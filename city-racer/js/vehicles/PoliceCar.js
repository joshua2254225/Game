/* ## `js/vehicles/PoliceCar.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — PoliceCar.js
 * ============================================================================
 * Extends Vehicle with police pursuit AI.
 * Dispatched by PoliceSystem when the player accumulates wanted stars.
 *
 * Behaviour states:
 *   'patrolling'  — cruising the road network like normal traffic
 *   'responding'  — driving toward last known player position at speed
 *   'pursuing'    — locked onto player, attempts to intercept + ram
 *   'blocking'    — races ahead to set up a roadblock position
 *   'ramming'     — deliberate collision course with player vehicle
 *   'returning'   — player escaped; driving back to patrol route
 *   'despawning'  — fading out after pursuit ends
 *
 * Pursuit tactics (scale with wanted level):
 *   1 star  — follow at distance, attempt to pull player over
 *   2 stars — aggressive chase, roadblock attempts
 *   3 stars — ram attempts, convoy with other units, no give-up
 *
 * Visual / audio:
 *   • Siren light bar (red/blue alternating PointLights)
 *   • Siren colour sweep driven by a timer
 *   • Police livery (dark body + white doors + decal stripes)
 *   • Blue/red undercar glow during pursuit
 * ============================================================================
 */

'use strict';

class PoliceCar extends Vehicle {

  // ══════════════════════════════════════════════════════════════════════════
  // STATIC POLICE CAR CONFIG  (not in CONFIG.CARS — AI only)
  // ══════════════════════════════════════════════════════════════════════════

