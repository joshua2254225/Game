/**
 * ============================================================================
 * CITY RACER — config.js
 * ============================================================================
 * Central configuration file. Every other module imports constants from here.
 * Changing a value here changes it everywhere in the game.
 * No game logic lives in this file — only data and constants.
 * ============================================================================
 */

'use strict';

const CONFIG = {

  // ══════════════════════════════════════════════════════════════════════════
  // ENGINE / RENDERER
  // ══════════════════════════════════════════════════════════════════════════

  RENDERER: {
    SHADOW_MAP_SIZE:    2048,       // px — shadow quality (1024 = low, 4096 = ultra)
    FOG_COLOR:          0xC8D8E8,   // sky-matching fog colour
    FOG_NEAR:           80,         // fog start distance (units)
    FOG_FAR:            260,        // fog end distance (units)
    PIXEL_RATIO_CAP:    2,          // cap devicePixelRatio for performance
    TONE_MAPPING_EXP:   1.0,        // ACES filmic tone mapping exposure
    ANTIALIAS:          true,
    TARGET_FPS:         60,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WORLD / MAP
  // ══════════════════════════════════════════════════════════════════════════

  WORLD: {
    SIZE:               512,        // total map side length (units)
    HALF:               256,        // convenience: SIZE / 2
    GROUND_COLOR:       0x4A7C3F,   // grass base colour
    SIDEWALK_COLOR:     0xCCBBA0,   // pavement colour
    GROUND_Y:           0,          // Y position of the ground plane

    // Districts — axis-aligned rectangles in world space [minX, minZ, maxX, maxZ]
    DISTRICTS: {
      DOWNTOWN:   { minX: -256, minZ: -256, maxX:   0, maxZ:   0,  name: 'Downtown',   buildingDensity: 0.85, buildingHeightMult: 3.5 },
      SUBURBS:    { minX:    0, minZ: -256, maxX: 256, maxZ:   0,  name: 'Suburbs',    buildingDensity: 0.45, buildingHeightMult: 1.0 },
      INDUSTRIAL: { minX: -256, minZ:    0, maxX:   0, maxZ: 256,  name: 'Industrial', buildingDensity: 0.55, buildingHeightMult: 1.6 },
      RIVERSIDE:  { minX:    0, minZ:    0, maxX: 256, maxZ: 256,  name: 'Riverside',  buildingDensity: 0.35, buildingHeightMult: 1.2 },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ROADS
  // ══════════════════════════════════════════════════════════════════════════

  ROADS: {
    LANE_WIDTH:         4.0,        // width of one driving lane (units)
    LANES_PER_SIDE:     1,          // lanes in each direction (1 = 2-lane road total)
    ROAD_WIDTH:         9.0,        // total road width including kerbs
    SIDEWALK_WIDTH:     2.5,        // width of pavement on each side
    ROAD_Y:             0.05,       // Y offset above ground (prevents z-fighting)
    MARKING_Y:          0.06,       // lane/centre markings Y offset
    KERB_HEIGHT:        0.18,       // height of kerb above road
    SPEED_LIMIT:        50,         // km/h — above this triggers police (1 star)

    // Road colours
    ASPHALT_COLOR:      0x333333,
    MARKING_COLOR:      0xFFFFFF,
    KERB_COLOR:         0x888888,

    // Traffic light positions are computed from intersections at runtime.
    // This defines their visual geometry constants.
    TRAFFIC_LIGHT: {
      POLE_HEIGHT:      4.5,
      HEAD_SIZE:        0.6,
      GREEN_PHASE:      8,          // seconds green stays on
      YELLOW_PHASE:     2,          // seconds yellow stays on
      RED_PHASE:        8,          // seconds red stays on
    },

    // The main road grid is defined here as a list of road segments.
    // Each segment: { id, x1, z1, x2, z2 }
    // Intersections are detected automatically where segments cross.
    GRID: [
      // ── East–West arterials ─────────────────────────────────────────
      { id: 'ew_n2',  x1: -256, z1: -192, x2: 256, z2: -192 },
      { id: 'ew_n1',  x1: -256, z1:  -96, x2: 256, z2:  -96 },
      { id: 'ew_c',   x1: -256, z1:    0, x2: 256, z2:    0 },  // city centre E-W
      { id: 'ew_s1',  x1: -256, z1:   96, x2: 256, z2:   96 },
      { id: 'ew_s2',  x1: -256, z1:  192, x2: 256, z2:  192 },

      // ── North–South arterials ────────────────────────────────────────
      { id: 'ns_w2',  x1: -192, z1: -256, x2: -192, z2: 256 },
      { id: 'ns_w1',  x1:  -96, z1: -256, x2:  -96, z2: 256 },
      { id: 'ns_c',   x1:    0, z1: -256, x2:    0, z2: 256 },  // city centre N-S
      { id: 'ns_e1',  x1:   96, z1: -256, x2:   96, z2: 256 },
      { id: 'ns_e2',  x1:  192, z1: -256, x2:  192, z2: 256 },

      // ── Downtown side streets (denser grid, western half only) ───────
      { id: 'dt_ew1', x1: -256, z1: -144, x2:   0, z2: -144 },
      { id: 'dt_ew2', x1: -256, z1:  -48, x2:   0, z2:  -48 },
      { id: 'dt_ns1', x1:  -48, z1: -256, x2:  -48, z2:    0 },
      { id: 'dt_ns2', x1: -144, z1: -256, x2: -144, z2:    0 },

      // ── Riverside waterfront road (runs along river banks) ───────────
      { id: 'rv_n',   x1:    0, z1:   48, x2: 256, z2:   48 },
      { id: 'rv_s',   x1:    0, z1:   80, x2: 256, z2:   80 },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RIVER & BRIDGES
  // ══════════════════════════════════════════════════════════════════════════

  WATER: {
    RIVER_X_START:      0,          // river begins at x=0 (divides map N/S in riverside)
    RIVER_X_END:        256,
    RIVER_Z_CENTER:     64,         // river runs at z=64
    RIVER_WIDTH:        28,         // river total width (units)
    RIVER_Y:           -0.3,        // water surface Y
    WAVE_SPEED:         0.4,        // animation speed multiplier
    WAVE_HEIGHT:        0.12,       // vertex displacement amplitude
    WATER_COLOR:        0x1A6B9A,
    WATER_EMISSIVE:     0x0A3B5A,
    WATER_EMISSIVE_INT: 0.3,

    // Three bridges across the river
    BRIDGES: [
      { id: 'bridge_west',   x: 64,  z: 64, width: 10, length: 32, type: 'concrete',   name: 'West Bridge'   },
      { id: 'bridge_center', x: 128, z: 64, width: 10, length: 32, type: 'suspension', name: 'Centre Bridge' },
      { id: 'bridge_east',   x: 192, z: 64, width: 10, length: 32, type: 'arch',       name: 'East Bridge'   },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SKY & LIGHTING
  // ══════════════════════════════════════════════════════════════════════════

  SKY: {
    DAY_CYCLE_DURATION: 300,        // seconds for a full day/night cycle (0 = disabled)
    SUNRISE_HOUR:       6,
    SUNSET_HOUR:        20,

    // Colour keyframes [hour, hexColour] for sky gradient
    SKY_COLORS: [
      { hour:  0, sky: 0x0A0A1A, ambient: 0x111133 },
      { hour:  5, sky: 0x1A1A3A, ambient: 0x222244 },
      { hour:  7, sky: 0xF4A460, ambient: 0xFFAA66 },
      { hour:  9, sky: 0x87CEEB, ambient: 0xFFFFCC },
      { hour: 12, sky: 0x5BA3D9, ambient: 0xFFFFEE },
      { hour: 17, sky: 0xE87040, ambient: 0xFFCC88 },
      { hour: 20, sky: 0x1A1A3A, ambient: 0x333355 },
      { hour: 24, sky: 0x0A0A1A, ambient: 0x111133 },
    ],

    SUN_DISTANCE:       200,
    SUN_INTENSITY_DAY:  1.4,
    SUN_INTENSITY_NIGHT: 0.05,
    SHADOW_ENABLED:     true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BUILDINGS
  // ══════════════════════════════════════════════════════════════════════════

  BUILDINGS: {
    BLOCK_PADDING:      2,          // gap between building and road kerb
    FOOTPRINT_MIN:      6,          // minimum building width/depth (units)
    FOOTPRINT_MAX:      22,         // maximum building width/depth
    HEIGHT_MIN:         4,          // minimum height (1-storey house)
    HEIGHT_MAX:         80,         // maximum height (skyscraper)
    WINDOW_ROWS_PER_FLOOR: 1,
    FLOOR_HEIGHT:       3.5,        // metres per storey

    // Colour palettes per district
    PALETTE: {
      DOWNTOWN:   [0x8899AA, 0x667788, 0xAABBCC, 0x445566, 0x334455, 0xCCDDEE],
      SUBURBS:    [0xEEDDCC, 0xDDCCBB, 0xCCBBAA, 0xFFEEDD, 0xBBAA99, 0xDDEECC],
      INDUSTRIAL: [0x888877, 0x777766, 0x999988, 0x666655, 0xAAAA99, 0x555544],
      RIVERSIDE:  [0xBBCCDD, 0xCCDDEE, 0xAABBCC, 0xDDEEFF, 0x99AABB, 0xEEEEDD],
    },

    ROOF_COLOR:         0x555555,
    WINDOW_LIT_COLOR:   0xFFEEAA,   // night window glow
    WINDOW_DAY_COLOR:   0xCCDDEE,
    WINDOW_CHANCE:      0.7,        // probability a window is "lit" at night
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PROPS (trees, lampposts, benches, etc.)
  // ══════════════════════════════════════════════════════════════════════════

  PROPS: {
    TREE_SPACING:       18,         // average distance between street trees
    TREE_TRUNK_COLOR:   0x5C3D1E,
    TREE_CANOPY_COLORS: [0x2D6A2D, 0x3A8A3A, 0x226622, 0x4A9A2A, 0x1A5A1A],
    TREE_HEIGHT_MIN:    3.5,
    TREE_HEIGHT_MAX:    7.0,
    TREE_CANOPY_R_MIN:  1.5,
    TREE_CANOPY_R_MAX:  3.0,

    LAMPPOST_SPACING:   24,         // distance between lampposts
    LAMPPOST_HEIGHT:    5.5,
    LAMPPOST_COLOR:     0x888888,
    LAMPPOST_LIGHT_DAY: false,
    LAMPPOST_LIGHT_RANGE: 14,
    LAMPPOST_LIGHT_INTENSITY: 0.9,
    LAMPPOST_LIGHT_COLOR: 0xFFEE99,

    BENCH_COLOR:        0x8B6914,
    FENCE_COLOR:        0xAAAAAA,
    FENCE_HEIGHT:       1.0,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VEHICLES — ALL CARS
  // ══════════════════════════════════════════════════════════════════════════

  CARS: {
    city_hatch: {
      id:             'city_hatch',
      name:           'City Hatch',
      description:    'Reliable, economical, and easy to drive. The perfect starter car.',
      price:          0,                  // starter car — free
      unlocked:       true,               // always available
      stats: {
        topSpeed:     120,                // km/h
        acceleration: 6.5,               // 0–100 km/h in seconds
        handling:     0.82,              // 0–1 (steering responsiveness)
        braking:      0.78,
        grip:         0.70,
        weight:       1050,              // kg (affects collision response)
      },
      // Body dimensions for mesh generation
      body: { length: 3.8, width: 1.7, height: 1.45, wheelbase: 2.4 },
      colors: { body: 0xCC3333, roof: 0xAA2222, wheel: 0x222222 },
      upgrades: { engine: 0, tires: 0, brakes: 0, suspension: 0, turbo: 0, armor: 0 },
    },

    sport_sedan: {
      id:             'sport_sedan',
      name:           'Sport Sedan',
      description:    'A well-rounded family sport sedan. Good balance of speed and comfort.',
      price:          8000,
      unlocked:       false,
      stats: {
        topSpeed:     160,
        acceleration: 5.2,
        handling:     0.78,
        braking:      0.82,
        grip:         0.74,
        weight:       1350,
      },
      body: { length: 4.5, width: 1.85, height: 1.42, wheelbase: 2.7 },
      colors: { body: 0x224488, roof: 0x1A3366, wheel: 0x333333 },
      upgrades: { engine: 0, tires: 0, brakes: 0, suspension: 0, turbo: 0, armor: 0 },
    },

    muscle_coupe: {
      id:             'muscle_coupe',
      name:           'Muscle Coupe',
      description:    'Pure American muscle. Blistering straight-line speed, loose in corners.',
      price:          18000,
      unlocked:       false,
      stats: {
        topSpeed:     195,
        acceleration: 4.1,
        handling:     0.60,
        braking:      0.72,
        grip:         0.62,
        weight:       1700,
      },
      body: { length: 4.8, width: 1.95, height: 1.35, wheelbase: 2.8 },
      colors: { body: 0xAA1111, roof: 0x881100, wheel: 0x111111 },
      upgrades: { engine: 0, tires: 0, brakes: 0, suspension: 0, turbo: 0, armor: 0 },
    },

    street_racer: {
      id:             'street_racer',
      name:           'Street Racer',
      description:    'Track-bred, street-legal. Nimble, fast, and built for circuits.',
      price:          35000,
      unlocked:       false,
      stats: {
        topSpeed:     225,
        acceleration: 3.4,
        handling:     0.92,
        braking:      0.91,
        grip:         0.90,
        weight:       1100,
      },
      body: { length: 4.3, width: 1.90, height: 1.18, wheelbase: 2.55 },
      colors: { body: 0xFFAA00, roof: 0xCC8800, wheel: 0x222222 },
      upgrades: { engine: 0, tires: 0, brakes: 0, suspension: 0, turbo: 0, armor: 0 },
    },

    hypercar: {
      id:             'hypercar',
      name:           'Hypercar',
      description:    'The pinnacle of engineering. Owns every road it touches.',
      price:          80000,
      unlocked:       false,
      stats: {
        topSpeed:     285,
        acceleration: 2.2,
        handling:     0.96,
        braking:      0.97,
        grip:         0.95,
        weight:       980,
      },
      body: { length: 4.6, width: 2.00, height: 1.08, wheelbase: 2.65 },
      colors: { body: 0x111111, roof: 0x000000, wheel: 0x444444 },
      upgrades: { engine: 0, tires: 0, brakes: 0, suspension: 0, turbo: 0, armor: 0 },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // UPGRADES
  // ══════════════════════════════════════════════════════════════════════════

  UPGRADES: {
    // Each upgrade has 5 levels; price and stat bonus per level listed.
    engine: {
      name:         'Engine',
      icon:         '⚙️',
      description:  'Increases top speed and acceleration.',
      levels: [
        { level: 1, price:  800, topSpeedBonus:  8, accelBonus: 0.3 },
        { level: 2, price: 1600, topSpeedBonus: 16, accelBonus: 0.5 },
        { level: 3, price: 3200, topSpeedBonus: 26, accelBonus: 0.8 },
        { level: 4, price: 6000, topSpeedBonus: 38, accelBonus: 1.2 },
        { level: 5, price:11000, topSpeedBonus: 55, accelBonus: 1.8 },
      ],
    },
    tires: {
      name:         'Tires',
      icon:         '🔘',
      description:  'Improves grip and cornering ability.',
      levels: [
        { level: 1, price:  500, gripBonus: 0.04, handlingBonus: 0.03 },
        { level: 2, price: 1000, gripBonus: 0.07, handlingBonus: 0.05 },
        { level: 3, price: 2000, gripBonus: 0.10, handlingBonus: 0.08 },
        { level: 4, price: 4000, gripBonus: 0.14, handlingBonus: 0.11 },
        { level: 5, price: 7500, gripBonus: 0.18, handlingBonus: 0.15 },
      ],
    },
    brakes: {
      name:         'Brakes',
      icon:         '🛑',
      description:  'Reduces stopping distance significantly.',
      levels: [
        { level: 1, price:  400, brakingBonus: 0.04 },
        { level: 2, price:  900, brakingBonus: 0.07 },
        { level: 3, price: 1800, brakingBonus: 0.10 },
        { level: 4, price: 3500, brakingBonus: 0.13 },
        { level: 5, price: 6500, brakingBonus: 0.17 },
      ],
    },
    suspension: {
      name:         'Suspension',
      icon:         '🔧',
      description:  'Reduces body roll, improves stability at speed.',
      levels: [
        { level: 1, price:  600, stabilityBonus: 0.05 },
        { level: 2, price: 1200, stabilityBonus: 0.09 },
        { level: 3, price: 2400, stabilityBonus: 0.14 },
        { level: 4, price: 4800, stabilityBonus: 0.19 },
        { level: 5, price: 9000, stabilityBonus: 0.25 },
      ],
    },
    turbo: {
      name:         'Turbo',
      icon:         '💨',
      description:  'Adds a short-duration speed boost (press SHIFT).',
      levels: [
        { level: 1, price: 1200, boostMult: 1.12, boostDuration: 3.0 },
        { level: 2, price: 2500, boostMult: 1.20, boostDuration: 4.0 },
        { level: 3, price: 4500, boostMult: 1.28, boostDuration: 5.0 },
        { level: 4, price: 8000, boostMult: 1.38, boostDuration: 6.5 },
        { level: 5, price:15000, boostMult: 1.50, boostDuration: 8.0 },
      ],
    },
    armor: {
      name:         'Armor',
      icon:         '🛡️',
      description:  'Reduces damage taken from collisions.',
      levels: [
        { level: 1, price:  700, damageReduction: 0.10 },
        { level: 2, price: 1400, damageReduction: 0.18 },
        { level: 3, price: 2800, damageReduction: 0.28 },
        { level: 4, price: 5500, damageReduction: 0.38 },
        { level: 5, price:10000, damageReduction: 0.50 },
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PAINT SHOP
  // ══════════════════════════════════════════════════════════════════════════

  PAINT: {
    COST:   500,                    // flat cost per respray
    FINISH_COST: {
      standard:   0,               // included in base cost
      metallic:   300,
      matte:      400,
      chrome:     900,
    },
    COLORS: [
      { name: 'Racing Red',     hex: 0xCC1111 },
      { name: 'Midnight Black', hex: 0x111111 },
      { name: 'Pearl White',    hex: 0xF5F5F5 },
      { name: 'Ocean Blue',     hex: 0x1144AA },
      { name: 'Forest Green',   hex: 0x226622 },
      { name: 'Sunset Orange',  hex: 0xFF6622 },
      { name: 'Banana Yellow',  hex: 0xFFDD00 },
      { name: 'Royal Purple',   hex: 0x552288 },
      { name: 'Hot Pink',       hex: 0xFF1177 },
      { name: 'Steel Grey',     hex: 0x778899 },
      { name: 'Bronze',         hex: 0xCD7F32 },
      { name: 'Lime',           hex: 0x88DD00 },
      { name: 'Teal',           hex: 0x009988 },
      { name: 'Cream',          hex: 0xFFEECC },
      { name: 'Cobalt',         hex: 0x0044AA },
      { name: 'Burgundy',       hex: 0x880022 },
      { name: 'Sand',           hex: 0xD4B896 },
      { name: 'Olive',          hex: 0x667733 },
      { name: 'Ice Blue',       hex: 0xAADDFF },
      { name: 'Graphite',       hex: 0x444444 },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GARAGES (3 locations in the city)
  // ══════════════════════════════════════════════════════════════════════════

  GARAGES: [
    {
      id:       'garage_downtown',
      name:     'Downtown Auto',
      position: { x: -80, z: -160 },   // world coords
      district: 'DOWNTOWN',
      color:    0xFF6600,
      repairCostPerPercent: 12,         // $ per 1% damage repaired
      services: ['repair', 'upgrades', 'paint'],
    },
    {
      id:       'garage_suburbs',
      name:     'Suburb Motors',
      position: { x: 160, z: -160 },
      district: 'SUBURBS',
      color:    0x0066FF,
      repairCostPerPercent: 9,          // slightly cheaper
      services: ['repair', 'upgrades', 'paint'],
    },
    {
      id:       'garage_industrial',
      name:     'Industrial Workshop',
      position: { x: -160, z: 160 },
      district: 'INDUSTRIAL',
      color:    0xFF2200,
      repairCostPerPercent: 7,          // cheapest, but out of the way
      services: ['repair', 'upgrades'],
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // CAR DEALERSHIPS (2 locations)
  // ══════════════════════════════════════════════════════════════════════════

  DEALERS: [
    {
      id:       'dealer_downtown',
      name:     'City Auto Gallery',
      position: { x: -48, z: -80 },
      district: 'DOWNTOWN',
      color:    0xFFCC00,
    },
    {
      id:       'dealer_riverside',
      name:     'Riverside Motors',
      position: { x: 160, z: 40 },
      district: 'RIVERSIDE',
      color:    0x00CCFF,
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // RACES (7 total)
  // ══════════════════════════════════════════════════════════════════════════

  RACES: [
    {
      id:           'race_downtown_sprint',
      name:         'Downtown Sprint',
      description:  'A fast dash through the downtown grid. Watch the traffic!',
      district:     'DOWNTOWN',
      laps:         1,
      opponents:    3,
      prize:        { 1st: 500,   2nd: 300,  3rd: 150  },
      entryFee:     50,
      timeLimit:    120,           // seconds (0 = no limit)
      requiredCar:  null,          // null = any car
      startPos:     { x: -96, z: -192, heading: 0 },
      checkpoints: [
        { x: -48,  z: -192 },
        { x: -48,  z: -144 },
        { x: -96,  z: -144 },
        { x: -96,  z:  -96 },
        { x: -144, z:  -96 },
        { x: -144, z: -192 },
        { x:  -96, z: -192 },     // finish = start
      ],
    },
    {
      id:           'race_riverside_loop',
      name:         'Riverside Loop',
      description:  'Two laps along the scenic riverside waterfront road.',
      district:     'RIVERSIDE',
      laps:         2,
      opponents:    4,
      prize:        { 1st: 900,   2nd: 540,  3rd: 270  },
      entryFee:     100,
      timeLimit:    180,
      requiredCar:  null,
      startPos:     { x: 48, z: 48, heading: Math.PI / 2 },
      checkpoints: [
        { x: 96,  z: 48  },
        { x: 192, z: 48  },
        { x: 240, z: 64  },
        { x: 192, z: 80  },
        { x: 96,  z: 80  },
        { x: 48,  z: 64  },
      ],
    },
    {
      id:           'race_industrial_chase',
      name:         'Industrial Chase',
      description:  'One brutal lap through the industrial district.',
      district:     'INDUSTRIAL',
      laps:         1,
      opponents:    4,
      prize:        { 1st: 1200,  2nd: 720,  3rd: 360  },
      entryFee:     150,
      timeLimit:    150,
      requiredCar:  null,
      startPos:     { x: -192, z: 96, heading: 0 },
      checkpoints: [
        { x: -144, z: 96  },
        { x: -96,  z: 96  },
        { x: -96,  z: 192 },
        { x: -144, z: 192 },
        { x: -192, z: 192 },
        { x: -192, z: 96  },
      ],
    },
    {
      id:           'race_suburb_circuit',
      name:         'Suburb Circuit',
      description:  'Three relaxing (but competitive!) laps through the suburbs.',
      district:     'SUBURBS',
      laps:         3,
      opponents:    5,
      prize:        { 1st: 800,   2nd: 480,  3rd: 240  },
      entryFee:     80,
      timeLimit:    300,
      requiredCar:  null,
      startPos:     { x: 96, z: -192, heading: Math.PI },
      checkpoints: [
        { x: 192, z: -192 },
        { x: 192, z:  -96 },
        { x: 96,  z:  -96 },
        { x: 96,  z: -192 },
      ],
    },
    {
      id:           'race_bridge_blitz',
      name:         'Bridge Blitz',
      description:  'Cross all three bridges — one lap across the entire city!',
      district:     'ALL',
      laps:         1,
      opponents:    5,
      prize:        { 1st: 2000,  2nd: 1200, 3rd: 600  },
      entryFee:     250,
      timeLimit:    200,
      requiredCar:  null,
      startPos:     { x: 0, z: -192, heading: Math.PI / 2 },
      checkpoints: [
        { x: 64,  z: 48  },
        { x: 128, z: 48  },
        { x: 192, z: 48  },
        { x: 192, z: -96 },
        { x:   0, z: -96 },
      ],
    },
    {
      id:           'race_night_race',
      name:         'Night Race',
      description:  'Downtown at night. Neon lights, wet roads, zero visibility.',
      district:     'DOWNTOWN',
      laps:         2,
      opponents:    6,
      prize:        { 1st: 3000,  2nd: 1800, 3rd: 900  },
      entryFee:     400,
      timeLimit:    240,
      requiredCar:  null,              // but strongly advised: sport_sedan or better
      nightOnly:    true,              // only available after 20:00 in-game
      startPos:     { x: -96, z: -240, heading: 0 },
      checkpoints: [
        { x: -48,  z: -240 },
        { x:   0,  z: -192 },
        { x: -48,  z: -144 },
        { x: -144, z: -144 },
        { x: -192, z: -192 },
        { x: -144, z: -240 },
        { x:  -96, z: -240 },
      ],
    },
    {
      id:           'race_grand_prix',
      name:         'Grand City Prix',
      description:  'The ultimate challenge. Three full laps across the entire city.',
      district:     'ALL',
      laps:         3,
      opponents:    7,
      prize:        { 1st: 10000, 2nd: 6000, 3rd: 3000 },
      entryFee:     1000,
      timeLimit:    0,               // no time limit
      requiredCar:  'street_racer', // need at least this car
      startPos:     { x: 0, z: -240, heading: Math.PI / 2 },
      checkpoints: [
        { x:  96,  z: -240 },
        { x: 192,  z: -192 },
        { x: 240,  z:  -96 },
        { x: 192,  z:    0 },
        { x: 192,  z:   48 },   // cross bridge east
        { x: 192,  z:  192 },
        { x:   0,  z:  192 },
        { x: -192, z:  192 },
        { x: -240, z:    0 },
        { x: -192, z:  -96 },
        { x:  -96, z: -192 },
        { x:    0, z: -240 },
      ],
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // PASSENGER / TAXI SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  PASSENGERS: {
    SPAWN_INTERVAL:   25,           // seconds between new passenger spawning
    MAX_ACTIVE:        4,           // max passengers waiting at once
    PICKUP_RADIUS:     5,           // units — how close to pick up
    DROPOFF_RADIUS:    5,
    BASE_PAY:         150,          // $ minimum pay per trip
    DISTANCE_BONUS:   0.8,          // $ per unit of distance
    TIME_BONUS_MAX:   250,          // $ max bonus for fast delivery
    TIME_LIMIT_MULT:  2.5,          // time limit = distance / carSpeed × this
    MARKER_COLOR:     0xFFEE00,
    DEST_COLOR:       0x00FFAA,

    // Preset passenger spawn/destination pairs
    // (runtime system also generates random ones from road nodes)
    PRESET_TRIPS: [
      { name: 'Airport Run',    from: { x:  96, z: -192 }, to: { x: 220, z: 220 }, bonus: 300 },
      { name: 'Late for Work',  from: { x: 160, z: -80  }, to: { x: -96, z: -96 }, bonus: 200 },
      { name: 'Night Out',      from: { x:  -48, z: -48 }, to: { x: 192, z:  96 }, bonus: 180 },
      { name: 'Hospital Dash',  from: { x: -160, z: 160 }, to: { x:  96, z: -96 }, bonus: 400, urgent: true },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TRAFFIC (AI CARS)
  // ══════════════════════════════════════════════════════════════════════════

  TRAFFIC: {
    MAX_CARS:         30,           // total AI traffic cars in world
    SPAWN_RADIUS:     120,          // spawn within this radius of player
    DESPAWN_RADIUS:   180,          // despawn when further than this
    BASE_SPEED:       35,           // km/h average traffic speed
    SPEED_VARIANCE:   10,           // ± variance in speed
    BRAKE_DISTANCE:   12,           // units — start braking before intersection
    HORN_CHANCE:      0.15,         // probability of honking when blocked

    // Traffic car body colours (random pick per car)
    CAR_COLORS: [
      0xCC4444, 0x4444CC, 0xCCCC44, 0x44CC44, 0xAAAAAA,
      0x884422, 0x228844, 0x442288, 0xCC8844, 0x888888,
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // POLICE SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  POLICE: {
    MAX_STARS:         3,
    STAR_COLOR:        [0xFFDD00, 0xFF8800, 0xFF0000],  // colour per star level

    // Conditions that add wanted level
    TRIGGERS: {
      SPEED_OVER_LIMIT:     50,     // km/h over limit for 1-star
      HIT_POLICE_CAR:       1,      // +1 star instantly
      HIT_TRAFFIC_HARD:     1,      // +1 star for hard collision
      EVADE_PURSUIT:        1,      // +1 star each time you escape
    },

    // Cool-down: stars drain if player behaves for this many seconds
    COOLDOWN_PER_STAR:    20,       // seconds before 1 star drains
    PURSUIT_GIVE_UP_DIST: 100,      // units — police give up chase beyond this

    UNITS_PER_STAR: [0, 1, 2, 4],  // [0stars, 1star, 2stars, 3stars]

    POLICE_SPEED:         160,      // km/h pursuit speed
    POLICE_COLOR_BODY:    0x111166,
    POLICE_COLOR_STRIPE:  0xFFFFFF,
    SIREN_COLORS:         [0x0000FF, 0xFF0000],

    BRIBE_COST_PER_STAR:  500,      // $ to bribe per star level
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PHYSICS
  // ══════════════════════════════════════════════════════════════════════════

  PHYSICS: {
    GRAVITY:          9.81,
    TIMESTEP:         1 / 60,      // fixed physics step
    MAX_SUBSTEPS:     3,

    // Car physics tuning
    STEER_SPEED:      2.5,         // how fast steering angle changes (rad/s)
    STEER_RETURN:     3.5,         // how fast wheel returns to centre
    MAX_STEER_ANGLE:  0.55,        // radians (~31°)
    STEER_SPEED_DAMP: 0.004,       // reduces max steer at high speed

    DRAG:             0.025,       // rolling/air resistance multiplier
    LATERAL_FRICTION: 0.88,        // sideways friction (prevents infinite drift)
    DRIFT_FACTOR:     0.92,        // grip → drift blend at high slip angles

    COLLISION_RESTITUTION: 0.25,   // bounciness on collision
    DAMAGE_SPEED_THRESHOLD: 15,    // km/h — below this, no damage on collision
    DAMAGE_PER_IMPACT: 0.08,       // damage fraction per collision at threshold
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER / ECONOMY
  // ══════════════════════════════════════════════════════════════════════════

  PLAYER: {
    START_MONEY:      2500,
    START_CAR:        'city_hatch',
    MAX_DAMAGE:       100,         // % — at 100% car stops moving
    DAMAGE_WARN_PCT:  70,          // show warning above this
    REPAIR_WARN_PCT:  85,          // auto-suggest repair above this
    BOOST_COOLDOWN:   12,          // seconds between turbo uses
  },

  // ══════════════════════════════════════════════════════════════════════════
  // UI / HUD
  // ══════════════════════════════════════════════════════════════════════════

  HUD: {
    MINIMAP_SIZE:       160,       // px
    MINIMAP_RANGE:      200,       // world units shown on minimap radius
    MINIMAP_PLAYER_COLOR: '#FFFF00',
    MINIMAP_ROAD_COLOR:   '#555555',
    MINIMAP_BG_COLOR:     'rgba(0,0,0,0.65)',
    MINIMAP_WATER_COLOR:  '#1A6B9A',
    MINIMAP_MARKER_RADIUS: 5,

    SPEEDO_MAX:         300,       // km/h — speedometer max reading
    MONEY_ANIM_SPEED:   2,         // seconds for money counter roll

    NOTIFICATION_DURATION: 4,     // seconds a toast stays on screen
    NOTIFICATION_SLIDE_MS: 350,   // slide-in animation ms

    DAMAGE_COLORS: {
      OK:      '#44CC44',
      WARN:    '#FFAA00',
      DANGER:  '#FF3300',
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SAVE SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  SAVE: {
    KEY_PREFIX:       'cityRacer_',
    SLOT_COUNT:       3,
    AUTO_SAVE_INTERVAL: 30,        // seconds between auto-saves
    VERSION:          '1.0.0',     // bump to invalidate old saves on update
  },

  // ══════════════════════════════════════════════════════════════════════════
  // AUDIO (Web Audio API — all sounds procedurally generated)
  // ══════════════════════════════════════════════════════════════════════════

  AUDIO: {
    MASTER_VOLUME:    0.8,
    ENGINE_VOLUME:    0.5,
    SKID_VOLUME:      0.4,
    HORN_VOLUME:      0.6,
    SIREN_VOLUME:     0.7,
    CASH_VOLUME:      0.9,
    CRASH_VOLUME:     0.7,
    AMBIENT_VOLUME:   0.25,        // city background noise

    // Engine note frequencies per RPM zone
    ENGINE_NOTES: {
      IDLE:      55,    // Hz
      LOW:       80,
      MID:       140,
      HIGH:      220,
      REDLINE:   380,
    },
  },

};

// Make config immutable in production to prevent accidental mutation.
// (Comment out during development if you want live-tweaking in console.)
Object.freeze(CONFIG);

// Export for module systems; also available as global for classic <script> tags.
if (typeof module !== 'undefined') module.exports = CONFIG;
