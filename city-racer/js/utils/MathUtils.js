/*js/utils/MathUtils.js*/
/**
 * ============================================================================
 * CITY RACER — MathUtils.js
 * ============================================================================
 * Pure-function mathematics library. No DOM, no Three.js dependency — only
 * vanilla JS so these helpers can be called from any module at any time.
 *
 * Sections:
 *   1.  Core scalar helpers       (clamp, lerp, smoothstep, …)
 *   2.  Angle utilities           (normalise, delta, lerp, to/from degrees)
 *   3.  Easing functions          (ease-in, ease-out, spring, …)
 *   4.  Random helpers            (range, int, pick, gaussian, …)
 *   5.  2-D vector helpers        (plain {x,z} objects used for road logic)
 *   6.  3-D vector helpers        (plain {x,y,z} objects)
 *   7.  AABB collision            (overlap, penetration, ray-cast)
 *   8.  Road / path utilities     (snap, project, closest-point-on-segment)
 *   9.  Colour helpers            (hex pack/unpack, lerp, HSL)
 *  10.  Bezier & spline           (quadratic, cubic, catmull-rom)
 *  11.  Coordinate conversion     (world ↔ minimap, world ↔ screen)
 *  12.  Physics helpers           (velocity, drag, impulse)
 * ============================================================================
 */

'use strict';

