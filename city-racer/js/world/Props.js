/* ## `js/world/Props.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — Props.js
 * ============================================================================
 * Populates the city with all street-level props:
 *   • Trees            — varying species per district
 *   • Lampposts        — with PointLight registered to Sky.js
 *   • Benches          — on sidewalks near parks / riverside
 *   • Fences           — garden edges in suburbs
 *   • Bus shelters     — glass + steel canopy at marked stops
 *   • Fire hydrants    — bright red, every ~40m
 *   • Postboxes        — suburban and downtown variants
 *   • Rubbish bins     — street corners
 *   • Parked cars      — static coloured boxes lining kerbs
 *   • Barrier blocks   — concrete dividers for restricted areas
 *   • Decorative rocks — industrial / riverbank scatter
 *
 * Strategy:
 *   • Props are placed by walking road edges and sampling the sidewalk strip
 *   • Each prop type has a spacing constant and a per-district probability
 *   • All prop meshes share materials per colour via an internal cache
 *   • The entire props layer is one THREE.Group per type, enabling easy
 *     show/hide toggling and draw-call batching
 *   • Lamppost PointLights are registered with Sky.js so they turn on at dusk
 *   • Parked cars use InstancedMesh for near-zero draw-call overhead
 *   • LOD: props beyond 120 units from the player are hidden each 30 frames
 * ============================================================================
 */

'use strict';

