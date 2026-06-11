/**
 * ══════════════════════════════════════════════════════════════════════════
 * LAVA JUMP — Level Definitions
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── HOW TO ADD A LEVEL ────────────────────────────────────────────────────
 *   Push a new object into the LEVELS array at the bottom.
 *   The game reads levels in order; index determines unlock sequence.
 *
 * ── PLATFORM FORMAT ───────────────────────────────────────────────────────
 *   [x, y, z, width, height, depth, type, options?]
 *
 *   x/y/z    → center position in 3D world (Y is up)
 *   width    → size on X axis
 *   height   → size on Y axis (thickness of slab)
 *   depth    → size on Z axis
 *   type     → one of the types listed below
 *   options  → optional object, only used by 'moving' type
 *
 * ── PLATFORM TYPES ────────────────────────────────────────────────────────
 *   'start'   Green slab. Player spawns directly above it.
 *   'goal'    Emerald glowing slab. Stepping on it wins the level.
 *   'normal'  Stone slab. Static, never changes.
 *   'moving'  Oscillates back and forth along one axis.
 *             options: { axis: 'x'|'y'|'z', range: units, speed: units/s }
 *   'crumble' Shakes then falls 1.5 s after the player first lands on it.
 *   'bouncy'  Launches the player to ~1.6× normal jump height on contact.
 *
 * ── COIN FORMAT ───────────────────────────────────────────────────────────
 *   [x, y, z]   — world position of each gold coin
 *
 * ── PHYSICS CHEATSHEET (for level designers) ──────────────────────────────
 *   Max jump height  ≈ 3.5 units above takeoff point
 *   Max jump range   ≈ 7 units horizontal while jumping at full speed
 *   Platform top     = platform_y + platform_height/2
 *   Safe gap width   ≤ 6 units
 *   Safe height diff ≤ 3 units upward (unlimited downward)
 * ══════════════════════════════════════════════════════════════════════════
 */

