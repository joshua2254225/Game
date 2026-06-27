/* ## `js/ui/Minimap.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — Minimap.js
 * ============================================================================
 * Draws the radar / minimap overlay onto the #minimap-canvas element.
 * Runs entirely on a 2D Canvas context — no Three.js dependency.
 *
 * Draws (in layer order, bottom to top):
 *   1. Background fill
 *   2. Water / river strip
 *   3. Road network segments
 *   4. District colour zones (very subtle tint)
 *   5. Location markers (G / D / Race / Taxi / Destination)
 *   6. Checkpoint dots (during race)
 *   7. Traffic cars (small grey dots)
 *   8. Police units (blue/red flashing dots)
 *   9. Player arrow (yellow, rotates with heading)
 *  10. Vignette overlay (circular fade at edges)
 *  11. Scale ring (optional)
 *
 * Performance:
 *   • Road network is pre-baked onto an offscreen canvas once at init.
 *     Only dynamic elements (player, traffic, markers) are redrawn each frame.
 *   • Full redraw triggered only when district / road data changes (never).
 *   • Canvas is 160×160 px (set in hud.css) — tiny draw budget.
 * ============================================================================
 */

'use strict';

const Minimap = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const MAP_SIZE   = CONFIG.HUD.MINIMAP_SIZE;       // 160 px
  const MAP_RANGE  = CONFIG.HUD.MINIMAP_RANGE;      // 200 world units radius

  // Colours
  const C_BG       = CONFIG.HUD.MINIMAP_BG_COLOR;   // 'rgba(0,0,0,0.65)'
  const C_ROAD     = CONFIG.HUD.MINIMAP_ROAD_COLOR;  // '#555555'
  const C_WATER    = CONFIG.HUD.MINIMAP_WATER_COLOR; // '#1A6B9A'
  const C_PLAYER   = CONFIG.HUD.MINIMAP_PLAYER_COLOR;// '#FFFF00'

  const C_GARAGE   = '#FF6600';
  const C_DEALER   = '#FFD700';
  const C_RACE     = '#FF2222';
  const C_TAXI     = '#FFEE00';
  const C_DEST     = '#00FF88';
  const C_CHECKPOINT = '#FFDD00';
  const C_TRAFFIC  = '#888888';
  const C_POLICE   = '#2244FF';

  // Dot radii (px)
  const R_PLAYER   = 5;
  const R_MARKER   = 5;
  const R_TRAFFIC  = 2.5;
  const R_POLICE   = 3.5;
  const R_CP       = 4;

  // Road segment width on minimap (px)
  const ROAD_PX    = 2;

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  /** Live canvas element (from index.html). */
  let _canvas      = null;
  let _ctx         = null;

  /** Offscreen canvas with pre-baked road network. */
  let _roadCanvas  = null;
  let _roadCtx     = null;

  /** Player vehicle reference. */
  let _player      = null;

  /** Frame counter for police siren flash. */
  let _frame       = 0;

  /** Whether the minimap has been initialised. */
  let _ready       = false;

  // External marker feeds (updated each frame by Game.js)
  let _locationMarkers  = [];   // from Markers.js
  let _passengerMarkers = [];   // from PassengerSystem.js
  let _raceMarkers      = [];   // from RaceSystem.js
  let _trafficCars      = [];   // from TrafficSystem.js (array of { position })
  let _policeUnits      = [];   // from PoliceSystem.js  (array of { position })

  // ══════════════════════════════════════════════════════════════════════════
  // COORDINATE TRANSFORM
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Convert a world XZ position to minimap canvas pixel coordinates.
   * The minimap is always centred on the player.
   *
   * @param {number} worldX
   * @param {number} worldZ
   * @param {number} playerX  Player world X.
   * @param {number} playerZ  Player world Z.
   * @returns {{ px:number, py:number }}
   */
  function _w2m(worldX, worldZ, playerX, playerZ) {
    return MathUtils.worldToMinimap(
      worldX, worldZ,
      playerX, playerZ,
      MAP_RANGE,
      MAP_SIZE
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise the minimap. Must be called once after the DOM is ready
   * and CityMap has been built.
   *
   * @param {PlayerCar} playerCar
   */
  function init(playerCar) {
    _player = playerCar;

    _canvas = document.getElementById('minimap-canvas');
    if (!_canvas) {
      console.warn('[Minimap] #minimap-canvas not found.');
      return;
    }

    // Set actual pixel dimensions
    _canvas.width  = MAP_SIZE;
    _canvas.height = MAP_SIZE;
    _ctx           = _canvas.getContext('2d');

    // Pre-bake roads onto an offscreen canvas
    _bakeRoadNetwork();

    _ready = true;
    console.info('[Minimap] Initialised.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROAD NETWORK BAKE  (called once)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Draw the entire road network onto an offscreen canvas at a fixed
   * world-space scale covering the FULL map (not player-relative).
   * This canvas is then stamped onto the minimap each frame with a
   * translate/clip to show only the area around the player.
   *
   * Scale: MAP_SIZE pixels represents the full CONFIG.WORLD.SIZE world units.
   */
  function _bakeRoadNetwork() {
    const FULL_SIZE  = CONFIG.WORLD.SIZE;   // 512
    const BAKE_PX    = 512;                 // offscreen canvas resolution

    _roadCanvas        = document.createElement('canvas');
    _roadCanvas.width  = BAKE_PX;
    _roadCanvas.height = BAKE_PX;
    _roadCtx           = _roadCanvas.getContext('2d');

    const scale = BAKE_PX / FULL_SIZE;    // px per world unit
    const half  = FULL_SIZE / 2;          // world origin offset

    // Fill background
    _roadCtx.fillStyle = 'rgba(20,24,30,1)';
    _roadCtx.fillRect(0, 0, BAKE_PX, BAKE_PX);

    // ── District tint zones ────────────────────────────────────────────────
    const DISTRICT_COLORS = {
      DOWNTOWN:   'rgba(80,120,180,0.10)',
      SUBURBS:    'rgba(60,140,60, 0.10)',
      INDUSTRIAL: 'rgba(120,80,40, 0.10)',
      RIVERSIDE:  'rgba(30,100,160,0.12)',
    };

    for (const [name, d] of Object.entries(CONFIG.WORLD.DISTRICTS)) {
      const x  = (d.minX + half) * scale;
      const y  = (d.minZ + half) * scale;
      const w  = (d.maxX - d.minX) * scale;
      const h  = (d.maxZ - d.minZ) * scale;
      _roadCtx.fillStyle = DISTRICT_COLORS[name] || 'rgba(255,255,255,0.04)';
      _roadCtx.fillRect(x, y, w, h);
    }

    // ── River ──────────────────────────────────────────────────────────────
    const riverX0 = (CONFIG.WATER.RIVER_X_START + half) * scale;
    const riverX1 = (CONFIG.WATER.RIVER_X_END   + half) * scale;
    const riverZ  = CONFIG.WATER.RIVER_Z_CENTER;
    const riverHW = CONFIG.WATER.RIVER_WIDTH / 2;

    const riverY0 = ((riverZ - riverHW) + half) * scale;
    const riverH  = CONFIG.WATER.RIVER_WIDTH * scale;

    _roadCtx.fillStyle = C_WATER;
    _roadCtx.globalAlpha = 0.75;
    _roadCtx.fillRect(riverX0, riverY0, riverX1 - riverX0, riverH);
    _roadCtx.globalAlpha = 1;

    // ── Roads ──────────────────────────────────────────────────────────────
    _roadCtx.strokeStyle = C_ROAD;
    _roadCtx.lineWidth   = ROAD_PX;
    _roadCtx.lineCap     = 'round';
    _roadCtx.lineJoin    = 'round';

    for (const seg of CONFIG.ROADS.GRID) {
      const x1 = (seg.x1 + half) * scale;
      const y1 = (seg.z1 + half) * scale;
      const x2 = (seg.x2 + half) * scale;
      const y2 = (seg.z2 + half) * scale;

      _roadCtx.beginPath();
      _roadCtx.moveTo(x1, y1);
      _roadCtx.lineTo(x2, y2);
      _roadCtx.stroke();
    }

    // Slightly brighter main arteries
    _roadCtx.strokeStyle = '#777777';
    _roadCtx.lineWidth   = ROAD_PX + 0.8;
    const MAIN = ['ew_c', 'ns_c', 'ew_n1', 'ew_s1', 'ns_e1', 'ns_w1'];
    for (const seg of CONFIG.ROADS.GRID) {
      if (!MAIN.includes(seg.id)) continue;
      const x1 = (seg.x1 + half) * scale;
      const y1 = (seg.z1 + half) * scale;
      const x2 = (seg.x2 + half) * scale;
      const y2 = (seg.z2 + half) * scale;
      _roadCtx.beginPath();
      _roadCtx.moveTo(x1, y1);
      _roadCtx.lineTo(x2, y2);
      _roadCtx.stroke();
    }

    // ── Bridge outlines ────────────────────────────────────────────────────
    _roadCtx.strokeStyle = '#AAAAAA';
    _roadCtx.lineWidth   = ROAD_PX + 1.5;
    for (const bridge of CONFIG.WATER.BRIDGES) {
      const bx = (bridge.x + half) * scale;
      const bz0 = ((riverZ - riverHW) + half) * scale;
      const bz1 = ((riverZ + riverHW) + half) * scale;
      _roadCtx.beginPath();
      _roadCtx.moveTo(bx, bz0);
      _roadCtx.lineTo(bx, bz1);
      _roadCtx.stroke();
    }

    console.info('[Minimap] Road network baked.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME DRAW
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Redraw the full minimap for this frame.
   * Call from Game.js each tick.
   */
  function draw() {
    if (!_ready || !_ctx || !_player) return;
    _frame++;

    const px = _player.position.x;
    const pz = _player.position.z;

    // ── Background ────────────────────────────────────────────────────────
    _ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

    // Circular clip mask
    _ctx.save();
    _ctx.beginPath();
    _ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE / 2, 0, Math.PI * 2);
    _ctx.clip();

    // Fill background
    _ctx.fillStyle = C_BG;
    _ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // ── Stamp pre-baked road canvas ────────────────────────────────────────
    _drawRoadLayer(px, pz);

    // ── Location markers ──────────────────────────────────────────────────
    _drawLocationMarkers(px, pz);

    // ── Passenger / taxi markers ──────────────────────────────────────────
    _drawPassengerMarkers(px, pz);

    // ── Race checkpoints ──────────────────────────────────────────────────
    _drawRaceMarkers(px, pz);

    // ── Traffic cars ──────────────────────────────────────────────────────
    _drawTrafficDots(px, pz);

    // ── Police units ──────────────────────────────────────────────────────
    _drawPoliceDots(px, pz);

    // ── Player arrow ──────────────────────────────────────────────────────
    _drawPlayerArrow();

    // ── Vignette ──────────────────────────────────────────────────────────
    _drawVignette();

    _ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROAD LAYER
  // ══════════════════════════════════════════════════════════════════════════

  function _drawRoadLayer(playerX, playerZ) {
    if (!_roadCanvas) return;

    const BAKE_PX  = _roadCanvas.width;
    const FULL_SIZE = CONFIG.WORLD.SIZE;
    const half     = FULL_SIZE / 2;
    const bakeScale = BAKE_PX / FULL_SIZE;

    // How many world units are shown per minimap pixel
    const worldPerPx  = (MAP_RANGE * 2) / MAP_SIZE;
    // How many baked pixels represent that many world units
    const bakePerMap  = bakeScale / (1 / worldPerPx);  // = bakeScale * worldPerPx

    // Source rectangle in the baked canvas centred on player
    const srcCX = (playerX + half) * bakeScale;
    const srcCZ = (playerZ + half) * bakeScale;
    const srcHalf = (MAP_RANGE * bakeScale);

    const sx = srcCX - srcHalf;
    const sy = srcCZ - srcHalf;
    const sw = srcHalf * 2;
    const sh = srcHalf * 2;

    _ctx.drawImage(
      _roadCanvas,
      sx, sy, sw, sh,
      0, 0, MAP_SIZE, MAP_SIZE
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOCATION MARKERS
  // ══════════════════════════════════════════════════════════════════════════

  function _drawLocationMarkers(px, pz) {
    for (const m of _locationMarkers) {
      const { pt } = _toMap(m.x, m.z, px, pz);
      if (!_inBounds(pt)) continue;

      const color = m.color || _markerColor(m.type);
      const r     = CONFIG.HUD.MINIMAP_MARKER_RADIUS;

      // Outer glow
      _ctx.shadowColor = color;
      _ctx.shadowBlur  = m.active ? 8 : 4;

      _ctx.fillStyle = color;
      _ctx.beginPath();
      _ctx.arc(pt.px, pt.py, m.active ? R_MARKER + 1.5 : R_MARKER, 0, Math.PI * 2);
      _ctx.fill();

      // White inner dot
      _ctx.fillStyle = '#FFFFFF';
      _ctx.beginPath();
      _ctx.arc(pt.px, pt.py, R_MARKER * 0.38, 0, Math.PI * 2);
      _ctx.fill();

      _ctx.shadowBlur  = 0;
      _ctx.shadowColor = 'transparent';

      // Letter label
      if (m.active) {
        _ctx.fillStyle   = '#FFFFFF';
        _ctx.font        = `bold ${R_MARKER + 2}px Orbitron, Arial`;
        _ctx.textAlign   = 'center';
        _ctx.textBaseline = 'middle';
        _ctx.fillText(_markerLetter(m.type), pt.px, pt.py);
      }
    }
  }

  function _markerColor(type) {
    switch (type) {
      case 'garage':  return C_GARAGE;
      case 'dealer':  return C_DEALER;
      case 'race':    return C_RACE;
      case 'taxi':    return C_TAXI;
      default:        return '#FFFFFF';
    }
  }

  function _markerLetter(type) {
    switch (type) {
      case 'garage':  return 'G';
      case 'dealer':  return 'D';
      case 'race':    return 'R';
      case 'taxi':    return 'T';
      default:        return '?';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PASSENGER MARKERS
  // ══════════════════════════════════════════════════════════════════════════

  function _drawPassengerMarkers(px, pz) {
    for (const m of _passengerMarkers) {
      const { pt } = _toMap(m.x, m.z, px, pz);
      if (!_inBounds(pt)) continue;

      const isDestination = m.type === 'destination';
      const color         = isDestination ? C_DEST : C_TAXI;

      _ctx.shadowColor = color;
      _ctx.shadowBlur  = 6;
      _ctx.fillStyle   = color;
      _ctx.beginPath();
      _ctx.arc(pt.px, pt.py, R_MARKER, 0, Math.PI * 2);
      _ctx.fill();

      // Pulsing ring for the active destination
      if (isDestination) {
        const pulse  = 0.5 + 0.5 * Math.sin(_frame * 0.12);
        _ctx.strokeStyle = color;
        _ctx.lineWidth   = 1.5;
        _ctx.globalAlpha = pulse;
        _ctx.beginPath();
        _ctx.arc(pt.px, pt.py, R_MARKER + 4, 0, Math.PI * 2);
        _ctx.stroke();
        _ctx.globalAlpha = 1;
      }

      _ctx.shadowBlur  = 0;
      _ctx.shadowColor = 'transparent';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE MARKERS
  // ══════════════════════════════════════════════════════════════════════════

  function _drawRaceMarkers(px, pz) {
    for (const m of _raceMarkers) {
      const { pt } = _toMap(m.x, m.z, px, pz);
      if (!_inBounds(pt)) continue;

      const isNext = m.color === '#FFDD00';   // next checkpoint is bright
      const r      = m.size ?? R_CP;

      _ctx.fillStyle   = m.color || C_CHECKPOINT;
      _ctx.shadowColor = m.color || C_CHECKPOINT;
      _ctx.shadowBlur  = isNext ? 8 : 2;

      _ctx.beginPath();
      _ctx.arc(pt.px, pt.py, r, 0, Math.PI * 2);
      _ctx.fill();

      _ctx.shadowBlur  = 0;
      _ctx.shadowColor = 'transparent';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRAFFIC DOTS
  // ══════════════════════════════════════════════════════════════════════════

  function _drawTrafficDots(px, pz) {
    _ctx.fillStyle = C_TRAFFIC;

    for (const car of _trafficCars) {
      if (!car.position) continue;
      const { pt } = _toMap(car.position.x, car.position.z, px, pz);
      if (!_inBounds(pt)) continue;

      _ctx.beginPath();
      _ctx.arc(pt.px, pt.py, R_TRAFFIC, 0, Math.PI * 2);
      _ctx.fill();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POLICE DOTS
  // ══════════════════════════════════════════════════════════════════════════

  function _drawPoliceDots(px, pz) {
    // Flash between blue and red
    const flash = (_frame % 16) < 8;
    const color  = flash ? C_POLICE : '#FF2222';

    for (const unit of _policeUnits) {
      if (!unit.position) continue;
      const { pt } = _toMap(unit.position.x, unit.position.z, px, pz);
      if (!_inBounds(pt)) continue;

      _ctx.shadowColor = color;
      _ctx.shadowBlur  = 6;
      _ctx.fillStyle   = color;
      _ctx.beginPath();
      _ctx.arc(pt.px, pt.py, R_POLICE, 0, Math.PI * 2);
      _ctx.fill();
      _ctx.shadowBlur  = 0;
      _ctx.shadowColor = 'transparent';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER ARROW
  // ══════════════════════════════════════════════════════════════════════════

  function _drawPlayerArrow() {
    const cx = MAP_SIZE / 2;
    const cy = MAP_SIZE / 2;

    _ctx.save();
    _ctx.translate(cx, cy);
    _ctx.rotate(_player.heading);

    // Outer glow ring
    _ctx.shadowColor = C_PLAYER;
    _ctx.shadowBlur  = 10;

    // Arrow shape (pointing up = forward)
    _ctx.fillStyle   = C_PLAYER;
    _ctx.beginPath();
    _ctx.moveTo(0, -(R_PLAYER + 3));       // tip
    _ctx.lineTo( R_PLAYER - 1,  R_PLAYER); // right base
    _ctx.lineTo(0, R_PLAYER * 0.4);        // inner bottom notch
    _ctx.lineTo(-(R_PLAYER - 1), R_PLAYER);// left base
    _ctx.closePath();
    _ctx.fill();

    // White dot centre
    _ctx.shadowBlur = 0;
    _ctx.fillStyle  = '#FFFFFF';
    _ctx.beginPath();
    _ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    _ctx.fill();

    _ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIGNETTE
  // ══════════════════════════════════════════════════════════════════════════

  function _drawVignette() {
    const cx = MAP_SIZE / 2;
    const cy = MAP_SIZE / 2;
    const r  = MAP_SIZE / 2;

    const grad = _ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.65)');

    _ctx.fillStyle = grad;
    _ctx.beginPath();
    _ctx.arc(cx, cy, r, 0, Math.PI * 2);
    _ctx.fill();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITY HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Convert a world XZ to minimap pixel and return both.
   */
  function _toMap(worldX, worldZ, playerX, playerZ) {
    const pt = _w2m(worldX, worldZ, playerX, playerZ);
    return { pt };
  }

  /**
   * Returns true if a minimap pixel is within the drawable circle.
   * @param {{ px:number, py:number }} pt
   * @returns {boolean}
   */
  function _inBounds(pt) {
    const cx  = MAP_SIZE / 2;
    const cy  = MAP_SIZE / 2;
    const r   = MAP_SIZE / 2 - 4;
    const dx  = pt.px - cx;
    const dy  = pt.py - cy;
    return dx * dx + dy * dy <= r * r;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DATA FEEDS  (called by Game.js each frame before draw())
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update all marker / entity feeds.
   * @param {object} feeds
   * @param {Array}  [feeds.locationMarkers]   from Markers.getMinimapMarkers()
   * @param {Array}  [feeds.passengerMarkers]  from PassengerSystem.getMinimapMarkers()
   * @param {Array}  [feeds.raceMarkers]       from RaceSystem.getMinimapMarkers()
   * @param {Array}  [feeds.trafficCars]       array of Vehicle instances
   * @param {Array}  [feeds.policeUnits]       array of PoliceCar instances
   */
  function setFeeds(feeds) {
    if (feeds.locationMarkers  !== undefined) _locationMarkers  = feeds.locationMarkers;
    if (feeds.passengerMarkers !== undefined) _passengerMarkers = feeds.passengerMarkers;
    if (feeds.raceMarkers      !== undefined) _raceMarkers      = feeds.raceMarkers;
    if (feeds.trafficCars      !== undefined) _trafficCars      = feeds.trafficCars;
    if (feeds.policeUnits      !== undefined) _policeUnits      = feeds.policeUnits;
  }

  /**
   * Update player reference (e.g. after car switch).
   * @param {PlayerCar} playerCar
   */
  function setPlayer(playerCar) {
    _player = playerCar;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    _canvas      = null;
    _ctx         = null;
    _roadCanvas  = null;
    _roadCtx     = null;
    _player      = null;
    _ready       = false;
    console.info('[Minimap] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    dispose,

    // Per-frame
    draw,

    // Data feeds
    setFeeds,
    setPlayer,

  });

})();

if (typeof module !== 'undefined') module.exports = Minimap;
/* ```

---

**File 31 ✅ — `js/ui/Minimap.js` done.**

This is the complete minimap radar system. The road network is pre-baked once at init onto a 512×512 offscreen canvas — drawing all road segments from `CONFIG.ROADS.GRID`, district colour tints, the river strip, and bridge outlines — so the per-frame cost of drawing roads is a single `drawImage` call that clips a player-centred rectangle from the baked canvas onto the 160×160 live canvas. Each frame the dynamic layers are drawn on top in order: location markers as coloured dots with letter labels and a glow shadow when the player is nearby, passenger pickup dots with a pulsing ring on the active destination, race checkpoint dots where the next checkpoint is brighter than the rest, traffic cars as small grey dots sampled from `TrafficSystem`, police units as blue/red alternating flashing dots that cycle every 8 frames, and the player as a filled arrow shape that rotates with the vehicle heading. A radial gradient vignette darkens the edges. All drawing runs inside a circular `clip()` path so nothing bleeds outside the minimap disc. The `setFeeds()` method accepts a single object with named arrays so `Game.js` can update all data sources in one call per frame.

**Say "File 32" for `js/ui/HUD.js`.** */
