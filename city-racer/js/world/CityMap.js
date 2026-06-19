/* ## `js/world/CityMap.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — CityMap.js
 * ============================================================================
 * The city's spatial data layer. Owns the road network graph, district
 * zones, intersections, spawn points, and pathfinding infrastructure.
 * Does NOT build any Three.js meshes — that is RoadBuilder.js's job.
 * This file is pure data and graph algorithms.
 *
 * Responsibilities:
 *   • Parse CONFIG.ROADS.GRID into a navigable graph of nodes + edges
 *   • Detect and catalogue all intersections (where segments cross)
 *   • Partition the map into district zones
 *   • Provide A* pathfinding for AI traffic routing
 *   • Expose spatial queries: nearest road, nearest node, point-in-district
 *   • Manage traffic-light phase state at each intersection
 *   • Register and serve spawn/despawn points for traffic and passengers
 *   • Expose city-block polygons for building placement
 * ============================================================================
 */

'use strict';

const CityMap = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // DATA STRUCTURES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Node — a point in the road network.
   * Nodes are created at segment endpoints and at every intersection.
   * @typedef {{ id:string, x:number, z:number, edges:string[], district:string }}
   */

  /**
   * Edge — a directed road segment between two nodes.
   * Two edges (A→B and B→A) represent a two-way road.
   * @typedef {{
   *   id:     string,
   *   from:   string,   // node id
   *   to:     string,   // node id
   *   length: number,   // world units
   *   angle:  number,   // radians (direction from→to)
   *   lanes:  number,   // CONFIG.ROADS.LANES_PER_SIDE
   *   speedLimit: number,
   *   segment: object,  // reference to original CONFIG.ROADS.GRID entry
   * }}
   */

  /**
   * Intersection — a node where ≥3 edges meet.
   * @typedef {{
   *   nodeId:     string,
   *   x: number, z: number,
   *   edgeCount:  number,
   *   light:      TrafficLight|null,
   * }}
   */

  /**
   * TrafficLight phase state.
   * @typedef {{ phase:'green'|'yellow'|'red', timer:number, cycleIndex:number }}
   */

  // ── In-memory maps ────────────────────────────────────────────────────────
  const _nodes         = new Map();   // nodeId → Node
  const _edges         = new Map();   // edgeId → Edge
  const _intersections = new Map();   // nodeId → Intersection
  const _blocks        = [];          // city-block polygon array
  const _spawnPoints   = [];          // { x, z, heading, district, type }

  // Traffic light phases per intersection (updated each frame)
  const _lights        = new Map();   // nodeId → TrafficLight

  // Spatial grid for fast nearest-node queries
  let   _grid          = null;        // SpatialGrid instance

  // District lookup cache
  const _districtCache = new Map();   // "x,z" → districtKey

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build the complete city graph from CONFIG.ROADS.GRID.
   * Should be called once, early in the boot sequence.
   */
  function init() {
    Renderer.setLoadProgress(8, 'Building road network…');

    _buildGraph();
    _detectIntersections();
    _initTrafficLights();
    _buildSpatialGrid();
    _generateSpawnPoints();
    _generateCityBlocks();

    Renderer.setLoadProgress(14, 'City map ready.');

    console.info(
      `[CityMap] Built. Nodes: ${_nodes.size} | ` +
      `Edges: ${_edges.size} | ` +
      `Intersections: ${_intersections.size} | ` +
      `Blocks: ${_blocks.length} | ` +
      `Spawns: ${_spawnPoints.length}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GRAPH CONSTRUCTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Parse CONFIG.ROADS.GRID segments into nodes and edges.
   * Nodes are created at every unique endpoint and intersection.
   */
  function _buildGraph() {
    const segments = CONFIG.ROADS.GRID;
    const SNAP     = 0.5;    // units — snap endpoints within this distance

    // ── Pass 1: collect all raw endpoints ─────────────────────────────────
    const rawPoints = [];
    for (const seg of segments) {
      rawPoints.push({ x: seg.x1, z: seg.z1, segId: seg.id, end: 'a' });
      rawPoints.push({ x: seg.x2, z: seg.z2, segId: seg.id, end: 'b' });
    }

    // ── Pass 2: find segment-segment intersections ────────────────────────
    const xPoints = _findAllIntersections(segments);
    rawPoints.push(...xPoints);

    // ── Pass 3: cluster nearby points → unique nodes ──────────────────────
    const nodeMap = new Map();  // "round(x),round(z)" → nodeId

    function getOrCreateNode(x, z) {
      const rx  = Math.round(x / SNAP) * SNAP;
      const rz  = Math.round(z / SNAP) * SNAP;
      const key = `${rx},${rz}`;
      if (nodeMap.has(key)) return nodeMap.get(key);

      const id  = `n_${_nodes.size}`;
      const district = _getDistrict(x, z);
      const node = { id, x: rx, z: rz, edges: [], district };
      _nodes.set(id, node);
      nodeMap.set(key, id);
      return id;
    }

    // ── Pass 4: build edges from each original segment ─────────────────────
    // Each segment may be split by intersections into multiple sub-edges.
    for (const seg of segments) {
      // Gather all nodes that lie on this segment
      const onSeg = [];

      for (const [key, nodeId] of nodeMap.entries()) {
        const n = _nodes.get(nodeId);
        if (_pointOnSegment(n.x, n.z, seg.x1, seg.z1, seg.x2, seg.z2, 1.0)) {
          // Compute parameter along the segment for sorting
          const t = _paramAlongSegment(n.x, n.z, seg.x1, seg.z1, seg.x2, seg.z2);
          onSeg.push({ nodeId, t });
        }
      }

      // Ensure segment endpoints are included
      const aId = getOrCreateNode(seg.x1, seg.z1);
      const bId = getOrCreateNode(seg.x2, seg.z2);
      if (!onSeg.find(p => p.nodeId === aId)) onSeg.push({ nodeId: aId, t: 0 });
      if (!onSeg.find(p => p.nodeId === bId)) onSeg.push({ nodeId: bId, t: 1 });

      // Add any intersection nodes that lie on this segment
      for (const xp of xPoints) {
        if (_pointOnSegment(xp.x, xp.z, seg.x1, seg.z1, seg.x2, seg.z2, 1.0)) {
          const nId = getOrCreateNode(xp.x, xp.z);
          const t   = _paramAlongSegment(xp.x, xp.z, seg.x1, seg.z1, seg.x2, seg.z2);
          if (!onSeg.find(p => p.nodeId === nId)) onSeg.push({ nodeId: nId, t });
        }
      }

      // Sort by parameter and create sequential edges
      onSeg.sort((a, b) => a.t - b.t);

      for (let i = 0; i < onSeg.length - 1; i++) {
        const fromId = onSeg[i].nodeId;
        const toId   = onSeg[i + 1].nodeId;
        if (fromId === toId) continue;

        _createEdgePair(fromId, toId, seg);
      }
    }
  }

  /**
   * Create a bidirectional edge pair between two nodes.
   */
  function _createEdgePair(fromId, toId, seg) {
    const nA = _nodes.get(fromId);
    const nB = _nodes.get(toId);
    if (!nA || !nB) return;

    const length = MathUtils.dist2D(nA, nB);
    if (length < 0.1) return;    // degenerate edge

    const angle = Math.atan2(nB.x - nA.x, nB.z - nA.z);

    const edgeAB = {
      id:         `e_${fromId}_${toId}`,
      from:       fromId,
      to:         toId,
      length,
      angle,
      lanes:      CONFIG.ROADS.LANES_PER_SIDE,
      speedLimit: CONFIG.ROADS.SPEED_LIMIT,
      segment:    seg,
    };

    const edgeBA = {
      id:         `e_${toId}_${fromId}`,
      from:       toId,
      to:         fromId,
      length,
      angle:      angle + Math.PI,
      lanes:      CONFIG.ROADS.LANES_PER_SIDE,
      speedLimit: CONFIG.ROADS.SPEED_LIMIT,
      segment:    seg,
    };

    _edges.set(edgeAB.id, edgeAB);
    _edges.set(edgeBA.id, edgeBA);

    // Register edges on their nodes
    if (!nA.edges.includes(edgeAB.id)) nA.edges.push(edgeAB.id);
    if (!nB.edges.includes(edgeBA.id)) nB.edges.push(edgeBA.id);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERSECTION DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Find all crossing points between pairs of road segments.
   * @param {Array} segments  CONFIG.ROADS.GRID
   * @returns {Array<{x,z}>}  Unique crossing points.
   */
  function _findAllIntersections(segments) {
    const results = [];
    const seen    = new Set();

    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const pt = _segmentIntersect(
          segments[i].x1, segments[i].z1, segments[i].x2, segments[i].z2,
          segments[j].x1, segments[j].z1, segments[j].x2, segments[j].z2
        );
        if (pt) {
          const key = `${Math.round(pt.x)},${Math.round(pt.z)}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push(pt);
          }
        }
      }
    }

    return results;
  }

  /**
   * Compute the intersection point of two line segments (if any).
   * Returns { x, z } or null.
   */
  function _segmentIntersect(x1, z1, x2, z2, x3, z3, x4, z4) {
    const dx1 = x2 - x1, dz1 = z2 - z1;
    const dx2 = x4 - x3, dz2 = z4 - z3;
    const denom = dx1 * dz2 - dz1 * dx2;

    if (Math.abs(denom) < 1e-10) return null;   // parallel

    const t = ((x3 - x1) * dz2 - (z3 - z1) * dx2) / denom;
    const u = ((x3 - x1) * dz1 - (z3 - z1) * dx1) / denom;

    const EPS = 0.001;
    if (t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS) {
      return { x: x1 + t * dx1, z: z1 + t * dz1 };
    }
    return null;
  }

  /**
   * Detect intersections: nodes where 3+ edges meet.
   * Populates _intersections map.
   */
  function _detectIntersections() {
    for (const [nodeId, node] of _nodes.entries()) {
      // Count unique edges where this node is the 'from'
      const outEdges = node.edges.filter(eid => {
        const e = _edges.get(eid);
        return e && e.from === nodeId;
      });

      if (outEdges.length >= 2) {
        _intersections.set(nodeId, {
          nodeId,
          x:         node.x,
          z:         node.z,
          edgeCount: outEdges.length,
          light:     null,
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRAFFIC LIGHTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create a traffic-light state machine for each intersection with ≥3 roads.
   */
  function _initTrafficLights() {
    const cfg  = CONFIG.ROADS.TRAFFIC_LIGHT;
    let offset = 0;

    for (const [nodeId, inter] of _intersections.entries()) {
      if (inter.edgeCount < 3) continue;

      // Stagger the start phases so not all lights are green at once
      const phases = ['green', 'yellow', 'red'];
      const startPhase = phases[offset % 3];
      const startTimer = offset % 3 === 0 ? cfg.GREEN_PHASE
                       : offset % 3 === 1 ? cfg.YELLOW_PHASE
                       : cfg.RED_PHASE;

      const light = {
        phase:      startPhase,
        timer:      startTimer - (offset * 2.5),   // stagger offset in seconds
        cycleIndex: offset % 3,
      };

      _lights.set(nodeId, light);
      inter.light = light;
      offset++;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPATIAL GRID
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Minimal spatial hash grid for O(1) nearest-node queries.
   */
  class SpatialGrid {
    constructor(cellSize = 32) {
      this.cellSize = cellSize;
      this.cells    = new Map();
    }

    _key(x, z) {
      return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
    }

    insert(x, z, data) {
      const key = this._key(x, z);
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push({ x, z, data });
    }

    /**
     * Return all entries within radius of (qx, qz).
     */
    query(qx, qz, radius) {
      const results = [];
      const cells   = Math.ceil(radius / this.cellSize) + 1;
      const cx      = Math.floor(qx / this.cellSize);
      const cz      = Math.floor(qz / this.cellSize);

      for (let dx = -cells; dx <= cells; dx++) {
        for (let dz = -cells; dz <= cells; dz++) {
          const key   = `${cx + dx},${cz + dz}`;
          const cell  = this.cells.get(key);
          if (!cell) continue;
          for (const item of cell) {
            const d = MathUtils.dist2D(item, { x: qx, z: qz });
            if (d <= radius) results.push({ ...item, dist: d });
          }
        }
      }
      return results;
    }

    nearest(qx, qz) {
      let bestDist = Infinity, best = null;
      // Start with a small radius, expand until we find something
      for (let r = this.cellSize; r <= this.cellSize * 10; r += this.cellSize) {
        const found = this.query(qx, qz, r);
        if (found.length > 0) {
          for (const item of found) {
            if (item.dist < bestDist) { bestDist = item.dist; best = item; }
          }
          if (best) break;
        }
      }
      return best;
    }
  }

  function _buildSpatialGrid() {
    _grid = new SpatialGrid(32);
    for (const [nodeId, node] of _nodes.entries()) {
      _grid.insert(node.x, node.z, nodeId);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPAWN POINT GENERATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a set of named spawn points distributed across all districts.
   * These are used by TrafficSystem and PassengerSystem.
   */
  function _generateSpawnPoints() {
    // Use edge midpoints in each district as spawn positions
    for (const [edgeId, edge] of _edges.entries()) {
      // Only use A→B edges (avoid duplicates)
      if (!edgeId.startsWith('e_n_')) continue;
      if (edge.from > edge.to)  continue;

      const nA      = _nodes.get(edge.from);
      const nB      = _nodes.get(edge.to);
      if (!nA || !nB) continue;

      // Only add one spawn per CONFIG.ROADS.ROAD_WIDTH * 4 units of road
      if (edge.length < CONFIG.ROADS.ROAD_WIDTH * 2) continue;

      const midX   = (nA.x + nB.x) / 2;
      const midZ   = (nA.z + nB.z) / 2;
      const heading = edge.angle;
      const district = _getDistrict(midX, midZ);

      _spawnPoints.push({
        x:        midX,
        z:        midZ,
        heading,
        district,
        edge:     edgeId,
        type:     'road',   // 'road' | 'side' | 'garage' | 'dealer'
      });
    }

    // Add explicit points at garages and dealers
    for (const g of CONFIG.GARAGES) {
      _spawnPoints.push({ x: g.position.x, z: g.position.z, heading: 0, district: g.district, type: 'garage', id: g.id });
    }
    for (const d of CONFIG.DEALERS) {
      _spawnPoints.push({ x: d.position.x, z: d.position.z, heading: 0, district: d.district, type: 'dealer', id: d.id });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CITY BLOCK GENERATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Generate axis-aligned city-block rectangles from the road grid.
   * These define the footprints available for building placement.
   * We compute blocks as the rectangular areas enclosed between
   * adjacent parallel road pairs.
   */
  function _generateCityBlocks() {
    const ROAD_W   = CONFIG.ROADS.ROAD_WIDTH + CONFIG.ROADS.SIDEWALK_WIDTH * 2;
    const grid     = CONFIG.ROADS.GRID;

    // Gather unique X and Z ordinates of vertical/horizontal roads
    const xLines = new Set();   // X coords of N-S roads
    const zLines = new Set();   // Z coords of E-W roads

    for (const seg of grid) {
      const isHoriz = Math.abs(seg.z2 - seg.z1) < 1;
      const isVert  = Math.abs(seg.x2 - seg.x1) < 1;

      if (isHoriz) zLines.add(seg.z1);
      if (isVert)  xLines.add(seg.x1);
    }

    const xs = [...xLines].sort((a, b) => a - b);
    const zs = [...zLines].sort((a, b) => a - b);

    // For each pair of adjacent road lines, create a block
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const x0 = xs[i] + ROAD_W / 2;
        const x1 = xs[i + 1] - ROAD_W / 2;
        const z0 = zs[j] + ROAD_W / 2;
        const z1 = zs[j + 1] - ROAD_W / 2;

        // Skip if block too small to build on
        if ((x1 - x0) < 4 || (z1 - z0) < 4) continue;

        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;

        _blocks.push({
          minX:     x0,
          maxX:     x1,
          minZ:     z0,
          maxZ:     z1,
          width:    x1 - x0,
          depth:    z1 - z0,
          cx,
          cz,
          district: _getDistrict(cx, cz),
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // A* PATHFINDING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Find the shortest path between two node IDs using A*.
   *
   * @param {string} startId   Node ID.
   * @param {string} goalId    Node ID.
   * @param {object} [opts]
   * @param {number} [opts.maxNodes=400]  Abort if search expands this many nodes.
   * @returns {string[]|null}  Ordered array of node IDs (start→goal), or null.
   */
  function findPath(startId, goalId, opts = {}) {
    const maxNodes = opts.maxNodes || 400;

    if (startId === goalId) return [startId];

    const goalNode = _nodes.get(goalId);
    if (!goalNode) return null;

    // MinHeap for the open set
    const open    = new MinHeap(n => n.f);
    const gScore  = new Map();
    const cameFrom = new Map();
    const closed  = new Set();

    gScore.set(startId, 0);
    open.push({ id: startId, f: _heuristic(startId, goalNode) });

    let expanded = 0;

    while (!open.isEmpty()) {
      const current = open.pop();
      if (current.id === goalId) return _reconstructPath(cameFrom, goalId);
      if (closed.has(current.id)) continue;
      closed.add(current.id);

      if (++expanded > maxNodes) break;

      const node = _nodes.get(current.id);
      if (!node) continue;

      for (const edgeId of node.edges) {
        const edge = _edges.get(edgeId);
        if (!edge || edge.from !== current.id) continue;

        const neighbour = edge.to;
        if (closed.has(neighbour)) continue;

        const tentG = (gScore.get(current.id) || Infinity) + edge.length;
        if (tentG < (gScore.get(neighbour) || Infinity)) {
          gScore.set(neighbour, tentG);
          cameFrom.set(neighbour, current.id);
          const f = tentG + _heuristic(neighbour, goalNode);
          open.push({ id: neighbour, f });
        }
      }
    }

    return null;   // no path found within maxNodes budget
  }

  function _heuristic(nodeId, goalNode) {
    const n = _nodes.get(nodeId);
    if (!n) return 0;
    return MathUtils.dist2D(n, goalNode);
  }

  function _reconstructPath(cameFrom, goalId) {
    const path = [goalId];
    let   cur  = goalId;
    while (cameFrom.has(cur)) {
      cur = cameFrom.get(cur);
      path.unshift(cur);
    }
    return path;
  }

  // ── Minimal binary MinHeap ─────────────────────────────────────────────

  class MinHeap {
    constructor(keyFn) {
      this._data  = [];
      this._keyFn = keyFn;
    }
    push(item) {
      this._data.push(item);
      this._bubbleUp(this._data.length - 1);
    }
    pop() {
      const top = this._data[0];
      const last = this._data.pop();
      if (this._data.length > 0) {
        this._data[0] = last;
        this._sinkDown(0);
      }
      return top;
    }
    isEmpty() { return this._data.length === 0; }
    _bubbleUp(i) {
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (this._keyFn(this._data[parent]) <= this._keyFn(this._data[i])) break;
        [this._data[parent], this._data[i]] = [this._data[i], this._data[parent]];
        i = parent;
      }
    }
    _sinkDown(i) {
      const n = this._data.length;
      while (true) {
        let smallest = i;
        const l = 2*i+1, r = 2*i+2;
        if (l < n && this._keyFn(this._data[l]) < this._keyFn(this._data[smallest])) smallest = l;
        if (r < n && this._keyFn(this._data[r]) < this._keyFn(this._data[smallest])) smallest = r;
        if (smallest === i) break;
        [this._data[smallest], this._data[i]] = [this._data[i], this._data[smallest]];
        i = smallest;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Advance traffic light timers.
   * Called by Game.js each tick.
   * @param {number} dt  Delta time seconds.
   */
  function update(dt) {
    const cfg = CONFIG.ROADS.TRAFFIC_LIGHT;

    for (const [nodeId, light] of _lights.entries()) {
      light.timer -= dt;

      if (light.timer <= 0) {
        // Cycle: green → yellow → red → green …
        switch (light.phase) {
          case 'green':
            light.phase      = 'yellow';
            light.timer      = cfg.YELLOW_PHASE;
            break;
          case 'yellow':
            light.phase      = 'red';
            light.timer      = cfg.RED_PHASE;
            break;
          case 'red':
            light.phase      = 'green';
            light.timer      = cfg.GREEN_PHASE;
            break;
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPATIAL QUERIES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return the nearest graph node to world position (x, z).
   * @param {number} x
   * @param {number} z
   * @returns {object|null}  Node object.
   */
  function nearestNode(x, z) {
    const result = _grid?.nearest(x, z);
    return result ? _nodes.get(result.data) : null;
  }

  /**
   * Return all nodes within `radius` of (x, z).
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @returns {object[]}  Array of Node objects.
   */
  function nodesInRadius(x, z, radius) {
    const results = _grid?.query(x, z, radius) || [];
    return results.map(r => _nodes.get(r.data)).filter(Boolean);
  }

  /**
   * Snap a world position to the nearest point on any road segment.
   * @param {number} x
   * @param {number} z
   * @param {number} [maxDist=25]
   * @returns {{ point:{x,z}, edge, t, sideOffset }|null}
   */
  function snapToRoad(x, z, maxDist = 25) {
    const segments = CONFIG.ROADS.GRID.map(s => ({
      x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2, ...s
    }));
    return MathUtils.snapToRoad({ x, z }, segments, maxDist);
  }

  /**
   * Return the district key for a world position.
   * @param {number} x
   * @param {number} z
   * @returns {string}  e.g. 'DOWNTOWN'
   */
  function getDistrict(x, z) {
    return _getDistrict(x, z);
  }

  function _getDistrict(x, z) {
    const key = `${Math.round(x / 8) * 8},${Math.round(z / 8) * 8}`;
    if (_districtCache.has(key)) return _districtCache.get(key);

    let result = 'DOWNTOWN';   // fallback
    for (const [name, d] of Object.entries(CONFIG.WORLD.DISTRICTS)) {
      if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) {
        result = name;
        break;
      }
    }

    _districtCache.set(key, result);
    return result;
  }

  /**
   * Return the display name of the district at a given world position.
   * @param {number} x
   * @param {number} z
   * @returns {string}  e.g. 'Downtown'
   */
  function getDistrictName(x, z) {
    const key = _getDistrict(x, z);
    return CONFIG.WORLD.DISTRICTS[key]?.name || 'Unknown';
  }

  /**
   * Return the traffic-light phase at a given intersection node.
   * @param {string} nodeId
   * @returns {'green'|'yellow'|'red'|null}
   */
  function getLightPhase(nodeId) {
    return _lights.get(nodeId)?.phase || null;
  }

  /**
   * Return all intersections as an array.
   * @returns {object[]}
   */
  function getIntersections() {
    return [..._intersections.values()];
  }

  /**
   * Return a random spawn point, optionally filtered by district or type.
   * @param {object} [filter]
   * @param {string} [filter.district]  e.g. 'DOWNTOWN'
   * @param {string} [filter.type]      e.g. 'road'
   * @returns {object|null}
   */
  function randomSpawnPoint(filter = {}) {
    let pool = _spawnPoints;

    if (filter.district) pool = pool.filter(p => p.district === filter.district);
    if (filter.type)     pool = pool.filter(p => p.type     === filter.type);

    if (pool.length === 0) return null;
    return MathUtils.randPick(pool);
  }

  /**
   * Return all spawn points.
   * @returns {object[]}
   */
  function getSpawnPoints() { return [..._spawnPoints]; }

  /**
   * Return the city-block array (for BuildingGenerator.js).
   * @returns {object[]}
   */
  function getCityBlocks() { return [..._blocks]; }

  /**
   * Return all nodes (for RoadBuilder mesh generation).
   * @returns {Map<string, object>}
   */
  function getNodes() { return _nodes; }

  /**
   * Return all edges.
   * @returns {Map<string, object>}
   */
  function getEdges() { return _edges; }

  /**
   * Return the node object for a given ID, or null.
   * @param {string} id
   * @returns {object|null}
   */
  function getNode(id) { return _nodes.get(id) || null; }

  /**
   * Return the edge object for a given ID, or null.
   * @param {string} id
   * @returns {object|null}
   */
  function getEdge(id) { return _edges.get(id) || null; }

  /**
   * Return all outbound edges from a node.
   * @param {string} nodeId
   * @returns {object[]}
   */
  function getEdgesFrom(nodeId) {
    const node = _nodes.get(nodeId);
    if (!node) return [];
    return node.edges
      .map(eid => _edges.get(eid))
      .filter(e => e && e.from === nodeId);
  }

  /**
   * Pick a random destination node in the graph.
   * @param {string} [excludeId]  Node to exclude (e.g. current position).
   * @returns {object|null}
   */
  function randomNode(excludeId) {
    const all = [..._nodes.values()].filter(n => n.id !== excludeId);
    return all.length > 0 ? MathUtils.randPick(all) : null;
  }

  /**
   * Return a random node in a given district.
   * @param {string} district  e.g. 'SUBURBS'
   * @returns {object|null}
   */
  function randomNodeInDistrict(district) {
    const filtered = [..._nodes.values()].filter(n => n.district === district);
    return filtered.length > 0 ? MathUtils.randPick(filtered) : null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROAD GEOMETRY HELPERS  (used by RoadBuilder and TrafficCar)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Compute a lane-centre offset position for the right lane of an edge.
   * Returns a {x, z} point offset perpendicular to the edge direction.
   *
   * @param {object} edge    Edge object.
   * @param {number} [laneIndex=0]  0 = rightmost lane, 1 = next, etc.
   * @param {number} [tParam=0.5]   0..1 along the edge.
   * @returns {{x:number, z:number}}
   */
  function getLaneCentre(edge, laneIndex = 0, tParam = 0.5) {
    const nA = _nodes.get(edge.from);
    const nB = _nodes.get(edge.to);
    if (!nA || !nB) return { x: 0, z: 0 };

    // Point along the edge at tParam
    const px = MathUtils.lerp(nA.x, nB.x, tParam);
    const pz = MathUtils.lerp(nA.z, nB.z, tParam);

    // Perpendicular direction (right of travel = +90°)
    const perpX =  Math.cos(edge.angle);
    const perpZ = -Math.sin(edge.angle);

    const laneW  = CONFIG.ROADS.LANE_WIDTH;
    const offset = (laneIndex + 0.5) * laneW;

    return {
      x: px + perpX * offset,
      z: pz + perpZ * offset,
    };
  }

  /**
   * Return the world Y position of the road surface at (x, z).
   * Currently flat at CONFIG.WORLD.GROUND_Y; extend for hills later.
   */
  function getRoadY(/* x, z */) {
    return CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y;
  }

  /**
   * Check whether a world point is inside an intersection zone
   * (i.e. within ROAD_WIDTH of an intersection node).
   * @param {number} x
   * @param {number} z
   * @returns {object|null}  Intersection object or null.
   */
  function getIntersectionAt(x, z) {
    const radius = CONFIG.ROADS.ROAD_WIDTH * 0.7;
    for (const inter of _intersections.values()) {
      if (MathUtils.dist2D({ x, z }, inter) < radius) return inter;
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEGMENT UTILITY HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return true if point (px,pz) lies on segment (x1,z1)→(x2,z2)
   * within `tolerance` units.
   */
  function _pointOnSegment(px, pz, x1, z1, x2, z2, tolerance) {
    const cp = MathUtils.closestPointOnSegment({ x: px, z: pz }, { x: x1, z: z1 }, { x: x2, z: z2 });
    return MathUtils.dist2D({ x: px, z: pz }, cp) < tolerance;
  }

  /**
   * Return the parameter t ∈ [0,1] for the projection of (px,pz)
   * onto segment (x1,z1)→(x2,z2).
   */
  function _paramAlongSegment(px, pz, x1, z1, x2, z2) {
    return MathUtils.clamp(
      MathUtils.projectPointOnSegment(
        { x: px, z: pz },
        { x: x1, z: z1 },
        { x: x2, z: z2 }
      ), 0, 1
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT ROUTE HELPERS (for RaceSystem)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Find the nearest node to a checkpoint world position.
   * @param {{x,z}} checkpoint
   * @returns {object|null}  Node
   */
  function nearestNodeToCheckpoint(checkpoint) {
    return nearestNode(checkpoint.x, checkpoint.z);
  }

  /**
   * Build a road-following path between a series of checkpoint positions.
   * Stitches together A* sub-paths between consecutive checkpoint nodes.
   *
   * @param {Array<{x,z}>} checkpoints
   * @returns {string[]}  Full ordered node ID path.
   */
  function buildCheckpointRoute(checkpoints) {
    if (checkpoints.length < 2) return [];

    let fullPath = [];

    for (let i = 0; i < checkpoints.length - 1; i++) {
      const fromNode = nearestNodeToCheckpoint(checkpoints[i]);
      const toNode   = nearestNodeToCheckpoint(checkpoints[i + 1]);
      if (!fromNode || !toNode) continue;

      const seg = findPath(fromNode.id, toNode.id);
      if (!seg) continue;

      // Avoid duplicating the joining node
      if (fullPath.length > 0 && seg[0] === fullPath[fullPath.length - 1]) {
        fullPath.push(...seg.slice(1));
      } else {
        fullPath.push(...seg);
      }
    }

    return fullPath;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEBUG HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Visualise the road graph by drawing debug lines in the Three.js scene.
   * Only call in development — adds many objects to the scene.
   */
  function debugDraw() {
    const material = new THREE.LineBasicMaterial({
      color:       0x00FF00,
      transparent: true,
      opacity:     0.5,
    });

    const roadY = CONFIG.WORLD.GROUND_Y + 0.3;

    for (const [edgeId, edge] of _edges.entries()) {
      if (edge.from > edge.to) continue;   // skip reverse edges

      const nA = _nodes.get(edge.from);
      const nB = _nodes.get(edge.to);
      if (!nA || !nB) continue;

      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(nA.x, roadY, nA.z),
        new THREE.Vector3(nB.x, roadY, nB.z),
      ]);
      Renderer.add(new THREE.Line(geo, material));
    }

    // Mark intersections
    const sphereGeo = new THREE.SphereGeometry(1.2, 6, 6);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xFF4400 });
    for (const inter of _intersections.values()) {
      const mesh = new THREE.Mesh(sphereGeo, sphereMat);
      mesh.position.set(inter.x, roadY + 1, inter.z);
      Renderer.add(mesh);
    }

    console.info('[CityMap] Debug draw complete.');
  }

  /**
   * Print a stats summary to the console.
   */
  function logStats() {
    console.table({
      Nodes:         _nodes.size,
      Edges:         _edges.size,
      Intersections: _intersections.size,
      Blocks:        _blocks.length,
      SpawnPoints:   _spawnPoints.length,
      TrafficLights: _lights.size,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    update,

    // Graph accessors
    getNodes,
    getEdges,
    getNode,
    getEdge,
    getEdgesFrom,

    // Pathfinding
    findPath,
    buildCheckpointRoute,

    // Spatial queries
    nearestNode,
    nodesInRadius,
    nearestNodeToCheckpoint,
    snapToRoad,
    getDistrict,
    getDistrictName,
    getIntersectionAt,
    getIntersections,

    // Random selection
    randomNode,
    randomNodeInDistrict,
    randomSpawnPoint,

    // Spawn / building data
    getSpawnPoints,
    getCityBlocks,

    // Traffic lights
    getLightPhase,

    // Road geometry helpers
    getLaneCentre,
    getRoadY,

    // Debug
    debugDraw,
    logStats,

  });

})();

if (typeof module !== 'undefined') module.exports = CityMap;
/* ```

---

**File 13 ✅ — `js/world/CityMap.js` done.**

This is the complete spatial data layer for the entire city. The graph builder parses every segment from `CONFIG.ROADS.GRID`, runs a full pairwise intersection scan across all segment pairs, clusters nearby raw endpoints with a snap tolerance, then splits each original segment at every intersection point and creates bidirectional edge pairs between consecutive nodes — so the graph is clean and fully connected before any other system touches it. The A* pathfinder uses a binary min-heap priority queue with a Euclidean heuristic and a `maxNodes` budget to keep AI route queries O(log N) and bounded. The spatial hash grid gives `nearestNode` O(1) average performance by scanning only the cells within a radius. Traffic lights are staggered at init so they're never all green simultaneously. The city-block generator intersects N-S and E-W road lines to produce every axis-aligned block rectangle with district metadata, ready for `BuildingGenerator.js` to fill. Checkpoint route stitching lets `RaceSystem` convert world-space waypoints into full road-following node paths in one call.

**Say "File 14" for `js/world/RoadBuilder.js`.** */
