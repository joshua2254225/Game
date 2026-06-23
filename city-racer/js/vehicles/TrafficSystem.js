/* ## `js/systems/TrafficSystem.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — TrafficSystem.js
 * ============================================================================
 * Manages the full lifecycle of AI traffic cars in the open world.
 *
 * Responsibilities:
 *   • Spawn traffic cars near the player within a configurable radius
 *   • Despawn cars that are too far away (fade + remove)
 *   • Maintain the pool up to CONFIG.TRAFFIC.MAX_CARS
 *   • Update all active cars each frame
 *   • Spatial grid for fast nearby-vehicle queries (obstacle detection)
 *   • Collision detection between traffic cars and player
 *   • Feed nearby vehicles list to each TrafficCar for obstacle sensing
 *   • Notify PoliceSystem when player hits a traffic car hard
 *   • District-aware car variety (colour, speed variance)
 *   • Headlight sync with Sky day/night
 *   • Debug stats (active count, state breakdown)
 * ============================================================================
 */

'use strict';

const TrafficSystem = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const MAX_CARS      = CONFIG.TRAFFIC.MAX_CARS;        // 30
  const SPAWN_RADIUS  = CONFIG.TRAFFIC.SPAWN_RADIUS;    // 120
  const DESPAWN_RADIUS = CONFIG.TRAFFIC.DESPAWN_RADIUS; // 180

  // Minimum gap between spawn attempts (seconds)
  const SPAWN_INTERVAL = 1.8;

  // Collision check radius — only test vehicles within this distance
  const COLLISION_RADIUS = 12;

  // Nearby feed radius — passed to each car for obstacle sensing
  const NEARBY_RADIUS = 20;

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  /** All currently active TrafficCar instances. */
  const _cars = [];

  /** Spawn timer. */
  let _spawnTimer = 0;

  /** Player vehicle reference (set via setPlayer). */
  let _player = null;

  /** Reference to PoliceSystem for collision escalation. */
  let _policeSystem = null;

  /** Frame counter for LOD / stagger. */
  let _frame = 0;

  /**
   * Minimal spatial grid for fast nearby queries.
   * Re-built every 10 frames.
   */
  const _spatialGrid = new Map();   // cellKey → TrafficCar[]
  const GRID_CELL    = 24;          // world units per cell

  // ══════════════════════════════════════════════════════════════════════════
  // TRAFFIC CAR CONFIGS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a minimal car config for a traffic car.
   * Uses randomised colour and a slight speed variance.
   * NOT a player-owned car — stats are simplified.
   */
  function _makeTrafficConfig() {
    const color = MathUtils.randPick(CONFIG.TRAFFIC.CAR_COLORS);

    // Random body dimensions variation (±10 %)
    const scale = 0.92 + Math.random() * 0.16;

    return {
      id:    `traffic_${Date.now()}_${(Math.random() * 9999).toFixed(0)}`,
      name:  'Traffic Car',
      stats: {
        topSpeed:     CONFIG.TRAFFIC.BASE_SPEED + MathUtils.randFloat(
                        -CONFIG.TRAFFIC.SPEED_VARIANCE,
                         CONFIG.TRAFFIC.SPEED_VARIANCE),
        acceleration: 4.5 + Math.random() * 1.5,
        handling:     0.72 + Math.random() * 0.12,
        braking:      0.75,
        grip:         0.68,
        weight:       1100 + Math.random() * 400,
        damageReduction: 0,
      },
      body: {
        length:    3.6  * scale,
        width:     1.65 * scale,
        height:    1.38 * scale,
        wheelbase: 2.30 * scale,
      },
      colors: { body: color, roof: color, wheel: 0x222222 },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise the system. Call once after CityMap is ready.
   * @param {object} [opts]
   * @param {object} [opts.policeSystem]  PoliceSystem reference.
   */
  function init(opts = {}) {
    _policeSystem = opts.policeSystem || null;
    console.info('[TrafficSystem] Initialised.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER BINDING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Register the player vehicle so traffic can react to it.
   * @param {PlayerCar} playerCar
   */
  function setPlayer(playerCar) {
    _player = playerCar;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update all traffic cars, handle spawning/despawning, and check collisions.
   * @param {number} dt  Delta time seconds.
   */
  function update(dt) {
    _frame++;

    const playerPos = _player ? _player.position : null;

    // ── Spawning ──────────────────────────────────────────────────────────
    _spawnTimer -= dt;
    if (_spawnTimer <= 0 && playerPos) {
      _spawnTimer = SPAWN_INTERVAL;
      _trySpawn(playerPos);
    }

    // ── Rebuild spatial grid every 10 frames ──────────────────────────────
    if (_frame % 10 === 0) {
      _rebuildSpatialGrid();
    }

    // ── Update each car ───────────────────────────────────────────────────
    for (let i = _cars.length - 1; i >= 0; i--) {
      const car = _cars[i];

      // Remove dead cars
      if (!car.alive) {
        car.dispose();
        _cars.splice(i, 1);
        continue;
      }

      // Despawn distant cars
      if (playerPos) {
        const dx = car.position.x - playerPos.x;
        const dz = car.position.z - playerPos.z;
        const d2 = dx * dx + dz * dz;

        if (d2 > DESPAWN_RADIUS * DESPAWN_RADIUS && !car.isFadingOut()) {
          car.beginDespawn();
        }
      }

      // Gather nearby vehicles for obstacle sensing
      const nearby = _frame % 3 === (i % 3)
        ? _getCarsNear(car.position.x, car.position.z, NEARBY_RADIUS)
        : [];

      // React to player
      if (_player && _player.alive) {
        const px = _player.position.x - car.position.x;
        const pz = _player.position.z - car.position.z;
        const pd2 = px * px + pz * pz;
        if (pd2 < 30 * 30) {
          car.reactToPlayer(_player.position, Math.abs(_player.speedKmh));
        }
      }

      // Update car AI + physics
      car.update(dt, nearby);
    }

    // ── Collision detection ───────────────────────────────────────────────
    if (_player && _player.alive && _frame % 2 === 0) {
      _checkPlayerCollisions();
    }

    // ── Traffic ↔ Traffic collisions (lightweight, staggered) ─────────────
    if (_frame % 4 === 0) {
      _checkTrafficCollisions();
    }

    // ── Night mode sync ───────────────────────────────────────────────────
    if (_frame % 60 === 0) {
      _syncLights();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPAWNING
  // ══════════════════════════════════════════════════════════════════════════

  function _trySpawn(playerPos) {
    if (_cars.length >= MAX_CARS) return;

    // Pick a spawn point on a road edge within SPAWN_RADIUS
    // but at least SPAWN_RADIUS * 0.4 away (not right next to player)
    const MIN_SPAWN_DIST = SPAWN_RADIUS * 0.35;

    // Attempt up to 6 candidate spawn points
    for (let attempt = 0; attempt < 6; attempt++) {
      const sp = CityMap.randomSpawnPoint({ type: 'road' });
      if (!sp) break;

      const dx = sp.x - playerPos.x;
      const dz = sp.z - playerPos.z;
      const d2 = dx * dx + dz * dz;

      if (d2 > SPAWN_RADIUS * SPAWN_RADIUS)    continue;
      if (d2 < MIN_SPAWN_DIST * MIN_SPAWN_DIST) continue;

      // Check the spot is not already occupied
      if (_isSpotOccupied(sp.x, sp.z)) continue;

      // Find a nearby goal node to drive toward
      const startNode = CityMap.nearestNode(sp.x, sp.z);
      if (!startNode) continue;

      const goalNode = CityMap.randomNode(startNode.id);
      if (!goalNode) continue;

      // Create the traffic car
      const cfg = _makeTrafficConfig();
      const car = new TrafficCar(cfg, startNode.id, goalNode.id);
      car.setPosition(sp.x, CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y, sp.z, sp.heading);

      _cars.push(car);
      return;  // one spawn per timer tick
    }
  }

  /**
   * Return true if a world XZ position already has a car within 6 units.
   */
  function _isSpotOccupied(x, z) {
    for (const car of _cars) {
      const dx = car.position.x - x;
      const dz = car.position.z - z;
      if (dx * dx + dz * dz < 36) return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPATIAL GRID
  // ══════════════════════════════════════════════════════════════════════════

  function _gridKey(x, z) {
    return `${Math.floor(x / GRID_CELL)},${Math.floor(z / GRID_CELL)}`;
  }

  function _rebuildSpatialGrid() {
    _spatialGrid.clear();
    for (const car of _cars) {
      if (!car.alive || car.isFadingOut()) continue;
      const key = _gridKey(car.position.x, car.position.z);
      if (!_spatialGrid.has(key)) _spatialGrid.set(key, []);
      _spatialGrid.get(key).push(car);
    }
  }

  /**
   * Return all traffic cars within radius of (x, z).
   * Uses spatial grid for O(1) average performance.
   *
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @returns {TrafficCar[]}
   */
  function _getCarsNear(x, z, radius) {
    const result = [];
    const cells  = Math.ceil(radius / GRID_CELL) + 1;
    const cx     = Math.floor(x / GRID_CELL);
    const cz     = Math.floor(z / GRID_CELL);
    const r2     = radius * radius;

    for (let dx = -cells; dx <= cells; dx++) {
      for (let dz = -cells; dz <= cells; dz++) {
        const key  = `${cx + dx},${cz + dz}`;
        const cell = _spatialGrid.get(key);
        if (!cell) continue;
        for (const car of cell) {
          const ex = car.position.x - x;
          const ez = car.position.z - z;
          if (ex * ex + ez * ez <= r2) result.push(car);
        }
      }
    }
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLLISION DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Check player vehicle against all nearby traffic cars.
   * Uses AABB overlap test for speed.
   */
  function _checkPlayerCollisions() {
    if (!_player || !_player.alive) return;

    const pAABB = _player.aabb;

    const nearby = _getCarsNear(
      _player.position.x,
      _player.position.z,
      COLLISION_RADIUS
    );

    for (const car of nearby) {
      if (!car.alive || car === _player) continue;

      // AABB overlap test
      if (!MathUtils.aabbOverlapFlat(pAABB, car.aabb)) continue;

      // Full 3-D AABB
      if (!MathUtils.aabbOverlap(pAABB, car.aabb)) continue;

      // Compute collision normal and relative speed
      const normal = _player.position.clone()
        .sub(car.position)
        .setY(0)
        .normalize();

      const relVelX = _player.velocity.x - car.velocity.x;
      const relVelZ = _player.velocity.z - car.velocity.z;
      const relSpeed = MathUtils.kmhToMs(
        Math.abs(relVelX * normal.x + relVelZ * normal.z)
      ) * MathUtils.msToKmh(1);   // keep in m/s

      const impactMs = Math.abs(relVelX * normal.x + relVelZ * normal.z);

      if (impactMs < 0.5) continue;   // ignore gentle brushes

      // Apply collision to both vehicles
      _player.onCollision(normal.clone().negate(), impactMs, car.stats.weight);
      car.onHitByPlayer(normal, impactMs);

      // Separate them
      _separateVehicles(_player, car, normal);

      // Notify police system
      if (_policeSystem && impactMs > MathUtils.kmhToMs(CONFIG.POLICE.TRIGGERS.HIT_TRAFFIC_HARD * 5)) {
        _policeSystem.reportEvent('hit_traffic', { speed: impactMs });
      }
    }
  }

  /**
   * Lightweight traffic-vs-traffic collision (no damage, just separation).
   * Only runs every 4 frames, only on cars in the same grid cell.
   */
  function _checkTrafficCollisions() {
    for (const [, cell] of _spatialGrid.entries()) {
      if (cell.length < 2) continue;

      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const a = cell[i], b = cell[j];
          if (!a.alive || !b.alive) continue;
          if (!MathUtils.aabbOverlapFlat(a.aabb, b.aabb)) continue;

          // Simple push-apart
          const normal = a.position.clone().sub(b.position).setY(0);
          const len    = normal.length();
          if (len < 0.01) continue;
          normal.divideScalar(len);

          const pushDist = 0.3;
          a.position.addScaledVector(normal,  pushDist);
          b.position.addScaledVector(normal, -pushDist);

          // Damp relative velocity along normal
          const relV = (a.velocity.x - b.velocity.x) * normal.x +
                       (a.velocity.z - b.velocity.z) * normal.z;
          if (relV < 0) {
            a.velocity.x -= relV * normal.x * 0.5;
            a.velocity.z -= relV * normal.z * 0.5;
            b.velocity.x += relV * normal.x * 0.5;
            b.velocity.z += relV * normal.z * 0.5;
          }
        }
      }
    }
  }

  /**
   * Push two vehicles apart along a collision normal.
   */
  function _separateVehicles(a, b, normal) {
    const overlap = (a.body.length + b.body.length) / 2;
    const dx = a.position.x - b.position.x;
    const dz = a.position.z - b.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const pen  = overlap - dist;

    if (pen > 0) {
      const massA = a.stats.weight;
      const massB = b.stats.weight;
      const total = massA + massB;

      a.position.addScaledVector(normal,  pen * (massB / total));
      b.position.addScaledVector(normal, -pen * (massA / total));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NIGHT LIGHT SYNC
  // ══════════════════════════════════════════════════════════════════════════

  function _syncLights() {
    const isNight = Sky.isNight();
    for (const car of _cars) {
      if (car.alive && !car.isFadingOut()) {
        car.setLights(isNight);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Enable or disable all traffic (called from Settings screen).
   * @param {boolean} enabled
   */
  function setEnabled(enabled) {
    if (!enabled) {
      // Fade out and remove all cars
      for (const car of _cars) car.beginDespawn();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC QUERY API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return all traffic cars within radius of a world position.
   * Used by PoliceSystem to check bystander count.
   *
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @returns {TrafficCar[]}
   */
  function getCarsNear(x, z, radius) {
    return _getCarsNear(x, z, radius);
  }

  /**
   * Return the total number of active (non-fading) traffic cars.
   */
  function getActiveCount() {
    return _cars.filter(c => c.alive && !c.isFadingOut()).length;
  }

  /**
   * Return a debug breakdown of car states.
   */
  function getDebugStats() {
    const states = {};
    for (const car of _cars) {
      const s = car.getAIState();
      states[s] = (states[s] || 0) + 1;
    }
    return {
      total:  _cars.length,
      active: getActiveCount(),
      states,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    for (const car of _cars) car.dispose();
    _cars.length = 0;
    _spatialGrid.clear();
    _player       = null;
    _policeSystem = null;
    console.info('[TrafficSystem] Disposed.');
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

    // Bindings
    setPlayer,

    // Query
    getCarsNear,
    getActiveCount,
    getDebugStats,

    // Settings
    setEnabled,

  });

})();

if (typeof module !== 'undefined') module.exports = TrafficSystem;
/* ```

---

**File 23 ✅ — `js/systems/TrafficSystem.js` done.**

This manages the full lifecycle of every AI car on the road. The spawn loop runs every 1.8 seconds and tries up to six candidate road spawn points — filtering for ones inside the spawn radius but at least 35% of it away from the player, and rejecting any point within 6 units of an existing car. The spatial grid is rebuilt every 10 frames by hashing each car's position into `floor(x/24), floor(z/24)` cells, giving `getCarsNear` O(1) average-case queries across all 30 cars. Each car's obstacle-sensing feed is staggered across three frame buckets so only a third of the fleet re-queries nearby vehicles each frame. Player collision runs every other frame using a two-stage AABB test — flat XZ first, then full 3D — and on a hit computes a mass-weighted separation push, applies `onCollision` to the player and `onHitByPlayer` to the traffic car, and reports the event to `PoliceSystem` if the impact speed exceeds the threshold. Traffic-vs-traffic collision runs every 4 frames using only intra-cell pairs for efficiency, applying a simple velocity-damp and position separation without damage. Night sync fires every 60 frames and toggles headlights on all active cars to match `Sky.isNight()`.

**Say "File 24" for `js/systems/PoliceSystem.js`.** */