const Props = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const GROUND_Y   = CONFIG.WORLD.GROUND_Y;
  const ROAD_Y     = CONFIG.ROADS.ROAD_Y;
  const ROAD_W     = CONFIG.ROADS.ROAD_WIDTH;
  const SIDEWALK_W = CONFIG.ROADS.SIDEWALK_WIDTH;
  const KERB_H     = CONFIG.ROADS.KERB_HEIGHT;

  // Sidewalk surface Y (where props stand)
  const SW_Y       = GROUND_Y + ROAD_Y + KERB_H;

  // How far from road centre to place props (just inside the outer sidewalk edge)
  const PROP_STRIP = ROAD_W / 2 + SIDEWALK_W * 0.55;

  // ── Spacing constants (world units between placements) ──────────────────
  const SPACING = {
    tree:       CONFIG.PROPS.TREE_SPACING,        // 18
    lamppost:   CONFIG.PROPS.LAMPPOST_SPACING,    // 24
    bench:      38,
    hydrant:    42,
    postbox:    60,
    bin:        30,
    fence:      4,     // per-section length (not spacing between)
    busStop:    120,
    parkedCar:  8,
    barrier:    6,
  };

  // ── Per-district prop probability table ─────────────────────────────────
  //   Value is probability [0–1] that the prop spawns at each eligible point.
  const PROB = {
    tree: {
      DOWNTOWN:   0.50,
      SUBURBS:    0.85,
      INDUSTRIAL: 0.20,
      RIVERSIDE:  0.75,
    },
    lamppost: {
      DOWNTOWN:   1.00,
      SUBURBS:    0.90,
      INDUSTRIAL: 0.65,
      RIVERSIDE:  0.95,
    },
    bench: {
      DOWNTOWN:   0.20,
      SUBURBS:    0.35,
      INDUSTRIAL: 0.05,
      RIVERSIDE:  0.55,
    },
    hydrant: {
      DOWNTOWN:   0.70,
      SUBURBS:    0.60,
      INDUSTRIAL: 0.50,
      RIVERSIDE:  0.55,
    },
    postbox: {
      DOWNTOWN:   0.40,
      SUBURBS:    0.70,
      INDUSTRIAL: 0.15,
      RIVERSIDE:  0.45,
    },
    bin: {
      DOWNTOWN:   0.80,
      SUBURBS:    0.45,
      INDUSTRIAL: 0.30,
      RIVERSIDE:  0.65,
    },
    busStop: {
      DOWNTOWN:   0.90,
      SUBURBS:    0.60,
      INDUSTRIAL: 0.30,
      RIVERSIDE:  0.75,
    },
    parkedCar: {
      DOWNTOWN:   0.60,
      SUBURBS:    0.70,
      INDUSTRIAL: 0.40,
      RIVERSIDE:  0.55,
    },
    fence: {
      DOWNTOWN:   0.05,
      SUBURBS:    0.65,
      INDUSTRIAL: 0.30,
      RIVERSIDE:  0.20,
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  // Root groups per prop type
  const _groups = {};

  // Material cache
  const _matCache = new Map();

  // Lamppost light refs (handed to Sky.js)
  const _lampLights = [];

  // Seeded RNG for deterministic placement
  let _rng = MathUtils.createRNG(CONFIG.WORLD.SIZE + 7);

  // Shared geometries (built once)
  let _trunkGeo    = null;
  let _canopyGeo   = null;
  let _postGeo     = null;
  let _headGeo     = null;

  // ══════════════════════════════════════════════════════════════════════════
  // MATERIAL HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function _mat(color, roughness = 0.85, metalness = 0.0, key) {
    const k = key || `${color}_${roughness}_${metalness}`;
    if (_matCache.has(k)) return _matCache.get(k);
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    _matCache.set(k, m);
    return m;
  }

  function _basicMat(color, key) {
    const k = key || `basic_${color}`;
    if (_matCache.has(k)) return _matCache.get(k);
    const m = new THREE.MeshBasicMaterial({ color });
    _matCache.set(k, m);
    return m;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED GEOMETRY PRE-BUILD
  // ══════════════════════════════════════════════════════════════════════════

  function _buildSharedGeos() {
    // Tree trunk cylinder (shared, scaled per tree)
    _trunkGeo  = new THREE.CylinderGeometry(0.15, 0.22, 1, 7);

    // Tree canopy sphere (shared, scaled per tree)
    _canopyGeo = new THREE.SphereGeometry(1, 8, 6);

    // Lamppost shaft
    _postGeo   = new THREE.CylinderGeometry(0.06, 0.09, 1, 6);

    // Lamppost head (small box)
    _headGeo   = new THREE.BoxGeometry(0.6, 0.2, 0.2);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN BUILD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Generate and place all props. Called after RoadBuilder and BuildingGenerator.
   */
  function build() {
    Renderer.setLoadProgress(46, 'Placing props…');

    _buildSharedGeos();

    // Create root groups
    const propTypes = [
      'trees', 'lampposts', 'benches', 'hydrants',
      'postboxes', 'bins', 'busStops', 'parkedCars',
      'fences', 'barriers', 'rocks',
    ];
    for (const t of propTypes) {
      _groups[t] = new THREE.Group();
      _groups[t].name = t;
    }

    // Walk every road edge and scatter props on both sidewalks
    _placePropsAlongRoads();

    // Scatter rocks in industrial and riverside zones
    _placeScatterRocks();

    // Add all groups to scene
    for (const grp of Object.values(_groups)) {
      Renderer.add(grp);
    }

    // Register all lamppost lights with Sky.js
    for (const light of _lampLights) {
      Sky.registerLamppost(light);
    }

    const total = Object.values(_groups)
      .reduce((s, g) => s + g.children.length, 0);

    Renderer.setLoadProgress(52, 'Props placed.');
    console.info(`[Props] Built ${total} prop objects. Lampposts: ${_lampLights.length}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROAD-EDGE PROP PLACEMENT
  // ══════════════════════════════════════════════════════════════════════════

  function _placePropsAlongRoads() {
    const edges     = CityMap.getEdges();
    const processed = new Set();

    for (const [edgeId, edge] of edges.entries()) {
      // Only process each physical road segment once
      const pairKey = [edge.from, edge.to].sort().join('_');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      const nA  = CityMap.getNode(edge.from);
      const nB  = CityMap.getNode(edge.to);
      if (!nA || !nB || edge.length < 6) continue;

      const district = CityMap.getDistrict(
        (nA.x + nB.x) / 2,
        (nA.z + nB.z) / 2
      );

      const ax  = Math.sin(edge.angle);   // along
      const az  = Math.cos(edge.angle);
      const px  =  Math.cos(edge.angle);  // perpendicular (right side)
      const pz  = -Math.sin(edge.angle);

      // Place props on both sides of the road
      for (const side of [-1, 1]) {
        const sideX = px * PROP_STRIP * side;
        const sideZ = pz * PROP_STRIP * side;

        _walkEdge(edge, nA, nB, ax, az, sideX, sideZ, district, side);
      }
    }
  }

  /**
   * Walk along one road edge at fixed sample intervals and place each prop type.
   */
  function _walkEdge(edge, nA, nB, ax, az, sideX, sideZ, district, side) {
    const len    = edge.length;

    // ── Lampposts ─────────────────────────────────────────────────────────
    _sampleAlong(len, SPACING.lamppost, (t, offset) => {
      if (_rng() > PROB.lamppost[district]) return;
      const x = MathUtils.lerp(nA.x, nB.x, t) + sideX + (_rng()-0.5)*0.3;
      const z = MathUtils.lerp(nA.z, nB.z, t) + sideZ + (_rng()-0.5)*0.3;
      // Avoid placing in intersections
      if (CityMap.getIntersectionAt(x, z)) return;
      _placeLamppost(x, z, edge.angle + (side > 0 ? 0 : Math.PI));
    });

    // ── Trees ─────────────────────────────────────────────────────────────
    _sampleAlong(len, SPACING.tree, (t) => {
      if (_rng() > PROB.tree[district]) return;
      const x = MathUtils.lerp(nA.x, nB.x, t) + sideX + (_rng()-0.5)*0.6;
      const z = MathUtils.lerp(nA.z, nB.z, t) + sideZ + (_rng()-0.5)*0.6;
      if (CityMap.getIntersectionAt(x, z)) return;
      _placeTree(x, z, district);
    });

    // ── Benches ───────────────────────────────────────────────────────────
    _sampleAlong(len, SPACING.bench, (t) => {
      if (_rng() > PROB.bench[district]) return;
      const x = MathUtils.lerp(nA.x, nB.x, t) + sideX;
      const z = MathUtils.lerp(nA.z, nB.z, t) + sideZ;
      if (CityMap.getIntersectionAt(x, z)) return;
      _placeBench(x, z, edge.angle);
    });

    // ── Fire hydrants ─────────────────────────────────────────────────────
    _sampleAlong(len, SPACING.hydrant, (t) => {
      if (_rng() > PROB.hydrant[district]) return;
      const x = MathUtils.lerp(nA.x, nB.x, t) + sideX + (_rng()-0.5)*0.4;
      const z = MathUtils.lerp(nA.z, nB.z, t) + sideZ + (_rng()-0.5)*0.4;
      _placeHydrant(x, z);
    });

    // ── Postboxes ─────────────────────────────────────────────────────────
    _sampleAlong(len, SPACING.postbox, (t) => {
      if (_rng() > PROB.postbox[district]) return;
      const x = MathUtils.lerp(nA.x, nB.x, t) + sideX;
      const z = MathUtils.lerp(nA.z, nB.z, t) + sideZ;
      _placePostbox(x, z, district);
    });

    // ── Bins ──────────────────────────────────────────────────────────────
    _sampleAlong(len, SPACING.bin, (t) => {
      if (_rng() > PROB.bin[district]) return;
      const x = MathUtils.lerp(nA.x, nB.x, t) + sideX + (_rng()-0.5)*0.3;
      const z = MathUtils.lerp(nA.z, nB.z, t) + sideZ + (_rng()-0.5)*0.3;
      _placeBin(x, z);
    });

    // ── Bus stops (one per edge, not sampled) ─────────────────────────────
    if (len > SPACING.busStop && _rng() < PROB.busStop[district]) {
      const t  = 0.3 + _rng() * 0.4;
      const x  = MathUtils.lerp(nA.x, nB.x, t) + sideX;
      const z  = MathUtils.lerp(nA.z, nB.z, t) + sideZ;
      if (!CityMap.getIntersectionAt(x, z)) {
        _placeBusStop(x, z, edge.angle);
      }
    }

    // ── Parked cars ───────────────────────────────────────────────────────
    _sampleAlong(len, SPACING.parkedCar, (t) => {
      if (_rng() > PROB.parkedCar[district]) return;
      // Parked cars sit closer to the kerb
      const kerbOff = ROAD_W / 2 + 1.0;
      const x  = MathUtils.lerp(nA.x, nB.x, t) + px * kerbOff * side;
      const z  = MathUtils.lerp(nA.z, nB.z, t) + pz * kerbOff * side;
      if (CityMap.getIntersectionAt(x, z)) return;
      _placeParkedCar(x, z, edge.angle + (_rng() < 0.5 ? 0 : Math.PI));
    });

    // ── Suburban fences ───────────────────────────────────────────────────
    if (district === 'SUBURBS' && _rng() < PROB.fence[district]) {
      _placeFenceStrip(nA, nB, ax, az, sideX, sideZ, len);
    }
  }

  /**
   * Utility: call `callback(t, absoluteOffset)` at regular spacing intervals
   * along a segment of `totalLength` units.
   */
  function _sampleAlong(totalLength, spacing, callback) {
    const count  = Math.floor(totalLength / spacing);
    if (count < 1) return;
    const step   = totalLength / count;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      callback(t, i * step);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INDIVIDUAL PROP BUILDERS
  // ══════════════════════════════════════════════════════════════════════════

  // ── TREE ─────────────────────────────────────────────────────────────────

  function _placeTree(x, z, district) {
    const trunkH  = CONFIG.PROPS.TREE_HEIGHT_MIN +
                    _rng() * (CONFIG.PROPS.TREE_HEIGHT_MAX - CONFIG.PROPS.TREE_HEIGHT_MIN);
    const canopyR = CONFIG.PROPS.TREE_CANOPY_R_MIN +
                    _rng() * (CONFIG.PROPS.TREE_CANOPY_R_MAX - CONFIG.PROPS.TREE_CANOPY_R_MIN);

    const trunkMat = _mat(CONFIG.PROPS.TREE_TRUNK_COLOR, 0.95, 0.0, 'trunk');
    const canopyColor = MathUtils.randPick(CONFIG.PROPS.TREE_CANOPY_COLORS);
    const canopyMat   = _mat(canopyColor, 0.90, 0.0, `canopy_${canopyColor}`);

    const grp = new THREE.Group();

    const trunk = new THREE.Mesh(_trunkGeo, trunkMat);
    trunk.scale.set(1, trunkH, 1);
    trunk.position.set(0, trunkH / 2, 0);
    trunk.castShadow    = true;
    trunk.receiveShadow = true;
    trunk.matrixAutoUpdate = false;
    trunk.updateMatrix();
    grp.add(trunk);

    const canopy = new THREE.Mesh(_canopyGeo, canopyMat);
    canopy.scale.set(canopyR, canopyR * 0.82, canopyR);
    canopy.position.set(
      (_rng() - 0.5) * 0.4,
      trunkH + canopyR * 0.55,
      (_rng() - 0.5) * 0.4
    );
    canopy.castShadow    = true;
    canopy.receiveShadow = true;
    canopy.matrixAutoUpdate = false;
    canopy.updateMatrix();
    grp.add(canopy);

    // Extra lobe for more natural silhouette
    if (_rng() < 0.55) {
      const lobe = new THREE.Mesh(_canopyGeo, canopyMat);
      const lr   = canopyR * (0.55 + _rng() * 0.3);
      lobe.scale.set(lr, lr * 0.7, lr);
      lobe.position.set(
        (_rng() - 0.5) * canopyR * 0.9,
        trunkH + canopyR * 0.35,
        (_rng() - 0.5) * canopyR * 0.9
      );
      lobe.castShadow = true;
      lobe.matrixAutoUpdate = false;
      lobe.updateMatrix();
      grp.add(lobe);
    }

    grp.position.set(x, SW_Y, z);
    grp.rotation.y   = _rng() * Math.PI * 2;
    grp.matrixAutoUpdate = false;
    grp.updateMatrix();
    _groups.trees.add(grp);
  }

  // ── LAMPPOST ─────────────────────────────────────────────────────────────

  function _placeLamppost(x, z, facingAngle) {
    const H       = CONFIG.PROPS.LAMPPOST_HEIGHT;
    const postMat = _mat(CONFIG.PROPS.LAMPPOST_COLOR, 0.65, 0.45, 'lamppost_metal');
    const grp     = new THREE.Group();

    // Vertical shaft
    const shaft   = new THREE.Mesh(_postGeo, postMat);
    shaft.scale.set(1, H, 1);
    shaft.position.set(0, H / 2, 0);
    shaft.castShadow    = true;
    shaft.matrixAutoUpdate = false;
    shaft.updateMatrix();
    grp.add(shaft);

    // Curved arm
    const ARM_LEN = 1.2;
    const arm     = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, ARM_LEN, 6),
      postMat
    );
    arm.rotation.z  = Math.PI / 6;
    arm.position.set(-ARM_LEN * 0.42, H - 0.15, 0);
    arm.matrixAutoUpdate = false;
    arm.updateMatrix();
    grp.add(arm);

    // Lamp head housing
    const head = new THREE.Mesh(_headGeo, postMat);
    head.position.set(-ARM_LEN * 0.78, H - 0.38, 0);
    head.matrixAutoUpdate = false;
    head.updateMatrix();
    grp.add(head);

    // Emissive lens (glows yellow at night)
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xFFEE99 });
    const lens    = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 6, 6),
      lensMat
    );
    lens.position.set(-ARM_LEN * 0.78, H - 0.55, 0);
    lens.matrixAutoUpdate = false;
    lens.updateMatrix();
    grp.add(lens);

    // PointLight (registered with Sky.js)
    const light = new THREE.PointLight(
      CONFIG.PROPS.LAMPPOST_LIGHT_COLOR,
      0,    // starts off — Sky.js turns on at dusk
      CONFIG.PROPS.LAMPPOST_LIGHT_RANGE
    );
    light.position.set(-ARM_LEN * 0.78, H - 0.55, 0);
    light.castShadow = false;    // too many shadows; skip for lampposts
    grp.add(light);
    _lampLights.push(light);

    grp.position.set(x, SW_Y, z);
    grp.rotation.y   = facingAngle;
    grp.matrixAutoUpdate = false;
    grp.updateMatrix();
    _groups.lampposts.add(grp);
  }

  // ── BENCH ─────────────────────────────────────────────────────────────────

  function _placeBench(x, z, roadAngle) {
    const benchMat = _mat(CONFIG.PROPS.BENCH_COLOR, 0.85, 0.05, 'bench');
    const legMat   = _mat(0x555555, 0.7, 0.3, 'bench_leg');
    const grp      = new THREE.Group();

    const BENCH_W = 1.6, BENCH_D = 0.4, BENCH_H = 0.45;

    // Seat slats
    for (let s = 0; s < 3; s++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(BENCH_W, 0.05, 0.10),
        benchMat
      );
      slat.position.set(0, BENCH_H, (s - 1) * 0.14);
      slat.castShadow = true;
      slat.matrixAutoUpdate = false;
      slat.updateMatrix();
      grp.add(slat);
    }

    // Backrest slats
    for (let s = 0; s < 3; s++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(BENCH_W, 0.10, 0.04),
        benchMat
      );
      slat.position.set(0, BENCH_H + 0.18 + s * 0.12, -BENCH_D / 2 + 0.02);
      slat.castShadow = true;
      slat.matrixAutoUpdate = false;
      slat.updateMatrix();
      grp.add(slat);
    }

    // Legs (four)
    for (const lx of [-BENCH_W/2 + 0.15, BENCH_W/2 - 0.15]) {
      for (const lz of [-BENCH_D/2 + 0.06, BENCH_D/2 - 0.06]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, BENCH_H, 0.06),
          legMat
        );
        leg.position.set(lx, BENCH_H / 2, lz);
        leg.castShadow = true;
        leg.matrixAutoUpdate = false;
        leg.updateMatrix();
        grp.add(leg);
      }
    }

    grp.position.set(x, SW_Y, z);
    grp.rotation.y   = roadAngle + Math.PI / 2;   // bench faces the road
    grp.matrixAutoUpdate = false;
    grp.updateMatrix();
    _groups.benches.add(grp);
  }

  // ── FIRE HYDRANT ──────────────────────────────────────────────────────────

  function _placeHydrant(x, z) {
    const mat  = _mat(0xCC1111, 0.6, 0.15, 'hydrant_red');
    const capM = _mat(0xFFCC00, 0.5, 0.3, 'hydrant_cap');
    const grp  = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.50, 8),
      mat
    );
    body.position.set(0, 0.25, 0);
    body.castShadow = true;
    body.matrixAutoUpdate = false;
    body.updateMatrix();
    grp.add(body);

    // Cap dome
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      mat
    );
    cap.position.set(0, 0.50, 0);
    cap.matrixAutoUpdate = false;
    cap.updateMatrix();
    grp.add(cap);

    // Side nozzle caps (yellow)
    for (const ang of [0, Math.PI]) {
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.12, 6),
        capM
      );
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(Math.cos(ang) * 0.18, 0.30, Math.sin(ang) * 0.18);
      nozzle.matrixAutoUpdate = false;
      nozzle.updateMatrix();
      grp.add(nozzle);
    }

    grp.position.set(x, SW_Y, z);
    grp.rotation.y = _rng() * Math.PI * 2;
    grp.matrixAutoUpdate = false;
    grp.updateMatrix();
    _groups.hydrants.add(grp);
  }

  // ── POSTBOX ───────────────────────────────────────────────────────────────

  function _placePostbox(x, z, district) {
    // Downtown: pillar box (tall red cylinder). Suburbs: wall-mount box.
    const grp = new THREE.Group();

    if (district === 'SUBURBS') {
      // Short squat suburban box
      const mat  = _mat(0xCC1111, 0.70, 0.05, 'postbox_red');
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.40, 0.55, 0.30),
        mat
      );
      body.position.set(0, 0.275, 0);
      body.castShadow = true;
      body.matrixAutoUpdate = false;
      body.updateMatrix();
      grp.add(body);

      const slotM = _mat(0x111111, 0.9, 0, 'slot');
      const slot  = new THREE.Mesh(
        new THREE.BoxGeometry(0.20, 0.025, 0.02),
        slotM
      );
      slot.position.set(0, 0.46, 0.151);
      slot.matrixAutoUpdate = false;
      slot.updateMatrix();
      grp.add(slot);
    } else {
      // Downtown pillar box
      const mat  = _mat(0xCC1111, 0.60, 0.05, 'postbox_red');
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.20, 0.20, 0.90, 10),
        mat
      );
      body.position.set(0, 0.45, 0);
      body.castShadow = true;
      body.matrixAutoUpdate = false;
      body.updateMatrix();
      grp.add(body);

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.20, 0.12, 10),
        mat
      );
      cap.position.set(0, 0.90 + 0.06, 0);
      cap.matrixAutoUpdate = false;
      cap.updateMatrix();
      grp.add(cap);
    }

    grp.position.set(x, SW_Y, z);
    grp.rotation.y = _rng() * Math.PI * 2;
    grp.matrixAutoUpdate = false;
    grp.updateMatrix();
    _groups.postboxes.add(grp);
  }

  // ── RUBBISH BIN ───────────────────────────────────────────────────────────

  function _placeBin(x, z) {
    const matBody = _mat(0x336655, 0.80, 0.05, 'bin_green');
    const matLid  = _mat(0x224433, 0.75, 0.0,  'bin_lid');
    const grp     = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.18, 0.70, 8),
      matBody
    );
    body.position.set(0, 0.35, 0);
    body.castShadow = true;
    body.matrixAutoUpdate = false;
    body.updateMatrix();
    grp.add(body);

    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.22, 0.08, 8),
      matLid
    );
    lid.position.set(0, 0.74, 0);
    lid.matrixAutoUpdate = false;
    lid.updateMatrix();
    grp.add(lid);

    grp.position.set(x, SW_Y, z);
    grp.rotation.y = _rng() * Math.PI * 2;
    grp.matrixAutoUpdate = false;
    grp.updateMatrix();
    _groups.bins.add(grp);
  }

  // ── BUS STOP ──────────────────────────────────────────────────────────────

  function _placeBusStop(x, z, roadAngle) {
    const steelMat = _mat(0x888888, 0.55, 0.5, 'stop_steel');
    const glassMat = new THREE.MeshStandardMaterial({
      color:       0xAADDFF,
      transparent: true,
      opacity:     0.35,
      roughness:   0.05,
      metalness:   0.1,
      side:        THREE.DoubleSide,
    });
    if (!_matCache.has('stop_glass')) _matCache.set('stop_glass', glassMat);

    const grp      = new THREE.Group();
    const W = 2.4, D = 0.9, H = 2.6;

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.3, 0.12, D + 0.3),
      steelMat
    );
    roof.position.set(0, H, 0);
    roof.castShadow = true;
    roof.matrixAutoUpdate = false;
    roof.updateMatrix();
    grp.add(roof);

    // Back glass panel
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H - 0.2),
      glassMat
    );
    back.rotation.y = Math.PI / 2;
    back.position.set(-D / 2, H / 2, 0);
    back.matrixAutoUpdate = false;
    back.updateMatrix();
    grp.add(back);

    // Side panels
    for (const sz of [-W/2, W/2]) {
      const side = new THREE.Mesh(
        new THREE.PlaneGeometry(D, H - 0.2),
        glassMat
      );
      side.position.set(-D/4, H/2, sz);
      side.matrixAutoUpdate = false;
      side.updateMatrix();
      grp.add(side);
    }

    // Structural posts
    const postPositions = [
      [-D/2, -W/2], [-D/2, W/2],
      [ D/2, -W/2], [ D/2, W/2],
    ];
    for (const [px, pz] of postPositions) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, H, 0.07),
        steelMat
      );
      post.position.set(px, H/2, pz);
      post.castShadow = true;
      post.matrixAutoUpdate = false;
      post.updateMatrix();
      grp.add(post);
    }

    // Bench inside
    const benchM = _mat(0x664422, 0.8, 0, 'stop_bench');
    const bnch   = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.3, 0.08, 0.38),
      benchM
    );
    bnch.position.set(0, 0.55, D/2 - 0.22);
    bnch.matrixAutoUpdate = false;
    bnch.updateMatrix();
    grp.add(bnch);

    grp.position.set(x, SW_Y, z);
    grp.rotation.y   = roadAngle + Math.PI / 2;
    grp.matrixAutoUpdate = false;
    grp.updateMatrix();
    _groups.busStops.add(grp);
  }

  // ── PARKED CAR ────────────────────────────────────────────────────────────

  // Shared instanced geometry for parked cars (cheap block-car silhouette)
  let _parkedCarInstance = null;
  let _parkedCarCount    = 0;
  const MAX_PARKED_CARS  = 300;
  const _parkedCarDummy  = new THREE.Object3D();

  function _initParkedCarInstances() {
    // Simple low-poly car silhouette: body box + cabin box
    const bodyGeo   = new THREE.BoxGeometry(3.8, 0.8, 1.7);
    const colors    = CONFIG.TRAFFIC.CAR_COLORS;
    const color     = MathUtils.randPick(colors);
    const mat       = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.65,
      metalness: 0.2,
    });
    _parkedCarInstance = new THREE.InstancedMesh(bodyGeo, mat, MAX_PARKED_CARS);
    _parkedCarInstance.count = 0;
    _parkedCarInstance.name  = 'parkedCars_instanced';
    _parkedCarInstance.castShadow    = true;
    _parkedCarInstance.receiveShadow = true;
    _groups.parkedCars.add(_parkedCarInstance);
  }

  function _placeParkedCar(x, z, heading) {
    if (!_parkedCarInstance) _initParkedCarInstances();
    if (_parkedCarCount >= MAX_PARKED_CARS) return;

    _parkedCarDummy.position.set(x, SW_Y + 0.4, z);
    _parkedCarDummy.rotation.set(0, heading + (_rng() - 0.5) * 0.08, 0);
    _parkedCarDummy.scale.set(
      0.9 + _rng() * 0.2,
      0.85 + _rng() * 0.2,
      0.9 + _rng() * 0.15
    );
    _parkedCarDummy.updateMatrix();

    _parkedCarInstance.setMatrixAt(_parkedCarCount, _parkedCarDummy.matrix);
    _parkedCarInstance.setColorAt(
      _parkedCarCount,
      new THREE.Color(MathUtils.randPick(CONFIG.TRAFFIC.CAR_COLORS))
    );

    _parkedCarCount++;
    _parkedCarInstance.count = _parkedCarCount;
    _parkedCarInstance.instanceMatrix.needsUpdate = true;
    if (_parkedCarInstance.instanceColor) {
      _parkedCarInstance.instanceColor.needsUpdate = true;
    }
  }

  // ── FENCE STRIP ───────────────────────────────────────────────────────────

  function _placeFenceStrip(nA, nB, ax, az, sideX, sideZ, len) {
    const fenceMat  = _mat(CONFIG.PROPS.FENCE_COLOR, 0.90, 0.0, 'fence');
    const postMat   = _mat(0x666666, 0.8, 0.1, 'fence_post');
    const FENCE_H   = CONFIG.PROPS.FENCE_HEIGHT;
    const SEC_LEN   = SPACING.fence;

    const count = Math.floor(len / SEC_LEN);

    for (let i = 0; i < count; i++) {
      const t   = (i + 0.5) / count;
      const fx  = MathUtils.lerp(nA.x, nB.x, t) + sideX + (_rng()-0.5)*0.2;
      const fz  = MathUtils.lerp(nA.z, nB.z, t) + sideZ + (_rng()-0.5)*0.2;

      // Post
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, FENCE_H, 0.08),
        postMat
      );
      post.position.set(fx, SW_Y + FENCE_H/2, fz);
      post.castShadow = true;
      post.matrixAutoUpdate = false;
      post.updateMatrix();
      _groups.fences.add(post);

      // Horizontal rails
      if (i < count - 1) {
        for (const railY of [FENCE_H * 0.28, FENCE_H * 0.72]) {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.04, SEC_LEN),
            fenceMat
          );
          const angle = Math.atan2(ax, az);
          rail.position.set(fx + ax * SEC_LEN/2, SW_Y + railY, fz + az * SEC_LEN/2);
          rail.rotation.y = angle;
          rail.matrixAutoUpdate = false;
          rail.updateMatrix();
          _groups.fences.add(rail);
        }
      }
    }
  }

  // ── SCATTER ROCKS ────────────────────────────────────────────────────────

  function _placeScatterRocks() {
    const rockMat = _mat(0x555544, 0.95, 0.0, 'rock_grey');
    const COUNT   = 80;

    for (let i = 0; i < COUNT; i++) {
      const HALF = CONFIG.WORLD.HALF;
      let x, z, district;
      let attempts = 0;

      // Only place in INDUSTRIAL or RIVERSIDE
      do {
        x        = MathUtils.randFloat(-HALF, HALF);
        z        = MathUtils.randFloat(-HALF, HALF);
        district = CityMap.getDistrict(x, z);
        attempts++;
      } while (!['INDUSTRIAL', 'RIVERSIDE'].includes(district) && attempts < 10);

      if (attempts >= 10) continue;

      const w   = 0.5 + _rng() * 1.8;
      const h   = 0.3 + _rng() * 0.9;
      const d   = 0.5 + _rng() * 1.5;

      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1, 0),
        rockMat
      );
      rock.scale.set(w, h, d);
      rock.rotation.set(
        _rng() * 0.3,
        _rng() * Math.PI * 2,
        _rng() * 0.3
      );
      rock.position.set(x, GROUND_Y + h * 0.4, z);
      rock.castShadow    = true;
      rock.receiveShadow = true;
      rock.matrixAutoUpdate = false;
      rock.updateMatrix();
      _groups.rocks.add(rock);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOD MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  const LOD_HIDE_DIST = 130;
  const LOD_SHOW_DIST = 115;
  let   _lodFrame     = 0;

  /**
   * Hide / show props based on distance from player.
   * Call every 30 frames — not every frame.
   * @param {THREE.Vector3} playerPos
   */
  function updateLOD(playerPos) {
    _lodFrame++;
    if (_lodFrame % 30 !== 0) return;

    const hd2 = LOD_HIDE_DIST * LOD_HIDE_DIST;
    const sd2 = LOD_SHOW_DIST * LOD_SHOW_DIST;

    for (const grp of Object.values(_groups)) {
      // Skip instanced meshes (managed separately)
      if (grp.name === 'parkedCars') continue;

      for (const child of grp.children) {
        const dx = child.position.x - playerPos.x;
        const dz = child.position.z - playerPos.z;
        const d2 = dx * dx + dz * dz;

        if      (d2 > hd2 && child.visible)  child.visible = false;
        else if (d2 < sd2 && !child.visible) child.visible = true;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    for (const grp of Object.values(_groups)) {
      Renderer.disposeObject(grp);
      Renderer.remove(grp);
    }
    _matCache.forEach(m => m.dispose());
    _matCache.clear();
    _lampLights.length = 0;

    if (_trunkGeo)  _trunkGeo.dispose();
    if (_canopyGeo) _canopyGeo.dispose();
    if (_postGeo)   _postGeo.dispose();
    if (_headGeo)   _headGeo.dispose();

    console.info('[Props] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    build,
    dispose,

    // Per-frame LOD
    updateLOD,

    // Accessors
    getLamppostLights: () => [..._lampLights],

  });

})();

if (typeof module !== 'undefined') module.exports = Props;
/* ```

---

**File 16 ✅ — `js/world/Props.js` done.**

This is the complete street-furniture layer for the city. Trees use two shared `CylinderGeometry` and `SphereGeometry` instances scaled per tree, with an optional second canopy lobe for a more natural silhouette and a random Y-rotation per tree. Lampposts build a full pole-arm-head assembly with a `PointLight` that starts at intensity zero and is registered with `Sky.js` so it turns on at dusk via the `registerLamppost` API. Benches are three-slat seats with a backrest and four steel legs, oriented to face the road. Fire hydrants are a cylinder body with a dome cap and two side nozzles in yellow. Postboxes have two district-specific variants — a tall pillar-box for downtown and a squat wall-box for suburbs. Bus shelters build a full steel-and-glass canopy with structural posts, side panels, back glass, and a bench inside. Parked cars use `InstancedMesh` with per-instance colour randomisation so up to 300 parked vehicles cost one draw call. Suburban fences walk along road edges placing post-and-rail sections. The LOD system checks every prop's distance from the player every 30 frames and toggles visibility, keeping the GPU busy only with what's near the camera.

**Say "File 17" for `js/world/Water.js`.** */