const LEVELS = [

  // ─── LEVEL 1 · Warm Up ──────────────────────────────────────────────────
  // Straight path, wide platforms, easy gaps. Learn the basics.
  {
    id: 1,
    name: "Warm Up",
    description: "Learn the basics!",
    timeLimit: 90,
    startPos: [0, 2, 0],
    platforms: [
      //  x    y   z    w   h   d   type
      [  0,  0,  0,  6, 1,  6, 'start'  ],
      [  9,  0,  0,  3, 1,  3, 'normal' ],
      [ 16,  0,  0,  3, 1,  3, 'normal' ],
      [ 23,  0,  0,  5, 1,  5, 'goal'   ],
    ],
    coins: [
      [  9, 2.5,  0 ],
      [ 16, 2.5,  0 ],
      [ 23, 2.5,  0 ],
    ],
  },

  // ─── LEVEL 2 · Zigzag ───────────────────────────────────────────────────
  // Platforms alternate left and right — watch your footing!
  {
    id: 2,
    name: "Zigzag",
    description: "Follow the zigzag!",
    timeLimit: 80,
    startPos: [0, 2, 0],
    platforms: [
      [  0,  0,   0,  5, 1,  4, 'start'  ],
      [  8,  0,  -4, 2.5,1,2.5,'normal'  ],
      [ 15,  0,   4, 2.5,1,2.5,'normal'  ],
      [ 22,  0,  -4, 2.5,1,2.5,'normal'  ],
      [ 29,  0,   4, 2.5,1,2.5,'normal'  ],
      [ 36,  0,   0,  5, 1,  4, 'goal'   ],
    ],
    coins: [
      [  8, 2.5, -4 ],
      [ 15, 2.5,  4 ],
      [ 22, 2.5, -4 ],
      [ 29, 2.5,  4 ],
    ],
  },

  // ─── LEVEL 3 · Moving Targets ───────────────────────────────────────────
  // Two platforms swing as you approach. Time your jumps!
  {
    id: 3,
    name: "Moving Targets",
    description: "Platforms are moving!",
    timeLimit: 75,
    startPos: [0, 2, 0],
    platforms: [
      [  0,  0,  0,  5, 1,  4, 'start'  ],
      [  9,  0,  0,  3, 1,  3, 'moving', { axis: 'z', range: 4,   speed: 1.8 } ],
      [ 17,  0,  0, 2.5,1,2.5,'normal'  ],
      [ 25,  0,  0,  3, 1,  3, 'moving', { axis: 'x', range: 3,   speed: 2.2 } ],
      [ 34,  0,  0,  5, 1,  4, 'goal'   ],
    ],
    coins: [
      [  9, 2.5,  0 ],
      [ 17, 2.5,  0 ],
      [ 25, 2.5,  0 ],
      [ 34, 2.5,  1 ],
      [ 34, 2.5, -1 ],
    ],
  },

  // ─── LEVEL 4 · Going Up! ────────────────────────────────────────────────
  // Platforms at varying heights. A bouncy pad helps you reach the top.
  {
    id: 4,
    name: "Going Up!",
    description: "Reach the heights!",
    timeLimit: 75,
    startPos: [0, 2, 0],
    platforms: [
      [  0,  0,  0,  5, 1,  4, 'start'  ],
      [  8,  2,  0,  3, 1,  3, 'normal' ],
      [ 15,  4,  0,  3, 1,  3, 'normal' ],
      [ 22,  1,  0,  3, 1,  3, 'bouncy' ],   // ← bouncy pad
      [ 30,  5,  0,  3, 1,  3, 'normal' ],
      [ 37,  3,  0,  3, 1,  3, 'normal' ],
      [ 45,  3,  0,  5, 1,  4, 'goal'   ],
    ],
    coins: [
      [  8, 4.5,  0 ],
      [ 15, 6.5,  0 ],
      [ 22, 3.5,  0 ],
      [ 30, 7.5,  0 ],
      [ 37, 5.5,  0 ],
      [ 45, 5.5,  0 ],
    ],
  },

  // ─── LEVEL 5 · Fork in the Road ─────────────────────────────────────────
  // Two diverging paths merge at the goal. Both hold coins — grab them all!
  {
    id: 5,
    name: "Fork in the Road",
    description: "Two paths, one goal!",
    timeLimit: 80,
    startPos: [0, 2, 0],
    platforms: [
      [  0,  0,   0,  5, 1,  4, 'start'  ],
      [  8,  0,  -5, 2.5,1,2.5,'normal'  ],   // left branch
      [  8,  0,   5, 2.5,1,2.5,'normal'  ],   // right branch
      [ 16,  0,  -5, 2.5,1,2.5,'moving', { axis: 'z', range: 2.5, speed: 1.5 } ],
      [ 16,  0,   5, 2.5,1,2.5,'crumble' ],   // ← crumble on right path
      [ 24,  0,   0, 3.5,1,3.5,'normal'  ],   // merge point
      [ 32,  0,   0,  3, 1,  3, 'moving', { axis: 'x', range: 3,   speed: 2   } ],
      [ 41,  0,   0,  5, 1,  4, 'goal'   ],
    ],
    coins: [
      [  8, 2.5, -5 ],
      [  8, 2.5,  5 ],
      [ 16, 2.5, -5 ],
      [ 16, 2.5,  5 ],
      [ 24, 2.5,  0 ],
      [ 41, 2.5,  0 ],
    ],
  },

  // ─── LEVEL 6 · Crumble Rush ─────────────────────────────────────────────
  // Most platforms crumble beneath you — keep moving!
  {
    id: 6,
    name: "Crumble Rush",
    description: "Don't stop moving!",
    timeLimit: 65,
    startPos: [0, 2, 0],
    platforms: [
      [  0,  0,  0,  5, 1,  4, 'start'   ],
      [  8,  0,  0,  3, 1,  3, 'crumble' ],
      [ 15,  0,  0, 2.5,1,2.5,'crumble'  ],
      [ 22,  0,  0,  3, 1,  3, 'normal'  ],   // ← safe rest spot
      [ 29,  0,  0, 2.5,1,2.5,'crumble'  ],
      [ 36,  0,  2, 2.5,1,2.5,'crumble'  ],
      [ 36,  0, -2, 2.5,1,2.5,'crumble'  ],
      [ 44,  0,  0, 2.5,1,2.5,'crumble'  ],
      [ 52,  0,  0,  5, 1,  4, 'goal'    ],
    ],
    coins: [
      [  8, 2.5,  0 ],
      [ 15, 2.5,  0 ],
      [ 22, 2.5,  0 ],
      [ 29, 2.5,  0 ],
      [ 36, 2.5,  2 ],
      [ 36, 2.5, -2 ],
      [ 52, 2.5,  0 ],
    ],
  },

  // ─── LEVEL 7 · The Gauntlet ─────────────────────────────────────────────
  // Every mechanic combined. Only the best earn 3 stars here!
  {
    id: 7,
    name: "The Gauntlet",
    description: "Everything at once!",
    timeLimit: 100,
    startPos: [0, 2, 0],
    platforms: [
      [  0,  0,   0,  5, 1,  4, 'start'  ],
      [  8,  0,   0,  3, 1,  3, 'moving', { axis: 'z', range: 4,   speed: 2.2 } ],
      [ 16,  2,   0, 2.5,1,2.5,'crumble' ],
      [ 23,  4,   0, 2.5,1,2.5,'normal'  ],
      [ 30,  1,   4, 2.5,1,2.5,'moving', { axis: 'z', range: 3,   speed: 2.5 } ],
      [ 30,  1,  -4, 2.5,1,2.5,'crumble' ],
      [ 38,  0,   0,  3, 1,  3, 'bouncy'  ],
      [ 46,  4,   0, 2.5,1,2.5,'normal'  ],
      [ 54,  2,   0,  2, 1,  2, 'crumble' ],
      [ 61,  2,   0,  2, 1,  2, 'crumble' ],
      [ 69,  0,   0,  3, 1,  3, 'moving', { axis: 'x', range: 3,   speed: 3   } ],
      [ 78,  0,   0,  6, 1,  5, 'goal'   ],
    ],
    coins: [
      [  8, 2.5,  0 ],
      [ 16, 4.5,  0 ],
      [ 23, 6.5,  0 ],
      [ 30, 3.5,  4 ],
      [ 30, 3.5, -4 ],
      [ 38, 2.5,  0 ],
      [ 46, 6.5,  0 ],
      [ 54, 4.5,  0 ],
      [ 78, 2.5,  0 ],
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ADD MORE LEVELS HERE — copy one of the blocks above and edit it!
  // ─────────────────────────────────────────────────────────────────────────

];
