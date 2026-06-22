/* ## `js/vehicles/Vehicle.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — Vehicle.js
 * ============================================================================
 * Base class for every driveable or AI vehicle in the game.
 * PlayerCar, TrafficCar, and PoliceCar all extend this class.
 *
 * Responsibilities:
 *   • Three.js mesh assembly (body, cabin, wheels, headlights, taillights)
 *   • Arcade physics integration (velocity, steering, drag, gravity)
 *   • Wheel spin and steering visual animation
 *   • Damage model (0–100 %)
 *   • Bridge deck surface tracking (height clamping)
 *   • AABB collision volume
 *   • Headlight / taillight PointLights (day/night toggled by Sky.js)
 *   • Smoke / spark particle emitter stubs (activated at high damage)
 *   • Shared material + geometry cache (all cars of same colour reuse mats)
 *   • Hit flash effect (material emissive spike on collision)
 *   • Horn audio trigger stub
 *   • Serialisable state for SaveSystem
 * ============================================================================
 */

'use strict';

class Vehicle {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTOR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {object} carConfig   One entry from CONFIG.CARS (or a runtime copy).
   * @param {object} [overrides] Optional field overrides (paint colour, upgrades, etc.)
   */
  constructor(carConfig, overrides = {}) {

    // ── Identity ──────────────────────────────────────────────────────────
    this.id        = carConfig.id;
    this.name      = carConfig.name;

    // ── Stats (base + upgrade bonuses applied by EconomySystem) ──────────
    this.stats     = Object.assign({}, carConfig.stats, overrides.stats || {});

    // ── Body dimensions ───────────────────────────────────────────────────
    this.body      = Object.assign({}, carConfig.body);

    // ── Physics state ─────────────────────────────────────────────────────
    this.position       = new THREE.Vector3(0, CONFIG.WORLD.GROUND_Y + 0.5, 0);
    this.velocity       = new THREE.Vector3(0, 0, 0);   // world-space m/s
    this.heading        = 0;       // radians — Y-axis, 0 = +Z
    this.steerAngle     = 0;       // current front-wheel steer (radians)
    this.speedKmh       = 0;       // signed (+forward / -reverse)
    this.onGround       = true;
    this.airTime        = 0;       // seconds since last ground contact

    // ── Wheels ────────────────────────────────────────────────────────────
    this._wheelRot      = 0;       // cumulative spin angle (radians)

    // ── Damage ────────────────────────────────────────────────────────────
    this.damage         = MathUtils.clamp(overrides.damage || 0, 0, 100);
    this._hitFlashTimer = 0;

    // ── Paint ─────────────────────────────────────────────────────────────
    this.paintHex       = overrides.paintHex  || carConfig.colors.body;
    this.paintFinish    = overrides.finish     || 'standard';

    // ── Lights ────────────────────────────────────────────────────────────
    this._headlights    = [];      // THREE.SpotLight[]
    this._taillights    = [];      // THREE.PointLight[]
    this._lightsOn      = false;

    // ── Particles ─────────────────────────────────────────────────────────
    this._smokeEmitter  = null;    // populated in _buildSmokeEmitter()
    this._sparkEmitter  = null;
    this._particles     = [];      // active particle objects {mesh,vel,life}

    // ── Mesh hierarchy ────────────────────────────────────────────────────
    this.group          = null;    // THREE.Group — root transform
    this._bodyMesh      = null;
    this._cabinMesh     = null;
    this._wheelMeshes   = [];      // [FL, FR, RL, RR]
    this._frontAxle     = null;    // sub-group for steered wheels
    this._rearAxle      = null;

    // ── AABB (updated each frame) ─────────────────────────────────────────
    this.aabb           = MathUtils.makeAABB(0, 0, 0, this.body.length/2, 0.75, this.body.width/2);

    // ── Flags ─────────────────────────────────────────────────────────────
    this.alive          = true;
    this.isPlayer       = false;

    // Build the mesh immediately
    this._buildMesh();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MESH CONSTRUCTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Assemble the complete vehicle mesh hierarchy.
   * Called once in the constructor.
   */
  _buildMesh() {
    this.group      = new THREE.Group();
    this.group.name = `vehicle_${this.id}`;

    // Materials
    const bodyMat  = this._getBodyMat();
    const glassMat = Vehicle._getSharedMat('glass', () =>
      new THREE.MeshStandardMaterial({
        color:       0x88BBCC,
        roughness:   0.05,
        metalness:   0.15,
        transparent: true,
        opacity:     0.72,
      })
    );
    const tyresMat = Vehicle._getSharedMat('tyres', () =>
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 })
    );
    const rimMat   = Vehicle._getSharedMat('rims', () =>
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.35, metalness: 0.75 })
    );
    const underMat = Vehicle._getSharedMat('underside', () =>
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.90 })
    );
    const lightMat = Vehicle._getSharedMat('lightlens', () =>
      new THREE.MeshBasicMaterial({ color: 0xFFFFCC })
    );
    const brakeRedMat = Vehicle._getSharedMat('brakelight', () =>
      new THREE.MeshBasicMaterial({ color: 0xFF1111 })
    );

    const L  = this.body.length;
    const W  = this.body.width;
    const H  = this.body.height;
    const WB = this.body.wheelbase;

    // ── Body shell ────────────────────────────────────────────────────────
    // Slightly tapered box for better silhouette
    const bodyGeo   = new THREE.BoxGeometry(L, H * 0.58, W);
    this._bodyMesh  = new THREE.Mesh(bodyGeo, bodyMat);
    this._bodyMesh.position.set(0, H * 0.30, 0);
    this._bodyMesh.castShadow    = true;
    this._bodyMesh.receiveShadow = true;
    this.group.add(this._bodyMesh);

    // ── Cabin / greenhouse ────────────────────────────────────────────────
    const cabinW    = W  * 0.82;
    const cabinL    = L  * 0.50;
    const cabinH    = H  * 0.42;
    const cabinGeo  = new THREE.BoxGeometry(cabinL, cabinH, cabinW);
    this._cabinMesh = new THREE.Mesh(cabinGeo, bodyMat);
    this._cabinMesh.position.set(-L * 0.04, H * 0.58 + cabinH / 2, 0);
    this._cabinMesh.castShadow = true;
    this.group.add(this._cabinMesh);

    // Windscreen
    const wsGeo = new THREE.PlaneGeometry(cabinW * 0.90, cabinH * 0.72);
    const ws    = new THREE.Mesh(wsGeo, glassMat);
    ws.position.set(-L * 0.04 + cabinL / 2 + 0.01, H * 0.58 + cabinH / 2, 0);
    ws.rotation.y = Math.PI / 2;
    ws.rotation.z = -0.14;    // slight rake
    this.group.add(ws);

    // Rear window
    const rwGeo = new THREE.PlaneGeometry(cabinW * 0.88, cabinH * 0.65);
    const rw    = new THREE.Mesh(rwGeo, glassMat);
    rw.position.set(-L * 0.04 - cabinL / 2 - 0.01, H * 0.58 + cabinH / 2, 0);
    rw.rotation.y = -Math.PI / 2;
    rw.rotation.z =  0.14;
    this.group.add(rw);

    // Side windows (left + right)
    for (const side of [-1, 1]) {
      const swGeo = new THREE.PlaneGeometry(cabinL * 0.78, cabinH * 0.68);
      const sw    = new THREE.Mesh(swGeo, glassMat);
      sw.position.set(-L * 0.04, H * 0.58 + cabinH / 2, side * (cabinW / 2 + 0.01));
      sw.rotation.y = side > 0 ? 0 : Math.PI;
      this.group.add(sw);
    }

    // ── Underside / floor pan ──────────────────────────────────────────────
    const floorGeo = new THREE.BoxGeometry(L - 0.1, 0.12, W - 0.1);
    const floor    = new THREE.Mesh(floorGeo, underMat);
    floor.position.set(0, H * 0.08, 0);
    this.group.add(floor);

    // ── Bumpers ───────────────────────────────────────────────────────────
    const bumpGeo = new THREE.BoxGeometry(0.18, H * 0.22, W * 0.88);
    for (const side of [-1, 1]) {
      const bump = new THREE.Mesh(bumpGeo, underMat);
      bump.position.set(side * (L / 2 + 0.09), H * 0.18, 0);
      bump.castShadow = true;
      this.group.add(bump);
    }

    // ── Headlights ────────────────────────────────────────────────────────
    this._buildHeadlights(L, W, H, lightMat);

    // ── Taillights ────────────────────────────────────────────────────────
    this._buildTaillights(L, W, H, brakeRedMat);

    // ── Wheels ────────────────────────────────────────────────────────────
    this._buildWheels(L, W, H, WB, tyresMat, rimMat);

    // ── Smoke emitter ─────────────────────────────────────────────────────
    this._buildSmokeEmitter();

    // Finalize transform
    this.group.position.copy(this.position);
    Renderer.add(this.group);
  }

  // ── Headlights ─────────────────────────────────────────────────────────

  _buildHeadlights(L, W, H, lensMat) {
    const lensGeo = new THREE.BoxGeometry(0.08, H * 0.14, 0.5);

    for (const side of [-1, 1]) {
      // Lens mesh
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(L / 2 + 0.04, H * 0.28, side * W * 0.32);
      this.group.add(lens);

      // SpotLight
      const spot = new THREE.SpotLight(0xFFFFEE, 0, 28, Math.PI / 7, 0.35, 1.5);
      spot.position.set(L / 2 + 0.15, H * 0.28, side * W * 0.32);
      // Target — aims forward along local Z
      const target = new THREE.Object3D();
      target.position.set(L / 2 + 8, H * 0.15, side * W * 0.32);
      this.group.add(target);
      spot.target = target;
      spot.castShadow = false;   // too expensive per car
      this.group.add(spot);
      this._headlights.push(spot);
    }
  }

  // ── Taillights ─────────────────────────────────────────────────────────

  _buildTaillights(L, W, H, lensMat) {
    const lensGeo = new THREE.BoxGeometry(0.08, H * 0.12, 0.45);

    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(-L / 2 - 0.04, H * 0.26, side * W * 0.30);
      this.group.add(lens);

      const pt = new THREE.PointLight(0xFF1111, 0, 5);
      pt.position.set(-L / 2 - 0.2, H * 0.26, side * W * 0.30);
      this.group.add(pt);
      this._taillights.push(pt);
    }
  }

  // ── Wheels ─────────────────────────────────────────────────────────────

  _buildWheels(L, W, H, WB, tyresMat, rimMat) {
    const WHEEL_R   = H * 0.32;
    const WHEEL_W   = W * 0.14;

    const tyreGeo   = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 14);
    tyreGeo.rotateZ(Math.PI / 2);
    const rimGeo    = new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, WHEEL_W + 0.01, 10);
    rimGeo.rotateZ(Math.PI / 2);

    // Front axle group (steered)
    this._frontAxle = new THREE.Group();
    this._frontAxle.position.set(WB / 2, -H * 0.07, 0);
    this.group.add(this._frontAxle);

    // Rear axle group
    this._rearAxle = new THREE.Group();
    this._rearAxle.position.set(-WB / 2, -H * 0.07, 0);
    this.group.add(this._rearAxle);

    const axleConfigs = [
      { axle: this._frontAxle, sides: [-1, 1] },
      { axle: this._rearAxle,  sides: [-1, 1] },
    ];

    for (const { axle, sides } of axleConfigs) {
      for (const side of sides) {
        const wGrp = new THREE.Group();
        wGrp.position.set(0, 0, side * (W / 2 + WHEEL_W * 0.4));

        const tyre = new THREE.Mesh(tyreGeo, tyresMat);
        tyre.castShadow = true;
        wGrp.add(tyre);

        const rim = new THREE.Mesh(rimGeo, rimMat);
        wGrp.add(rim);

        axle.add(wGrp);
        this._wheelMeshes.push(wGrp);
      }
    }
  }

  // ── Smoke emitter ──────────────────────────────────────────────────────

  _buildSmokeEmitter() {
    this._smokeEmitter = {
      active: false,
      timer:  0,
      rate:   0.12,   // seconds between smoke puffs
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED MATERIAL CACHE
  // ══════════════════════════════════════════════════════════════════════════

  static _matCache = new Map();

  static _getSharedMat(key, factory) {
    if (Vehicle._matCache.has(key)) return Vehicle._matCache.get(key);
    const mat = factory();
    Vehicle._matCache.set(key, mat);
    return mat;
  }

  /**
   * Build or retrieve a body-paint material for this vehicle's colour.
   * Each unique (colour, finish) combination gets one cached material.
   */
  _getBodyMat() {
    const key = `body_${this.paintHex}_${this.paintFinish}`;
    return Vehicle._getSharedMat(key, () =>
      new THREE.MeshStandardMaterial({
        color:             new THREE.Color(this.paintHex),
        roughness:         this.paintFinish === 'matte'    ? 0.95 :
                           this.paintFinish === 'metallic' ? 0.35 :
                           this.paintFinish === 'chrome'   ? 0.05 : 0.60,
        metalness:         this.paintFinish === 'chrome'   ? 0.95 :
                           this.paintFinish === 'metallic' ? 0.65 : 0.12,
        envMapIntensity:   this.paintFinish === 'chrome'   ? 1.0  : 0.3,
      })
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHYSICS UPDATE  (called by subclasses every frame)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Integrate velocity, apply drag, bridge-clamp, and update the mesh.
   * Subclasses call super.update(dt) after computing their own forces.
   *
   * @param {number} dt  Delta time seconds.
   */
  update(dt) {
    if (!this.alive) return;

    const cfg = CONFIG.PHYSICS;

    // ── Gravity / ground ──────────────────────────────────────────────────
    const bridgeY = Bridges.getBridgeSurfaceY(this.position.x, this.position.z);
    const groundY = bridgeY !== null
      ? bridgeY
      : CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y;

    if (this.position.y > groundY + 0.05) {
      // In the air
      this.velocity.y   -= cfg.GRAVITY * dt;
      this.onGround      = false;
      this.airTime      += dt;
    } else {
      // On ground — clamp Y and kill vertical velocity
      this.position.y    = groundY;
      this.velocity.y    = 0;
      this.onGround      = true;
      this.airTime       = 0;
    }

    // ── Drag (rolling resistance + air resistance) ─────────────────────
    const dragFactor = Math.pow(1 - cfg.DRAG, dt);
    this.velocity.x *= dragFactor;
    this.velocity.z *= dragFactor;

    // ── Lateral friction — bleed off sideways slip ─────────────────────
    this._applyLateralFriction(dt);

    // ── Integrate position ─────────────────────────────────────────────
    this.position.addScaledVector(this.velocity, dt);

    // ── Speed readout ─────────────────────────────────────────────────
    const fwdX     = Math.sin(this.heading);
    const fwdZ     = Math.cos(this.heading);
    const dotFwd   = this.velocity.x * fwdX + this.velocity.z * fwdZ;
    this.speedKmh  = MathUtils.msToKmh(dotFwd);

    // ── Update mesh transform ─────────────────────────────────────────
    this.group.position.copy(this.position);
    this.group.position.y += this.body.height * 0.32;   // pivot offset
    this.group.rotation.y  = this.heading;

    // ── Wheel spin ────────────────────────────────────────────────────
    const WHEEL_R     = this.body.height * 0.32;
    const spinPerSec  = dotFwd / WHEEL_R;
    this._wheelRot   -= spinPerSec * dt;
    for (const w of this._wheelMeshes) {
      w.rotation.x = this._wheelRot;
    }

    // ── Steering visual ───────────────────────────────────────────────
    if (this._frontAxle) {
      this._frontAxle.rotation.y = this.steerAngle;
    }

    // ── Body roll (cosmetic lean into corners) ─────────────────────────
    const rollRate = -this.steerAngle * MathUtils.clamp(Math.abs(this.speedKmh) / 80, 0, 1);
    this.group.rotation.z = MathUtils.lerp(this.group.rotation.z, rollRate * 0.12, 0.18);

    // ── Pitch under acceleration / braking ────────────────────────────
    const pitchBias = -this.velocity.y * 0.012;
    this.group.rotation.x = MathUtils.lerp(this.group.rotation.x, pitchBias, 0.10);

    // ── AABB update ───────────────────────────────────────────────────
    this._updateAABB();

    // ── Hit flash decay ───────────────────────────────────────────────
    if (this._hitFlashTimer > 0) {
      this._hitFlashTimer -= dt;
      const intensity = MathUtils.clamp(this._hitFlashTimer / 0.25, 0, 1);
      if (this._bodyMesh) this._bodyMesh.material.emissiveIntensity = intensity * 0.6;
      if (this._cabinMesh) this._cabinMesh.material.emissiveIntensity = intensity * 0.3;
    }

    // ── Smoke at high damage ──────────────────────────────────────────
    this._updateSmoke(dt);

    // ── Particles ────────────────────────────────────────────────────
    this._updateParticles(dt);

    // ── Lights on at night ────────────────────────────────────────────
    const shouldHaveLights = Sky?.getSkyState()?.isNight ?? false;
    if (shouldHaveLights !== this._lightsOn) {
      this.setLights(shouldHaveLights);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LATERAL FRICTION
  // ══════════════════════════════════════════════════════════════════════════

  _applyLateralFriction(dt) {
    const cfg = CONFIG.PHYSICS;

    // Side-vector of the vehicle
    const rightX  =  Math.cos(this.heading);
    const rightZ  = -Math.sin(this.heading);

    // Lateral velocity component
    const latVel  = this.velocity.x * rightX + this.velocity.z * rightZ;

    // Effective grip (lower at high speed / high steer = drift)
    const speedN  = MathUtils.clamp(Math.abs(this.speedKmh) / this.stats.topSpeed, 0, 1);
    const grip    = MathUtils.lerp(
      cfg.LATERAL_FRICTION,
      cfg.DRIFT_FACTOR,
      Math.abs(this.steerAngle) / CONFIG.PHYSICS.MAX_STEER_ANGLE * speedN
    );

    // Bleed off lateral velocity
    const bleed   = latVel * (1 - grip) * dt * 8;
    this.velocity.x -= bleed * rightX;
    this.velocity.z -= bleed * rightZ;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AABB
  // ══════════════════════════════════════════════════════════════════════════

  _updateAABB() {
    // Axis-aligned approximation (no rotation — conservative but fast)
    const p  = this.position;
    const hw = this.body.length  / 2;
    const hh = this.body.height  / 2;
    const hd = this.body.width   / 2;

    this.aabb.minX = p.x - hw;  this.aabb.maxX = p.x + hw;
    this.aabb.minY = p.y;        this.aabb.maxY = p.y + this.body.height;
    this.aabb.minZ = p.z - hd;  this.aabb.maxZ = p.z + hd;
    this.aabb.cx   = p.x;
    this.aabb.cy   = p.y + hh;
    this.aabb.cz   = p.z;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLLISION RESPONSE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Handle a collision with another vehicle or static object.
   * Applies impulse, damage, and hit-flash.
   *
   * @param {THREE.Vector3} normal     Collision normal (points away from other).
   * @param {number}        impactSpeed World-space speed of impact (m/s).
   * @param {number}        otherMass   Mass of the other object (kg). 0 = static wall.
   */
  onCollision(normal, impactSpeed, otherMass = 0) {
    const cfg       = CONFIG.PHYSICS;
    const myMass    = this.stats.weight;
    const effectiveMass = otherMass > 0 ? otherMass : myMass * 10;

    // Impulse magnitude
    const impulse = MathUtils.collisionImpulse(
      impactSpeed,
      myMass,
      effectiveMass,
      cfg.COLLISION_RESTITUTION
    );

    // Apply to velocity
    this.velocity.addScaledVector(normal, impulse / myMass);

    // Damage
    const armorReduction = this.stats.damageReduction || 0;
    const dmg = MathUtils.impactDamage(
      Math.abs(impactSpeed),
      MathUtils.kmhToMs(cfg.DAMAGE_SPEED_THRESHOLD),
      cfg.DAMAGE_PER_IMPACT,
      1 - armorReduction
    );
    this.applyDamage(dmg);

    // Hit flash
    this._hitFlashTimer = 0.25;
    if (this._bodyMesh && this._bodyMesh.material.emissive) {
      this._bodyMesh.material.emissive.setHex(0xFF4400);
    }

    // Spawn spark burst at impact point
    const impactPt = this.position.clone().addScaledVector(normal, -this.body.length / 2);
    this._spawnSparks(impactPt, Math.min(impactSpeed / 5, 1));

    // Camera shake if this is the player
    if (this.isPlayer) {
      Camera.shake(MathUtils.clamp(Math.abs(impactSpeed) * 0.04, 0.05, 0.5), 'collision');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DAMAGE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Apply damage percentage to this vehicle.
   * @param {number} amount  Damage to add (0–100 scale).
   */
  applyDamage(amount) {
    if (amount <= 0) return;
    this.damage = MathUtils.clamp(this.damage + amount, 0, 100);

    // Visual deformation at high damage
    if (this.damage > 60 && this._bodyMesh) {
      const deform = (this.damage - 60) / 40;
      this._bodyMesh.scale.y = 1 - deform * 0.08;
    }

    // Activate smoke at 70 %
    if (this.damage >= 70 && this._smokeEmitter) {
      this._smokeEmitter.active = true;
    }
  }

  /**
   * Repair to 0 % damage.
   */
  repair() {
    this.damage = 0;
    if (this._bodyMesh) this._bodyMesh.scale.y = 1;
    if (this._smokeEmitter) this._smokeEmitter.active = false;
  }

  /**
   * Return true if the vehicle is destroyed (100 % damage).
   */
  isDestroyed() {
    return this.damage >= 100;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAINT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Apply a new paint job at runtime.
   * Replaces the body and cabin material with a new cached material.
   *
   * @param {number} hexColor
   * @param {string} finish   'standard'|'metallic'|'matte'|'chrome'
   */
  applyPaint(hexColor, finish = 'standard') {
    this.paintHex    = hexColor;
    this.paintFinish = finish;

    const newMat = this._getBodyMat();
    if (this._bodyMesh)  this._bodyMesh.material  = newMat;
    if (this._cabinMesh) this._cabinMesh.material  = newMat;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIGHTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Turn vehicle headlights and taillights on or off.
   * @param {boolean} on
   */
  setLights(on) {
    this._lightsOn = on;

    for (const spot of this._headlights) {
      spot.intensity = on ? 1.8 : 0;
    }
    for (const pt of this._taillights) {
      pt.intensity = on ? 1.2 : 0;
    }
  }

  /**
   * Activate brake lights (bright red rear glow).
   * @param {boolean} braking
   */
  setBrakeLights(braking) {
    for (const pt of this._taillights) {
      if (!this._lightsOn && !braking) {
        pt.intensity = 0;
      } else {
        pt.intensity = braking ? 2.4 : (this._lightsOn ? 1.2 : 0);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SMOKE PARTICLES
  // ══════════════════════════════════════════════════════════════════════════

  _updateSmoke(dt) {
    if (!this._smokeEmitter?.active) return;

    this._smokeEmitter.timer -= dt;
    if (this._smokeEmitter.timer > 0) return;
    this._smokeEmitter.timer = this._smokeEmitter.rate;

    // Spawn one smoke puff from the engine bay (front-top)
    const L    = this.body.length;
    const H    = this.body.height;

    const offset = new THREE.Vector3(L * 0.45, H * 0.75, 0);
    offset.applyEuler(this.group.rotation);

    const puffPos = this.position.clone().add(offset);
    puffPos.y    += H * 0.32;

    this._spawnPuff(puffPos);
  }

  _spawnPuff(pos) {
    const mat  = new THREE.MeshBasicMaterial({
      color:       0x888888,
      transparent: true,
      opacity:     0.55,
    });
    const geo  = new THREE.SphereGeometry(0.25, 5, 5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    Renderer.add(mesh);

    this._particles.push({
      mesh,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        0.6 + Math.random() * 0.6,
        (Math.random() - 0.5) * 0.8
      ),
      life:    1.0,
      type:    'smoke',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPARK PARTICLES
  // ══════════════════════════════════════════════════════════════════════════

  _spawnSparks(pos, intensity) {
    const count = Math.round(6 + intensity * 12);
    for (let i = 0; i < count; i++) {
      const mat  = new THREE.MeshBasicMaterial({
        color:       0xFF8800,
        transparent: true,
        opacity:     0.9,
      });
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 4, 4),
        mat
      );
      mesh.position.copy(pos);
      Renderer.add(mesh);

      const spd  = 2 + Math.random() * 4 * intensity;
      const ang  = Math.random() * Math.PI * 2;
      this._particles.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.cos(ang) * spd,
          3 + Math.random() * 3,
          Math.sin(ang) * spd
        ),
        life:  0.6 + Math.random() * 0.4,
        type: 'spark',
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PARTICLE UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  _updateParticles(dt) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];

      if (p.type === 'smoke') {
        p.velocity.y  += 0.4 * dt;
        p.mesh.scale.addScalar(dt * 1.2);
        p.mesh.material.opacity = MathUtils.clamp(p.life * 0.55, 0, 0.55);
      } else {
        p.velocity.y -= 14 * dt;   // gravity for sparks
        p.mesh.material.opacity = MathUtils.clamp(p.life * 0.9, 0, 0.9);
      }

      p.mesh.position.addScaledVector(p.velocity, dt);
      p.life -= dt * (p.type === 'smoke' ? 0.55 : 1.8);

      if (p.life <= 0) {
        Renderer.remove(p.mesh);
        Renderer.disposeObject(p.mesh);
        this._particles.splice(i, 1);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POSITION / HEADING SETTERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Teleport the vehicle to an exact world position.
   * Resets velocity.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} [heading=0]
   */
  setPosition(x, y, z, heading = 0) {
    this.position.set(x, y, z);
    this.heading  = heading;
    this.velocity.set(0, 0, 0);
    this.group.position.set(x, y + this.body.height * 0.32, z);
    this.group.rotation.y = heading;
    this._updateAABB();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SERIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return a plain-object snapshot of this vehicle's runtime state.
   * Used by SaveSystem to persist the player's car position.
   * @returns {object}
   */
  serialise() {
    return {
      id:       this.id,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      heading:  this.heading,
      speedKmh: this.speedKmh,
      damage:   this.damage,
      paintHex: this.paintHex,
      finish:   this.paintFinish,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Remove from scene and free all GPU resources.
   */
  dispose() {
    // Kill particles
    for (const p of this._particles) {
      Renderer.remove(p.mesh);
      Renderer.disposeObject(p.mesh);
    }
    this._particles.length = 0;

    if (this.group) {
      Renderer.disposeObject(this.group);
      Renderer.remove(this.group);
      this.group = null;
    }

    this.alive = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATIC CACHE DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Free all cached shared materials.
   * Call once on full game teardown.
   */
  static disposeSharedMaterials() {
    Vehicle._matCache.forEach(mat => mat.dispose());
    Vehicle._matCache.clear();
  }

}

if (typeof module !== 'undefined') module.exports = Vehicle;
/* ```

---

**File 19 ✅ — `js/vehicles/Vehicle.js` done.**

This is the complete base class for every vehicle in the game. The mesh assembly builds a full car hierarchy: tapered body shell, cabin greenhouse with four glass window planes, a floor pan, front and rear bumpers, four independently-grouped wheels on front and rear axle sub-groups, headlight SpotLights and taillight PointLights. Physics integration handles gravity against the bridge deck height or ground plane, aerodynamic and rolling drag, and a lateral friction model that blends between grip and drift based on steering angle and speed normalised to the car's top speed. The wheel spin angle is computed from the forward velocity dot product divided by wheel radius, and the front axle group rotates to match the current steer angle. Body roll leans the car into corners as a cosmetic touch, and pitch bias tilts it under acceleration. Collision response computes an impulse using the two-body formula, applies it to velocity, calculates damage using the impact speed threshold from `CONFIG.PHYSICS`, triggers a 250ms emissive hit flash, and spawns spark particles. Smoke puffs are spawned from the engine bay when damage exceeds 70% and are pooled in the same particle array as sparks. The shared material cache means all cars of the same colour and finish share one `MeshStandardMaterial` on the GPU.

**Say "File 20" for `js/vehicles/PlayerCar.js`.** */
