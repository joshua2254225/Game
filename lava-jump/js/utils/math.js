/* =========================================================
FILE 13: js/utils/math.js

This file contains reusable math helpers for the game.

Purpose:

- Keep common math operations in one place
- Avoid repeating small utility logic everywhere
- Make movement, collision, camera, and UI code cleaner
- Provide safe helpers for future game systems

This file is utility-only.
It should not know anything about game rules.
========================================================= */

/* ---------------------------------------------------------
BASIC HELPERS
--------------------------------------------------------- */

/**

* Clamp a number between a minimum and maximum value.
* Useful for keeping values inside safe ranges.
  */
  function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
  }

/**

* Linear interpolation.
* Returns a value between a and b based on t.
* t usually ranges from 0 to 1.
  */
  function lerp(a, b, t) {
  return a + (b - a) * t;
  }

/**

* Inverse lerp.
* Converts a value into a normalized position between a and b.
* Returns a number usually between 0 and 1.
  */
  function inverseLerp(a, b, value) {
  if (a === b) return 0;
  return (value - a) / (b - a);
  }

/**

* Maps a value from one range into another range.
  */
  function mapRange(value, inMin, inMax, outMin, outMax) {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
  }

/**

* Returns true if a number is close enough to another number.
  */
  function nearlyEqual(a, b, epsilon = 0.00001) {
  return Math.abs(a - b) <= epsilon;
  }

/* ---------------------------------------------------------
ANGLES
--------------------------------------------------------- */

/**

* Convert degrees to radians.
  */
  function degToRad(degrees) {
  return degrees * (Math.PI / 180);
  }

/**

* Convert radians to degrees.
  */
  function radToDeg(radians) {
  return radians * (180 / Math.PI);
  }

/**

* Wrap an angle in radians into the range -PI to PI.
  */
  function wrapRadians(angle) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
  }

/**

* Wrap an angle in degrees into the range 0 to 360.
  */
  function wrapDegrees(angle) {
  let result = angle % 360;
  if (result < 0) result += 360;
  return result;
  }

/* ---------------------------------------------------------
VECTOR HELPERS
--------------------------------------------------------- */

/**

* Create a simple 3D vector object.
* This is intentionally plain so it works without any library.
  */
  function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
  }

/**

* Copy values from one vector-like object into another.
  */
  function copyVec3(target, source) {
  if (!target || !source) return target;

target.x = source.x ?? 0;
target.y = source.y ?? 0;
target.z = source.z ?? 0;
return target;
}

/**

* Add two vectors and return a new vector.
  */
  function addVec3(a, b) {
  return vec3(
  (a?.x ?? 0) + (b?.x ?? 0),
  (a?.y ?? 0) + (b?.y ?? 0),
  (a?.z ?? 0) + (b?.z ?? 0)
  );
  }

/**

* Subtract vector b from vector a and return a new vector.
  */
  function subtractVec3(a, b) {
  return vec3(
  (a?.x ?? 0) - (b?.x ?? 0),
  (a?.y ?? 0) - (b?.y ?? 0),
  (a?.z ?? 0) - (b?.z ?? 0)
  );
  }

/**

* Multiply a vector by a scalar and return a new vector.
  */
  function scaleVec3(v, scalar) {
  return vec3(
  (v?.x ?? 0) * scalar,
  (v?.y ?? 0) * scalar,
  (v?.z ?? 0) * scalar
  );
  }

/**

* Compute the dot product of two vectors.
  */
  function dotVec3(a, b) {
  return (
  (a?.x ?? 0) * (b?.x ?? 0) +
  (a?.y ?? 0) * (b?.y ?? 0) +
  (a?.z ?? 0) * (b?.z ?? 0)
  );
  }

/**

* Compute the length of a 3D vector.
  */
  function lengthVec3(v) {
  return Math.sqrt(dotVec3(v, v));
  }

/**

* Compute the squared length of a 3D vector.
* Useful when we want to avoid a square root for performance.
  */
  function lengthSquaredVec3(v) {
  return dotVec3(v, v);
  }

/**

* Normalize a vector.
* If the vector is too small, return a zero vector.
  */
  function normalizeVec3(v) {
  const len = lengthVec3(v);
  if (len <= 0.00001) {
  return vec3(0, 0, 0);
  }

return scaleVec3(v, 1 / len);
}

/**

* Compute the distance between two 3D points.
  */
  function distanceVec3(a, b) {
  return lengthVec3(subtractVec3(a, b));
  }

/**

* Compute the squared distance between two 3D points.
  */
  function distanceSquaredVec3(a, b) {
  return lengthSquaredVec3(subtractVec3(a, b));
  }

/**

* Clamp a vector's length to a maximum value.
  */
  function clampVec3Length(v, maxLength) {
  const len = lengthVec3(v);
  if (len <= maxLength) return vec3(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0);
  if (len <= 0.00001) return vec3(0, 0, 0);

const scale = maxLength / len;
return scaleVec3(v, scale);
}

/* ---------------------------------------------------------
RANDOM HELPERS
--------------------------------------------------------- */

/**

* Random number between min and max.
  */
  function randomRange(min, max) {
  return min + Math.random() * (max - min);
  }

