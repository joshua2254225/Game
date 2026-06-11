/*js/game.js*/
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LAVA JUMP — 3D Game Engine  (Three.js r128)
 *
 * Responsibilities:
 *   • Three.js renderer, scene, camera, lighting
 *   • Player mesh + block-character animation
 *   • Per-axis AABB collision detection & resolution
 *   • Platform types: normal, moving, crumble, bouncy, start, goal
 *   • Coin spawning, rotation, collection
 *   • Animated lava (vertex wave) + ambient ember particles
 *   • 3 camera modes: third-person orbit, isometric, top-down
 *   • Timer, win/lose detection
 *   • Particle burst effects
 * ══════════════════════════════════════════════════════════════════════════
 */

class Game {

  constructor(canvas, controls) {
    this.canvas   = canvas;
    this.controls = controls;

    // ── Game-state flags ─────────────────────────────────────────────────
    this.running  = false;
    this.paused   = false;
    this.firstTry = true;

    // ── Active level data ────────────────────────────────────────────────
    this.levelData = null;

    // ── Timer ────────────────────────────────────────────────────────────
    this.timer     = 0;
    this.timeLimit = 0;

    // ── Coin tracking ────────────────────────────────────────────────────
    this.coinsCollected = 0;
    this.totalCoins     = 0;

    // ── Physics constants ─────────────────────────────────────────────────
    this.GRAVITY    = -28;
    this.JUMP_FORCE =  14;
    this.MOVE_SPEED =   7;
    this.FRICTION   =  0.80;

    // ── Player physics state ─────────────────────────────────────────────
    this.playerVelocity  = new THREE.Vector3();
    this.playerOnGround  = false;
    this.playerSize      = { w: 0.7, h: 1.2, d: 0.7 };  // full extents

    // ── Camera ───────────────────────────────────────────────────────────
    this.cameraMode  = 0;      // 0=third-person, 1=isometric, 2=top-down
    this.cameraYaw   = 0;      // horizontal orbit angle (mode 0)
    this.camDist     = 11;
    this.camPitch    = 0.38;   // radians above horizon

    // ── Scene-object pools ────────────────────────────────────────────────
    this.player       = null;
    this.platforms    = [];    // see _createPlatform for shape
    this.coins        = [];    // { mesh, collected, originalY }
    this.particles    = [];    // { mesh, velocity, life }
    this.embers       = [];    // ambient floating sparks

    this.goalRing     = null;
    this._goalBeacon  = null;
    this._goalData    = null;  // { x,y,z,w,h,d } of goal platform

    // ── Moving-platform carry ─────────────────────────────────────────────
    this._standingOn     = null;
    this._prevStandingOn = null;

    // ── Callbacks (set by UI) ─────────────────────────────────────────────
    this.onCoinCollect   = null;  // (collected, total)
    this.onLevelComplete = null;  // (stats{})
    this.onPlayerDeath   = null;  // (reason)
    this.onTimerUpdate   = null;  // (secondsRemaining)

    // ── Clock & time-tracking ─────────────────────────────────────────────
    this.clock    = new THREE.Clock();
    this.lavaTime = 0;

    // ── Build Three.js world ──────────────────────────────────────────────
    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initLights();
    this._initLava();
    this._initDecorRocks();

    window.addEventListener('resize', () => this._onResize());

    // Start render loop immediately (lava animates behind menus too)
    this._animate();
  }

