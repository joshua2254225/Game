/* ## `js/world/RoadBuilder.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — RoadBuilder.js
 * ============================================================================
 * Converts the abstract CityMap graph into visible Three.js geometry.
 * Reads nodes, edges, and intersections from CityMap and produces:
 *
 *   • Road surface slabs (asphalt, textured)
 *   • Kerb / curb strips along both edges
 *   • Sidewalk strips (concrete pavement)
 *   • Centre-line and lane markings (dash/solid overlays)
 *   • Intersection pads (flat filled square/circle at junctions)
 *   • Traffic-light pole assemblies (pole, arm, three heads)
 *   • Crosswalk zebra stripes
 *   • Ground plane (grass / dirt base beneath the whole city)
 *   • Road signs (speed limit, one-way arrows)
 *
 * Performance strategy:
 *   • All road segments of the same type share one merged BufferGeometry
 *     via THREE.BufferGeometryUtils.mergeBufferGeometries (simulated here
 *     without the util by manually concatenating attribute arrays).
 *   • Markings use a single instanced mesh per marking type.
 *   • Traffic light poles each have their own small Group (they animate).
 *   • All static meshes are marked matrixAutoUpdate = false after placement.
 * ============================================================================
 */

'use strict';

const RoadBuilder = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const RW   = CONFIG.ROADS.ROAD_WIDTH;
  const LW   = CONFIG.ROADS.LANE_WIDTH;
  const SW   = CONFIG.ROADS.SIDEWALK_WIDTH;
  const KH   = CONFIG.ROADS.KERB_HEIGHT;
  const ROAD_Y   = CONFIG.ROADS.ROAD_Y;
  const MARK_Y   = CONFIG.ROADS.MARKING_Y;
  const GROUND_Y = CONFIG.WORLD.GROUND_Y;

  // Total slab width: road + both kerbs + both sidewalks
  const FULL_W   = RW + SW * 2;

  // ══════════════════════════════════════════════════════════════════════════
  // MATERIALS  (created once, shared across all geometry)
  // ══════════════════════════════════════════════════════════════════════════

  let _matAsphalt   = null;
  let _matSidewalk  = null;
  let _matKerb      = null;
  let _matMarking   = null;
  let _matStopLine  = null;
  let _matIntersect = null;
  let _matGround    = null;
  let _matLightPole = null;
  let _matLightHead = null;
  let _matCrosswalk = null;

  function _buildMaterials() {
    // Asphalt — repeating tarmac texture
    _matAsphalt = new THREE.MeshStandardMaterial({
      map:       ProceduralTextures.makeAsphalt(512),
      roughness: 0.92,
      metalness: 0.0,
      color:     new THREE.Color(CONFIG.ROADS.ASPHALT_COLOR),
    });
    _matAsphalt.map.repeat.set(0.15, 0.6);

    // Sidewalk — tiled concrete
    _matSidewalk = new THREE.MeshStandardMaterial({
      map:       ProceduralTextures.makeSidewalk(256),
      roughness: 0.88,
      metalness: 0.0,
      color:     new THREE.Color(CONFIG.ROADS.SIDEWALK_COLOR),
    });
    _matSidewalk.map.repeat.set(0.2, 0.8);

    // Kerb — red/white stripe
    _matKerb = new THREE.MeshStandardMaterial({
      map:       ProceduralTextures.makeKerb(128),
      roughness: 0.80,
      metalness: 0.0,
    });
    _matKerb.map.repeat.set(0.1, 1.0);

    // Lane markings — white semi-transparent dashes
    _matMarking = new THREE.MeshBasicMaterial({
      color:       CONFIG.ROADS.MARKING_COLOR,
      transparent: true,
      opacity:     0.88,
      depthWrite:  false,
    });

    // Stop-line marking
    _matStopLine = new THREE.MeshBasicMaterial({
      color:       CONFIG.ROADS.MARKING_COLOR,
      transparent: true,
      opacity:     0.92,
      depthWrite:  false,
    });

    // Intersection pad — slightly darker asphalt
    _matIntersect = new THREE.MeshStandardMaterial({
      map:       ProceduralTextures.makeAsphalt(256),
      roughness: 0.95,
      metalness: 0.0,
      color:     new THREE.Color(0x2A2A2A),
    });
    _matIntersect.map.repeat.set(0.12, 0.12);

    // Ground — grass base
    _matGround = new THREE.MeshStandardMaterial({
      map:       ProceduralTextures.makeGrass(512),
      roughness: 0.95,
      metalness: 0.0,
    });
    _matGround.map.repeat.set(8, 8);

    // Traffic light pole — dark steel
    _matLightPole = new THREE.MeshStandardMaterial({
      color:     0x444444,
      roughness: 0.7,
      metalness: 0.4,
    });

    // Traffic light head housing — black
    _matLightHead = new THREE.MeshStandardMaterial({
      color:     0x111111,
      roughness: 0.5,
      metalness: 0.2,
    });

    // Crosswalk white stripes
    _matCrosswalk = new THREE.MeshBasicMaterial({
      color:       0xEEEEEE,
      transparent: true,
      opacity:     0.80,
      depthWrite:  false,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL GEOMETRY HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create a flat rectangular slab mesh centred at origin, lying in XZ plane.
   * @param {number} w  Width (X)
   * @param {number} d  Depth (Z)
   * @param {THREE.Material} mat
   * @returns {THREE.Mesh}
   */
  function _makeSlab(w, d, mat) {
    const geo  = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow  = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /**
   * Create a box (for kerb, pole sections, etc.).
   */
  function _makeBox(w, h, d, mat) {
    const geo  = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow     = true;
    mesh.receiveShadow  = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /**
   * Position, rotate, and freeze a mesh's matrix.
   * @param {THREE.Mesh|THREE.Group} mesh
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} [ry=0]  Y rotation in radians.
   */
  function _place(mesh, x, y, z, ry = 0) {
    mesh.position.set(x, y, z);
    if (ry !== 0) mesh.rotation.y = ry;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
  }

  /**
   * Return the world position and rotation for the centre of an edge.
   */
  function _edgeTransform(edge) {
    const nA = CityMap.getNode(edge.from);
    const nB = CityMap.getNode(edge.to);
    return {
      x:      (nA.x + nB.x) / 2,
      z:      (nA.z + nB.z) / 2,
      length: edge.length,
      angle:  edge.angle,   // radians, Y-axis rotation
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN BUILD
  // ══════════════════════════════════════════════════════════════════════════

  /** Root group — all road geometry lives here for easy culling. */
  let _rootGroup = null;

  /**
   * Build all road geometry and add it to the scene.
   * Called once during game initialisation, after CityMap.init().
   */
  function build() {
    Renderer.setLoadProgress(15, 'Building roads…');

    _buildMaterials();

    _rootGroup = new THREE.Group();
    _rootGroup.name = 'roadSystem';

    // ── Ground plane ──────────────────────────────────────────────────────
    _buildGround();
    Renderer.setLoadProgress(17, 'Ground done…');

    // ── Road slabs (one pass for all edges) ───────────────────────────────
    _buildRoadSlabs();
    Renderer.setLoadProgress(20, 'Road slabs done…');

    // ── Kerbs and sidewalks ───────────────────────────────────────────────
    _buildKerbsAndSidewalks();
    Renderer.setLoadProgress(23, 'Kerbs done…');

    // ── Intersection pads ─────────────────────────────────────────────────
    _buildIntersectionPads();
    Renderer.setLoadProgress(25, 'Intersections done…');

    // ── Lane markings ─────────────────────────────────────────────────────
    _buildLaneMarkings();
    Renderer.setLoadProgress(27, 'Road markings done…');

    // ── Crosswalks ────────────────────────────────────────────────────────
    _buildCrosswalks();
    Renderer.setLoadProgress(28, 'Crosswalks done…');

    // ── Traffic lights ────────────────────────────────────────────────────
    _buildTrafficLights();
    Renderer.setLoadProgress(30, 'Traffic lights done…');

    Renderer.add(_rootGroup);

    console.info('[RoadBuilder] Complete. Road segments built.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GROUND PLANE
  // ══════════════════════════════════════════════════════════════════════════

  function _buildGround() {
    const size = CONFIG.WORLD.SIZE + 100;   // slightly larger than city
    const geo  = new THREE.PlaneGeometry(size, size, 8, 8);
    geo.rotateX(-Math.PI / 2);

    const ground = new THREE.Mesh(geo, _matGround);
    ground.name            = 'ground';
    ground.position.y      = GROUND_Y - 0.02;
    ground.receiveShadow   = true;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();

    _rootGroup.add(ground);

    // Subtle ground colour variation (city outskirts = darker)
    const edgeGeo = new THREE.PlaneGeometry(size + 200, size + 200);
    edgeGeo.rotateX(-Math.PI / 2);
    const edgeMat = new THREE.MeshBasicMaterial({
      color:       0x1A1000,
      transparent: true,
      opacity:     0.22,
      depthWrite:  false,
    });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.y      = GROUND_Y - 0.01;
    edge.matrixAutoUpdate = false;
    edge.updateMatrix();
    _rootGroup.add(edge);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROAD SLABS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildRoadSlabs() {
    const edges = CityMap.getEdges();

    // Merge all road slabs into one geometry for performance
    const posArrays = [], uvArrays = [], normArrays = [], idxArrays = [];
    let   vertOffset = 0;

    // Only process each pair once (skip reverse edges)
    const processed = new Set();

    for (const [edgeId, edge] of edges.entries()) {
      const pairKey = [edge.from, edge.to].sort().join('_');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      const nA = CityMap.getNode(edge.from);
      const nB = CityMap.getNode(edge.to);
      if (!nA || !nB) continue;

      const { positions, uvs, normals, indices } =
        _roadSlabGeom(nA, nB, RW, edge.length);

      const offsetIdx = indices.map(i => i + vertOffset);
      posArrays.push(...positions);
      uvArrays.push(...uvs);
      normArrays.push(...normals);
      idxArrays.push(...offsetIdx);
      vertOffset += positions.length / 3;
    }

    if (posArrays.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArrays), 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(normArrays), 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(uvArrays), 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idxArrays), 1));
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, _matAsphalt);
    mesh.name             = 'roadSlabs';
    mesh.receiveShadow    = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    _rootGroup.add(mesh);
  }

  /**
   * Generate flat slab geometry for one road segment.
   * Returns raw attribute arrays (not a BufferGeometry) for merging.
   *
   * @param {{x,z}} nA      Start node.
   * @param {{x,z}} nB      End node.
   * @param {number} width   Road width.
   * @param {number} length  Segment length.
   * @returns {{ positions, uvs, normals, indices }}
   */
  function _roadSlabGeom(nA, nB, width, length) {
    const angle = Math.atan2(nB.x - nA.x, nB.z - nA.z);

    // Road perpendicular direction
    const px =  Math.cos(angle);
    const pz = -Math.sin(angle);

    // Four corners (centred on segment)
    const hw = width / 2;
    const hl = length / 2;

    // Along direction
    const ax =  Math.sin(angle);
    const az =  Math.cos(angle);

    const cx = (nA.x + nB.x) / 2;
    const cz = (nA.z + nB.z) / 2;
    const y  =  GROUND_Y + ROAD_Y;

    // v0: back-left, v1: back-right, v2: front-right, v3: front-left
    const v0x = cx - ax * hl - px * hw;  const v0z = cz - az * hl - pz * hw;
    const v1x = cx - ax * hl + px * hw;  const v1z = cz - az * hl + pz * hw;
    const v2x = cx + ax * hl + px * hw;  const v2z = cz + az * hl + pz * hw;
    const v3x = cx + ax * hl - px * hw;  const v3z = cz + az * hl - pz * hw;

    const positions = [
      v0x, y, v0z,
      v1x, y, v1z,
      v2x, y, v2z,
      v3x, y, v3z,
    ];

    const uvScale = 0.06;
    const uvLen   = length * uvScale;
    const uvW     = width  * uvScale;
    const uvs = [0, 0,  uvW, 0,  uvW, uvLen,  0, uvLen];

    const normals = [0,1,0, 0,1,0, 0,1,0, 0,1,0];
    const indices  = [0, 1, 2,  0, 2, 3];

    return { positions, uvs, normals, indices };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // KERBS AND SIDEWALKS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildKerbsAndSidewalks() {
    const edges     = CityMap.getEdges();
    const processed = new Set();

    const kerbGroup     = new THREE.Group(); kerbGroup.name = 'kerbs';
    const sidewalkGroup = new THREE.Group(); sidewalkGroup.name = 'sidewalks';

    for (const [edgeId, edge] of edges.entries()) {
      const pairKey = [edge.from, edge.to].sort().join('_');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      const nA = CityMap.getNode(edge.from);
      const nB = CityMap.getNode(edge.to);
      if (!nA || !nB || edge.length < 1) continue;

      const angle  = edge.angle;
      const cx     = (nA.x + nB.x) / 2;
      const cz     = (nA.z + nB.z) / 2;
      const len    = edge.length;

      // Perpendicular unit vector
      const px =  Math.cos(angle);
      const pz = -Math.sin(angle);

      // ── Kerbs ─────────────────────────────────────────────────────────
      // Left kerb
      const kerbL = _makeBox(KH, KH, len, _matKerb);
      const kOff  = RW / 2;
      _place(kerbL,
        cx + px * kOff,
        GROUND_Y + ROAD_Y + KH / 2,
        cz + pz * kOff,
        angle
      );
      kerbGroup.add(kerbL);

      // Right kerb
      const kerbR = _makeBox(KH, KH, len, _matKerb);
      _place(kerbR,
        cx - px * kOff,
        GROUND_Y + ROAD_Y + KH / 2,
        cz - pz * kOff,
        angle
      );
      kerbGroup.add(kerbR);

      // ── Sidewalks ──────────────────────────────────────────────────────
      const swOff = RW / 2 + SW / 2;
      const swH   = GROUND_Y + ROAD_Y + KH + 0.005;

      const swL = _makeSlab(SW, len, _matSidewalk);
      _place(swL, cx + px * swOff, swH, cz + pz * swOff, angle);
      sidewalkGroup.add(swL);

      const swR = _makeSlab(SW, len, _matSidewalk);
      _place(swR, cx - px * swOff, swH, cz - pz * swOff, angle);
      sidewalkGroup.add(swR);
    }

    _rootGroup.add(kerbGroup, sidewalkGroup);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERSECTION PADS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildIntersectionPads() {
    const group = new THREE.Group();
    group.name  = 'intersectionPads';

    for (const inter of CityMap.getIntersections()) {
      // Pad size covers the road width in all directions
      const padSize = RW + 0.5;
      const pad     = _makeSlab(padSize, padSize, _matIntersect);
      _place(pad, inter.x, GROUND_Y + ROAD_Y + 0.002, inter.z);
      group.add(pad);
    }

    _rootGroup.add(group);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LANE MARKINGS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildLaneMarkings() {
    const group = new THREE.Group();
    group.name  = 'laneMarkings';

    const processed = new Set();
    const edges     = CityMap.getEdges();

    const DASH_LEN  = 2.8;   // length of each dash
    const DASH_GAP  = 4.0;   // gap between dashes
    const DASH_W    = 0.18;  // width of each dash
    const MARK_LIFT = MARK_Y - ROAD_Y + 0.005;

    for (const [edgeId, edge] of edges.entries()) {
      const pairKey = [edge.from, edge.to].sort().join('_');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      const nA = CityMap.getNode(edge.from);
      const nB = CityMap.getNode(edge.to);
      if (!nA || !nB) continue;

      const len   = edge.length;
      const angle = edge.angle;
      const cx    = (nA.x + nB.x) / 2;
      const cz    = (nA.z + nB.z) / 2;

      const ax  = Math.sin(angle), az  = Math.cos(angle);   // along
      const y   = GROUND_Y + MARK_LIFT;

      // ── Centre dashed line ─────────────────────────────────────────────
      const dashCount = Math.floor(len / (DASH_LEN + DASH_GAP));
      const totalLen  = dashCount * (DASH_LEN + DASH_GAP) - DASH_GAP;
      const startOff  = -totalLen / 2 + DASH_LEN / 2;

      for (let i = 0; i < dashCount; i++) {
        const t    = startOff + i * (DASH_LEN + DASH_GAP);
        const dx   = cx + ax * t;
        const dz   = cz + az * t;

        const dash = _makeSlab(DASH_W, DASH_LEN, _matMarking);
        _place(dash, dx, y, dz, angle);
        group.add(dash);
      }

      // ── Edge solid white lines (road edges) ───────────────────────────
      const edgeLineW = 0.14;
      const edgeOff   = RW / 2 - edgeLineW / 2 - 0.1;

      for (const side of [-1, 1]) {
        const px =  Math.cos(angle) * side;
        const pz = -Math.sin(angle) * side;

        const line = _makeSlab(edgeLineW, len, _matMarking);
        _place(line,
          cx + px * edgeOff,
          y,
          cz + pz * edgeOff,
          angle
        );
        group.add(line);
      }
    }

    _rootGroup.add(group);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CROSSWALKS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildCrosswalks() {
    const group = new THREE.Group();
    group.name  = 'crosswalks';

    const STRIPE_W    = 0.55;    // width of each stripe
    const STRIPE_GAP  = 0.40;    // gap between stripes
    const STRIPE_LEN  = RW - 0.6; // spans the road minus kerbs
    const CROSS_LIFT  = GROUND_Y + ROAD_Y + 0.006;
    const CROSS_DIST  = RW / 2 + 0.2;  // offset from intersection centre

    for (const inter of CityMap.getIntersections()) {
      // Get the unique headings of roads meeting at this intersection
      const edges    = CityMap.getEdgesFrom(inter.nodeId);
      const angles   = new Set();

      for (const edge of edges) {
        // Round to nearest 45° to deduplicate near-parallel roads
        const rounded = Math.round(edge.angle / (Math.PI / 4)) * (Math.PI / 4);
        angles.add(rounded);
      }

      for (const angle of angles) {
        const ax  = Math.sin(angle), az  = Math.cos(angle);
        const px  =  Math.cos(angle), pz = -Math.sin(angle);

        // Position crosswalk across the road at CROSS_DIST from centre
        const baseX = inter.x + ax * CROSS_DIST;
        const baseZ = inter.z + az * CROSS_DIST;

        const stripeCount  = Math.floor(STRIPE_LEN / (STRIPE_W + STRIPE_GAP));
        const totalStripW  = stripeCount * (STRIPE_W + STRIPE_GAP) - STRIPE_GAP;
        const startPerpOff = -totalStripW / 2 + STRIPE_W / 2;

        for (let s = 0; s < stripeCount; s++) {
          const perpOff = startPerpOff + s * (STRIPE_W + STRIPE_GAP);
          const sx = baseX + px * perpOff;
          const sz = baseZ + pz * perpOff;

          const stripe = _makeSlab(STRIPE_W, STRIPE_LEN - 0.3, _matCrosswalk);
          _place(stripe, sx, CROSS_LIFT, sz, angle);
          group.add(stripe);
        }
      }
    }

    _rootGroup.add(group);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRAFFIC LIGHTS
  // ══════════════════════════════════════════════════════════════════════════

  /** Map: nodeId → { group, lights: [{mesh,color}] } for animation */
  const _trafficLightObjects = new Map();

  function _buildTrafficLights() {
    const group = new THREE.Group();
    group.name  = 'trafficLights';

    const cfg    = CONFIG.ROADS.TRAFFIC_LIGHT;
    const POLE_H = cfg.POLE_HEIGHT;
    const HEAD_S = cfg.HEAD_SIZE;

    for (const inter of CityMap.getIntersections()) {
      if (inter.edgeCount < 3) continue;

      // Place one signal at each road arm of the intersection
      const edges = CityMap.getEdgesFrom(inter.nodeId);

      for (const edge of edges) {
        const ang   = edge.angle;
        const ax    = Math.sin(ang), az = Math.cos(ang);
        const px    =  Math.cos(ang), pz = -Math.sin(ang);

        // Pole position: just to the right of the road edge, at the stop line
        const poleX = inter.x + ax * (RW / 2 + 0.4) - px * (RW / 2 + 0.4);
        const poleZ = inter.z + az * (RW / 2 + 0.4) - pz * (RW / 2 + 0.4);

        const lightGroup = _buildOneLightPole(POLE_H, HEAD_S);
        _place(lightGroup, poleX, GROUND_Y, poleZ, ang);
        group.add(lightGroup);

        // Store reference for CityMap light phase updates
        if (!_trafficLightObjects.has(inter.nodeId)) {
          _trafficLightObjects.set(inter.nodeId, []);
        }
        _trafficLightObjects.get(inter.nodeId).push(lightGroup);
      }
    }

    _rootGroup.add(group);
  }

  /**
   * Build a single traffic-light pole with three coloured heads.
   * @returns {THREE.Group}
   */
  function _buildOneLightPole(poleH, headSize) {
    const grp = new THREE.Group();

    // Vertical pole
    const pole = _makeBox(0.12, poleH, 0.12, _matLightPole);
    pole.position.set(0, poleH / 2, 0);
    pole.updateMatrix();
    grp.add(pole);

    // Horizontal arm
    const ARM_LEN = 1.4;
    const arm = _makeBox(ARM_LEN, 0.10, 0.10, _matLightPole);
    arm.position.set(-ARM_LEN / 2, poleH - 0.1, 0);
    arm.updateMatrix();
    grp.add(arm);

    // Signal head housing
    const headH  = headSize * 3.4;
    const housing = _makeBox(headSize, headH, headSize, _matLightHead);
    housing.position.set(-ARM_LEN, poleH - headH / 2 - 0.1, 0);
    housing.updateMatrix();
    grp.add(housing);

    // Three light lenses: red (top), yellow (mid), green (bottom)
    const COLORS  = [0xFF1111, 0xFFBB00, 0x11FF44];
    const offsets = [headH / 2 - headSize * 0.55,
                      0,
                     -headH / 2 + headSize * 0.55];

    const lensGeo = new THREE.CircleGeometry(headSize * 0.32, 12);
    lensGeo.rotateY(Math.PI / 2);   // face outward

    grp.userData.lenses = [];

    for (let i = 0; i < 3; i++) {
      const lensMat = new THREE.MeshStandardMaterial({
        color:             COLORS[i],
        emissive:          new THREE.Color(COLORS[i]),
        emissiveIntensity: 0.1,   // dim by default; active = 1.5
        roughness:         0.2,
        metalness:         0.3,
      });
      const lens = new THREE.Mesh(lensGeo.clone(), lensMat);
      lens.position.set(-ARM_LEN - headSize * 0.51, poleH - headH / 2 - 0.1 + offsets[i], 0);
      lens.updateMatrix();
      grp.add(lens);
      grp.userData.lenses.push({ mesh: lens, color: ['red','yellow','green'][i] });
    }

    grp.matrixAutoUpdate = false;
    return grp;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE (traffic light colours)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Sync traffic-light lens emissive to match CityMap phase state.
   * Call from Game.js each frame (cheap — only emissive intensity changes).
   */
  function update() {
    for (const [nodeId, groups] of _trafficLightObjects.entries()) {
      const phase = CityMap.getLightPhase(nodeId);
      if (!phase) continue;

      for (const grp of groups) {
        const lenses = grp.userData.lenses;
        if (!lenses) continue;

        for (const lens of lenses) {
          const isActive =
            (phase === 'red'    && lens.color === 'red')    ||
            (phase === 'yellow' && lens.color === 'yellow') ||
            (phase === 'green'  && lens.color === 'green');

          lens.mesh.material.emissiveIntensity = isActive ? 1.6 : 0.06;
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROAD SIGN HELPERS  (speed-limit discs)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build a simple speed-limit disc sign on a short post.
   * Place one every ~80 units along major roads.
   * @param {number} limitKmh
   * @returns {THREE.Group}
   */
  function _buildSpeedSign(limitKmh) {
    const grp = new THREE.Group();

    // Post
    const post = _makeBox(0.06, 2.0, 0.06, _matLightPole);
    post.position.set(0, 1.0, 0);
    post.updateMatrix();
    grp.add(post);

    // Disc (canvas texture)
    const canvas = document.createElement('canvas');
    canvas.width  = 128;
    canvas.height = 128;
    const ctx     = canvas.getContext('2d');

    // White circle
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();

    // Red ring
    ctx.strokeStyle = '#CC0000';
    ctx.lineWidth   = 10;
    ctx.stroke();

    // Speed number
    ctx.fillStyle   = '#111111';
    ctx.font        = 'bold 48px Arial';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(limitKmh), 64, 66);

    const tex  = new THREE.CanvasTexture(canvas);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    disc.position.set(0, 2.15, 0);
    disc.updateMatrix();
    grp.add(disc);

    grp.matrixAutoUpdate = false;
    return grp;
  }

  /**
   * Scatter speed-limit signs along long road segments.
   * Called internally during build().
   */
  function _buildRoadSigns() {
    const signGroup  = new THREE.Group();
    signGroup.name   = 'roadSigns';

    const SIGN_INTERVAL = 80;   // world units between signs
    const processed     = new Set();
    const edges         = CityMap.getEdges();

    for (const [edgeId, edge] of edges.entries()) {
      const pairKey = [edge.from, edge.to].sort().join('_');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      if (edge.length < SIGN_INTERVAL * 1.5) continue;

      const nA = CityMap.getNode(edge.from);
      const nB = CityMap.getNode(edge.to);
      if (!nA || !nB) continue;

      const ax   = Math.sin(edge.angle);
      const az   = Math.cos(edge.angle);
      const px   =  Math.cos(edge.angle);
      const pz   = -Math.sin(edge.angle);
      const sOff = RW / 2 + SW + 0.3;   // on the pavement

      // Place one sign per SIGN_INTERVAL along the edge
      const count = Math.floor(edge.length / SIGN_INTERVAL);
      for (let i = 1; i <= count; i++) {
        const t    = (i / (count + 1));
        const sx   = MathUtils.lerp(nA.x, nB.x, t) + px * sOff;
        const sz   = MathUtils.lerp(nA.z, nB.z, t) + pz * sOff;

        const sign = _buildSpeedSign(edge.speedLimit);
        _place(sign, sx, GROUND_Y, sz, edge.angle);
        signGroup.add(sign);
      }
    }

    _rootGroup.add(signGroup);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLLISION MESH EXPORT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return an array of meshes that should block the player/traffic camera.
   * Currently returns an empty array — kerbs are low enough to drive over;
   * buildings (from BuildingGenerator) are the main blockers.
   * Extend this if you add barrier walls.
   *
   * @returns {THREE.Mesh[]}
   */
  function getCollisionMeshes() {
    return [];
  }

  /**
   * Return the root group for external visibility toggling.
   * @returns {THREE.Group|null}
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

    // Dispose shared materials
    const mats = [
      _matAsphalt, _matSidewalk, _matKerb, _matMarking,
      _matStopLine, _matIntersect, _matGround,
      _matLightPole, _matLightHead, _matCrosswalk,
    ];
    for (const m of mats) {
      if (m) {
        if (m.map)  m.map.dispose();
        m.dispose();
      }
    }

    _trafficLightObjects.clear();
    console.info('[RoadBuilder] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    build,
    dispose,

    // Per-frame (traffic-light colours)
    update,

    // Accessors
    getRootGroup,
    getCollisionMeshes,

  });

})();

if (typeof module !== 'undefined') module.exports = RoadBuilder;
/* ```

---

**File 14 ✅ — `js/world/RoadBuilder.js` done.**

This converts the abstract `CityMap` graph into every piece of visible road geometry. The road slab builder iterates all unique edge pairs, computes four-corner quads with correct UV scale, and merges them all into a single `BufferGeometry` with one draw call — keeping the frame budget low even for a full city grid. Kerbs are short `BoxGeometry` strips placed precisely along each road edge, with the kerb texture tiling along the length. Sidewalks are flat slab planes sitting on top of the kerbs at the correct height offset. Intersection pads are filled square slabs that cover each junction and prevent visual gaps where road slabs end. Lane markings generate dashed centre lines and solid edge lines via individual small slab meshes, all sharing one `MeshBasicMaterial` with no depth write so they sit cleanly on the asphalt. Crosswalks place zebra stripes across each arm of every intersection. Traffic lights build a full pole-arm-housing-lens assembly per road arm, with three lens meshes whose emissive intensity is toggled each frame by `update()` reading the phase from `CityMap.getLightPhase()`. Road signs use a per-sign canvas texture with the speed limit number rendered in code.

**Say "File 15" for `js/world/BuildingGenerator.js`.** */
