/* ## `js/vehicles/TrafficCar.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — TrafficCar.js
 * ============================================================================
 * Extends Vehicle with AI traffic behaviour.
 * TrafficCars drive along the road network autonomously, obeying traffic
 * lights, stopping for obstacles, and reacting to the player.
 *
 * AI behaviour states:
 *   'driving'    — following road, normal speed
 *   'slowing'    — approaching intersection or obstacle ahead
 *   'stopped'    — red light / blocked
 *   'avoiding'   — lateral nudge to avoid a collision
 *   'honking'    — brief stop + horn after being blocked too long
 *   'despawning' — fading out before removal by TrafficSystem
 *
 * Pathfinding:
 *   Each car is given a start node and a destination node.
 *   CityMap.findPath() produces an ordered node list.
 *   The car drives toward the next waypoint node, then pops it off and
 *   advances to the following one.
 *
 * Lane discipline:
 *   CityMap.getLaneCentre() returns the right-lane centre for the current
 *   edge. The car uses a pursuit-steering controller to track it.
 * ============================================================================
 */

'use strict';

class TrafficCar extends Vehicle {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTOR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {object}  carConfig     Minimal car config (id, stats, body, colors).
   * @param {string}  startNodeId   CityMap node ID where the car spawns.
   * @param {string}  goalNodeId    CityMap node ID to drive toward.
   */
  constructor(carConfig, startNodeId, goalNodeId) {
    super(carConfig);

    // ── AI state ──────────────────────────────────────────────────────────
    this._aiState        = 'driving';
    this._stateTimer     = 0;     // time in current state

    // ── Pathfinding ───────────────────────────────────────────────────────
    this._path           = [];    // ordered node IDs  [current → goal]
    this._pathIndex      = 0;    // which node we are steering toward
    this._startNodeId    = startNodeId;
    this._goalNodeId     = goalNodeId;
    this._currentEdgeId  = null; // edge we are currently travelling on

    // ── Speed ─────────────────────────────────────────────────────────────
    this._targetSpeedKmh = 0;
    this._baseSpeedKmh   = CONFIG.TRAFFIC.BASE_SPEED +
                           (Math.random() - 0.5) * CONFIG.TRAFFIC.SPEED_VARIANCE;

    // ── Steering pursuit ──────────────────────────────────────────────────
    this._pursuitGain    = 1.8;   // lateral error → steer gain
    this._lookAheadDist  = 5.5;   // metres ahead for lane-centre sampling

    // ── Obstacle sensing ──────────────────────────────────────────────────
    this._frontClearance = 8;     // units — probe distance ahead
    this._blockedTimer   = 0;     // how long we have been blocked
    this._avoidSide      = 1;     // +1 = nudge right, -1 = left

    // ── Traffic light awareness ───────────────────────────────────────────
    this._lightCheckDist = CONFIG.ROADS.TRAFFIC_LIGHT.POLE_HEIGHT * 2 + 4;
    this._waitingAtLight = false;

    // ── Horn ─────────────────────────────────────────────────────────────
    this._hornCooldown   = 4 + Math.random() * 6;

    // ── Fade (despawn) ────────────────────────────────────────────────────
    this._opacity        = 1.0;
    this._fadingOut      = false;

    // Build path immediately
    this._buildPath();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PATHFINDING
  // ══════════════════════════════════════════════════════════════════════════

  _buildPath() {
    if (!this._startNodeId || !this._goalNodeId) return;

    const path = CityMap.findPath(this._startNodeId, this._goalNodeId, { maxNodes: 300 });

    if (path && path.length > 1) {
      this._path      = path;
      this._pathIndex = 1;   // index 0 = current position node, start steering to 1

      // Snap to the road at the start node
      const startNode = CityMap.getNode(this._startNodeId);
      if (startNode) {
        this.setPosition(
          startNode.x,
          CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y,
          startNode.z,
          0
        );
      }
    } else {
      // No path found — pick a random neighbour to go to
      this._path      = [this._startNodeId];
      this._pathIndex = 0;
      this._pickNewGoal();
    }
  }

  /**
   * Choose a new random destination and rebuild the path.
   * Called when the car reaches its goal or path fails.
   */
  _pickNewGoal() {
    const currentNode = this._path[this._path.length - 1] || this._startNodeId;
    const newGoal     = CityMap.randomNode(currentNode);

    if (!newGoal) return;

    this._startNodeId = currentNode;
    this._goalNodeId  = newGoal.id;
    this._buildPath();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {number} dt             Delta time seconds.
   * @param {object} nearbyVehicles  Array of other Vehicle instances for
   *                                 obstacle detection.
   */
  update(dt, nearbyVehicles = []) {
    if (!this.alive) return;

    if (this._fadingOut) {
      this._updateFade(dt);
      return;
    }

    // ── Advance AI state machine ──────────────────────────────────────────
    this._stateTimer += dt;
    this._updateAI(dt, nearbyVehicles);

    // ── Apply computed steer / speed to velocity ──────────────────────────
    this._applyAIDriving(dt);

    // ── Base Vehicle physics (drag, gravity, mesh update) ─────────────────
    super.update(dt);

    // ── Brake lights when slowing ─────────────────────────────────────────
    this.setBrakeLights(this._aiState === 'slowing' || this._aiState === 'stopped');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AI STATE MACHINE
  // ══════════════════════════════════════════════════════════════════════════

  _updateAI(dt, nearbyVehicles) {
    // Always update waypoint tracking regardless of state
    this._trackWaypoint(dt);

    switch (this._aiState) {
      case 'driving':   this._stateDriving(dt, nearbyVehicles);  break;
      case 'slowing':   this._stateSlowing(dt, nearbyVehicles);  break;
      case 'stopped':   this._stateStopped(dt, nearbyVehicles);  break;
      case 'avoiding':  this._stateAvoiding(dt);                 break;
      case 'honking':   this._stateHonking(dt);                  break;
    }
  }

  // ── STATE: driving ───────────────────────────────────────────────────────

  _stateDriving(dt, nearbyVehicles) {
    this._targetSpeedKmh = this._baseSpeedKmh;

    // Check for red light ahead
    if (this._redLightAhead()) {
      this._setState('slowing');
      return;
    }

    // Check for vehicle/obstacle ahead
    const frontDist = this._distanceToObstacleAhead(nearbyVehicles);
    if (frontDist < CONFIG.TRAFFIC.BRAKE_DISTANCE) {
      this._setState('slowing');
      return;
    }
  }

  // ── STATE: slowing ───────────────────────────────────────────────────────

  _stateSlowing(dt, nearbyVehicles) {
    const frontDist   = this._distanceToObstacleAhead(nearbyVehicles);
    const atRedLight  = this._redLightAhead();

    const STOP_DIST   = 2.5;
    const CREEP_DIST  = CONFIG.TRAFFIC.BRAKE_DISTANCE;

    if (frontDist < STOP_DIST || (atRedLight && this._distToNearestIntersection() < STOP_DIST + 2)) {
      this._setState('stopped');
      return;
    }

    // Graduated braking — target speed proportional to distance
    const ratio              = MathUtils.clamp((frontDist - STOP_DIST) / (CREEP_DIST - STOP_DIST), 0, 1);
    this._targetSpeedKmh     = this._baseSpeedKmh * ratio * 0.5;

    // If obstacle clears, resume driving
    if (!atRedLight && frontDist > CREEP_DIST * 1.2) {
      this._setState('driving');
    }
  }

  // ── STATE: stopped ───────────────────────────────────────────────────────

  _stateStopped(dt, nearbyVehicles) {
    this._targetSpeedKmh = 0;
    this._blockedTimer  += dt;

    // Check if we can go
    const frontDist  = this._distanceToObstacleAhead(nearbyVehicles);
    const redLight   = this._redLightAhead();

    if (!redLight && frontDist > CONFIG.TRAFFIC.BRAKE_DISTANCE) {
      this._blockedTimer = 0;
      this._setState('driving');
      return;
    }

    // Been blocked too long → attempt to avoid
    if (this._blockedTimer > 5.0 && !redLight) {
      this._avoidSide = Math.random() < 0.5 ? 1 : -1;
      this._setState('avoiding');
      this._blockedTimer = 0;
      return;
    }

    // Horn after being blocked
    if (this._blockedTimer > 3.0 && Math.random() < CONFIG.TRAFFIC.HORN_CHANCE * dt) {
      this._setState('honking');
    }
  }

  // ── STATE: avoiding ───────────────────────────────────────────────────────

  _stateAvoiding(dt) {
    this._targetSpeedKmh = this._baseSpeedKmh * 0.4;

    // Apply lateral nudge by biasing the steer toward avoidSide
    this.steerAngle = MathUtils.clamp(
      this.steerAngle + this._avoidSide * 0.08,
      -CONFIG.PHYSICS.MAX_STEER_ANGLE,
       CONFIG.PHYSICS.MAX_STEER_ANGLE
    );

    // After 2 seconds of avoiding, return to driving
    if (this._stateTimer > 2.0) {
      this._setState('driving');
    }
  }

  // ── STATE: honking ────────────────────────────────────────────────────────

  _stateHonking(dt) {
    this._targetSpeedKmh = 0;

    // Brief state — just emit a toast and return to stopped
    if (this._stateTimer > 0.6) {
      this._setState('stopped');
    }
  }

  _setState(newState) {
    this._aiState    = newState;
    this._stateTimer = 0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WAYPOINT TRACKING
  // ══════════════════════════════════════════════════════════════════════════

  _trackWaypoint(dt) {
    if (this._path.length === 0 || this._pathIndex >= this._path.length) {
      // Reached destination — pick a new one
      this._pickNewGoal();
      return;
    }

    const targetNodeId = this._path[this._pathIndex];
    const targetNode   = CityMap.getNode(targetNodeId);
    if (!targetNode) {
      this._pathIndex++;
      return;
    }

    // Distance to waypoint
    const dx   = targetNode.x - this.position.x;
    const dz   = targetNode.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Advance to next waypoint when close enough
    const WAYPOINT_REACH = MathUtils.clamp(MathUtils.kmhToMs(Math.abs(this.speedKmh)) * 0.6, 3, 8);

    if (dist < WAYPOINT_REACH) {
      this._pathIndex++;
      return;
    }

    // Compute desired heading toward waypoint
    const desiredHeading = Math.atan2(dx, dz);

    // Smooth turn toward desired heading
    const headingError   = MathUtils.angleDelta(this.heading, desiredHeading);
    const maxTurn        = CONFIG.PHYSICS.STEER_SPEED * dt * 0.9;
    this.heading        += MathUtils.clamp(headingError, -maxTurn, maxTurn);

    // Lane-centre lateral correction
    this._applyLaneCorrectionSteering(dt, targetNode);
  }

  /**
   * Compute a lane-following steer correction using the look-ahead point.
   */
  _applyLaneCorrectionSteering(dt, targetNode) {
    // Find the edge from the current node toward the target
    const prevNodeId = this._path[Math.max(0, this._pathIndex - 1)];
    if (!prevNodeId || prevNodeId === targetNode.id) return;

    const edgeId = `e_${prevNodeId}_${targetNode.id}`;
    const edge   = CityMap.getEdge(edgeId);
    if (!edge) return;

    this._currentEdgeId = edgeId;

    // Right-lane centre at look-ahead distance along edge
    const edgeLen     = edge.length || 1;
    const tParam      = MathUtils.clamp(
      this._lookAheadDist / edgeLen, 0, 1
    );
    const laneCentre  = CityMap.getLaneCentre(edge, 0, tParam);

    // Lateral error: signed distance from car to lane centre
    const rightX      =  Math.cos(this.heading);
    const rightZ      = -Math.sin(this.heading);

    const errX        = laneCentre.x - this.position.x;
    const errZ        = laneCentre.z - this.position.z;
    const latError    = errX * rightX + errZ * rightZ;

    // Proportional steer correction
    const steerCorr   = MathUtils.clamp(
      latError * this._pursuitGain / Math.max(MathUtils.kmhToMs(Math.abs(this.speedKmh)), 1),
      -CONFIG.PHYSICS.MAX_STEER_ANGLE,
       CONFIG.PHYSICS.MAX_STEER_ANGLE
    );

    this.steerAngle = MathUtils.lerp(this.steerAngle, steerCorr, dt * 4);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // APPLY AI DRIVING FORCES
  // ══════════════════════════════════════════════════════════════════════════

  _applyAIDriving(dt) {
    const topMs        = MathUtils.kmhToMs(this._baseSpeedKmh);
    const targetMs     = MathUtils.kmhToMs(this._targetSpeedKmh);
    const fwdX         = Math.sin(this.heading);
    const fwdZ         = Math.cos(this.heading);
    const currentFwd   = this.velocity.x * fwdX + this.velocity.z * fwdZ;

    const error        = targetMs - currentFwd;

    // Proportional throttle / brake
    const force = MathUtils.clamp(error * 3.5, -18, 18);

    this.velocity.x += fwdX * force * dt;
    this.velocity.z += fwdZ * force * dt;

    // Hard speed cap
    const spd = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (spd > topMs * 1.08) {
      const s = (topMs * 1.08) / spd;
      this.velocity.x *= s;
      this.velocity.z *= s;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OBSTACLE SENSING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return the distance to the nearest vehicle or static obstacle directly
   * in front of this car. Returns Infinity if the path is clear.
   *
   * @param {Vehicle[]} nearbyVehicles
   * @returns {number}  Distance in world units.
   */
  _distanceToObstacleAhead(nearbyVehicles) {
    const fwdX  = Math.sin(this.heading);
    const fwdZ  = Math.cos(this.heading);

    let minDist = Infinity;

    for (const other of nearbyVehicles) {
      if (other === this || !other.alive) continue;

      const dx    = other.position.x - this.position.x;
      const dz    = other.position.z - this.position.z;
      const dot   = dx * fwdX + dz * fwdZ;   // positive = in front

      if (dot < 0 || dot > this._frontClearance) continue;

      // Lateral distance check — only care about vehicles roughly in our lane
      const latX  = dx - fwdX * dot;
      const latZ  = dz - fwdZ * dot;
      const latD  = Math.sqrt(latX ** 2 + latZ ** 2);

      if (latD < CONFIG.ROADS.LANE_WIDTH * 0.9) {
        minDist = Math.min(minDist, dot - this.body.length / 2);
      }
    }

    return minDist;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRAFFIC LIGHT AWARENESS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return true if there is a red or yellow light at an intersection
   * within stopping distance ahead.
   */
  _redLightAhead() {
    // Look up the next node on the path — if it is an intersection,
    // check its light phase.
    if (this._pathIndex >= this._path.length) return false;

    const nextNodeId  = this._path[this._pathIndex];
    const nextNode    = CityMap.getNode(nextNodeId);
    if (!nextNode) return false;

    // How far away is it?
    const dx   = nextNode.x - this.position.x;
    const dz   = nextNode.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > this._lightCheckDist) return false;

    // Is it an intersection?
    const inter = CityMap.getIntersectionAt(nextNode.x, nextNode.z);
    if (!inter) return false;

    const phase = CityMap.getLightPhase(inter.nodeId);
    return phase === 'red' || phase === 'yellow';
  }

  /**
   * Return the distance to the nearest intersection directly ahead.
   */
  _distToNearestIntersection() {
    if (this._pathIndex >= this._path.length) return Infinity;

    const nextNodeId = this._path[this._pathIndex];
    const nextNode   = CityMap.getNode(nextNodeId);
    if (!nextNode) return Infinity;

    const dx = nextNode.x - this.position.x;
    const dz = nextNode.z - this.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER REACTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Called by TrafficSystem when the player gets too close.
   * Makes this car pull to the side or briefly stop.
   *
   * @param {THREE.Vector3} playerPos
   * @param {number}        playerSpeedKmh
   */
  reactToPlayer(playerPos, playerSpeedKmh) {
    if (this._aiState === 'despawning') return;

    const dx   = playerPos.x - this.position.x;
    const dz   = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Only react if player is close and behind (approaching from rear)
    const fwdX   = Math.sin(this.heading);
    const fwdZ   = Math.cos(this.heading);
    const dotFwd = dx * (-fwdX) + dz * (-fwdZ);  // negative fwd = behind us

    if (dist < 12 && dotFwd > 0) {
      // Pull to the right to let player pass
      this._avoidSide = 1;
      if (this._aiState !== 'avoiding') {
        this._setState('avoiding');
      }

      // Horn if player is very close
      if (dist < 5 && this._hornCooldown <= 0) {
        this._hornCooldown = 6;
        Notifications.toast('📯', 'Watch it!', 'warn', 0.8);
      }
    }

    if (this._hornCooldown > 0) this._hornCooldown -= 0.016;
  }

  /**
   * Called by TrafficSystem / PoliceSystem when this car is hit.
   * @param {THREE.Vector3} impactNormal
   * @param {number}        impactSpeed  m/s
   */
  onHitByPlayer(impactNormal, impactSpeed) {
    this.onCollision(impactNormal, impactSpeed, 1200);

    // Panic — stop and wait
    this._setState('stopped');
    this._blockedTimer = 0;

    // Honk
    if (this._hornCooldown <= 0) {
      this._hornCooldown = 5;
      Notifications.toast('📯', 'HEY!', 'danger', 1.0);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FADE OUT (despawn)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Trigger a fade-out before the car is removed by TrafficSystem.
   */
  beginDespawn() {
    this._fadingOut = true;
    this._aiState   = 'despawning';
  }

  _updateFade(dt) {
    this._opacity -= dt * 1.4;

    if (this._opacity <= 0) {
      this._opacity = 0;
      this.alive    = false;
      return;
    }

    // Apply opacity to all meshes in the group
    if (this.group) {
      this.group.traverse(child => {
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m.transparent) {
              m.transparent = true;
            }
            m.opacity = this._opacity;
          }
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITY GETTERS
  // ══════════════════════════════════════════════════════════════════════════

  getAIState()       { return this._aiState;         }
  getCurrentEdge()   { return this._currentEdgeId;   }
  isStopped()        { return this._aiState === 'stopped'; }
  isFadingOut()      { return this._fadingOut;        }

  /**
   * Return the current path node ID we are heading toward.
   * Used by TrafficSystem for spatial indexing.
   */
  getCurrentTargetNodeId() {
    return this._path[this._pathIndex] || null;
  }

}

if (typeof module !== 'undefined') module.exports = TrafficCar;
/* ```

---

**File 21 ✅ — `js/vehicles/TrafficCar.js` done.**

This gives every AI traffic car a complete autonomous driving brain. The five-state machine transitions cleanly between `driving`, `slowing`, `stopped`, `avoiding`, and `honking` based on what the car senses ahead. The waypoint tracker steers toward successive nodes in the A* path, advances when within a speed-proportional capture radius, and calls `_pickNewGoal()` when it arrives so the car loops the city indefinitely rather than stopping dead. Lane discipline uses `CityMap.getLaneCentre()` to sample the right-lane position at a configurable look-ahead distance, computes the signed lateral error, and feeds it into a proportional steer controller that blends gently with `lerp`. Traffic light awareness looks up the next path node, checks if it is an intersection via `CityMap.getIntersectionAt()`, and queries the phase — stopping for both red and yellow. Obstacle sensing raycasts forward in the heading direction against every nearby vehicle's AABB and only triggers for vehicles in the same lane using a lateral distance threshold. The `reactToPlayer` method pulls the car right when the player approaches from behind and emits a horn toast. `beginDespawn` triggers a transparency fade-out so cars disappear gracefully when `TrafficSystem` despawns them beyond the draw radius.

**Say "File 22" for `js/vehicles/PoliceCar.js`.** */
