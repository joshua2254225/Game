/* ## `js/world/Bridges.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — Bridges.js
 * ============================================================================
 * Builds the three bridges that cross the river in the Riverside district.
 * Each bridge is architecturally distinct and driveable.
 *
 * Bridge types (from CONFIG.WATER.BRIDGES):
 *   1. West Bridge   (x=64)  — Concrete flat-deck with barrier walls
 *   2. Centre Bridge (x=128) — Steel suspension with cables and towers
 *   3. East Bridge   (x=192) — Stone arch with decorative keystones
 *
 * Each bridge provides:
 *   • A driveable road deck at the correct height above the river
 *   • Structural elements (towers, arches, piers, cables)
 *   • Railing / barrier walls on both sides
 *   • Lamppost pairs every 8 units (registered with Sky.js)
 *   • AABB collision volumes for the deck (exported for Vehicle.js)
 *   • Road markings matching the city road style
 *   • Approach ramps that smoothly connect deck height to road level
 *
 * Deck Y is computed from Water.getSurfaceY() + CLEARANCE so boats
 * could theoretically pass underneath (and the visual gap looks right).
 * ============================================================================
 */

'use strict';

const Bridges = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const GROUND_Y    = CONFIG.WORLD.GROUND_Y;
  const ROAD_W      = CONFIG.ROADS.ROAD_WIDTH;
  const ROAD_Y      = CONFIG.ROADS.ROAD_Y;

  // How high the deck sits above the water surface
  const CLEARANCE   = 3.2;

  // Deck Y level — all bridges share the same elevation
  const DECK_Y      = Water.getSurfaceY() + CLEARANCE;

  // Ramp horizontal length on each approach
  const RAMP_LEN    = 18;

  // Rail / barrier constants
  const RAIL_H      = 0.85;
  const RAIL_W      = 0.22;

  // Lamppost spacing on bridges
  const LAMP_SPACING = 8;

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  let   _rootGroup  = null;    // THREE.Group — all bridge geometry

  // Collision volumes for Vehicle.js — array of AABB objects
  const _deckAABBs  = [];

  // Lamppost lights registered with Sky.js
  const _bridgeLamps = [];

  // Materials (shared across bridges)
  let _matConcrete   = null;
  let _matSteel      = null;
  let _matStone      = null;
  let _matAsphalt    = null;
  let _matRailing    = null;
  let _matCable      = null;
  let _matMarking    = null;

  // Seeded RNG for minor variation
  const _rng = MathUtils.createRNG(CONFIG.WATER.RIVER_Z_CENTER + 42);

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build all three bridges. Call after Water.init().
   */
  function build() {
    Renderer.setLoadProgress(57, 'Building bridges…');

    _buildMaterials();

    _rootGroup      = new THREE.Group();
    _rootGroup.name = 'bridges';

    const bridges = CONFIG.WATER.BRIDGES;

    // Build each bridge by type
    for (const bridgeCfg of bridges) {
      switch (bridgeCfg.type) {
        case 'concrete':   _buildConcreteBridge(bridgeCfg);   break;
        case 'suspension': _buildSuspensionBridge(bridgeCfg); break;
        case 'arch':       _buildArchBridge(bridgeCfg);       break;
        default:
          console.warn(`[Bridges] Unknown bridge type: ${bridgeCfg.type}`);
      }
    }

    // Register all bridge lamps with Sky.js
    for (const lamp of _bridgeLamps) {
      Sky.registerLamppost(lamp);
    }

    Renderer.add(_rootGroup);

    Renderer.setLoadProgress(60, 'Bridges complete.');
    console.info(
      `[Bridges] Built ${bridges.length} bridges. ` +
      `Deck Y: ${DECK_Y.toFixed(2)} | Lamps: ${_bridgeLamps.length}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MATERIALS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildMaterials() {
    _matConcrete = new THREE.MeshStandardMaterial({
      map:       ProceduralTextures.makeConcrete(256),
      roughness: 0.92,
      metalness: 0.02,
      color:     new THREE.Color(0xBBB8AA),
    });
    _matConcrete.map.repeat.set(0.1, 0.1);

    _matSteel = new THREE.MeshStandardMaterial({
      map:       ProceduralTextures.makeSteel(128),
      roughness: 0.35,
      metalness: 0.80,
      color:     new THREE.Color(0x778899),
    });

    _matStone = new THREE.MeshStandardMaterial({
      color:     new THREE.Color(0x887766),
      roughness: 0.96,
      metalness: 0.01,
    });

    _matAsphalt = new THREE.MeshStandardMaterial({
      map:       ProceduralTextures.makeAsphalt(256),
      roughness: 0.90,
      metalness: 0.00,
      color:     new THREE.Color(CONFIG.ROADS.ASPHALT_COLOR),
    });
    _matAsphalt.map.repeat.set(0.1, 0.4);

    _matRailing = new THREE.MeshStandardMaterial({
      color:     new THREE.Color(0x888888),
      roughness: 0.55,
      metalness: 0.50,
    });

    _matCable = new THREE.MeshStandardMaterial({
      color:     new THREE.Color(0x555566),
      roughness: 0.60,
      metalness: 0.55,
    });

    _matMarking = new THREE.MeshBasicMaterial({
      color:       CONFIG.ROADS.MARKING_COLOR,
      transparent: true,
      opacity:     0.85,
      depthWrite:  false,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Make a box mesh and place it in world space.
   */
  function _box(w, h, d, mat, x, y, z, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (ry !== 0) mesh.rotation.y = ry;
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  /**
   * Make a cylinder mesh and place it in world space.
   */
  function _cyl(rTop, rBot, h, segs, mat, x, y, z, rx = 0, rz = 0) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, h, segs),
      mat
    );
    mesh.position.set(x, y, z);
    if (rx !== 0) mesh.rotation.x = rx;
    if (rz !== 0) mesh.rotation.z = rz;
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  /**
   * Build the driveable asphalt deck slab for any bridge.
   * Returns the mesh.
   *
   * @param {THREE.Group} grp   Parent group.
   * @param {number}      bx    Bridge centre X.
   * @param {number}      bz    Bridge centre Z (river centre).
   * @param {number}      len   Bridge span length (Z axis).
   * @param {number}      width Road width.
   */
  function _buildDeck(grp, bx, bz, len, width) {
    const DECK_THICK = 0.40;

    // Road surface
    const deck = _box(
      width, DECK_THICK, len,
      _matAsphalt,
      bx, DECK_Y + DECK_THICK / 2, bz
    );
    deck.name = 'bridgeDeck';
    grp.add(deck);

    // Lane marking — single dashed centre line
    const DASH_W  = 0.18;
    const DASH_L  = 2.5;
    const DASH_GAP = 3.5;
    const count   = Math.floor(len / (DASH_L + DASH_GAP));
    const startZ  = bz - len / 2 + DASH_L / 2 + 1;

    for (let i = 0; i < count; i++) {
      const dz   = startZ + i * (DASH_L + DASH_GAP);
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(DASH_W, DASH_L),
        _matMarking
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(bx, DECK_Y + DECK_THICK + 0.005, dz);
      dash.matrixAutoUpdate = false;
      dash.updateMatrix();
      grp.add(dash);
    }

    // Edge white lines
    for (const side of [-1, 1]) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, len - 0.4),
        _matMarking
      );
      line.rotation.x = -Math.PI / 2;
      line.position.set(
        bx + side * (width / 2 - 0.14),
        DECK_Y + DECK_THICK + 0.005,
        bz
      );
      line.matrixAutoUpdate = false;
      line.updateMatrix();
      grp.add(line);
    }

    // Register AABB for vehicle collision / ramp detection
    _deckAABBs.push({
      minX: bx - width / 2,
      maxX: bx + width / 2,
      minZ: bz - len / 2,
      maxZ: bz + len / 2,
      minY: DECK_Y - 0.2,
      maxY: DECK_Y + DECK_THICK + 0.1,
      deckY: DECK_Y + DECK_THICK,
      bridgeId: grp.name,
    });

    return deck;
  }

  /**
   * Build approach ramps on both ends of a bridge.
   * Ramps slope from GROUND_Y + ROAD_Y up to DECK_Y.
   *
   * @param {THREE.Group} grp
   * @param {number}      bx     Bridge centre X.
   * @param {number}      bz     Bridge centre Z.
   * @param {number}      bridgeHalfLen  Half of the bridge span.
   * @param {number}      width
   */
  function _buildRamps(grp, bx, bz, bridgeHalfLen, width) {
    const ROAD_SURFACE = GROUND_Y + ROAD_Y;
    const riseH        = DECK_Y - ROAD_SURFACE;
    const rampDiag     = Math.sqrt(RAMP_LEN * RAMP_LEN + riseH * riseH);
    const rampAngle    = Math.atan2(riseH, RAMP_LEN);

    for (const side of [-1, 1]) {
      // Ramp centre Z
      const rampCentreZ = bz + side * (bridgeHalfLen + RAMP_LEN / 2);
      const rampCentreY = ROAD_SURFACE + riseH / 2;

      const ramp = _box(
        width, 0.35, rampDiag,
        _matConcrete,
        bx, rampCentreY, rampCentreZ,
        0   // rotation applied below
      );
      ramp.rotation.x = -rampAngle * side;
      ramp.matrixAutoUpdate = false;
      ramp.updateMatrix();
      grp.add(ramp);

      // Ramp AABB (approximate — treated as flat for simplicity)
      _deckAABBs.push({
        minX:    bx - width / 2,
        maxX:    bx + width / 2,
        minZ:    Math.min(bz + side * bridgeHalfLen, rampCentreZ - RAMP_LEN / 2),
        maxZ:    Math.max(bz + side * bridgeHalfLen, rampCentreZ + RAMP_LEN / 2),
        minY:    ROAD_SURFACE - 0.2,
        maxY:    DECK_Y + 0.5,
        isRamp:  true,
        rampSide: side,
        deckY:   DECK_Y,
        bridgeId: grp.name,
      });

      // Solid fill under the ramp (wing walls)
      for (const ws of [-1, 1]) {
        const wall = _box(
          0.4, riseH + 0.5, RAMP_LEN,
          _matConcrete,
          bx + ws * (width / 2 + 0.2),
          ROAD_SURFACE + riseH / 2,
          rampCentreZ
        );
        grp.add(wall);
      }
    }
  }

  /**
   * Build barrier rails along both sides of the deck.
   *
   * @param {THREE.Group} grp
   * @param {number}      bx
   * @param {number}      bz
   * @param {number}      len    Full bridge length including ramps.
   * @param {number}      width
   * @param {string}      style  'solid'|'open'|'stone'
   */
  function _buildRailings(grp, bx, bz, len, width, style = 'solid') {
    const railY  = DECK_Y + RAIL_H / 2 + 0.40;
    const postH  = RAIL_H + 0.15;
    const postW  = 0.12;
    const postGap = 2.5;
    const count  = Math.floor(len / postGap);

    for (const side of [-1, 1]) {
      const rx = bx + side * (width / 2 + RAIL_W / 2);

      // Top rail (continuous)
      const topRail = _box(
        RAIL_W, RAIL_W * 0.7, len,
        _matRailing,
        rx, DECK_Y + postH + RAIL_W * 0.3, bz
      );
      grp.add(topRail);

      // Mid rail
      if (style === 'open') {
        const midRail = _box(
          RAIL_W * 0.6, RAIL_W * 0.6, len,
          _matRailing,
          rx, DECK_Y + postH * 0.55, bz
        );
        grp.add(midRail);
      }

      // Vertical posts
      for (let i = 0; i <= count; i++) {
        const postZ = bz - len / 2 + (i / count) * len;

        const post = style === 'stone'
          ? _box(postW * 2, postH * 1.1, postW * 2, _matStone, rx, DECK_Y + postH / 2 + 0.40, postZ)
          : _box(postW, postH, postW, _matRailing, rx, DECK_Y + postH / 2 + 0.40, postZ);

        grp.add(post);
      }

      // Solid base barrier
      const base = _box(
        RAIL_W * 1.5, 0.42, len,
        style === 'stone' ? _matStone : _matConcrete,
        rx, DECK_Y + 0.21 + 0.40, bz
      );
      grp.add(base);
    }
  }

  /**
   * Place lamppost pairs along the deck at regular intervals.
   * Registers each PointLight with Sky.js via _bridgeLamps.
   *
   * @param {THREE.Group} grp
   * @param {number}      bx
   * @param {number}      bz
   * @param {number}      len
   * @param {number}      width
   */
  function _addBridgeLamps(grp, bx, bz, len, width) {
    const POLE_H  = 4.0;
    const count   = Math.floor(len / LAMP_SPACING);

    for (let i = 0; i <= count; i++) {
      const lz  = bz - len / 2 + (i / Math.max(count, 1)) * len;

      for (const side of [-1, 1]) {
        const lx = bx + side * (width / 2 + 0.3);
        const ly = DECK_Y + 0.40;

        // Pole
        const pole = _cyl(0.05, 0.07, POLE_H, 6, _matRailing, lx, ly + POLE_H / 2, lz);
        grp.add(pole);

        // Head
        const head = _box(0.5, 0.18, 0.18, _matRailing, lx - 0.22, ly + POLE_H - 0.1, lz);
        grp.add(head);

        // PointLight
        const light = new THREE.PointLight(0xFFEE88, 0, 12);
        light.position.set(lx - 0.22, ly + POLE_H - 0.3, lz);
        grp.add(light);
        _bridgeLamps.push(light);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. CONCRETE FLAT BRIDGE  (West, x=64)
  // ══════════════════════════════════════════════════════════════════════════

  function _buildConcreteBridge(cfg) {
    const grp   = new THREE.Group();
    grp.name    = `bridge_${cfg.id}`;

    const bx    = cfg.x;
    const bz    = Water.getRiverZ();
    const span  = Water.getRiverWidth() + 4;   // slight overhang
    const width = cfg.width;

    // ── Deck ──────────────────────────────────────────────────────────────
    _buildDeck(grp, bx, bz, span, width);

    // ── Approach ramps ────────────────────────────────────────────────────
    _buildRamps(grp, bx, bz, span / 2, width);

    // ── Solid concrete parapets ───────────────────────────────────────────
    _buildRailings(grp, bx, bz, span, width, 'solid');

    // ── Mid-span support piers (two, one each side of river centre) ───────
    for (const offset of [-span * 0.2, span * 0.2]) {
      for (const side of [-1, 1]) {
        // Pier cap
        const capW = width + 1.2;
        const cap  = _box(
          capW, 0.55, 1.0,
          _matConcrete,
          bx, DECK_Y - 0.05, bz + offset
        );
        grp.add(cap);

        // Pier column
        const colH = DECK_Y - GROUND_Y - 0.55;
        const col  = _box(
          1.0, colH, 1.0,
          _matConcrete,
          bx + side * (width / 2 - 0.8),
          GROUND_Y + colH / 2,
          bz + offset
        );
        grp.add(col);
      }
    }

    // ── Abutment walls at each end ─────────────────────────────────────────
    for (const side of [-1, 1]) {
      const abZ = bz + side * (span / 2 + 0.5);
      const abH = DECK_Y - GROUND_Y + 0.5;

      const abut = _box(
        width + 1.8, abH, 1.6,
        _matConcrete,
        bx, GROUND_Y + abH / 2, abZ
      );
      grp.add(abut);
    }

    // ── Drain holes (visual — small dark cylinders in deck face) ──────────
    const drainMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const dz of [bz - span * 0.25, bz + span * 0.25]) {
      for (const side of [-1, 1]) {
        const drain = _cyl(0.08, 0.08, 0.5, 6, drainMat,
          bx + side * (width * 0.35), DECK_Y + 0.1, dz, 0, 0);
        grp.add(drain);
      }
    }

    // ── Lampposts ─────────────────────────────────────────────────────────
    _addBridgeLamps(grp, bx, bz, span, width);

    // ── Name plate ────────────────────────────────────────────────────────
    _addNamePlate(grp, bx, bz - span / 2 - 0.8, cfg.name, 0xAAAAAA);

    _rootGroup.add(grp);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. SUSPENSION BRIDGE  (Centre, x=128)
  // ══════════════════════════════════════════════════════════════════════════

  function _buildSuspensionBridge(cfg) {
    const grp   = new THREE.Group();
    grp.name    = `bridge_${cfg.id}`;

    const bx    = cfg.x;
    const bz    = Water.getRiverZ();
    const span  = Water.getRiverWidth() + 6;
    const width = cfg.width;

    // ── Deck ──────────────────────────────────────────────────────────────
    _buildDeck(grp, bx, bz, span, width);
    _buildRamps(grp, bx, bz, span / 2, width);

    // ── Open-railing style ────────────────────────────────────────────────
    _buildRailings(grp, bx, bz, span, width, 'open');

    // ── Tower pylons (two, one each side of the river centre) ─────────────
    const TOWER_H  = 16;
    const TOWER_W  = 0.9;
    const towerZs  = [-span * 0.28, span * 0.28];

    for (const tz of towerZs) {
      for (const side of [-1, 1]) {
        const tx = bx + side * (width / 2 + 0.5);

        // Main tower leg
        const tower = _box(
          TOWER_W, TOWER_H, TOWER_W,
          _matSteel,
          tx, GROUND_Y + TOWER_H / 2, bz + tz
        );
        grp.add(tower);

        // Cross-beam between towers at 2/3 height
        if (side === -1) {
          const xBeam = _box(
            width + 1.0 + TOWER_W * 2, TOWER_W * 0.6, TOWER_W * 0.6,
            _matSteel,
            bx, GROUND_Y + TOWER_H * 0.68, bz + tz
          );
          grp.add(xBeam);

          // Second cross-beam at top
          const xTop = _box(
            width + 1.0 + TOWER_W * 2, TOWER_W * 0.45, TOWER_W * 0.45,
            _matSteel,
            bx, GROUND_Y + TOWER_H - 0.5, bz + tz
          );
          grp.add(xTop);
        }
      }

      // ── Main cables (catenary parabola approximation) ──────────────────
      _buildSuspensionCables(grp, bx, bz, tz, span, width, TOWER_H);
    }

    // ── Deck stiffening girder (I-beam along each side) ───────────────────
    for (const side of [-1, 1]) {
      const gx = bx + side * (width / 2 - 0.3);

      // Web
      const web = _box(0.12, 0.55, span, _matSteel, gx, DECK_Y - 0.15, bz);
      grp.add(web);

      // Top flange
      const topF = _box(0.45, 0.08, span, _matSteel, gx, DECK_Y + 0.115, bz);
      grp.add(topF);

      // Bottom flange
      const botF = _box(0.45, 0.08, span, _matSteel, gx, DECK_Y - 0.45, bz);
      grp.add(botF);
    }

    // ── Anchorage blocks at each end ──────────────────────────────────────
    for (const end of [-1, 1]) {
      const az  = bz + end * (span / 2 + RAMP_LEN + 2);
      const anc = _box(width + 3, 2.0, 3.5, _matConcrete, bx, GROUND_Y + 1.0, az);
      grp.add(anc);
    }

    // ── Lampposts ─────────────────────────────────────────────────────────
    _addBridgeLamps(grp, bx, bz, span, width);

    // ── Name plate ────────────────────────────────────────────────────────
    _addNamePlate(grp, bx, bz - span / 2 - 0.8, cfg.name, 0x8899AA);

    _rootGroup.add(grp);
  }

  /**
   * Build the hanging cables and vertical hangers for the suspension bridge.
   */
  function _buildSuspensionCables(grp, bx, bz, towerZ, span, width, towerH) {
    const CABLE_SEGS = 20;
    const SAG        = 3.5;     // catenary sag depth
    const towerTopY  = GROUND_Y + towerH - 0.3;

    for (const side of [-1, 1]) {
      const cx = bx + side * (width / 2 + 0.3);

      // Main cable parabola
      const points = [];
      for (let i = 0; i <= CABLE_SEGS; i++) {
        const t  = i / CABLE_SEGS;
        // Map t from 0..1 across the full span
        const lz = bz - span / 2 + t * span;
        // Parabola: apex at tower Z, lowest at mid-span
        const distFromTower = Math.abs(lz - (bz + towerZ));
        const maxDist       = span / 2;
        const sag           = SAG * (distFromTower / maxDist) ** 1.6;
        const ly            = towerTopY - sag;

        points.push(new THREE.Vector3(cx, ly, lz));
      }

      const curve   = new THREE.CatmullRomCurve3(points);
      const tubePts = curve.getPoints(40);
      const tubeGeo = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(tubePts), 40, 0.06, 6, false
      );
      const cable = new THREE.Mesh(tubeGeo, _matCable);
      cable.castShadow    = true;
      cable.matrixAutoUpdate = false;
      cable.updateMatrix();
      grp.add(cable);

      // Vertical hangers dropping from cable to deck
      const HANGER_COUNT = 8;
      for (let h = 1; h < HANGER_COUNT; h++) {
        const t   = h / HANGER_COUNT;
        const lz  = bz - span / 2 + t * span;
        const distFromTower = Math.abs(lz - (bz + towerZ));
        const maxDist       = span / 2;
        const sag           = SAG * (distFromTower / maxDist) ** 1.6;
        const topY          = towerTopY - sag;
        const hangerH       = topY - (DECK_Y + 0.40);

        if (hangerH < 0.1) continue;

        const hanger = _cyl(
          0.025, 0.025, hangerH, 4,
          _matCable,
          cx, DECK_Y + 0.40 + hangerH / 2, lz
        );
        grp.add(hanger);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. STONE ARCH BRIDGE  (East, x=192)
  // ══════════════════════════════════════════════════════════════════════════

  function _buildArchBridge(cfg) {
    const grp   = new THREE.Group();
    grp.name    = `bridge_${cfg.id}`;

    const bx    = cfg.x;
    const bz    = Water.getRiverZ();
    const span  = Water.getRiverWidth() + 4;
    const width = cfg.width;

    // ── Deck ──────────────────────────────────────────────────────────────
    _buildDeck(grp, bx, bz, span, width);
    _buildRamps(grp, bx, bz, span / 2, width);

    // ── Stone-style parapets ──────────────────────────────────────────────
    _buildRailings(grp, bx, bz, span, width, 'stone');

    // ── Main arch (two arches, one each side of the road) ─────────────────
    const ARCH_SEG  = 28;
    const ARCH_R    = span * 0.6;      // arch radius
    const ARCH_CY   = DECK_Y - ARCH_R; // arch circle centre Y

    for (const side of [-1, 1]) {
      const ax = bx + side * (width / 2 + 0.3 + 0.45);

      _buildStoneArch(grp, ax, bz, span, ARCH_R, ARCH_CY, ARCH_SEG, side);
    }

    // ── Spandrel fill walls (solid stone between arch and deck) ───────────
    _buildSpandrelWalls(grp, bx, bz, span, width, ARCH_R, ARCH_CY);

    // ── Keystone accent at arch apex ──────────────────────────────────────
    for (const side of [-1, 1]) {
      const ax = bx + side * (width / 2 + 0.3 + 0.45);
      const keystone = _box(
        0.55, 0.7, 0.55,
        new THREE.MeshStandardMaterial({ color: 0xAA9977, roughness: 0.95 }),
        ax, ARCH_CY + ARCH_R - 0.3, bz
      );
      grp.add(keystone);
    }

    // ── Pier bases (stone footings either side of river) ──────────────────
    for (const side of [-1, 1]) {
      const pz  = bz + side * (span / 2 - 1.0);
      const pH  = DECK_Y - GROUND_Y + 0.2;

      // Full-width abutment
      const abut = _box(
        width + 2.8, pH, 2.8,
        _matStone,
        bx, GROUND_Y + pH / 2, pz
      );
      grp.add(abut);

      // Stepped plinth
      for (let step = 0; step < 3; step++) {
        const stepW = width + 2.8 + (3 - step) * 0.5;
        const stepH = 0.35;
        const stepZ = pz + side * (1.4 + step * 0.45);

        const plinth = _box(
          stepW, stepH, 1.0,
          _matStone,
          bx, GROUND_Y + step * stepH + stepH / 2, stepZ
        );
        grp.add(plinth);
      }
    }

    // ── Decorative rounded pillars on deck edges ───────────────────────────
    for (const dz of [bz - span * 0.22, bz, bz + span * 0.22]) {
      for (const side of [-1, 1]) {
        const px = bx + side * (width / 2 + RAIL_W * 2);
        const pillar = _cyl(
          0.18, 0.22, RAIL_H + 0.6, 10,
          _matStone,
          px, DECK_Y + 0.40 + (RAIL_H + 0.6) / 2, dz
        );
        grp.add(pillar);

        // Pillar cap orb
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 8, 6),
          _matStone
        );
        orb.position.set(px, DECK_Y + 0.40 + RAIL_H + 0.6 + 0.20, dz);
        orb.castShadow = true;
        orb.matrixAutoUpdate = false;
        orb.updateMatrix();
        grp.add(orb);
      }
    }

    // ── Lampposts ─────────────────────────────────────────────────────────
    _addBridgeLamps(grp, bx, bz, span, width);

    // ── Name plate ────────────────────────────────────────────────────────
    _addNamePlate(grp, bx, bz - span / 2 - 0.8, cfg.name, 0xAA9966);

    _rootGroup.add(grp);
  }

  /**
   * Build one stone arch as a segmented tube following a circular arc.
   */
  function _buildStoneArch(grp, ax, bz, span, archR, archCY, segs, side) {
    const ARCH_THICK  = 0.90;   // arch rib width (Z axis)
    const ARCH_DEPTH  = 0.65;   // arch rib depth

    // Angle range: arch starts and ends at deck level on both sides of river
    const halfAngle = Math.asin(span / 2 / archR);
    const startAng  = -(Math.PI / 2) - halfAngle;
    const endAng    = -(Math.PI / 2) + halfAngle;

    for (let i = 0; i < segs; i++) {
      const t0  = i       / segs;
      const t1  = (i + 1) / segs;
      const a0  = startAng + t0 * (endAng - startAng);
      const a1  = startAng + t1 * (endAng - startAng);
      const mid = (a0 + a1) / 2;

      const z0  = archR * Math.cos(a0) + bz;
      const z1  = archR * Math.cos(a1) + bz;
      const y0  = archR * Math.sin(a0) + archCY;
      const y1  = archR * Math.sin(a1) + archCY;

      const segLen  = Math.sqrt((z1-z0)**2 + (y1-y0)**2);
      const segAngle = Math.atan2(y1 - y0, z1 - z0);

      // Voussoir (arch block)
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(ARCH_DEPTH, segLen, ARCH_THICK),
        _matStone
      );
      block.position.set(ax, (y0 + y1) / 2, (z0 + z1) / 2);
      block.rotation.x = -segAngle;
      block.castShadow    = true;
      block.receiveShadow = true;
      block.matrixAutoUpdate = false;
      block.updateMatrix();
      grp.add(block);
    }
  }

  /**
   * Build solid spandrel fill between arch curve and deck.
   */
  function _buildSpandrelWalls(grp, bx, bz, span, width, archR, archCY) {
    const SPAN_SEGS = 16;
    const halfAngle = Math.asin(span / 2 / archR);
    const startAng  = -(Math.PI / 2) - halfAngle;
    const endAng    = -(Math.PI / 2) + halfAngle;

    for (let i = 0; i < SPAN_SEGS; i++) {
      const t    = (i + 0.5) / SPAN_SEGS;
      const ang  = startAng + t * (endAng - startAng);
      const archY = archR * Math.sin(ang) + archCY;
      const archZ = archR * Math.cos(ang) + bz;

      const fillH = DECK_Y - archY;
      if (fillH < 0.05) continue;

      const fill = _box(
        width + 0.1,
        fillH,
        (span / SPAN_SEGS) + 0.1,
        _matStone,
        bx, archY + fillH / 2, archZ
      );
      grp.add(fill);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NAME PLATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Add a small canvas-texture name sign at the bridge entrance.
   */
  function _addNamePlate(grp, bx, bz, name, bgColor) {
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 64;
    const ctx     = canvas.getContext('2d');

    // Background
    const { r, g, b } = MathUtils.hexToRgb(bgColor);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 256, 64);

    // Border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth   = 3;
    ctx.strokeRect(3, 3, 250, 58);

    // Text
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 22px Orbitron, Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.toUpperCase(), 128, 32);

    const tex  = new THREE.CanvasTexture(canvas);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.8),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    sign.position.set(bx, DECK_Y + 1.8, bz);
    sign.matrixAutoUpdate = false;
    sign.updateMatrix();
    grp.add(sign);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VEHICLE DECK DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Test whether a world position is on any bridge deck or ramp.
   * Returns the deck AABB if true, null if not.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {object|null}
   */
  function getDeckAt(x, y, z) {
    for (const aabb of _deckAABBs) {
      if (
        x >= aabb.minX && x <= aabb.maxX &&
        z >= aabb.minZ && z <= aabb.maxZ &&
        y >= aabb.minY && y <= aabb.maxY
      ) {
        return aabb;
      }
    }
    return null;
  }

  /**
   * Return the surface Y a vehicle should be clamped to when on the bridge.
   * Returns null if not on a bridge.
   *
   * @param {number} x
   * @param {number} z
   * @returns {number|null}
   */
  function getBridgeSurfaceY(x, z) {
    for (const aabb of _deckAABBs) {
      if (x >= aabb.minX && x <= aabb.maxX &&
          z >= aabb.minZ && z <= aabb.maxZ) {
        return aabb.deckY;
      }
    }
    return null;
  }

  /**
   * Return all deck AABBs (for Vehicle.js / PlayerCar.js collision).
   * @returns {object[]}
   */
  function getDeckAABBs() { return [..._deckAABBs]; }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    if (_rootGroup) {
      Renderer.disposeObject(_rootGroup);
      Renderer.remove(_rootGroup);
      _rootGroup = null;
    }

    const mats = [
      _matConcrete, _matSteel, _matStone,
      _matAsphalt, _matRailing, _matCable, _matMarking,
    ];
    for (const m of mats) {
      if (m?.map) m.map.dispose();
      if (m)      m.dispose();
    }

    _deckAABBs.length   = 0;
    _bridgeLamps.length = 0;

    console.info('[Bridges] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    build,
    dispose,

    // Vehicle surface queries
    getDeckAt,
    getBridgeSurfaceY,
    getDeckAABBs,

    // Constants
    DECK_Y,

  });

})();

if (typeof module !== 'undefined') module.exports = Bridges;
/* ```

---

**File 18 ✅ — `js/world/Bridges.js` done.**

This builds all three architecturally distinct bridges. The concrete flat-deck bridge gets solid parapet walls, two sets of mid-span support piers with cap beams, tapered abutment walls at each end, and drainage hole cylinders punched through the deck face. The suspension bridge builds two steel pylon towers with cross-beams, a full catenary main cable modelled with `CatmullRomCurve3` and `TubeGeometry` per side, vertical hanger rods dropping from the cable down to deck level, I-beam stiffening girders along both deck edges, and massive concrete anchorage blocks at each end. The stone arch bridge generates two full segmented arches using voussoir blocks rotated to follow the circular arc, spandrel fill walls between the arch curve and deck, decorative rounded pillars with orb caps on the parapet, stepped plinths at each abutment, and a highlighted keystone at the apex. All three bridges share approach ramps, lane markings, open/solid/stone-style railings, lamppost pairs registered with `Sky.js`, and canvas-drawn name plates. `getBridgeSurfaceY` gives `PlayerCar.js` a fast Z-lookup to clamp the car to the correct deck height when crossing.

**Say "File 19" for `js/vehicles/Vehicle.js`.** */
