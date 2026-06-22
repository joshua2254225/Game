/* ## `js/vehicles/PlayerCar.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — PlayerCar.js
 * ============================================================================
 * Extends Vehicle with player-specific input handling, tuned arcade physics,
 * turbo/nitro boost, interaction detection, and all HUD data feeds.
 *
 * Responsibilities:
 *   • Read InputManager each frame and translate to throttle/brake/steer forces
 *   • Speed-sensitive steering (wide at low speed, tight at high speed)
 *   • Handbrake drift mechanics
 *   • Turbo boost with charge/discharge and cooldown
 *   • Horn audio trigger
 *   • Rear-view mirror camera activation
 *   • Interaction proximity check (garages, dealers, race starts, taxi markers)
 *   • Wanted-level speed monitoring (reports to PoliceSystem)
 *   • Skid-mark decal spawning under rear wheels
 *   • Gear simulation (6 forward + reverse) for HUD display
 *   • Feed live data to HUD (speed, gear, damage, boost)
 *   • Zone entry/exit detection (district change, water, bridge)
 *   • Respawn after destruction
 * ============================================================================
 */

'use strict';

class PlayerCar extends Vehicle {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTOR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {object} carConfig      CONFIG.CARS entry.
   * @param {object} [carState]     SaveSystem car state (upgrades, damage, paint).
   */
  constructor(carConfig, carState = {}) {
    // Build effective stats with upgrade bonuses applied
    const effectiveStats = PlayerCar._applyUpgrades(carConfig, carState.upgrades || {});

    super(
      { ...carConfig, stats: effectiveStats },
      {
        damage:   carState.damage   || 0,
        paintHex: carState.paintHex || carConfig.colors.body,
        finish:   carState.finish   || 'standard',
      }
    );

    this.isPlayer = true;

    // ── Upgrade metadata ──────────────────────────────────────────────────
    this.upgrades = { ...carState.upgrades } || {};

    // ── Turbo / Boost ─────────────────────────────────────────────────────
    const turboLevel = this.upgrades.turbo || 0;
    const turboCfg   = turboLevel > 0
      ? CONFIG.UPGRADES.turbo.levels[turboLevel - 1]
      : null;

    this.turbo = {
      available:  turboLevel > 0,
      active:     false,
      charge:     1.0,          // 0–1 (full by default)
      mult:       turboCfg?.boostMult     || 1.0,
      duration:   turboCfg?.boostDuration || 0,
      cooldown:   CONFIG.PLAYER.BOOST_COOLDOWN,
      timer:      0,            // seconds remaining in active boost
      coolTimer:  0,            // seconds remaining in cooldown
    };

    // ── Gear simulation ───────────────────────────────────────────────────
    this.gear         = 1;       // 0=R, 1–6=forward
    this._gearRatios  = [3.5, 2.8, 2.0, 1.5, 1.15, 0.9]; // speed thresholds for 1–6

    // ── Steering ──────────────────────────────────────────────────────────
    this._steerInput  = 0;       // raw -1..+1 from InputManager
    this._steerTarget = 0;
    this.MAX_STEER    = CONFIG.PHYSICS.MAX_STEER_ANGLE;

    // ── Handbrake / drift ─────────────────────────────────────────────────
    this._handbraking = false;
    this._driftAngle  = 0;

    // ── Skid mark state ───────────────────────────────────────────────────
    this._skidding      = false;
    this._skidTimer     = 0;
    this._skidDecals    = [];   // { mesh, life }
    this._lastSkidPos   = new THREE.Vector3();
    this._skidMinDist   = 1.2; // minimum distance between skid marks

    // ── Odometer ──────────────────────────────────────────────────────────
    this.distanceTravelled = 0;   // metres since spawn

    // ── District / zone tracking ──────────────────────────────────────────
    this._currentDistrict = '';
    this._inWater         = false;
    this._onBridge        = false;

    // ── Interaction prompt ────────────────────────────────────────────────
    this._nearMarker      = null;   // Markers.Marker object or null
    this._interactTimer   = 0;

    // ── Audio ─────────────────────────────────────────────────────────────
    this._enginePitch     = 0;
    this._hornActive      = false;

    // ── HUD data (written each frame for HUD.js to read) ─────────────────
    this.hudData = {
      speedKmh:     0,
      gear:         '1',
      boostCharge:  0,
      boostActive:  false,
      damage:       0,
      isReversing:  false,
    };

    // ── Callbacks (set by Game.js) ─────────────────────────────────────────
    this.onEnterDistrict   = null;  // (districtKey, districtName) => void
    this.onEnterWater      = null;  // () => void
    this.onExitWater       = null;  // () => void
    this.onInteractNear    = null;  // (markerData) => void
    this.onInteractFar     = null;  // () => void
    this.onInteractConfirm = null;  // (markerData) => void
    this.onSpeedingChange  = null;  // (isOver, speedKmh) => void

    // Register with Water.js for river detection
    Water.onPlayerWater(
      () => { this._inWater = true;  if (this.onEnterWater) this.onEnterWater(); },
      () => { this._inWater = false; if (this.onExitWater)  this.onExitWater();  }
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATIC UPGRADE HELPER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Compute effective stats for a car config with upgrade bonuses applied.
   * Mirrors the logic in SaveSystem.getEffectiveCarStats() but works on raw
   * config data without a full playerState object.
   *
   * @param {object} carConfig
   * @param {object} upgrades   { engine:0, tires:0, … }
   * @returns {object}  Merged stats object.
   */
  static _applyUpgrades(carConfig, upgrades) {
    const stats = { ...carConfig.stats };

    for (const [key, level] of Object.entries(upgrades)) {
      if (!level || level === 0) continue;
      const upgCfg = CONFIG.UPGRADES[key];
      if (!upgCfg) continue;

      for (let i = 0; i < level; i++) {
        const ld = upgCfg.levels[i];
        if (!ld) continue;
        if (ld.topSpeedBonus)   stats.topSpeed    = (stats.topSpeed    || 0) + ld.topSpeedBonus;
        if (ld.accelBonus)      stats.acceleration = Math.max(0.5, (stats.acceleration || 5) - ld.accelBonus);
        if (ld.gripBonus)       stats.grip         = MathUtils.clamp((stats.grip     || 0.7) + ld.gripBonus, 0, 1);
        if (ld.handlingBonus)   stats.handling     = MathUtils.clamp((stats.handling || 0.7) + ld.handlingBonus, 0, 1);
        if (ld.brakingBonus)    stats.braking      = MathUtils.clamp((stats.braking  || 0.7) + ld.brakingBonus, 0, 1);
        if (ld.stabilityBonus)  stats.handling     = MathUtils.clamp((stats.handling || 0.7) + ld.stabilityBonus * 0.5, 0, 1);
        if (ld.damageReduction) stats.damageReduction = ld.damageReduction;
      }
    }

    return stats;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Main update tick. Called by Game.js every frame.
   * @param {number} dt  Delta time in seconds.
   */
  update(dt) {
    if (!this.alive) return;
    if (this.isDestroyed()) { this._handleDestruction(); return; }

    this._processInput(dt);
    this._updateTurbo(dt);
    this._updateGear();
    this._updateSteering(dt);
    this._applyDrivingForces(dt);

    // Base class handles physics integration, AABB, lights, particles
    super.update(dt);

    this._updateOdometer(dt);
    this._updateSkidMarks(dt);
    this._updateZones();
    this._updateInteractionCheck(dt);
    this._updateSpeedingCheck();
    this._updateHUD();
    this._updateCamera();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INPUT PROCESSING
  // ══════════════════════════════════════════════════════════════════════════

  _processInput(dt) {
    this._steerInput    = InputManager.getSteer();
    this._throttleInput = InputManager.getThrottle();
    this._brakeInput    = InputManager.getBrake();
    this._handbraking   = InputManager.isHandbrakeHeld();

    // Turbo activation
    if (InputManager.isNitroHeld() && this.turbo.available) {
      this._activateTurbo();
    }

    // Horn
    const wantsHorn = InputManager.isHornHeld();
    if (wantsHorn !== this._hornActive) {
      this._hornActive = wantsHorn;
      // AudioManager.horn(wantsHorn);  // hooked up in AudioManager
    }

    // Interact (E key / select button)
    if (InputManager.justPressed('interact') && this._nearMarker) {
      if (this.onInteractConfirm) this.onInteractConfirm(this._nearMarker);
    }

    // Rear-view mirror
    if (InputManager.isRearViewHeld()) {
      Camera.setMode(Camera.MODES.HOOD);
    } else if (Camera.getMode() === Camera.MODES.HOOD) {
      Camera.setMode(Camera.MODES.FOLLOW);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEERING
  // ══════════════════════════════════════════════════════════════════════════

  _updateSteering(dt) {
    const cfg       = CONFIG.PHYSICS;

    // Speed-sensitive maximum steer angle
    const speedN    = MathUtils.clamp(Math.abs(this.speedKmh) / this.stats.topSpeed, 0, 1);
    const maxSteer  = this.MAX_STEER * (1 - speedN * cfg.STEER_SPEED_DAMP * 80);

    // Target steer from input
    this._steerTarget = this._steerInput * maxSteer * this.stats.handling;

    // Smooth toward target
    const steerRate = this._steerInput !== 0
      ? cfg.STEER_SPEED  * dt
      : cfg.STEER_RETURN * dt;

    this.steerAngle = MathUtils.moveToward(
      this.steerAngle,
      this._steerTarget,
      steerRate
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DRIVING FORCES
  // ══════════════════════════════════════════════════════════════════════════

  _applyDrivingForces(dt) {
    const topMs       = MathUtils.kmhToMs(this.stats.topSpeed);
    const boostMult   = this.turbo.active ? this.turbo.mult : 1.0;
    const damageMult  = 1 - (this.damage / 100) * 0.55;

    const fwdX  = Math.sin(this.heading);
    const fwdZ  = Math.cos(this.heading);

    // ── Throttle ──────────────────────────────────────────────────────────
    if (this._throttleInput > 0) {
      // Torque curve: strong off the line, tapers near top speed
      const currentFwd = this.velocity.x * fwdX + this.velocity.z * fwdZ;
      const speedRatio = MathUtils.clamp(currentFwd / (topMs * boostMult), 0, 1);
      const torque     = MathUtils.lerp(1.0, 0.18, speedRatio * speedRatio);

      // Acceleration in m/s² — scale by 0–100 km/h time
      const accelMs2 = (MathUtils.kmhToMs(100) / this.stats.acceleration)
                       * torque * this._throttleInput * boostMult * damageMult;

      this.velocity.x += fwdX * accelMs2 * dt;
      this.velocity.z += fwdZ * accelMs2 * dt;
    }

    // ── Braking / reverse ─────────────────────────────────────────────────
    if (this._brakeInput > 0) {
      const currentFwd  = this.velocity.x * fwdX + this.velocity.z * fwdZ;
      const brakeForce  = MathUtils.kmhToMs(this.stats.topSpeed * 1.8)
                          * this.stats.braking * this._brakeInput;

      if (currentFwd > 0.3) {
        // Forward — braking
        this.velocity.x -= fwdX * brakeForce * dt;
        this.velocity.z -= fwdZ * brakeForce * dt;
        this.setBrakeLights(true);
      } else if (currentFwd > -MathUtils.kmhToMs(30)) {
        // Reversing
        this.velocity.x -= fwdX * brakeForce * 0.5 * dt;
        this.velocity.z -= fwdZ * brakeForce * 0.5 * dt;
        this.setBrakeLights(false);
      }
    } else {
      this.setBrakeLights(false);
    }

    // ── Handbrake / drift ──────────────────────────────────────────────────
    if (this._handbraking) {
      // Zero lateral velocity very harshly (car slides sideways)
      const rightX  =  Math.cos(this.heading);
      const rightZ  = -Math.sin(this.heading);
      const latVel   = this.velocity.x * rightX + this.velocity.z * rightZ;
      this.velocity.x -= latVel * rightX * 0.55;
      this.velocity.z -= latVel * rightZ * 0.55;

      // Kill forward speed fast
      this.velocity.x *= Math.pow(0.88, dt * 60);
      this.velocity.z *= Math.pow(0.88, dt * 60);

      this._skidding = Math.abs(this.speedKmh) > 8;
      this.setBrakeLights(true);
    } else {
      this._skidding = false;
    }

    // ── Yaw from steering (Ackermann-style) ──────────────────────────────
    const speed  = Math.abs(MathUtils.kmhToMs(this.speedKmh));
    if (speed > 0.5 && Math.abs(this.steerAngle) > 0.002) {
      // Turn radius from wheelbase and steer angle
      const turnRadius = this.body.wheelbase / Math.tan(Math.abs(this.steerAngle));
      const yawRate    = (speed / turnRadius) * MathUtils.sign(this.steerAngle)
                         * MathUtils.sign(this.speedKmh);

      this.heading = MathUtils.normaliseAngle(this.heading + yawRate * dt);
    }

    // ── Speed cap (can't exceed top speed × boost) ────────────────────────
    const maxMs   = topMs * boostMult * damageMult;
    const hSpeed  = Math.hypot(this.velocity.x, this.velocity.z);
    if (hSpeed > maxMs) {
      const scale     = maxMs / hSpeed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // ── Skid detection (tyre screech when cornering fast) ─────────────────
    if (!this._handbraking) {
      const rightX  =  Math.cos(this.heading);
      const rightZ  = -Math.sin(this.heading);
      const latVel   = Math.abs(this.velocity.x * rightX + this.velocity.z * rightZ);
      const slipN    = latVel / Math.max(speed, 0.1);
      this._skidding = slipN > 0.38 && speed > MathUtils.kmhToMs(15);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TURBO / BOOST
  // ══════════════════════════════════════════════════════════════════════════

  _activateTurbo() {
    if (!this.turbo.available)       return;
    if (this.turbo.active)           return;
    if (this.turbo.coolTimer > 0)    return;
    if (this.turbo.charge < 0.15)    return;

    this.turbo.active = true;
    this.turbo.timer  = this.turbo.duration * this.turbo.charge;
    Camera.shake(0.15, 'nitro');
  }

  _updateTurbo(dt) {
    if (!this.turbo.available) return;

    if (this.turbo.active) {
      this.turbo.timer -= dt;
      this.turbo.charge = MathUtils.clamp(this.turbo.timer / this.turbo.duration, 0, 1);

      if (this.turbo.timer <= 0) {
        this.turbo.active    = false;
        this.turbo.charge    = 0;
        this.turbo.coolTimer = this.turbo.cooldown;
      }
    } else if (this.turbo.coolTimer > 0) {
      // Cooling down
      this.turbo.coolTimer -= dt;
      if (this.turbo.coolTimer <= 0) {
        this.turbo.coolTimer = 0;
        // Recharge
        this.turbo.charge    = 0;
      }
    } else if (this.turbo.charge < 1.0) {
      // Recharging passively
      this.turbo.charge = MathUtils.clamp(
        this.turbo.charge + dt / (this.turbo.duration * 1.5),
        0, 1
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GEAR SIMULATION
  // ══════════════════════════════════════════════════════════════════════════

  _updateGear() {
    const spd = Math.abs(this.speedKmh);
    const top = this.stats.topSpeed;

    if (this.speedKmh < -1) {
      this.gear = 0;     // Reverse
      return;
    }

    // Six gears — evenly distributed across top speed
    const gearThresholds = [0, 0.14, 0.26, 0.42, 0.60, 0.78, 1.0];
    for (let g = 6; g >= 1; g--) {
      if (spd / top >= gearThresholds[g - 1]) {
        this.gear = g;
        return;
      }
    }
    this.gear = 1;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ODOMETER
  // ══════════════════════════════════════════════════════════════════════════

  _updateOdometer(dt) {
    const dist = Math.abs(MathUtils.kmhToMs(this.speedKmh)) * dt;
    this.distanceTravelled += dist;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SKID MARKS
  // ══════════════════════════════════════════════════════════════════════════

  _updateSkidMarks(dt) {
    // Decay existing skid mark decals
    for (let i = this._skidDecals.length - 1; i >= 0; i--) {
      const d = this._skidDecals[i];
      d.life -= dt * 0.08;   // slow fade
      d.mesh.material.opacity = MathUtils.clamp(d.life * 0.55, 0, 0.55);
      if (d.life <= 0) {
        Renderer.remove(d.mesh);
        Renderer.disposeObject(d.mesh);
        this._skidDecals.splice(i, 1);
      }
    }

    if (!this._skidding) return;

    const distFromLast = this.position.distanceTo(this._lastSkidPos);
    if (distFromLast < this._skidMinDist) return;

    this._lastSkidPos.copy(this.position);

    // Spawn skid mark decal under rear wheels
    const WHEEL_R = this.body.height * 0.32;
    const rearOff = this.body.wheelbase / 2;
    const fwdX    = Math.sin(this.heading);
    const fwdZ    = Math.cos(this.heading);

    for (const side of [-1, 1]) {
      const rightX =  Math.cos(this.heading) * side;
      const rightZ = -Math.sin(this.heading) * side;
      const wx = this.position.x - fwdX * rearOff + rightX * this.body.width * 0.38;
      const wz = this.position.z - fwdZ * rearOff + rightZ * this.body.width * 0.38;
      const wy = this.position.y + 0.008;

      const geo  = new THREE.PlaneGeometry(0.28, this._skidMinDist * 1.4);
      geo.rotateX(-Math.PI / 2);

      const mat  = new THREE.MeshBasicMaterial({
        color:       0x111111,
        transparent: true,
        opacity:     0.52,
        depthWrite:  false,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(wx, wy, wz);
      mesh.rotation.y = this.heading;
      Renderer.add(mesh);

      this._skidDecals.push({ mesh, life: 1.0 });

      // Limit total decals to avoid memory bloat
      if (this._skidDecals.length > 80) {
        const old = this._skidDecals.shift();
        Renderer.remove(old.mesh);
        Renderer.disposeObject(old.mesh);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ZONE DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  _updateZones() {
    // District check
    const district = CityMap.getDistrict(this.position.x, this.position.z);
    if (district !== this._currentDistrict) {
      this._currentDistrict = district;
      if (this.onEnterDistrict) {
        this.onEnterDistrict(district, CityMap.getDistrictName(this.position.x, this.position.z));
      }
    }

    // Bridge check
    const onBridge = Bridges.getBridgeSurfaceY(this.position.x, this.position.z) !== null;
    this._onBridge = onBridge;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERACTION PROXIMITY
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Check world markers (garages, dealers, race starts, taxi) for proximity.
   * Shows the interaction prompt via HUD.js when the player is close enough.
   */
  _updateInteractionCheck(dt) {
    if (typeof Markers === 'undefined') return;

    const nearest = Markers.getNearestMarker(
      this.position.x,
      this.position.z,
      CONFIG.HUD.MINIMAP_RANGE   // scan within minimap range
    );

    const INTERACT_DIST = 6.5;    // units to show prompt
    const INTERACT_DIST2 = INTERACT_DIST * INTERACT_DIST;

    if (nearest) {
      const dx = nearest.position.x - this.position.x;
      const dz = nearest.position.z - this.position.z;
      const d2 = dx * dx + dz * dz;

      if (d2 < INTERACT_DIST2) {
        if (this._nearMarker !== nearest) {
          this._nearMarker = nearest;
          if (this.onInteractNear) this.onInteractNear(nearest);
        }
        return;
      }
    }

    // Not near anything
    if (this._nearMarker !== null) {
      this._nearMarker = null;
      if (this.onInteractFar) this.onInteractFar();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPEEDING CHECK
  // ══════════════════════════════════════════════════════════════════════════

  _updateSpeedingCheck() {
    const limit     = CONFIG.ROADS.SPEED_LIMIT;
    const overLimit = CONFIG.POLICE.TRIGGERS.SPEED_OVER_LIMIT;
    const isOver    = this.speedKmh > limit + overLimit;

    if (this.onSpeedingChange) {
      this.onSpeedingChange(isOver, this.speedKmh);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HUD DATA UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  _updateHUD() {
    this.hudData.speedKmh    = Math.abs(Math.round(this.speedKmh));
    this.hudData.gear        = this.gear === 0 ? 'R' : String(this.gear);
    this.hudData.boostCharge = this.turbo.charge;
    this.hudData.boostActive = this.turbo.active;
    this.hudData.damage      = this.damage;
    this.hudData.isReversing = this.gear === 0;

    // Push to HUD module
    if (typeof HUD !== 'undefined') {
      HUD.updateSpeed(this.hudData.speedKmh);
      HUD.updateGear(this.hudData.gear);
      HUD.updateBoost(this.turbo.charge, this.turbo.active, this.turbo.coolTimer > 0);
      HUD.updateDamage(this.damage);
    }

    // Camera speed for FOV breathing
    Camera.setSpeed(this.hudData.speedKmh);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMERA ATTACHMENT
  // ══════════════════════════════════════════════════════════════════════════

  _updateCamera() {
    Camera.attachToTarget(this.group);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DESTRUCTION HANDLING
  // ══════════════════════════════════════════════════════════════════════════

  _handleDestruction() {
    if (!this.alive) return;
    this.alive = false;

    // Big explosion burst
    const burstPos = this.position.clone();
    burstPos.y += this.body.height * 0.5;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 1.5,
          (Math.random() - 0.5) * 2
        );
        this._spawnSparks(burstPos.clone().add(offset), 1.0);
      }, i * 200);
    }

    Camera.shake(0.6, 'collision');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESPAWN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Respawn the player car at the given position.
   * Resets damage, velocity, and re-activates the vehicle.
   *
   * @param {number} x
   * @param {number} z
   * @param {number} [heading=0]
   */
  respawn(x, z, heading = 0) {
    const y = CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y;
    this.setPosition(x, y, z, heading);
    this.repair();
    this.alive        = true;
    this.velocity.set(0, 0, 0);
    this.speedKmh     = 0;
    this.gear         = 1;
    this.steerAngle   = 0;
    this.turbo.active = false;
    this.turbo.charge = 1.0;
    this.turbo.timer  = 0;
    this.turbo.coolTimer = 0;

    if (this.group) this.group.visible = true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXTENDED SERIALISE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Extends Vehicle.serialise() with player-specific fields.
   * @returns {object}
   */
  serialise() {
    return {
      ...super.serialise(),
      distanceTravelled: this.distanceTravelled,
      gear:              this.gear,
      district:          this._currentDistrict,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  dispose() {
    // Clear skid mark decals
    for (const d of this._skidDecals) {
      Renderer.remove(d.mesh);
      Renderer.disposeObject(d.mesh);
    }
    this._skidDecals.length = 0;

    super.dispose();
  }

}

if (typeof module !== 'undefined') module.exports = PlayerCar;
/* ```

---

**File 20 ✅ — `js/vehicles/PlayerCar.js` done.**

This is the complete player-controlled car extending `Vehicle`. The torque curve tapers from peak off the line to 18% near top speed, so acceleration feels strong but not infinite — the car takes time to max out. Speed-sensitive steering reduces the maximum steer angle at high speed by a configurable damp factor so the car doesn't snap into spins. Handbrake instantly bleeds lateral velocity and locks the rear wheels, producing authentic rear-wheel drift. The turbo system manages a charge float from 0 to 1, tracks active timer and cooldown separately, and recharges passively at 1.5× the discharge rate. Gear simulation maps speed as a fraction of top speed to six forward gear thresholds. Skid marks spawn `PlaneGeometry` decals under both rear wheels whenever slip exceeds the threshold, capped at 80 total with the oldest evicted first. Zone detection checks the district every frame and fires `onEnterDistrict` on change. Interaction proximity scans `Markers.getNearestMarker` within minimap range and fires `onInteractNear` / `onInteractFar` callbacks that `MenuManager` listens to. All live data is pushed into `this.hudData` and directly forwarded to `HUD` module methods each frame.

**Say "File 21" for `js/vehicles/TrafficCar.js`.** */
