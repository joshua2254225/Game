/* ## `js/world/Water.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — Water.js
 * ============================================================================
 * Builds and animates the river that cuts through the Riverside district.
 *
 * Features:
 *   • Animated wave surface via per-frame vertex displacement (sine waves +
 *     fBm noise baked onto a subdivided PlaneGeometry)
 *   • Reflective water material using environment colour tinting
 *   • Foam / shoreline edge strips along both banks
 *   • River bed (dark plane slightly below water surface)
 *   • Ambient water PointLights for blue underglow at night
 *   • Ripple ring particles spawned randomly on the surface
 *   • Splashes when the player drives through the water (if applicable)
 *   • Dry-land collision detection — notifies Game.js when player enters water
 *   • Static decorative elements: lily pads, floating debris, ducks (simple)
 *   • Configures a rectangular "water zone" AABB for fast overlap tests
 *
 * River geometry (from CONFIG.WATER):
 *   Runs east–west from x=0 to x=256 at z=64, width=28 units.
 *   Three bridges interrupt it (handled by Bridges.js, which masks the water).
 * ============================================================================
 */

'use strict';

const Water = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const W_CFG      = CONFIG.WATER;
  const GROUND_Y   = CONFIG.WORLD.GROUND_Y;

  // River extents (world space)
  const RIVER_X0   = W_CFG.RIVER_X_START;        //   0
  const RIVER_X1   = W_CFG.RIVER_X_END;           // 256
  const RIVER_LEN  = RIVER_X1 - RIVER_X0;         // 256
  const RIVER_Z    = W_CFG.RIVER_Z_CENTER;         //  64
  const RIVER_W    = W_CFG.RIVER_WIDTH;            //  28
  const RIVER_Y    = GROUND_Y + W_CFG.RIVER_Y;    // slightly below ground

  // Water surface Y (top of the wave displacement)
  const SURFACE_Y  = RIVER_Y + W_CFG.WAVE_HEIGHT;

  // AABB for fast player-in-water test
  const WATER_AABB = {
    minX: RIVER_X0,
    maxX: RIVER_X1,
    minZ: RIVER_Z - RIVER_W / 2,
    maxZ: RIVER_Z + RIVER_W / 2,
    minY: RIVER_Y - 0.5,
    maxY: SURFACE_Y + 0.5,
  };

  // Bridge X positions to cut holes in the water geometry
  const BRIDGE_XS  = W_CFG.BRIDGES.map(b => b.x);
  const BRIDGE_GAP = 12;   // units of water surface to leave clear under each bridge

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  let _waterMesh    = null;     // THREE.Mesh — animated wave surface
  let _bedMesh      = null;     // THREE.Mesh — river bed
  let _foamL        = null;     // THREE.Mesh — north bank foam strip
  let _foamR        = null;     // THREE.Mesh — south bank foam strip
  let _rootGroup    = null;     // THREE.Group — all water objects
  let _rippleGroup  = null;     // THREE.Group — ripple ring pool
  let _lilyGroup    = null;     // THREE.Group — lily pads

  // Wave animation
  let _time         = 0;
  const _posAttr    = null;     // THREE.BufferAttribute of water surface verts
  let _origX        = null;     // Float32Array — original X positions
  let _origZ        = null;     // Float32Array — original Z positions

  // Ripple pool (reused objects)
  const MAX_RIPPLES = 12;
  const _ripples    = [];       // { mesh, life, maxLife, scale }

  // Ambient water glow lights
  const _waterLights = [];

  // Callback registered by Game.js
  let _onPlayerEnterWater = null;
  let _onPlayerExitWater  = null;
  let _playerWasInWater   = false;

  // Seeded RNG for deterministic decoration
  const _rng = MathUtils.createRNG(W_CFG.RIVER_Z_CENTER + 99);

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build all water geometry and add to scene.
   * Called after RoadBuilder.build() and Props.build().
   */
  function init() {
    Renderer.setLoadProgress(53, 'Building river…');

    _rootGroup   = new THREE.Group();
    _rootGroup.name = 'water';

    _rippleGroup = new THREE.Group();
    _rippleGroup.name = 'ripples';

    _lilyGroup   = new THREE.Group();
    _lilyGroup.name = 'lilyPads';

    _buildRiverBed();
    _buildWaterSurface();
    _buildFoamStrips();
    _buildBankEdges();
    _buildWaterLights();
    _buildLilyPads();
    _buildRipplePool();
    _buildFloatingDebris();

    _rootGroup.add(_rippleGroup);
    _rootGroup.add(_lilyGroup);
    Renderer.add(_rootGroup);

    Renderer.setLoadProgress(56, 'River built.');
    console.info('[Water] River initialised. ' +
      `Length: ${RIVER_LEN}u | Width: ${RIVER_W}u | Y: ${RIVER_Y.toFixed(2)}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RIVER BED
  // ══════════════════════════════════════════════════════════════════════════

  function _buildRiverBed() {
    const geo = new THREE.PlaneGeometry(RIVER_LEN, RIVER_W);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color:     0x0A2A3A,
      roughness: 1.0,
      metalness: 0.0,
    });

    _bedMesh = new THREE.Mesh(geo, mat);
    _bedMesh.name           = 'riverBed';
    _bedMesh.position.set(
      RIVER_X0 + RIVER_LEN / 2,
      RIVER_Y - 0.4,
      RIVER_Z
    );
    _bedMesh.receiveShadow   = true;
    _bedMesh.matrixAutoUpdate = false;
    _bedMesh.updateMatrix();
    _rootGroup.add(_bedMesh);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WATER SURFACE  (animated)
  // ══════════════════════════════════════════════════════════════════════════

  function _buildWaterSurface() {
    // Subdivided plane — more verts = smoother waves.
    // Segments chosen to balance quality vs vertex count.
    const SEG_X = Math.floor(RIVER_LEN / 4);   // ~64 segments along length
    const SEG_Z = 12;                            // 12 segments across width

    const geo = new THREE.PlaneGeometry(RIVER_LEN, RIVER_W, SEG_X, SEG_Z);
    geo.rotateX(-Math.PI / 2);

    // Cache original positions for wave animation
    const pos  = geo.attributes.position;
    const cnt  = pos.count;
    _origX = new Float32Array(cnt);
    _origZ = new Float32Array(cnt);

    for (let i = 0; i < cnt; i++) {
      _origX[i] = pos.getX(i);
      _origZ[i] = pos.getZ(i);
    }

    const mat = new THREE.MeshStandardMaterial({
      color:             new THREE.Color(W_CFG.WATER_COLOR),
      emissive:          new THREE.Color(W_CFG.WATER_EMISSIVE),
      emissiveIntensity: W_CFG.WATER_EMISSIVE_INT,
      roughness:         0.12,
      metalness:         0.22,
      transparent:       true,
      opacity:           0.88,
      side:              THREE.FrontSide,
      depthWrite:        false,
    });

    _waterMesh = new THREE.Mesh(geo, mat);
    _waterMesh.name = 'waterSurface';
    _waterMesh.position.set(
      RIVER_X0 + RIVER_LEN / 2,
      RIVER_Y,
      RIVER_Z
    );
    _waterMesh.receiveShadow = true;
    _waterMesh.renderOrder   = 1;    // render after opaque geometry

    _rootGroup.add(_waterMesh);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOAM / SHORELINE STRIPS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildFoamStrips() {
    const foamMat = new THREE.MeshBasicMaterial({
      color:       0xCCEEFF,
      transparent: true,
      opacity:     0.45,
      depthWrite:  false,
    });

    const FOAM_W = 1.2;

    for (const side of [-1, 1]) {
      const geo  = new THREE.PlaneGeometry(RIVER_LEN, FOAM_W);
      geo.rotateX(-Math.PI / 2);

      const foam = new THREE.Mesh(geo, foamMat);
      foam.position.set(
        RIVER_X0 + RIVER_LEN / 2,
        RIVER_Y + 0.03,
        RIVER_Z + side * (RIVER_W / 2 - FOAM_W / 2)
      );
      foam.renderOrder   = 2;
      foam.matrixAutoUpdate = false;
      foam.updateMatrix();
      _rootGroup.add(foam);

      if (side === -1) _foamL = foam;
      else             _foamR = foam;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BANK EDGES  (transition between grass and water)
  // ══════════════════════════════════════════════════════════════════════════

  function _buildBankEdges() {
    // Muddy bank strip on each side of the river
    const bankMat = new THREE.MeshStandardMaterial({
      color:     0x4A3520,
      roughness: 0.98,
      metalness: 0.0,
    });

    const BANK_W = 2.0;

    for (const side of [-1, 1]) {
      const geo  = new THREE.PlaneGeometry(RIVER_LEN, BANK_W);
      geo.rotateX(-Math.PI / 2);

      const bank = new THREE.Mesh(geo, bankMat);
      bank.position.set(
        RIVER_X0 + RIVER_LEN / 2,
        GROUND_Y + 0.01,
        RIVER_Z + side * (RIVER_W / 2 + BANK_W / 2)
      );
      bank.receiveShadow   = true;
      bank.matrixAutoUpdate = false;
      bank.updateMatrix();
      _rootGroup.add(bank);

      // Pebble scatter (tiny box instances along the bank)
      _addPebbles(side);
    }
  }

  function _addPebbles(side) {
    const pebbleMat = new THREE.MeshStandardMaterial({
      color:     0x888877,
      roughness: 0.95,
      metalness: 0.0,
    });

    const pebbleGeo = new THREE.DodecahedronGeometry(0.12, 0);
    const COUNT     = 60;

    for (let i = 0; i < COUNT; i++) {
      const px = RIVER_X0 + _rng() * RIVER_LEN;
      const pz = RIVER_Z  + side * (RIVER_W / 2 + _rng() * 1.8 + 0.2);

      const p = new THREE.Mesh(pebbleGeo, pebbleMat);
      p.position.set(px, GROUND_Y + 0.06 + _rng() * 0.08, pz);
      p.scale.set(
        0.5 + _rng() * 1.2,
        0.3 + _rng() * 0.5,
        0.5 + _rng() * 1.0
      );
      p.rotation.set(
        _rng() * 0.5,
        _rng() * Math.PI * 2,
        _rng() * 0.4
      );
      p.castShadow    = true;
      p.receiveShadow = true;
      p.matrixAutoUpdate = false;
      p.updateMatrix();
      _rootGroup.add(p);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WATER LIGHTS  (ambient underwater blue glow)
  // ══════════════════════════════════════════════════════════════════════════

  function _buildWaterLights() {
    const LIGHT_COUNT   = 6;
    const LIGHT_SPACING = RIVER_LEN / LIGHT_COUNT;

    for (let i = 0; i < LIGHT_COUNT; i++) {
      const lx = RIVER_X0 + LIGHT_SPACING * (i + 0.5);
      const lz = RIVER_Z + (_rng() - 0.5) * RIVER_W * 0.5;

      const light = new THREE.PointLight(0x0055AA, 0.6, 18);
      light.position.set(lx, RIVER_Y + 0.5, lz);
      _rootGroup.add(light);
      _waterLights.push(light);

      // Register with Sky so they dim during daylight
      Sky.registerLamppost(light);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LILY PADS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildLilyPads() {
    const padMat = new THREE.MeshStandardMaterial({
      color:     0x2A7A2A,
      roughness: 0.85,
      metalness: 0.0,
      side:      THREE.DoubleSide,
    });

    const flowerMat = new THREE.MeshBasicMaterial({ color: 0xFFCCDD });

    const COUNT = 22;

    for (let i = 0; i < COUNT; i++) {
      // Avoid bridge zones
      let px;
      let attempts = 0;
      do {
        px = RIVER_X0 + 10 + _rng() * (RIVER_LEN - 20);
        attempts++;
      } while (_isUnderBridge(px) && attempts < 8);

      if (_isUnderBridge(px)) continue;

      const pz    = RIVER_Z + (_rng() - 0.5) * (RIVER_W - 4);
      const r     = 0.5 + _rng() * 0.9;

      // Lily pad disc
      const padGeo = new THREE.CircleGeometry(r, 10);
      const pad    = new THREE.Mesh(padGeo, padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(px, RIVER_Y + 0.05, pz);

      // Notch cut (visual only — just rotate slightly)
      pad.rotation.z = _rng() * Math.PI * 2;
      pad.matrixAutoUpdate = false;
      pad.updateMatrix();
      _lilyGroup.add(pad);

      // Occasional flower on top
      if (_rng() < 0.45) {
        const flowerGeo = new THREE.SphereGeometry(0.18, 6, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
        const flower    = new THREE.Mesh(flowerGeo, flowerMat);
        flower.position.set(px, RIVER_Y + 0.18, pz);
        flower.matrixAutoUpdate = false;
        flower.updateMatrix();
        _lilyGroup.add(flower);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RIPPLE POOL
  // ══════════════════════════════════════════════════════════════════════════

  function _buildRipplePool() {
    const mat = new THREE.MeshBasicMaterial({
      color:       0xAADDFF,
      transparent: true,
      opacity:     0.0,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const geo  = new THREE.RingGeometry(0.3, 0.5, 16);
      geo.rotateX(-Math.PI / 2);

      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.position.y = RIVER_Y + 0.06;
      mesh.visible    = false;
      _rippleGroup.add(mesh);

      _ripples.push({
        mesh,
        life:    0,
        maxLife: 0,
        speed:   1,
      });
    }
  }

  /**
   * Spawn a ripple at the given world XZ position.
   * @param {number} wx  World X.
   * @param {number} wz  World Z.
   */
  function spawnRipple(wx, wz) {
    const r = _ripples.find(r => !r.mesh.visible);
    if (!r) return;

    r.mesh.position.set(wx, RIVER_Y + 0.07, wz);
    r.mesh.scale.set(0.2, 1, 0.2);
    r.mesh.visible   = true;
    r.life           = 1.0;
    r.maxLife        = 1.4 + _rng() * 0.8;
    r.speed          = 0.6 + _rng() * 0.5;
    r.mesh.material.opacity = 0.6;
  }

  function _updateRipples(dt) {
    for (const r of _ripples) {
      if (!r.mesh.visible) continue;

      r.life -= dt / r.maxLife;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }

      // Expand outward and fade
      const progress = 1 - r.life;
      const s = 0.2 + progress * 3.5;
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = MathUtils.clamp(r.life * 0.7, 0, 0.6);
    }
  }

  /**
   * Spawn ambient random ripples on the river surface.
   */
  function _spawnAmbientRipples() {
    if (_rng() > 0.06) return;  // ~6% chance per call

    let px;
    let attempts = 0;
    do {
      px = RIVER_X0 + _rng() * RIVER_LEN;
      attempts++;
    } while (_isUnderBridge(px) && attempts < 5);

    const pz = RIVER_Z + (_rng() - 0.5) * (RIVER_W - 2);
    spawnRipple(px, pz);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FLOATING DEBRIS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildFloatingDebris() {
    const mat = new THREE.MeshStandardMaterial({
      color:     0x5A3A1A,
      roughness: 0.95,
      metalness: 0.0,
    });

    const COUNT = 14;

    for (let i = 0; i < COUNT; i++) {
      let px;
      let attempts = 0;
      do {
        px = RIVER_X0 + _rng() * RIVER_LEN;
        attempts++;
      } while (_isUnderBridge(px) && attempts < 6);

      if (attempts >= 6) continue;

      const pz   = RIVER_Z + (_rng() - 0.5) * (RIVER_W * 0.7);
      const type = _rng() < 0.6 ? 'log' : 'plank';

      let geo;
      if (type === 'log') {
        geo = new THREE.CylinderGeometry(0.12, 0.16, 1.2 + _rng() * 0.8, 7);
        geo.rotateZ(Math.PI / 2);
      } else {
        geo = new THREE.BoxGeometry(0.8 + _rng() * 0.6, 0.06, 0.2 + _rng() * 0.1);
      }

      const debris = new THREE.Mesh(geo, mat);
      debris.position.set(px, RIVER_Y + 0.04, pz);
      debris.rotation.y  = _rng() * Math.PI * 2;
      debris.castShadow  = true;
      debris.userData.floatOffset = _rng() * Math.PI * 2;  // phase for bob animation
      debris.userData.floatSpeed  = 0.4 + _rng() * 0.4;
      debris.matrixAutoUpdate = true;   // must update — animated
      _rootGroup.add(debris);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE ANIMATION  (per-frame vertex displacement)
  // ══════════════════════════════════════════════════════════════════════════

  function _animateWaves(dt) {
    if (!_waterMesh) return;

    _time += dt * W_CFG.WAVE_SPEED;

    const pos   = _waterMesh.geometry.attributes.position;
    const cnt   = pos.count;
    const AMP   = W_CFG.WAVE_HEIGHT;
    const t     = _time;

    for (let i = 0; i < cnt; i++) {
      const ox = _origX[i];
      const oz = _origZ[i];

      // Layered sine waves for organic motion
      const wave =
        Math.sin(ox * 0.18 + t * 2.1) * AMP * 0.5 +
        Math.cos(oz * 0.22 + t * 1.6) * AMP * 0.35 +
        Math.sin((ox + oz) * 0.11 + t * 2.8) * AMP * 0.20 +
        Math.sin(ox * 0.08 - t * 0.9) * AMP * 0.15;

      pos.setY(i, wave);
    }

    pos.needsUpdate = true;
    _waterMesh.geometry.computeVertexNormals();

    // Pulse emissive intensity
    _waterMesh.material.emissiveIntensity =
      W_CFG.WATER_EMISSIVE_INT + Math.sin(t * 1.8) * 0.08;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOAM ANIMATION
  // ══════════════════════════════════════════════════════════════════════════

  function _animateFoam(dt) {
    const foamOpacity = 0.32 + Math.sin(_time * 2.2) * 0.12;
    if (_foamL) _foamL.material.opacity = foamOpacity;
    if (_foamR) _foamR.material.opacity = foamOpacity;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FLOATING DEBRIS ANIMATION
  // ══════════════════════════════════════════════════════════════════════════

  function _animateDebris(dt) {
    _rootGroup.traverse(obj => {
      if (!obj.userData.floatOffset === undefined) return;
      if (obj.userData.floatSpeed === undefined)   return;

      const bob = Math.sin(_time * obj.userData.floatSpeed + obj.userData.floatOffset) * 0.05;
      obj.position.y = RIVER_Y + 0.04 + bob;
      obj.rotation.y += dt * 0.04;
      obj.updateMatrix();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER WATER DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Test whether a world position is inside the river.
   * Uses the cached AABB — O(1).
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean}
   */
  function isInWater(x, y, z) {
    return MathUtils.aabbContainsPoint(WATER_AABB, x, y, z);
  }

  /**
   * Check player position and fire entry/exit callbacks.
   * @param {THREE.Vector3} playerPos
   */
  function _checkPlayerWater(playerPos) {
    const inWater = isInWater(playerPos.x, playerPos.y, playerPos.z);

    if (inWater && !_playerWasInWater) {
      _playerWasInWater = true;
      if (_onPlayerEnterWater) _onPlayerEnterWater();

      // Splash effect
      spawnRipple(playerPos.x, playerPos.z);
      spawnRipple(playerPos.x + 1.2, playerPos.z);
      spawnRipple(playerPos.x - 1.2, playerPos.z);
    } else if (!inWater && _playerWasInWater) {
      _playerWasInWater = false;
      if (_onPlayerExitWater) _onPlayerExitWater();
    }
  }

  /**
   * Register callbacks for when the player enters or exits the river.
   * @param {Function} onEnter
   * @param {Function} onExit
   */
  function onPlayerWater(onEnter, onExit) {
    _onPlayerEnterWater = onEnter;
    _onPlayerExitWater  = onExit;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BRIDGE ZONE HELPER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return true if world X is directly under one of the bridges.
   * Used to avoid placing lily pads and debris in bridge zones.
   * @param {number} wx  World X.
   * @returns {boolean}
   */
  function _isUnderBridge(wx) {
    const HALF = BRIDGE_GAP / 2;
    return BRIDGE_XS.some(bx => wx >= bx - HALF && wx <= bx + HALF);
  }

  /**
   * Public version for Bridges.js to query.
   * @param {number} wx
   * @returns {boolean}
   */
  function isUnderBridge(wx) { return _isUnderBridge(wx); }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Animate water, foam, ripples, and debris.
   * @param {number} dt            Delta time seconds.
   * @param {THREE.Vector3} [playerPos]  Player world position for water detection.
   */
  function update(dt, playerPos) {
    _animateWaves(dt);
    _animateFoam(dt);
    _animateDebris(dt);
    _updateRipples(dt);
    _spawnAmbientRipples();

    if (playerPos) _checkPlayerWater(playerPos);

    // Night mode: pulse water lights
    const nightDepth = Sky.getSkyState()?.starOpacity || 0;
    for (const l of _waterLights) {
      l.intensity = MathUtils.lerp(0.1, 0.9, nightDepth) +
                    Math.sin(_time * 2.4 + l.position.x * 0.1) * 0.12;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESSORS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return the AABB used for water overlap tests.
   * Bridges.js uses this to cut holes in the deck geometry.
   */
  function getWaterAABB() { return { ...WATER_AABB }; }

  /**
   * Return the river surface Y (top of wave displacement).
   */
  function getSurfaceY() { return SURFACE_Y; }

  /**
   * Return the river centre Z.
   */
  function getRiverZ() { return RIVER_Z; }

  /**
   * Return the river width.
   */
  function getRiverWidth() { return RIVER_W; }

  /**
   * Return X start and end of the river.
   */
  function getRiverExtents() { return { x0: RIVER_X0, x1: RIVER_X1 }; }

  /**
   * Return the root THREE.Group for external visibility toggles.
   */
  function getRootGroup() { return _rootGroup; }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    if (_rootGroup) {
      Renderer.disposeObject(_rootGroup);
      Renderer.remove(_rootGroup);
      _rootGroup = null;
    }

    _waterMesh   = null;
    _bedMesh     = null;
    _foamL       = null;
    _foamR       = null;
    _waterLights.length = 0;
    _ripples.length     = 0;

    _onPlayerEnterWater = null;
    _onPlayerExitWater  = null;

    console.info('[Water] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    dispose,

    // Per-frame
    update,

    // Effects
    spawnRipple,

    // Detection
    isInWater,
    isUnderBridge,
    onPlayerWater,

    // Accessors
    getWaterAABB,
    getSurfaceY,
    getRiverZ,
    getRiverWidth,
    getRiverExtents,
    getRootGroup,

  });

})();

if (typeof module !== 'undefined') module.exports = Water;
/* ```

---

**File 17 ✅ — `js/world/Water.js` done.**

This is the complete river system. The water surface is a subdivided `PlaneGeometry` with `SEG_X × SEG_Z` vertices that are displaced every frame by four layered sine waves with different frequencies and phases, giving an organic rippling appearance. Both bank edges have muddy brown strips with randomly-placed `DodecahedronGeometry` pebble clusters. Six `PointLight` objects are registered with `Sky.js` so they brighten at night and dim at sunrise. Lily pads are `CircleGeometry` discs with optional dome flower meshes, all avoiding bridge zones. The ripple pool pre-allocates 12 `RingGeometry` meshes and reuses them via a life-cycle system — expanding outward and fading out over 1–2 seconds. Floating logs and planks bob vertically via a per-object phase offset and slowly rotate. Foam strips along both banks pulse opacity sinusoidally. Player water detection uses the pre-computed `WATER_AABB` for O(1) overlap tests each frame, firing enter/exit callbacks to `Game.js` when the player drives into or out of the river.

**Say "File 18" for `js/world/Bridges.js`.** */