/**

* Random integer between min and max, inclusive.
  */
  function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
  }

/**

* Return a random item from an array.
  */
  function randomChoice(array) {
  if (!Array.isArray(array) || array.length === 0) return undefined;
  return array[randomInt(0, array.length - 1)];
  }

/**

* Randomly return true with the given probability.
* Example: chance(0.25) returns true about 25% of the time.
  */
  function chance(probability) {
  return Math.random() < probability;
  }

/* ---------------------------------------------------------
SMOOTHING / TWEEN HELPERS
--------------------------------------------------------- */

/**

* Smoothly move a value toward a target using a factor.
* Good for camera smoothing or UI transitions.
  */
  function approach(current, target, delta) {
  if (current < target) return Math.min(current + delta, target);
  if (current > target) return Math.max(current - delta, target);
  return target;
  }

/**

* Smooth damp-style helper.
* This is a simple version, useful for gentle motion.
  */
  function smoothStep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
  }

/* ---------------------------------------------------------
COLLISION / GEOMETRY HELPERS
--------------------------------------------------------- */

/**

* Check whether two axis-aligned boxes overlap.
* Boxes should be expressed as min/max objects:
* { minX, minY, minZ, maxX, maxY, maxZ }
  */
  function aabbIntersects(a, b) {
  if (!a || !b) return false;

return (
a.minX <= b.maxX &&
a.maxX >= b.minX &&
a.minY <= b.maxY &&
a.maxY >= b.minY &&
a.minZ <= b.maxZ &&
a.maxZ >= b.minZ
);
}

/**

* Check whether a point lies inside an AABB.
  */
  function pointInAabb(point, box) {
  if (!point || !box) return false;

return (
point.x >= box.minX &&
point.x <= box.maxX &&
point.y >= box.minY &&
point.y <= box.maxY &&
point.z >= box.minZ &&
point.z <= box.maxZ
);
}

/**

* Expand a box by the same amount in every direction.
  */
  function expandAabb(box, amount) {
  if (!box) return null;

return {
minX: box.minX - amount,
minY: box.minY - amount,
minZ: box.minZ - amount,
maxX: box.maxX + amount,
maxY: box.maxY + amount,
maxZ: box.maxZ + amount
};
}

/**

* Build an AABB from a center point and size.
  */
  function aabbFromCenterSize(center, size) {
  const halfX = (size?.x ?? 0) / 2;
  const halfY = (size?.y ?? 0) / 2;
  const halfZ = (size?.z ?? 0) / 2;

return {
minX: (center?.x ?? 0) - halfX,
minY: (center?.y ?? 0) - halfY,
minZ: (center?.z ?? 0) - halfZ,
maxX: (center?.x ?? 0) + halfX,
maxY: (center?.y ?? 0) + halfY,
maxZ: (center?.z ?? 0) + halfZ
};
}

/**

* Return the center point of an AABB.
  */
  function aabbCenter(box) {
  if (!box) return vec3();

return vec3(
(box.minX + box.maxX) / 2,
(box.minY + box.maxY) / 2,
(box.minZ + box.maxZ) / 2
);
}

/* ---------------------------------------------------------
ARRAY / VALUE HELPERS
--------------------------------------------------------- */

/**

* Remove an item from an array by value.
* Returns true if something was removed.
  */
  function removeFromArray(array, item) {
  if (!Array.isArray(array)) return false;

const index = array.indexOf(item);
if (index === -1) return false;

array.splice(index, 1);
return true;
}

/**

* Clear an array without creating a new one.
  */
  function clearArray(array) {
  if (!Array.isArray(array)) return array;
  array.length = 0;
  return array;
  }

/**

* Return the sign of a number, but treat zero as zero.
  */
  function sign(value) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
  }

/* ---------------------------------------------------------
EXPORTS
--------------------------------------------------------- */

export {
clamp,
lerp,
inverseLerp,
mapRange,
nearlyEqual,
degToRad,
radToDeg,
wrapRadians,
wrapDegrees,
vec3,
copyVec3,
addVec3,
subtractVec3,
scaleVec3,
dotVec3,
lengthVec3,
lengthSquaredVec3,
normalizeVec3,
distanceVec3,
distanceSquaredVec3,
clampVec3Length,
randomRange,
randomInt,
randomChoice,
chance,
approach,
smoothStep,
aabbIntersects,
pointInAabb,
expandAabb,
aabbFromCenterSize,
aabbCenter,
removeFromArray,
clearArray,
sign
};

export default {
clamp,
lerp,
inverseLerp,
mapRange,
nearlyEqual,
degToRad,
radToDeg,
wrapRadians,
wrapDegrees,
vec3,
copyVec3,
addVec3,
subtractVec3,
scaleVec3,
dotVec3,
lengthVec3,
lengthSquaredVec3,
normalizeVec3,
distanceVec3,
distanceSquaredVec3,
clampVec3Length,
randomRange,
randomInt,
randomChoice,
chance,
approach,
smoothStep,
aabbIntersects,
pointInAabb,
expandAabb,
aabbFromCenterSize,
aabbCenter,
removeFromArray,
clearArray,
sign
};