  // ════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ════════════════════════════════════════════════════════════════════════

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled  = true;
    this.renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x120300);
    this.scene.fog         = new THREE.FogExp2(0x1E0500, 0.017);
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.1, 260
    );
    this.camera.position.set(0, 12, 16);
    this.camera.lookAt(0, 0, 0);
  }

  _initLights() {
    // Warm ambient from lava glow
    this.scene.add(new THREE.AmbientLight(0xFF6622, 0.5));

    // Main directional "sun" with shadow
    const sun = new THREE.DirectionalLight(0xFFDDCC, 1.3);
    sun.position.set(30, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near   =   1;
    sun.shadow.camera.far    = 200;
    sun.shadow.camera.left   = -70;
    sun.shadow.camera.right  =  70;
    sun.shadow.camera.top    =  70;
    sun.shadow.camera.bottom = -70;
    this.scene.add(sun);
    this.sunLight = sun;

    // Dynamic lava-glow point light (follows player)
    this.lavaGlow = new THREE.PointLight(0xFF3300, 3, 38);
    this.lavaGlow.position.set(0, -4, 0);
    this.scene.add(this.lavaGlow);
  }

  _initLava() {
    // Low-poly plane — vertices displaced each frame for wave effect
    const geo = new THREE.PlaneGeometry(500, 500, 18, 18);
    geo.rotateX(-Math.PI / 2);

    // Cache original X/Z per vertex for wave formula
    const cnt = geo.attributes.position.count;
    this._lavaPosAttr = geo.attributes.position;
    this._lavaOrigX   = new Float32Array(cnt);
    this._lavaOrigZ   = new Float32Array(cnt);
    for (let i = 0; i < cnt; i++) {
      this._lavaOrigX[i] = geo.attributes.position.getX(i);
      this._lavaOrigZ[i] = geo.attributes.position.getZ(i);
    }

    const mat = new THREE.MeshStandardMaterial({
      color:             0xFF2200,
      emissive:          0xFF4400,
      emissiveIntensity: 1.6,
      roughness:         0.9,
    });

    this.lavaMesh = new THREE.Mesh(geo, mat);
    this.lavaMesh.position.y = -3.2;
    this.scene.add(this.lavaMesh);
  }

  _initDecorRocks() {
    // Atmospheric rock spires around the arena perimeter
    const mat = new THREE.MeshStandardMaterial({ color: 0x1A0A00, roughness: 1 });
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const r   = 95 + Math.random() * 55;
      const h   = 8  + Math.random() * 24;
      const geo = new THREE.ConeGeometry(3 + Math.random() * 4, h, 4 + Math.floor(Math.random() * 3));
      const m   = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(ang) * r, -3.2 + h / 2, Math.sin(ang) * r);
      m.rotation.y = Math.random() * Math.PI;
      this.scene.add(m);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEVEL MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════

  /** Load a fresh level. Always resets firstTry to true. */
  loadLevel(data) {
    this._clearLevel();

    this.levelData      = data;
    this.timeLimit      = data.timeLimit;
    this.timer          = data.timeLimit;
    this.coinsCollected = 0;
    this.totalCoins     = data.coins.length;
    this.firstTry       = true;
    this.lavaTime       = 0;

    // Platforms
    for (const p of data.platforms) this.platforms.push(this._createPlatform(p));

    // Coins
    for (const c of data.coins) this.coins.push(this._createCoin(c[0], c[1], c[2]));

    // Player
    this.player = this._createPlayer(data.startPos);
    this.playerVelocity.set(0, 0, 0);
    this.playerOnGround  = false;
    this._standingOn     = null;
    this._prevStandingOn = null;

    // Camera reset
    this.cameraYaw = 0;

    // Move lava glow to level start
    this.lavaGlow.position.set(data.startPos[0], -4, data.startPos[2]);
  }

  /** Restart the current level — keeps firstTry = false. */
  resetLevel() {
    if (!this.levelData) return;
    this.loadLevel(this.levelData);
    this.firstTry = false;   // override what loadLevel just set to true
  }

  _clearLevel() {
    for (const p of this.platforms)  this.scene.remove(p.mesh);
    for (const c of this.coins)      this.scene.remove(c.mesh);
    for (const p of this.particles)  this.scene.remove(p.mesh);
    for (const e of this.embers)     this.scene.remove(e.mesh);

    this.platforms = [];
    this.coins     = [];
    this.particles = [];
    this.embers    = [];

    if (this.player)      { this.scene.remove(this.player);      this.player     = null; }
    if (this.goalRing)    { this.scene.remove(this.goalRing);    this.goalRing   = null; }
    if (this._goalBeacon) { this.scene.remove(this._goalBeacon); this._goalBeacon = null; }
    this._goalData = null;
  }

  // ════════════════════════════════════════════════════════════════════════
  // OBJECT CREATION
  // ════════════════════════════════════════════════════════════════════════

  _createPlatform(data) {
    const [x, y, z, w, h, d, type, opts] = data;

    // Colour scheme per type
    const COLS = {
      start:   { c: 0x44BB55, e: 0x226633, ei: 0.30 },
      goal:    { c: 0x00EE77, e: 0x00AA55, ei: 1.00 },
      normal:  { c: 0x7A6B55, e: 0x000000, ei: 0.00 },
      moving:  { c: 0x4488EE, e: 0x224488, ei: 0.25 },
      crumble: { c: 0xBB4422, e: 0x000000, ei: 0.00 },
      bouncy:  { c: 0xFFCC00, e: 0x996600, ei: 0.40 },
    };
    const col = COLS[type] || COLS.normal;

    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color:             col.c,
      emissive:          col.e,
      emissiveIntensity: col.ei,
      roughness:         0.85,
      metalness:         0.10,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Subtle edge lines for depth perception
    const eLine = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.11 })
    );
    mesh.add(eLine);

    // Goal-specific effects
    if (type === 'goal') this._buildGoalFX(x, y + h / 2, z);

    // Moving-platform oscillation state
    let movingState = null;
    if (type === 'moving' && opts) {
      movingState = {
        origin: new THREE.Vector3(x, y, z),
        axis:   opts.axis,
        range:  opts.range,
        speed:  opts.speed,
        phase:  Math.random() * Math.PI * 2,  // random start offset so all aren't in sync
      };
    }

    return {
      mesh,
      data:         { x, y, z, w, h, d, type, opts },
      movingState,
      crumbleState: type === 'crumble' ? 'idle' : null,  // idle|crumbling|fallen
      crumbleTimer: 0,
      originalPos:  new THREE.Vector3(x, y, z),
      movingDelta:  new THREE.Vector3(),
    };
  }

  _buildGoalFX(x, topY, z) {
    // Spinning torus ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.9, 0.11, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0x00FF88 })
    );
    ring.position.set(x, topY + 0.8, z);
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);
    this.goalRing = ring;

    // Pulsing beacon light
    const beacon = new THREE.PointLight(0x00FF88, 2, 9);
    beacon.position.set(x, topY + 1, z);
    this.scene.add(beacon);
    this._goalBeacon = beacon;

    // Store geometry info for goal-detection
    // (will be replaced when _createPlatform sets _goalData via reference)
  }

  _createCoin(x, y, z) {
    const g = new THREE.Group();

    // Disc body
    g.add(Object.assign(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.12, 14),
        new THREE.MeshStandardMaterial({ color: 0xFFD700, emissive: 0xFFAA00, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.1 })
      )
    ));

    // Sparkle ring
    g.add(new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.04, 6, 14),
      new THREE.MeshBasicMaterial({ color: 0xFFFF88 })
    ));

    g.position.set(x, y, z);
    this.scene.add(g);
    return { mesh: g, collected: false, originalY: y };
  }

  _createPlayer(startPos) {
    const g = new THREE.Group();

    const bodyM = new THREE.MeshStandardMaterial({ color: 0xFF6B35, roughness: 0.7 });
    const headM = new THREE.MeshStandardMaterial({ color: 0xFFCDA0, roughness: 0.7 });
    const legM  = new THREE.MeshStandardMaterial({ color: 0x3355AA, roughness: 0.8 });
    const eyeM  = new THREE.MeshBasicMaterial({ color: 0x111111 });

    const body  = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.75, 0.50), bodyM);
    const head  = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.58), headM);
    const eyeGeo = new THREE.SphereGeometry(0.07, 6, 6);
    const eyeL  = new THREE.Mesh(eyeGeo, eyeM);
    const eyeR  = new THREE.Mesh(eyeGeo, eyeM);
    const legL  = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.44, 0.28), legM);
    const legR  = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.44, 0.28), legM);

    head.position.y = 0.67;
    eyeL.position.set(-0.14, 0.72, 0.28);
    eyeR.position.set( 0.14, 0.72, 0.28);
    legL.position.set(-0.22, -0.60, 0);
    legR.position.set( 0.22, -0.60, 0);

    [body, head, legL, legR].forEach(m => m.castShadow = true);
    g.add(body, head, eyeL, eyeR, legL, legR);
    g.position.set(startPos[0], startPos[1], startPos[2]);
    g.userData = { head, legL, legR, walkTime: 0 };
    this.scene.add(g);
    return g;
  }

  // ════════════════════════════════════════════════════════════════════════
  // COLLISION — AABB HELPERS
  // ════════════════════════════════════════════════════════════════════════

  _getPlayerAABB() {
    const p  = this.player.position;
    const hw = this.playerSize.w / 2, hh = this.playerSize.h / 2, hd = this.playerSize.d / 2;
    return { minX: p.x-hw, maxX: p.x+hw, minY: p.y-hh, maxY: p.y+hh, minZ: p.z-hd, maxZ: p.z+hd };
  }

  _getPlatAABB(plat) {
    const p  = plat.mesh.position;
    const hw = plat.data.w/2, hh = plat.data.h/2, hd = plat.data.d/2;
    return { minX: p.x-hw, maxX: p.x+hw, minY: p.y-hh, maxY: p.y+hh, minZ: p.z-hd, maxZ: p.z+hd };
  }

  _overlap(a, b) {
    return a.minX < b.maxX && a.maxX > b.minX &&
           a.minY < b.maxY && a.maxY > b.minY &&
           a.minZ < b.maxZ && a.maxZ > b.minZ;
  }

  // ── Per-axis resolution (move one axis at a time, then resolve) ──────────

  _resolveX() {
    for (const plat of this.platforms) {
      if (plat.crumbleState === 'fallen') continue;
      const pA = this._getPlayerAABB(), lA = this._getPlatAABB(plat);
      if (!this._overlap(pA, lA)) continue;
      this.player.position.x = this.playerVelocity.x > 0
        ? lA.minX - this.playerSize.w / 2 - 0.001
        : lA.maxX + this.playerSize.w / 2 + 0.001;
      this.playerVelocity.x = 0;
      break;
    }
  }

  _resolveY() {
    for (const plat of this.platforms) {
      if (plat.crumbleState === 'fallen') continue;
      const pA = this._getPlayerAABB(), lA = this._getPlatAABB(plat);
      if (!this._overlap(pA, lA)) continue;

      if (this.playerVelocity.y <= 0) {
        // ── Land on top ────────────────────────────────────────────────
        this.player.position.y = lA.maxY + this.playerSize.h / 2 + 0.001;
        this.playerVelocity.y  = 0;
        this.playerOnGround    = true;
        this._standingOn       = plat;

        if (plat.data.type === 'bouncy') {
          this.playerVelocity.y = this.JUMP_FORCE * 1.6;
          this.playerOnGround   = false;
          this._standingOn      = null;
          this._burst(this.player.position.clone(), 8, 0xFFDD00, 4, 5);
        }
        if (plat.data.type === 'crumble' && plat.crumbleState === 'idle') {
          plat.crumbleState = 'crumbling';
          plat.crumbleTimer = 1.5;
        }
      } else {
        // ── Ceiling bump ───────────────────────────────────────────────
        this.player.position.y = lA.minY - this.playerSize.h / 2 - 0.001;
        this.playerVelocity.y  = 0;
      }
      break;
    }
  }

  _resolveZ() {
    for (const plat of this.platforms) {
      if (plat.crumbleState === 'fallen') continue;
      const pA = this._getPlayerAABB(), lA = this._getPlatAABB(plat);
      if (!this._overlap(pA, lA)) continue;
      this.player.position.z = this.playerVelocity.z > 0
        ? lA.minZ - this.playerSize.d / 2 - 0.001
        : lA.maxZ + this.playerSize.d / 2 + 0.001;
      this.playerVelocity.z = 0;
      break;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // PLAYER UPDATE
  // ════════════════════════════════════════════════════════════════════════

  _updatePlayer(dt) {
    // ── Carry player when standing on a moving platform ────────────────
    if (this._prevStandingOn && this._prevStandingOn.movingDelta) {
      const d = this._prevStandingOn.movingDelta;
      this.player.position.x += d.x;
      this.player.position.z += d.z;
    }
    this._prevStandingOn = null;
    this._standingOn     = null;

    // ── Input ──────────────────────────────────────────────────────────
    const move = this.controls.getMovement();
    const jump = this.controls.consumeJump();

    // ── Camera-relative movement direction ────────────────────────────
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    camDir.y = 0;
    if (camDir.length() < 0.001) camDir.set(0, 0, -1);
    else camDir.normalize();
    const camRight = new THREE.Vector3()
      .crossVectors(camDir, new THREE.Vector3(0, 1, 0))
      .normalize();

    const spd = this.MOVE_SPEED;
    const tx  = (camDir.x * move.y + camRight.x * move.x) * spd;
    const tz  = (camDir.z * move.y + camRight.z * move.x) * spd;

    // Smooth acceleration
    this.playerVelocity.x += (tx - this.playerVelocity.x) * 0.22;
    this.playerVelocity.z += (tz - this.playerVelocity.z) * 0.22;

    // ── Jump ───────────────────────────────────────────────────────────
    if (jump && this.playerOnGround) {
      this.playerVelocity.y = this.JUMP_FORCE;
      this.playerOnGround   = false;
      this._burst(
        this.player.position.clone().add(new THREE.Vector3(0, -0.5, 0)),
        6, 0xFFAA22, 3, 2
      );
    }

    // ── Gravity ────────────────────────────────────────────────────────
    if (!this.playerOnGround) this.playerVelocity.y += this.GRAVITY * dt;
    this.playerVelocity.y = Math.max(this.playerVelocity.y, -36);

    // ── Reset ground state, then move + resolve each axis ──────────────
    this.playerOnGround = false;

    this.player.position.x += this.playerVelocity.x * dt;
    this._resolveX();

    this.player.position.y += this.playerVelocity.y * dt;
    this._resolveY();

    this.player.position.z += this.playerVelocity.z * dt;
    this._resolveZ();

    // ── Ground friction ────────────────────────────────────────────────
    if (this.playerOnGround) {
      this.playerVelocity.x *= this.FRICTION;
      this.playerVelocity.z *= this.FRICTION;
      this._prevStandingOn = this._standingOn;
    }

    // ── Face direction of travel ────────────────────────────────────────
    const hSpd = Math.hypot(this.playerVelocity.x, this.playerVelocity.z);
    if (hSpd > 0.4)
      this.player.rotation.y = Math.atan2(this.playerVelocity.x, this.playerVelocity.z);

    // ── Limb animation ─────────────────────────────────────────────────
    const ud = this.player.userData;
    if (hSpd > 0.4) {
      ud.walkTime += dt * hSpd * 4;
      ud.legL.rotation.x =  Math.sin(ud.walkTime) * 0.55;
      ud.legR.rotation.x = -Math.sin(ud.walkTime) * 0.55;
      ud.head.position.y  = 0.67 + Math.sin(ud.walkTime * 2) * 0.025;
    } else {
      ud.legL.rotation.x *= 0.84;
      ud.legR.rotation.x *= 0.84;
      ud.head.position.y  = 0.67;
    }
    // Slight body tilt based on horizontal speed
    if (this.player.children[0])
      this.player.children[0].rotation.z = -this.playerVelocity.x * 0.04;

    // ── Lava death ─────────────────────────────────────────────────────
    if (this.player.position.y < -1.5) this._die('lava');
  }

  // ════════════════════════════════════════════════════════════════════════
  // PLATFORM UPDATE
  // ════════════════════════════════════════════════════════════════════════

  _updatePlatforms(dt) {
    for (const plat of this.platforms) {

      // ── Moving oscillation ─────────────────────────────────────────
      if (plat.movingState) {
        const ms   = plat.movingState;
        const prev = plat.mesh.position.clone();
        ms.phase  += dt * ms.speed;
        const offset = Math.sin(ms.phase) * ms.range;
        const np     = ms.origin.clone();
        if      (ms.axis === 'x') np.x += offset;
        else if (ms.axis === 'y') np.y += offset;
        else                      np.z += offset;
        plat.mesh.position.copy(np);
        plat.movingDelta.subVectors(np, prev);
      } else {
        plat.movingDelta.set(0, 0, 0);
      }

      // ── Crumble ────────────────────────────────────────────────────
      if (plat.crumbleState === 'crumbling') {
        plat.crumbleTimer -= dt;
        const shake = (1.5 - plat.crumbleTimer) * 0.16;
        plat.mesh.position.x = plat.originalPos.x + (Math.random() - 0.5) * shake;
        plat.mesh.position.z = plat.originalPos.z + (Math.random() - 0.5) * shake;

        plat.mesh.material.emissive.setHex(0xFF2200);
        plat.mesh.material.emissiveIntensity = (1 - plat.crumbleTimer / 1.5) * 0.9;

        if (plat.crumbleTimer <= 0) {
          plat.crumbleState = 'fallen';
          plat.mesh.position.y = -60;   // sink out of sight
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // COINS & GOAL
  // ════════════════════════════════════════════════════════════════════════

  _checkCoins() {
    for (const c of this.coins) {
      if (c.collected) continue;
      if (this.player.position.distanceTo(c.mesh.position) < 1.2) {
        c.collected = true;
        this.coinsCollected++;
        this._burst(c.mesh.position.clone(), 10, 0xFFD700, 4, 7);
        this.scene.remove(c.mesh);
        if (this.onCoinCollect) this.onCoinCollect(this.coinsCollected, this.totalCoins);
      }
    }
  }

  _checkGoal() {
    if (!this.playerOnGround) return;

    for (const plat of this.platforms) {
      if (plat.data.type !== 'goal') continue;
      const lA = this._getPlatAABB(plat);
      const p  = this.player.position;
      const onTop =
        p.x > lA.minX && p.x < lA.maxX &&
        p.z > lA.minZ && p.z < lA.maxZ &&
        Math.abs(p.y - lA.maxY - this.playerSize.h / 2) < 0.5;

      if (onTop) {
        this.running = false;
        if (this.onLevelComplete) {
          this.onLevelComplete({
            coinsCollected: this.coinsCollected,
            totalCoins:     this.totalCoins,
            timeRemaining:  this.timer,
            timeLimit:      this.timeLimit,
            firstTry:       this.firstTry,
          });
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // DEATH
  // ════════════════════════════════════════════════════════════════════════

  _die(reason) {
    if (!this.running) return;
    this.running  = false;
    this.firstTry = false;
    this._burst(this.player.position.clone(), 24, 0xFF4400, 7, 9);
    if (this.player) this.player.visible = false;
    if (this.onPlayerDeath) setTimeout(() => this.onPlayerDeath(reason), 900);
  }

  // ════════════════════════════════════════════════════════════════════════
  // TIMER
  // ════════════════════════════════════════════════════════════════════════

  _updateTimer(dt) {
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 0; this._die('timer'); }
    if (this.onTimerUpdate) this.onTimerUpdate(this.timer);
  }

  // ════════════════════════════════════════════════════════════════════════
  // VISUAL UPDATES
  // ════════════════════════════════════════════════════════════════════════

  _updateLava(dt) {
    this.lavaTime += dt;
    const pos = this._lavaPosAttr;

    for (let i = 0; i < pos.count; i++) {
      const ox = this._lavaOrigX[i];
      const oz = this._lavaOrigZ[i];
      const w  =
        Math.sin(ox * 0.22 + this.lavaTime * 1.8) * 0.38 +
        Math.cos(oz * 0.22 + this.lavaTime * 1.4) * 0.28 +
        Math.sin((ox + oz) * 0.12 + this.lavaTime * 2.6) * 0.14;
      pos.setY(i, w);
    }
    pos.needsUpdate = true;
    this.lavaMesh.geometry.computeVertexNormals();

    this.lavaMesh.material.emissiveIntensity = 1.4 + Math.sin(this.lavaTime * 2.6) * 0.4;
    this.lavaGlow.intensity = 2.5 + Math.sin(this.lavaTime * 3) * 0.8;

    if (this.player) {
      this.lavaGlow.position.x = this.player.position.x;
      this.lavaGlow.position.z = this.player.position.z;
    }
  }

  _updateCoins(dt) {
    for (const c of this.coins) {
      if (c.collected) continue;
      c.mesh.rotation.y  += dt * 2.8;
      c.mesh.position.y   = c.originalY + Math.sin(this.lavaTime * 2 + c.originalY * 0.7) * 0.18;
    }
  }

  _updateGoalFX(dt) {
    if (this.goalRing) {
      this.goalRing.rotation.z += dt * 1.8;
      const s = 1 + Math.sin(this.lavaTime * 4) * 0.08;
      this.goalRing.scale.set(s, s, 1);
    }
    if (this._goalBeacon) {
      this._goalBeacon.intensity = 1.8 + Math.sin(this.lavaTime * 5) * 0.85;
    }
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.velocity.y -= 22 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.life -= dt * 1.8;
      p.mesh.material.opacity = Math.max(0, p.life);
      if (p.life <= 0) { this.scene.remove(p.mesh); this.particles.splice(i, 1); }
    }
  }

  _updateEmbers(dt) {
    // Spawn ambient sparks
    if (Math.random() < 0.4 && this.embers.length < 40) {
      const cx  = this.player ? this.player.position.x : 0;
      const cz  = this.player ? this.player.position.z : 0;
      const mat = new THREE.MeshBasicMaterial({
        color:       Math.random() < 0.5 ? 0xFF5500 : 0xFF9900,
        transparent: true,
        opacity:     0.9,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.06, 4, 4), mat);
      mesh.position.set(
        cx + (Math.random() - 0.5) * 55,
        -3 + Math.random() * 0.4,
        cz + (Math.random() - 0.5) * 55
      );
      this.scene.add(mesh);
      const life = 2.5 + Math.random() * 3;
      this.embers.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          0.55 + Math.random() * 1.4,
          (Math.random() - 0.5) * 0.4
        ),
        life,
        maxLife: life,
      });
    }
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.mesh.position.addScaledVector(e.velocity, dt);
      e.velocity.y -= 0.04 * dt;
      e.life -= dt;
      e.mesh.material.opacity = Math.max(0, (e.life / e.maxLife) * 0.9);
      if (e.life <= 0) { this.scene.remove(e.mesh); this.embers.splice(i, 1); }
    }
  }

  /** Spawn a burst of particles at pos. */
  _burst(pos, count, color, spread, upForce) {
    for (let i = 0; i < count; i++) {
      const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 4, 4), mat
      );
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          Math.random() * upForce,
          (Math.random() - 0.5) * spread
        ),
        life: 1.0,
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // CAMERA
  // ════════════════════════════════════════════════════════════════════════

  _updateCamera(dt) {
    // Consume swipe input first so it feeds into the position calculation
    const swipeDelta = this.controls.consumeCameraRotation();
    if (this.cameraMode === 0) this.cameraYaw += swipeDelta * 0.004;

    if (!this.player) return;
    const tgt = this.player.position;

    switch (this.cameraMode) {

      case 0: {
        // Third-person orbit — camera orbits around player using yaw+pitch
        const cx = tgt.x - Math.sin(this.cameraYaw) * this.camDist * Math.cos(this.camPitch);
        const cy = tgt.y + Math.sin(this.camPitch)  * this.camDist + 2;
        const cz = tgt.z - Math.cos(this.cameraYaw) * this.camDist * Math.cos(this.camPitch);
        this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.12);
        this.camera.lookAt(tgt.x, tgt.y + 0.8, tgt.z);
        break;
      }

      case 1: {
        // Isometric — fixed 45° angle from all three axes
        const iso = new THREE.Vector3(tgt.x + 14, tgt.y + 14, tgt.z + 14);
        this.camera.position.lerp(iso, 0.09);
        this.camera.lookAt(tgt.x, tgt.y + 0.5, tgt.z);
        break;
      }

      case 2: {
        // Top-down — directly overhead (tiny Z offset avoids gimbal lock)
        this.camera.position.lerp(new THREE.Vector3(tgt.x, tgt.y + 22, tgt.z + 0.01), 0.09);
        this.camera.lookAt(tgt.x, tgt.y, tgt.z);
        break;
      }
    }
  }

  setCameraMode(mode) { this.cameraMode = mode; }

  // ════════════════════════════════════════════════════════════════════════
  // MAIN LOOP
  // ════════════════════════════════════════════════════════════════════════

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);  // cap at 50 ms

    // Always animate atmosphere even in menus
    this._updateLava(dt);
    this._updateEmbers(dt);

    if (this.running && !this.paused) {
      this._updatePlatforms(dt);
      this._updatePlayer(dt);
      this._checkCoins();
      this._checkGoal();
      this._updateCoins(dt);
      this._updateGoalFX(dt);
      this._updateParticles(dt);
      this._updateTimer(dt);
    } else {
      // Decorative updates while paused / in menu
      this._updateGoalFX(dt);
      this._updateCoins(dt);
    }

    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════════════

  start()  { this.running = true;  this.paused = false; }
  pause()  { this.paused  = true;  }
  resume() { this.paused  = false; }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