const MathUtils = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // 1. CORE SCALAR HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Clamp a value between min and max (inclusive).
   * @param {number} v
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  /**
   * Linear interpolation between a and b by factor t (0–1).
   * t is NOT clamped — pass clamp(t,0,1) yourself if needed.
   */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * Inverse lerp — returns t such that lerp(a,b,t) === v.
   * Returns 0 when a === b to avoid division by zero.
   */
  function invLerp(a, b, v) {
    return a === b ? 0 : (v - a) / (b - a);
  }

  /**
   * Re-maps v from range [inMin,inMax] to range [outMin,outMax].
   */
  function remap(v, inMin, inMax, outMin, outMax) {
    return lerp(outMin, outMax, invLerp(inMin, inMax, v));
  }

  /**
   * Smooth Hermite interpolation (6t⁵ − 15t⁴ + 10t³ variant).
   * t should be in [0,1].
   */
  function smoothstep(t) {
    t = clamp(t, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /**
   * Standard smoothstep (3t² − 2t³).
   */
  function smoothstep3(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }

  /**
   * Snap v to the nearest multiple of step.
   */
  function snap(v, step) {
    return Math.round(v / step) * step;
  }

  /**
   * Returns the sign of v: −1, 0, or +1.
   */
  function sign(v) {
    return v < 0 ? -1 : v > 0 ? 1 : 0;
  }

  /**
   * Returns true if v is between min and max (inclusive).
   */
  function inRange(v, min, max) {
    return v >= min && v <= max;
  }

  /**
   * Wraps v into the range [min, max).
   * Useful for looping counters and circular quantities.
   */
  function wrap(v, min, max) {
    const range = max - min;
    if (range === 0) return min;
    return ((((v - min) % range) + range) % range) + min;
  }

  /**
   * Modulo that always returns a non-negative result.
   */
  function mod(v, m) {
    return ((v % m) + m) % m;
  }

  /**
   * Approximately equal — useful for floating-point comparisons.
   */
  function approxEqual(a, b, eps = 1e-6) {
    return Math.abs(a - b) < eps;
  }

  /**
   * Round to a given number of decimal places.
   */
  function roundTo(v, decimals) {
    const f = Math.pow(10, decimals);
    return Math.round(v * f) / f;
  }

  /**
   * Convert kilometres per hour to metres per second.
   */
  function kmhToMs(kmh) { return kmh / 3.6; }

  /**
   * Convert metres per second to kilometres per hour.
   */
  function msToKmh(ms)  { return ms * 3.6;  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. ANGLE UTILITIES
  // ══════════════════════════════════════════════════════════════════════════

  const TWO_PI  = Math.PI * 2;
  const HALF_PI = Math.PI / 2;
  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  /** Degrees → radians. */
  function degToRad(deg) { return deg * DEG2RAD; }

  /** Radians → degrees. */
  function radToDeg(rad) { return rad * RAD2DEG; }

  /**
   * Normalise an angle to [−π, +π].
   */
  function normaliseAngle(a) {
    a = mod(a, TWO_PI);
    if (a > Math.PI) a -= TWO_PI;
    return a;
  }

  /**
   * Shortest signed angular difference from angle a to angle b.
   * Result is in [−π, +π].
   */
  function angleDelta(a, b) {
    return normaliseAngle(b - a);
  }

  /**
   * Lerp between two angles along the shortest arc.
   */
  function lerpAngle(a, b, t) {
    return a + angleDelta(a, b) * t;
  }

  /**
   * Smoothly move angle `current` toward `target` by at most `maxStep`
   * radians, taking the shortest arc. Returns the new angle.
   */
  function moveTowardAngle(current, target, maxStep) {
    const delta = angleDelta(current, target);
    if (Math.abs(delta) <= maxStep) return target;
    return current + sign(delta) * maxStep;
  }

  /**
   * Convert a heading angle (radians, 0 = North, clockwise) to a
   * compass label: N, NE, E, SE, S, SW, W, NW.
   */
  function headingToCompass(rad) {
    const d = mod(radToDeg(rad), 360);
    const labels = ['N','NE','E','SE','S','SW','W','NW'];
    return labels[Math.round(d / 45) % 8];
  }

  /**
   * Angle from point a to point b on the XZ plane (in radians).
   * Returns 0 when b is directly ahead (+Z from a) and increases clockwise.
   */
  function angleTo2D(ax, az, bx, bz) {
    return Math.atan2(bx - ax, bz - az);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. EASING FUNCTIONS
  // All take t ∈ [0,1] and return a value in [0,1] (mostly).
  // ══════════════════════════════════════════════════════════════════════════

  const Ease = {
    linear:      t => t,

    inQuad:      t => t * t,
    outQuad:     t => 1 - (1 - t) * (1 - t),
    inOutQuad:   t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2,

    inCubic:     t => t * t * t,
    outCubic:    t => 1 - Math.pow(1-t, 3),
    inOutCubic:  t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2,

    inQuart:     t => t * t * t * t,
    outQuart:    t => 1 - Math.pow(1-t, 4),

    inExpo:      t => t === 0 ? 0 : Math.pow(2, 10*t-10),
    outExpo:     t => t === 1 ? 1 : 1 - Math.pow(2, -10*t),

    inBack:      t => { const c = 1.70158; return t*t*((c+1)*t - c); },
    outBack:     t => { const c = 1.70158; return 1 + Math.pow(t-1,2)*((c+1)*(t-1)+c); },

    /**
     * Spring overshoot — overshoots 1.0 then settles. Good for UI pop-ins.
     * @param {number} t   0–1
     * @param {number} [s=0.3] overshoot amount
     */
    spring(t, s = 0.3) {
      return Math.pow(2, -10*t) * Math.sin((t - s/4) * (TWO_PI/s)) + 1;
    },

    /**
     * Exponential decay — smoothly approaches 1. Good for camera follow.
     * @param {number} t          0–1
     * @param {number} [k=8]  decay rate
     */
    expDecay(t, k = 8) {
      return 1 - Math.exp(-k * t);
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 4. RANDOM HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Uniform random float in [min, max).
   */
  function randFloat(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * Uniform random integer in [min, max] (inclusive).
   */
  function randInt(min, max) {
    return Math.floor(randFloat(min, max + 1));
  }

  /**
   * Random boolean with given probability of true (default 0.5).
   */
  function randBool(probability = 0.5) {
    return Math.random() < probability;
  }

  /**
   * Pick a random element from an array.
   */
  function randPick(arr) {
    return arr[randInt(0, arr.length - 1)];
  }

  /**
   * Shuffle an array in place (Fisher-Yates) and return it.
   */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Box-Muller transform — approximate Gaussian random (mean=0, σ=1).
   * Multiply result by σ and add μ for other distributions.
   */
  function randGaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v);
  }

  /**
   * Seeded pseudo-random number generator (mulberry32).
   * Returns a function that produces repeatable floats in [0,1).
   * @param {number} seed  Any 32-bit integer.
   */
  function createRNG(seed) {
    let s = seed | 0;
    return function () {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. 2-D VECTOR HELPERS  ({x, z} — XZ plane, Y is up in 3-D world)
  // ══════════════════════════════════════════════════════════════════════════

  /** Create a 2-D vector. */
  function vec2(x = 0, z = 0) { return { x, z }; }

  function vec2Add(a, b)    { return { x: a.x + b.x, z: a.z + b.z }; }
  function vec2Sub(a, b)    { return { x: a.x - b.x, z: a.z - b.z }; }
  function vec2Scale(v, s)  { return { x: v.x * s,   z: v.z * s   }; }
  function vec2Dot(a, b)    { return a.x * b.x + a.z * b.z; }
  function vec2LenSq(v)     { return v.x * v.x + v.z * v.z; }
  function vec2Len(v)       { return Math.sqrt(vec2LenSq(v)); }
  function vec2Norm(v) {
    const l = vec2Len(v);
    return l < 1e-10 ? { x: 0, z: 0 } : { x: v.x / l, z: v.z / l };
  }
  function vec2Perp(v)      { return { x: -v.z, z: v.x }; } // 90° CCW
  function vec2Lerp(a, b, t){ return { x: lerp(a.x,b.x,t), z: lerp(a.z,b.z,t) }; }

  /** Euclidean distance between two 2-D points. */
  function dist2D(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    return Math.sqrt(dx*dx + dz*dz);
  }

  /** Squared distance (avoids sqrt — use for comparisons). */
  function dist2DSq(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    return dx*dx + dz*dz;
  }

  /** Rotate a 2-D vector by angle radians (CCW). */
  function vec2Rotate(v, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: v.x * c - v.z * s, z: v.x * s + v.z * c };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. 3-D VECTOR HELPERS  ({x, y, z})
  // ══════════════════════════════════════════════════════════════════════════

  /** Create a 3-D vector. */
  function vec3(x = 0, y = 0, z = 0) { return { x, y, z }; }

  function vec3Add(a, b)   { return { x:a.x+b.x, y:a.y+b.y, z:a.z+b.z }; }
  function vec3Sub(a, b)   { return { x:a.x-b.x, y:a.y-b.y, z:a.z-b.z }; }
  function vec3Scale(v, s) { return { x:v.x*s,   y:v.y*s,   z:v.z*s   }; }
  function vec3Dot(a, b)   { return a.x*b.x + a.y*b.y + a.z*b.z; }
  function vec3LenSq(v)    { return v.x*v.x + v.y*v.y + v.z*v.z; }
  function vec3Len(v)      { return Math.sqrt(vec3LenSq(v)); }
  function vec3Norm(v) {
    const l = vec3Len(v);
    return l < 1e-10 ? {x:0,y:0,z:0} : { x:v.x/l, y:v.y/l, z:v.z/l };
  }
  function vec3Cross(a, b) {
    return {
      x: a.y*b.z - a.z*b.y,
      y: a.z*b.x - a.x*b.z,
      z: a.x*b.y - a.y*b.x,
    };
  }
  function vec3Lerp(a, b, t) {
    return { x:lerp(a.x,b.x,t), y:lerp(a.y,b.y,t), z:lerp(a.z,b.z,t) };
  }

  /** Euclidean distance between two 3-D points. */
  function dist3D(a, b) {
    const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }

  /** Flat (XZ-plane) distance between two 3-D points (ignores Y). */
  function distFlat(a, b) {
    const dx=b.x-a.x, dz=b.z-a.z;
    return Math.sqrt(dx*dx + dz*dz);
  }

  /**
   * Reflect vector v about normal n (both normalised).
   * Used for collision deflection.
   */
  function vec3Reflect(v, n) {
    const d = 2 * vec3Dot(v, n);
    return vec3Sub(v, vec3Scale(n, d));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. AABB COLLISION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create an Axis-Aligned Bounding Box from a centre + half-extents.
   * @param {number} cx  centre X
   * @param {number} cy  centre Y
   * @param {number} cz  centre Z
   * @param {number} hw  half-width  (X extent)
   * @param {number} hh  half-height (Y extent)
   * @param {number} hd  half-depth  (Z extent)
   */
  function makeAABB(cx, cy, cz, hw, hh, hd) {
    return {
      minX: cx - hw, maxX: cx + hw,
      minY: cy - hh, maxY: cy + hh,
      minZ: cz - hd, maxZ: cz + hd,
      cx, cy, cz, hw, hh, hd,
    };
  }

  /**
   * Returns true if two AABBs overlap in all three axes.
   */
  function aabbOverlap(a, b) {
    return a.minX < b.maxX && a.maxX > b.minX &&
           a.minY < b.maxY && a.maxY > b.minY &&
           a.minZ < b.maxZ && a.maxZ > b.minZ;
  }

  /**
   * Returns true if two AABBs overlap on the XZ plane only (flat test).
   * Useful for road-level collision ignoring height.
   */
  function aabbOverlapFlat(a, b) {
    return a.minX < b.maxX && a.maxX > b.minX &&
           a.minZ < b.maxZ && a.maxZ > b.minZ;
  }

  /**
   * Returns the penetration depth on each axis for overlapping AABBs.
   * Result: { x, y, z } — the axis with smallest value is the collision normal.
   * Returns null if there is no overlap.
   */
  function aabbPenetration(a, b) {
    if (!aabbOverlap(a, b)) return null;
    return {
      x: Math.min(a.maxX - b.minX, b.maxX - a.minX),
      y: Math.min(a.maxY - b.minY, b.maxY - a.minY),
      z: Math.min(a.maxZ - b.minZ, b.maxZ - a.minZ),
    };
  }

  /**
   * Returns the axis of minimum penetration depth from aabbPenetration().
   * Result: 'x' | 'y' | 'z' | null
   */
  function aabbMinAxis(pen) {
    if (!pen) return null;
    if (pen.x <= pen.y && pen.x <= pen.z) return 'x';
    if (pen.y <= pen.x && pen.y <= pen.z) return 'y';
    return 'z';
  }

  /**
   * Returns true if point {x,y,z} is inside AABB.
   */
  function aabbContainsPoint(aabb, x, y, z) {
    return x >= aabb.minX && x <= aabb.maxX &&
           y >= aabb.minY && y <= aabb.maxY &&
           z >= aabb.minZ && z <= aabb.maxZ;
  }

  /**
   * Expand an AABB by margin on all sides.  Returns a new AABB.
   */
  function aabbExpand(aabb, margin) {
    return makeAABB(
      aabb.cx, aabb.cy, aabb.cz,
      aabb.hw + margin, aabb.hh + margin, aabb.hd + margin
    );
  }

  /**
   * Simple 2-D OBB (Oriented Bounding Box) overlap test on the XZ plane.
   * Uses the Separating Axis Theorem with 4 axes (2 per box).
   *
   * @param {{cx,cz,hw,hd,angle}} a   box A: centre, half-widths, rotation radians
   * @param {{cx,cz,hw,hd,angle}} b   box B
   * @returns {boolean}
   */
  function obbOverlap2D(a, b) {
    function projectOntoAxis(box, ax, az) {
      const ca = Math.cos(box.angle), sa = Math.sin(box.angle);
      // Four corners
      const corners = [
        { x:  box.hw, z:  box.hd },
        { x: -box.hw, z:  box.hd },
        { x:  box.hw, z: -box.hd },
        { x: -box.hw, z: -box.hd },
      ];
      let mn = Infinity, mx = -Infinity;
      for (const c of corners) {
        const wx = box.cx + c.x * ca - c.z * sa;
        const wz = box.cz + c.x * sa + c.z * ca;
        const proj = wx * ax + wz * az;
        if (proj < mn) mn = proj;
        if (proj > mx) mx = proj;
      }
      return { mn, mx };
    }

    // Four separating axes (normals of each box's faces)
    const axes = [
      { ax: Math.cos(a.angle),  az: Math.sin(a.angle)  },
      { ax: -Math.sin(a.angle), az: Math.cos(a.angle)  },
      { ax: Math.cos(b.angle),  az: Math.sin(b.angle)  },
      { ax: -Math.sin(b.angle), az: Math.cos(b.angle)  },
    ];

    for (const { ax, az } of axes) {
      const pA = projectOntoAxis(a, ax, az);
      const pB = projectOntoAxis(b, ax, az);
      if (pA.mx < pB.mn || pB.mx < pA.mn) return false;  // gap found
    }
    return true;  // no gap on any axis → overlapping
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. ROAD / PATH UTILITIES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Project point P onto the infinite line defined by segment AB.
   * Returns the parameter t along AB (0 = at A, 1 = at B, outside = < 0 or > 1).
   *
   * @param {{x,z}} P
   * @param {{x,z}} A
   * @param {{x,z}} B
   * @returns {number} t
   */
  function projectPointOnSegment(P, A, B) {
    const AB  = vec2Sub(B, A);
    const AP  = vec2Sub(P, A);
    const len2 = vec2LenSq(AB);
    if (len2 < 1e-10) return 0;
    return vec2Dot(AP, AB) / len2;
  }

  /**
   * Returns the closest point on segment AB to point P (clamped to the segment).
   *
   * @param {{x,z}} P
   * @param {{x,z}} A
   * @param {{x,z}} B
   * @returns {{x,z}}
   */
  function closestPointOnSegment(P, A, B) {
    const t = clamp(projectPointOnSegment(P, A, B), 0, 1);
    return vec2Add(A, vec2Scale(vec2Sub(B, A), t));
  }

  /**
   * Signed distance from point P to the infinite line through A→B.
   * Positive = left side, negative = right side.
   */
  function signedDistToLine(P, A, B) {
    const AB = vec2Sub(B, A);
    const len = vec2Len(AB);
    if (len < 1e-10) return dist2D(P, A);
    // Perpendicular component
    return (AB.z * (P.x - A.x) - AB.x * (P.z - A.z)) / len;
  }

  /**
   * Snap a world position to the nearest road segment in a segments array.
   *
   * @param {{x,z}}        pos       World XZ position to snap.
   * @param {Array}        segments  Array of { x1,z1, x2,z2 } road segments.
   * @param {number}       [maxDist] Maximum snap distance (units). Default 20.
   * @returns {{ point:{x,z}, segment, t, dist, sideOffset } | null}
   */
  function snapToRoad(pos, segments, maxDist = 20) {
    let best = null;
    let bestDist = maxDist;

    for (const seg of segments) {
      const A = { x: seg.x1, z: seg.z1 };
      const B = { x: seg.x2, z: seg.z2 };
      const cp = closestPointOnSegment(pos, A, B);
      const d  = dist2D(pos, cp);
      if (d < bestDist) {
        bestDist = d;
        const t = clamp(projectPointOnSegment(pos, A, B), 0, 1);
        best = {
          point:      cp,
          segment:    seg,
          t,
          dist:       d,
          sideOffset: signedDistToLine(pos, A, B),
        };
      }
    }
    return best;
  }

  /**
   * Find the angle (radians) of a road segment for aligning a car to it.
   * 0 = pointing toward +Z, increases clockwise.
   */
  function roadSegmentAngle(seg) {
    return Math.atan2(seg.x2 - seg.x1, seg.z2 - seg.z1);
  }

  /**
   * Given a start position and a road network (array of segments with
   * shared endpoints), find the next waypoint position when travelling
   * along the road network in a simple forward direction.
   * Returns the end point of the current segment, favouring forward travel.
   *
   * @param {{x,z}}  pos       Current position.
   * @param {number} heading   Current heading in radians.
   * @param {Array}  segments  All road segments.
   * @returns {{x,z} | null}
   */
  function nextRoadWaypoint(pos, heading, segments) {
    const snap = snapToRoad(pos, segments, 12);
    if (!snap) return null;

    const seg = snap.segment;
    const end = snap.t > 0.5
      ? { x: seg.x2, z: seg.z2 }
      : { x: seg.x1, z: seg.z1 };

    return end;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9. COLOUR HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Unpack a 24-bit hex integer into { r, g, b } ∈ [0,255].
   */
  function hexToRgb(hex) {
    return {
      r: (hex >> 16) & 0xFF,
      g: (hex >>  8) & 0xFF,
      b:  hex        & 0xFF,
    };
  }

  /**
   * Pack { r, g, b } ∈ [0,255] back into a 24-bit integer.
   */
  function rgbToHex({ r, g, b }) {
    return ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
  }

  /**
   * Linearly interpolate between two hex colours.
   * @param {number} hexA
   * @param {number} hexB
   * @param {number} t    0 = hexA, 1 = hexB
   * @returns {number} interpolated hex integer
   */
  function lerpColor(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    return rgbToHex({
      r: Math.round(lerp(a.r, b.r, t)),
      g: Math.round(lerp(a.g, b.g, t)),
      b: Math.round(lerp(a.b, b.b, t)),
    });
  }

  /**
   * Convert HSL (h ∈ [0,360], s/l ∈ [0,1]) to a hex integer.
   */
  function hslToHex(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + h / 30) % 12;
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * c);
    };
    return rgbToHex({ r: f(0), g: f(8), b: f(4) });
  }

  /**
   * Convert a hex colour to a CSS `#rrggbb` string.
   */
  function hexToCss(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  /**
   * Convert a CSS `#rrggbb` or `#rgb` string to a hex integer.
   */
  function cssToHex(css) {
    const s = css.replace('#', '');
    const full = s.length === 3
      ? s.split('').map(c => c + c).join('')
      : s;
    return parseInt(full, 16);
  }

  /**
   * Lighten a hex colour by factor f ∈ [0,1] (1 = white).
   */
  function lightenColor(hex, f) { return lerpColor(hex, 0xFFFFFF, f); }

  /**
   * Darken a hex colour by factor f ∈ [0,1] (1 = black).
   */
  function darkenColor(hex, f)  { return lerpColor(hex, 0x000000, f); }

  // ══════════════════════════════════════════════════════════════════════════
  // 10. BÉZIER & SPLINE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate a quadratic Bézier curve at parameter t ∈ [0,1].
   * P0, P1, P2 are {x,z} control points.
   */
  function bezierQuadratic(P0, P1, P2, t) {
    const mt = 1 - t;
    return {
      x: mt*mt*P0.x + 2*mt*t*P1.x + t*t*P2.x,
      z: mt*mt*P0.z + 2*mt*t*P1.z + t*t*P2.z,
    };
  }

  /**
   * Evaluate a cubic Bézier curve at parameter t ∈ [0,1].
   * P0–P3 are {x,z} control points.
   */
  function bezierCubic(P0, P1, P2, P3, t) {
    const mt = 1 - t;
    const mt2 = mt*mt, t2 = t*t;
    return {
      x: mt2*mt*P0.x + 3*mt2*t*P1.x + 3*mt*t2*P2.x + t2*t*P3.x,
      z: mt2*mt*P0.z + 3*mt2*t*P1.z + 3*mt*t2*P2.z + t2*t*P3.z,
    };
  }

  /**
   * Catmull-Rom spline through four {x,z} points at parameter t ∈ [0,1].
   * The curve passes through P1 and P2; P0 and P3 are tangent guides.
   */
  function catmullRom(P0, P1, P2, P3, t) {
    const t2 = t*t, t3 = t2*t;
    return {
      x: 0.5 * ((2*P1.x) + (-P0.x+P2.x)*t + (2*P0.x-5*P1.x+4*P2.x-P3.x)*t2 + (-P0.x+3*P1.x-3*P2.x+P3.x)*t3),
      z: 0.5 * ((2*P1.z) + (-P0.z+P2.z)*t + (2*P0.z-5*P1.z+4*P2.z-P3.z)*t2 + (-P0.z+3*P1.z-3*P2.z+P3.z)*t3),
    };
  }

  /**
   * Sample a Catmull-Rom spline at uniform arc-length intervals.
   * Returns an array of {x,z} points.
   *
   * @param {Array<{x,z}>} points   Control points (≥ 4).
   * @param {number}        samples  Number of output points.
   */
  function sampleSpline(points, samples) {
    const result = [];
    const n = points.length;
    for (let i = 0; i < samples; i++) {
      const global = (i / (samples - 1)) * (n - 3); // 0 → n-3
      const seg    = Math.floor(global);
      const t      = global - seg;
      const i0 = clamp(seg - 1, 0, n - 1);
      const i1 = clamp(seg,     0, n - 1);
      const i2 = clamp(seg + 1, 0, n - 1);
      const i3 = clamp(seg + 2, 0, n - 1);
      result.push(catmullRom(points[i0], points[i1], points[i2], points[i3], t));
    }
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 11. COORDINATE CONVERSION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Convert a world XZ position to minimap canvas pixel coordinates.
   *
   * @param {number} worldX
   * @param {number} worldZ
   * @param {number} playerX    Player world X (minimap centres on player).
   * @param {number} playerZ    Player world Z.
   * @param {number} mapRange   World units visible from centre to edge.
   * @param {number} canvasSize Canvas width/height in pixels (square assumed).
   * @returns {{ px: number, py: number }}
   */
  function worldToMinimap(worldX, worldZ, playerX, playerZ, mapRange, canvasSize) {
    const half = canvasSize / 2;
    const scale = half / mapRange;
    return {
      px: half + (worldX - playerX) * scale,
      py: half + (worldZ - playerZ) * scale,
    };
  }

  /**
   * Convert a world XZ position to normalised device coordinates (NDC)
   * for screen-space HUD elements like arrow indicators.
   *
   * Requires the Three.js camera's projection + view matrices.
   * Returns { x, y } in [−1,+1] × [+1,−1] (WebGL NDC space).
   *
   * @param {number} wx  World X
   * @param {number} wy  World Y
   * @param {number} wz  World Z
   * @param {THREE.Camera} camera
   * @returns {{ x: number, y: number, behindCamera: boolean }}
   */
  function worldToNDC(wx, wy, wz, camera) {
    // We work with plain objects to avoid a hard Three.js dependency here;
    // the camera's matrixWorldInverse and projectionMatrix are accessed
    // directly from the THREE.Camera instance passed in.
    const v = new THREE.Vector3(wx, wy, wz);
    v.project(camera);
    return {
      x:             v.x,
      y:             v.y,
      behindCamera:  v.z > 1,
    };
  }

  /**
   * Convert NDC (x,y in [−1,+1]) to screen pixel coordinates.
   *
   * @param {number} ndcX
   * @param {number} ndcY
   * @param {number} screenW  window.innerWidth
   * @param {number} screenH  window.innerHeight
   * @returns {{ px: number, py: number }}
   */
  function ndcToScreen(ndcX, ndcY, screenW, screenH) {
    return {
      px: (ndcX + 1) / 2 * screenW,
      py: (1 - ndcY) / 2 * screenH,
    };
  }

  /**
   * Clamp a screen-space point to the HUD edge (for off-screen indicators).
   * Returns the clamped position and the direction angle pointing toward
   * the off-screen target.
   *
   * @param {number} px       Raw screen X (may be outside screen).
   * @param {number} py       Raw screen Y.
   * @param {number} screenW
   * @param {number} screenH
   * @param {number} margin   Pixels from edge to clamp to.
   * @returns {{ px, py, angle, clipped }}
   */
  function clampToScreen(px, py, screenW, screenH, margin = 40) {
    const cx = screenW / 2, cy = screenH / 2;
    const dx = px - cx,     dy = py - cy;
    const angle = Math.atan2(dy, dx);

    const hw = screenW / 2 - margin;
    const hh = screenH / 2 - margin;

    let clipped = false;
    let ox = px, oy = py;

    if (Math.abs(dx) > hw || Math.abs(dy) > hh) {
      clipped = true;
      const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
      const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
      const scale  = Math.min(scaleX, scaleY);
      ox = cx + dx * scale;
      oy = cy + dy * scale;
    }

    return { px: ox, py: oy, angle, clipped };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 12. PHYSICS HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Apply drag to a velocity component over dt seconds.
   * drag coefficient is the fraction of velocity lost per second (0–1).
   *
   * @param {number} velocity
   * @param {number} drag       0 = no drag, 1 = instant stop
   * @param {number} dt
   * @returns {number}
   */
  function applyDrag(velocity, drag, dt) {
    return velocity * Math.pow(1 - clamp(drag, 0, 1), dt);
  }

  /**
   * Move a value toward a target at a constant rate per second.
   * Never overshoots. Good for non-spring steering and camera lerp.
   *
   * @param {number} current
   * @param {number} target
   * @param {number} maxDelta  Max change per second.
   * @param {number} dt
   * @returns {number}
   */
  function moveToward(current, target, maxDelta, dt) {
    const delta = target - current;
    const step  = maxDelta * dt;
    if (Math.abs(delta) <= step) return target;
    return current + sign(delta) * step;
  }

  /**
   * Spring-damper — smoothly follows a target with configurable
   * stiffness and damping. Returns updated { value, velocity }.
   *
   * @param {number} value       Current value.
   * @param {number} velocity    Current velocity.
   * @param {number} target      Target value.
   * @param {number} stiffness   Spring constant (higher = stiffer).
   * @param {number} damping     Damping ratio (1.0 = critically damped).
   * @param {number} dt          Delta time in seconds.
   * @returns {{ value: number, velocity: number }}
   */
  function springDamper(value, velocity, target, stiffness, damping, dt) {
    const force = -stiffness * (value - target) - damping * velocity;
    const newVel = velocity + force * dt;
    const newVal = value + newVel * dt;
    return { value: newVal, velocity: newVel };
  }

  /**
   * Compute the impact impulse magnitude when two objects collide.
   *
   * @param {number} relativeSpeedAlongNormal  Dot of relative velocity with collision normal.
   * @param {number} massA
   * @param {number} massB
   * @param {number} restitution   0 = perfectly inelastic, 1 = perfectly elastic.
   * @returns {number}  Impulse magnitude (apply as ± along normal for each body).
   */
  function collisionImpulse(relativeSpeedAlongNormal, massA, massB, restitution) {
    return -(1 + restitution) * relativeSpeedAlongNormal / (1/massA + 1/massB);
  }

  /**
   * Convert an impact speed (m/s) to a damage amount using the
   * CONFIG thresholds and damage-per-impact constant.
   *
   * @param {number} speed     Impact speed in m/s.
   * @param {number} threshold Minimum speed to cause damage (m/s).
   * @param {number} dpI       Damage fraction per 1 m/s above threshold.
   * @param {number} armorMult Armour damage reduction multiplier (0–1).
   * @returns {number}  Damage percentage (0–100 scale).
   */
  function impactDamage(speed, threshold, dpI, armorMult = 1) {
    if (speed < threshold) return 0;
    return clamp((speed - threshold) * dpI * armorMult * 100, 0, 100);
  }

  /**
   * Format a time in seconds to a MM:SS.ms display string.
   * @param {number} seconds
   * @param {boolean} [showMs=false]
   * @returns {string}
   */
  function formatTime(seconds, showMs = false) {
    const m  = Math.floor(seconds / 60);
    const s  = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    const base = `${m}:${String(s).padStart(2,'0')}`;
    return showMs ? `${base}.${String(ms).padStart(2,'0')}` : base;
  }

  /**
   * Format a money amount as a compact string (e.g. $1,200 or $1.2K).
   * @param {number}  amount
   * @param {boolean} [compact=false]
   * @returns {string}
   */
  function formatMoney(amount, compact = false) {
    if (compact && amount >= 1000) {
      return '$' + (amount / 1000).toFixed(1) + 'K';
    }
    return '$' + amount.toLocaleString('en-US');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({
    // Constants
    TWO_PI, HALF_PI, DEG2RAD, RAD2DEG,

    // Scalar
    clamp, lerp, invLerp, remap, smoothstep, smoothstep3,
    snap, sign, inRange, wrap, mod, approxEqual, roundTo,
    kmhToMs, msToKmh,

    // Angles
    degToRad, radToDeg, normaliseAngle, angleDelta, lerpAngle,
    moveTowardAngle, headingToCompass, angleTo2D,

    // Easing
    Ease,

    // Random
    randFloat, randInt, randBool, randPick, shuffle,
    randGaussian, createRNG,

    // 2-D vectors
    vec2, vec2Add, vec2Sub, vec2Scale, vec2Dot,
    vec2LenSq, vec2Len, vec2Norm, vec2Perp, vec2Lerp,
    vec2Rotate, dist2D, dist2DSq,

    // 3-D vectors
    vec3, vec3Add, vec3Sub, vec3Scale, vec3Dot,
    vec3LenSq, vec3Len, vec3Norm, vec3Cross, vec3Lerp,
    vec3Reflect, dist3D, distFlat,

    // AABB
    makeAABB, aabbOverlap, aabbOverlapFlat, aabbPenetration,
    aabbMinAxis, aabbContainsPoint, aabbExpand, obbOverlap2D,

    // Road / path
    projectPointOnSegment, closestPointOnSegment,
    signedDistToLine, snapToRoad, roadSegmentAngle,
    nextRoadWaypoint,

    // Colour
    hexToRgb, rgbToHex, lerpColor, hslToHex,
    hexToCss, cssToHex, lightenColor, darkenColor,

    // Bézier / spline
    bezierQuadratic, bezierCubic, catmullRom, sampleSpline,

    // Coordinate conversion
    worldToMinimap, worldToNDC, ndcToScreen, clampToScreen,

    // Physics
    applyDrag, moveToward, springDamper,
    collisionImpulse, impactDamage,

    // Formatting
    formatTime, formatMoney,
  });

})();

// Global access — every other module can use MathUtils.clamp(), etc.
// No module system needed; loaded via plain <script> tags.
if (typeof module !== 'undefined') module.exports = MathUtils;