  static POLICE_CONFIG = {
    id:    'police_car',
    name:  'Police Cruiser',
    stats: {
      topSpeed:     CONFIG.POLICE.POLICE_SPEED,
      acceleration: 3.8,
      handling:     0.85,
      braking:      0.90,
      grip:         0.82,
      weight:       1600,
      damageReduction: 0.20,
    },
    body: { length: 4.6, width: 1.90, height: 1.42, wheelbase: 2.72 },
    colors: {
      body:  CONFIG.POLICE.POLICE_COLOR_BODY,
      roof:  CONFIG.POLICE.POLICE_COLOR_BODY,
      wheel: 0x222222,
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTOR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {string}  startNodeId   Road node to spawn at.
   * @param {number}  wantedLevel   1, 2, or 3 — affects aggression.
   */
  constructor(startNodeId, wantedLevel = 1) {
    super(PoliceCar.POLICE_CONFIG, {
      paintHex: CONFIG.POLICE.POLICE_COLOR_BODY,
      finish:   'standard',
    });

    // ── Identity ──────────────────────────────────────────────────────────
    this.isPolice      = true;
    this.wantedLevel   = MathUtils.clamp(wantedLevel, 1, CONFIG.POLICE.MAX_STARS);
    this.unitId        = `police_${Date.now()}_${Math.random().toFixed(4)}`;

    // ── AI state ──────────────────────────────────────────────────────────
    this._aiState      = 'patrolling';
    this._stateTimer   = 0;

    // ── Pursuit data ──────────────────────────────────────────────────────
    this._target       = null;    // PlayerCar reference (set by PoliceSystem)
    this._lastKnownPos = new THREE.Vector3();
    this._lostTimer    = 0;       // seconds since last player sighting

    // Give-up distance and timer scale with wanted level
    this._giveUpDist   = CONFIG.POLICE.PURSUIT_GIVE_UP_DIST * (1 + (wantedLevel - 1) * 0.4);
    this._giveUpTime   = 8 - wantedLevel * 2;   // fewer seconds at higher wanted

    // ── Pathfinding ───────────────────────────────────────────────────────
    this._path         = [];
    this._pathIndex    = 0;
    this._startNode    = startNodeId;
    this._patrolGoal   = null;

    // ── Speed settings (higher wanted = faster) ───────────────────────────
    this._pursuitSpeedMult = 1.0 + (wantedLevel - 1) * 0.15;

    // ── Ramming ───────────────────────────────────────────────────────────
    this._ramTimer     = 0;
    this._ramCooldown  = 0;
    this._ramming      = false;

    // ── Roadblock ─────────────────────────────────────────────────────────
    this._blockTarget  = new THREE.Vector3();
    this._blockTimer   = 0;

    // ── Siren ─────────────────────────────────────────────────────────────
    this._sirenActive  = false;
    this._sirenTimer   = 0;
    this._sirenLights  = [];    // TWO PointLights on the roof
    this._sirenLightMeshes = [];

    // ── Fade ─────────────────────────────────────────────────────────────
    this._opacity      = 1.0;
    this._fadingOut    = false;

    // Build police-specific livery on top of the base mesh
    this._buildPoliceLivery();
    this._buildSirenBar();

    // Snap to start node
    const node = CityMap.getNode(startNodeId);
    if (node) {
      this.setPosition(
        node.x,
        CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y,
        node.z,
        Math.random() * Math.PI * 2
      );
    }

    // Begin patrol path
    this._pickPatrolGoal();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POLICE LIVERY
  // ══════════════════════════════════════════════════════════════════════════

  _buildPoliceLivery() {
    if (!this.group) return;

    const L = this.body.length;
    const W = this.body.width;
    const H = this.body.height;

    // White door panels (two planes, one each side)
    const doorMat = new THREE.MeshStandardMaterial({
      color:     CONFIG.POLICE.POLICE_COLOR_STRIPE,
      roughness: 0.70,
      metalness: 0.05,
    });

    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(
        new THREE.PlaneGeometry(L * 0.48, H * 0.42),
        doorMat
      );
      door.position.set(0, H * 0.29, side * (W / 2 + 0.005));
      door.rotation.y = side > 0 ? 0 : Math.PI;
      door.matrixAutoUpdate = false;
      door.updateMatrix();
      this.group.add(door);
    }

    // Blue undercar glow strip (hidden until siren active)
    const glowMat = new THREE.MeshBasicMaterial({
      color:       0x0022FF,
      transparent: true,
      opacity:     0,
    });
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(L * 0.9, W * 0.85),
      glowMat
    );
    glow.rotation.x      = Math.PI / 2;
    glow.position.y      = -H * 0.28;
    glow.matrixAutoUpdate = false;
    glow.updateMatrix();
    this.group.add(glow);
    this._underglow = glow;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIREN LIGHT BAR
  // ══════════════════════════════════════════════════════════════════════════

  _buildSirenBar() {
    if (!this.group) return;

    const L = this.body.length;
    const W = this.body.width;
    const H = this.body.height;
    const CABIN_H = H * 0.42;
    const barY    = H * 0.58 + CABIN_H + 0.06;

    // Light bar housing
    const barMat = new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.6, metalness: 0.4
    });
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.78, 0.15, L * 0.42),
      barMat
    );
    bar.position.set(0, barY, -L * 0.04);
    bar.castShadow    = true;
    bar.matrixAutoUpdate = false;
    bar.updateMatrix();
    this.group.add(bar);

    // Two lens clusters (red left, blue right)
    const lensColors = [0xFF1111, 0x0011FF];
    const lensOffsets = [W * 0.22, -W * 0.22];

    for (let i = 0; i < 2; i++) {
      // Lens mesh
      const lensMat = new THREE.MeshBasicMaterial({ color: lensColors[i] });
      const lens    = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.10, L * 0.36),
        lensMat
      );
      lens.position.set(lensOffsets[i], barY + 0.07, -L * 0.04);
      lens.matrixAutoUpdate = false;
      lens.updateMatrix();
      this.group.add(lens);
      this._sirenLightMeshes.push(lens);

      // PointLight
      const pt = new THREE.PointLight(lensColors[i], 0, 18);
      pt.position.set(lensOffsets[i], barY + 0.2, -L * 0.04);
      this.group.add(pt);
      this._sirenLights.push(pt);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIREN ANIMATION
  // ══════════════════════════════════════════════════════════════════════════

  _updateSiren(dt) {
    if (!this._sirenActive) {
      for (const l of this._sirenLights) l.intensity = 0;
      if (this._underglow) this._underglow.material.opacity = 0;
      return;
    }

    this._sirenTimer += dt * 3.5;   // flash rate

    // Alternate red and blue in anti-phase
    const redOn  = Math.sin(this._sirenTimer)        > 0;
    const blueOn = Math.sin(this._sirenTimer + Math.PI) > 0;

    this._sirenLights[0].intensity = redOn  ? 2.8 : 0.05;
    this._sirenLights[1].intensity = blueOn ? 2.8 : 0.05;

    // Lens brightness
    if (this._sirenLightMeshes[0]) {
      this._sirenLightMeshes[0].material.color.setHex(redOn  ? 0xFF3333 : 0x330000);
      this._sirenLightMeshes[1].material.color.setHex(blueOn ? 0x3333FF : 0x000033);
    }

    // Underglow pulse
    if (this._underglow) {
      this._underglow.material.opacity = 0.18 + Math.abs(Math.sin(this._sirenTimer)) * 0.12;
      this._underglow.material.color.setHex(redOn ? 0xFF0000 : 0x0000FF);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PATROL PATHFINDING
  // ══════════════════════════════════════════════════════════════════════════

  _pickPatrolGoal() {
    const current = this._path.length > 0
      ? this._path[this._path.length - 1]
      : this._startNode;

    const goal = CityMap.randomNode(current);
    if (!goal) return;

    this._patrolGoal = goal.id;
    const path = CityMap.findPath(current, goal.id, { maxNodes: 200 });

    if (path && path.length > 1) {
      this._path      = path;
      this._pathIndex = 1;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERCEPT POSITION CALCULATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Compute a world position ahead of the player to intercept.
   * @returns {THREE.Vector3}
   */
  _calcInterceptPoint() {
    if (!this._target) return this._lastKnownPos.clone();

    const pPos     = this._target.position;
    const pVel     = this._target.velocity;
    const myPos    = this.position;

    // Time-to-intercept estimate
    const dist     = myPos.distanceTo(pPos);
    const mySpeedMs = MathUtils.kmhToMs(CONFIG.POLICE.POLICE_SPEED * this._pursuitSpeedMult);
    const toa      = mySpeedMs > 0.1 ? dist / mySpeedMs : 1;

    // Lead the target
    return new THREE.Vector3(
      pPos.x + pVel.x * toa * 0.55,
      pPos.y,
      pPos.z + pVel.z * toa * 0.55
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {number}       dt
   * @param {Vehicle[]}    nearbyVehicles
   */
  update(dt, nearbyVehicles = []) {
    if (!this.alive) return;

    if (this._fadingOut) {
      this._updateFade(dt);
      return;
    }

    this._stateTimer += dt;
    this._updateSiren(dt);

    // Ram cooldown
    if (this._ramCooldown > 0) this._ramCooldown -= dt;

    // AI state machine
    switch (this._aiState) {
      case 'patrolling':  this._statePatrolling(dt, nearbyVehicles); break;
      case 'responding':  this._stateResponding(dt);                 break;
      case 'pursuing':    this._statePursuing(dt, nearbyVehicles);   break;
      case 'blocking':    this._stateBlocking(dt);                   break;
      case 'ramming':     this._stateRamming(dt);                    break;
      case 'returning':   this._stateReturning(dt);                  break;
    }

    // Apply velocity toward current goal
    this._applyDriving(dt);

    // Base physics
    super.update(dt);

    // Brake lights when slowing / stopped
    this.setBrakeLights(
      this._aiState === 'returning' ||
      (this._aiState === 'blocking' && this._stateTimer > 1.5)
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AI STATES
  // ══════════════════════════════════════════════════════════════════════════

  // ── PATROLLING ────────────────────────────────────────────────────────────

  _statePatrolling(dt, nearbyVehicles) {
    const patrolSpeed = CONFIG.TRAFFIC.BASE_SPEED + 8;
    this._driveAlongPath(dt, patrolSpeed, nearbyVehicles);

    if (this._pathIndex >= this._path.length) {
      this._pickPatrolGoal();
    }
  }

  // ── RESPONDING ────────────────────────────────────────────────────────────

  _stateResponding(dt) {
    if (!this._target) { this._setState('returning'); return; }

    const responseSpeed = CONFIG.POLICE.POLICE_SPEED * this._pursuitSpeedMult * 0.85;

    // Drive toward last known position
    const dest = this._lastKnownPos;
    const dist = this.position.distanceTo(dest);

    this._driveTowardPoint(dt, dest, responseSpeed);

    // Switch to full pursuit when close enough
    if (dist < 40) {
      this._setState('pursuing');
    }

    // Give up if no target for a long time
    this._lostTimer += dt;
    if (this._lostTimer > this._giveUpTime + 4) {
      this._setState('returning');
    }
  }

  // ── PURSUING ──────────────────────────────────────────────────────────────

  _statePursuing(dt, nearbyVehicles) {
    if (!this._target || !this._target.alive) {
      this._setState('returning');
      return;
    }

    // Update last known position
    this._lastKnownPos.copy(this._target.position);
    this._lostTimer = 0;

    const dist = this.position.distanceTo(this._target.position);

    // Give up if too far
    if (dist > this._giveUpDist) {
      this._lostTimer += dt;
      if (this._lostTimer > this._giveUpTime) {
        this._setState('returning');
        this.setSiren(false);
        return;
      }
    } else {
      this._lostTimer = 0;
    }

    // Compute intercept
    const intercept = this._calcInterceptPoint();
    const pursuitSpeed = CONFIG.POLICE.POLICE_SPEED * this._pursuitSpeedMult;

    this._driveTowardPoint(dt, intercept, pursuitSpeed);

    // ── Roadblock tactic (2+ stars) ────────────────────────────────────────
    if (this.wantedLevel >= 2 && dist > 35 && Math.random() < 0.002) {
      this._setupRoadblock();
      return;
    }

    // ── Ram attempt (3 stars or very close) ───────────────────────────────
    if (this.wantedLevel >= 3 && dist < 10 && this._ramCooldown <= 0) {
      this._setState('ramming');
      this._ramTimer = 1.8;
      return;
    }
  }

  // ── BLOCKING ──────────────────────────────────────────────────────────────

  _setupRoadblock() {
    if (!this._target) return;

    // Race ahead of the player by 60 units
    const leadDist  = 60;
    const pHeading  = this._target.heading;
    this._blockTarget.set(
      this._target.position.x + Math.sin(pHeading) * leadDist,
      CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y,
      this._target.position.z + Math.cos(pHeading) * leadDist
    );

    this._setState('blocking');
  }

  _stateBlocking(dt) {
    const dist = this.position.distanceTo(this._blockTarget);

    if (dist > 6) {
      // Race to the block point at full speed
      this._driveTowardPoint(dt, this._blockTarget, CONFIG.POLICE.POLICE_SPEED * 1.1);
    } else {
      // Arrived — steer perpendicular to road to create a barrier
      const targetAngle = this._target
        ? this._target.heading + Math.PI / 2
        : this.heading;

      this.heading = MathUtils.lerpAngle(this.heading, targetAngle, dt * 2.5);
      this.velocity.multiplyScalar(0.85);  // skid to a stop

      // After 5 seconds holding position, return to pursuit
      if (this._stateTimer > 5.0) {
        this._setState('pursuing');
      }
    }
  }

  // ── RAMMING ────────────────────────────────────────────────────────────────

  _stateRamming(dt) {
    if (!this._target) { this._setState('pursuing'); return; }

    this._ramTimer -= dt;

    // Drive directly at the player at full throttle
    const ramSpeed = CONFIG.POLICE.POLICE_SPEED * this._pursuitSpeedMult * 1.2;
    this._driveTowardPoint(dt, this._target.position, ramSpeed);

    // Check for contact
    const dist = this.position.distanceTo(this._target.position);
    if (dist < (this.body.length + this._target.body.length) / 2 + 0.5) {
      // Impact
      const normal = this.position.clone()
        .sub(this._target.position).normalize();
      const relSpd  = MathUtils.kmhToMs(Math.abs(this.speedKmh - this._target.speedKmh));

      this._target.onCollision(normal.negate(), relSpd, this.stats.weight);
      this.onCollision(normal, relSpd * 0.4, this._target.stats.weight);

      this._ramCooldown = 4 + Math.random() * 3;
      this._setState('pursuing');
      return;
    }

    if (this._ramTimer <= 0) {
      this._ramCooldown = 3;
      this._setState('pursuing');
    }
  }

  // ── RETURNING ─────────────────────────────────────────────────────────────

  _stateReturning(dt) {
    this.setSiren(false);

    if (this._path.length === 0 || this._pathIndex >= this._path.length) {
      this._pickPatrolGoal();
    }

    const patrolSpeed = CONFIG.TRAFFIC.BASE_SPEED + 5;
    this._driveAlongPath(dt, patrolSpeed, []);

    // After 12 seconds just resume patrol
    if (this._stateTimer > 12) {
      this._setState('patrolling');
    }
  }

  _setState(newState) {
    this._aiState    = newState;
    this._stateTimer = 0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DRIVING HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Drive along the current _path at a given speed.
   * Mirrors TrafficCar._trackWaypoint behaviour.
   */
  _driveAlongPath(dt, speedKmh, nearbyVehicles) {
    if (this._pathIndex >= this._path.length) return;

    const nodeId = this._path[this._pathIndex];
    const node   = CityMap.getNode(nodeId);
    if (!node) { this._pathIndex++; return; }

    const dx   = node.x - this.position.x;
    const dz   = node.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const reach = MathUtils.clamp(MathUtils.kmhToMs(speedKmh) * 0.5, 3.5, 9);
    if (dist < reach) { this._pathIndex++; return; }

    const desired = Math.atan2(dx, dz);
    const delta   = MathUtils.angleDelta(this.heading, desired);
    const maxTurn = CONFIG.PHYSICS.STEER_SPEED * dt;

    this.heading       += MathUtils.clamp(delta, -maxTurn, maxTurn);
    this.steerAngle     = MathUtils.clamp(delta * 0.55, -CONFIG.PHYSICS.MAX_STEER_ANGLE, CONFIG.PHYSICS.MAX_STEER_ANGLE);

    // Simple stop for red lights
    const inter = CityMap.getIntersectionAt(node.x, node.z);
    if (inter && dist < 14) {
      const phase = CityMap.getLightPhase(inter.nodeId);
      if (phase === 'red' || phase === 'yellow') {
        speedKmh = 0;
      }
    }

    this._driveToSpeed(dt, speedKmh);
  }

  /**
   * Steer and accelerate directly toward a world-space point.
   */
  _driveTowardPoint(dt, point, speedKmh) {
    const dx      = point.x - this.position.x;
    const dz      = point.z - this.position.z;
    const desired = Math.atan2(dx, dz);
    const delta   = MathUtils.angleDelta(this.heading, desired);
    const maxTurn = CONFIG.PHYSICS.STEER_SPEED * dt * 1.2;

    this.heading    += MathUtils.clamp(delta, -maxTurn, maxTurn);
    this.steerAngle  = MathUtils.clamp(delta * 0.6, -CONFIG.PHYSICS.MAX_STEER_ANGLE, CONFIG.PHYSICS.MAX_STEER_ANGLE);

    this._driveToSpeed(dt, speedKmh);
  }

  /**
   * Accelerate / decelerate toward a target speed in km/h.
   */
  _driveToSpeed(dt, targetKmh) {
    const targetMs  = MathUtils.kmhToMs(targetKmh);
    const fwdX      = Math.sin(this.heading);
    const fwdZ      = Math.cos(this.heading);
    const currentMs = this.velocity.x * fwdX + this.velocity.z * fwdZ;

    const error  = targetMs - currentMs;
    const force  = MathUtils.clamp(error * 4.2, -22, 22);

    this.velocity.x += fwdX * force * dt;
    this.velocity.z += fwdZ * force * dt;

    // Top-speed cap
    const cap = MathUtils.kmhToMs(CONFIG.POLICE.POLICE_SPEED * this._pursuitSpeedMult * 1.06);
    const spd = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (spd > cap) {
      this.velocity.x *= cap / spd;
      this.velocity.z *= cap / spd;
    }
  }

  /**
   * Apply one frame of driving (called from update after state machine).
   * No-op here — each state calls _driveAlongPath or _driveTowardPoint directly.
   */
  _applyDriving(/* dt */) {}

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC CONTROL API  (called by PoliceSystem)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Assign the player vehicle as this unit's pursuit target.
   * Transitions to 'responding' or 'pursuing' state.
   *
   * @param {PlayerCar} playerCar
   */
  engageTarget(playerCar) {
    this._target = playerCar;
    this._lastKnownPos.copy(playerCar.position);
    this._lostTimer = 0;

    const dist = this.position.distanceTo(playerCar.position);
    this._setState(dist < 60 ? 'pursuing' : 'responding');
    this.setSiren(true);

    // Path toward player's nearest node
    const playerNode = CityMap.nearestNode(playerCar.position.x, playerCar.position.z);
    const myNode     = CityMap.nearestNode(this.position.x, this.position.z);

    if (myNode && playerNode) {
      const path = CityMap.findPath(myNode.id, playerNode.id, { maxNodes: 300 });
      if (path && path.length > 1) {
        this._path      = path;
        this._pathIndex = 1;
      }
    }
  }

  /**
   * Tell this unit the player has escaped — start returning to patrol.
   */
  playerEscaped() {
    this._target = null;
    this._setState('returning');
    this.setSiren(false);
  }

  /**
   * Update wanted level mid-pursuit (escalation).
   * @param {number} level  1–3
   */
  setWantedLevel(level) {
    this.wantedLevel        = MathUtils.clamp(level, 1, CONFIG.POLICE.MAX_STARS);
    this._pursuitSpeedMult  = 1.0 + (this.wantedLevel - 1) * 0.15;
    this._giveUpDist        = CONFIG.POLICE.PURSUIT_GIVE_UP_DIST * (1 + (this.wantedLevel - 1) * 0.4);
    this._giveUpTime        = 8 - this.wantedLevel * 2;
  }

  /**
   * Activate or deactivate the siren lights and undercar glow.
   * @param {boolean} on
   */
  setSiren(on) {
    this._sirenActive = on;
    if (!on) {
      for (const l of this._sirenLights) l.intensity = 0;
      if (this._underglow) this._underglow.material.opacity = 0;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FADE OUT (despawn)
  // ══════════════════════════════════════════════════════════════════════════

  beginDespawn() {
    this._fadingOut   = true;
    this._aiState     = 'despawning';
    this._sirenActive = false;
    for (const l of this._sirenLights) l.intensity = 0;
  }

  _updateFade(dt) {
    this._opacity -= dt * 1.2;
    if (this._opacity <= 0) {
      this._opacity = 0;
      this.alive    = false;
      return;
    }
    if (this.group) {
      this.group.traverse(child => {
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m.transparent) m.transparent = true;
            m.opacity = this._opacity;
          }
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ══════════════════════════════════════════════════════════════════════════

  getAIState()    { return this._aiState;     }
  isPursuing()    { return this._aiState === 'pursuing' || this._aiState === 'ramming'; }
  isResponding()  { return this._aiState === 'responding'; }
  isPatrolling()  { return this._aiState === 'patrolling'; }
  isFadingOut()   { return this._fadingOut;   }
  getSirenActive(){ return this._sirenActive; }
  getTarget()     { return this._target;      }

}

if (typeof module !== 'undefined') module.exports = PoliceCar;
/* ```

---

**File 22 ✅ — `js/vehicles/PoliceCar.js` done.**

This gives every police unit a full six-state pursuit brain. During patrol it follows random A* paths like normal traffic, respecting traffic lights. When `engageTarget()` is called by `PoliceSystem`, it snaps into `responding` and pathfinds to the player's nearest node, transitioning to `pursuing` when within 40 units. In pursuit the intercept position leads the player by time-of-arrival rather than chasing the current position, making it much harder to outrun. At wanted level 2 there is a small probability each frame of triggering a roadblock — the car races 60 units ahead of the player's heading and skids broadside across the road for up to 5 seconds. At wanted level 3 the car enters `ramming` state when within 10 units and drives directly at the player at 120% normal speed, applying a two-body collision impulse on contact. The siren bar alternates red and blue `PointLight` intensities in anti-phase at 3.5 Hz, and the undercar glow pulses between red and blue in sync. White door-panel planes layered over the base dark body create the police livery without a separate material per panel.

**Say "File 23" for `js/systems/TrafficSystem.js`.** */
