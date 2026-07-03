/* =========================================================
FILE 17: js/utils/debug.js

This file contains small debugging helpers for development.

Purpose:

- Provide consistent logging tools
- Make debug output easier to enable or disable
- Keep development helpers out of gameplay logic
- Support future collision, level, and state inspection tools

This file should remain optional and lightweight.
It should never be required for the game to run.
========================================================= */

/* ---------------------------------------------------------
LOGGING CONTROLS
--------------------------------------------------------- */

/**

* Print a labeled debug message to the console.
  */
  function debugLog(label, ...args) {
  if (typeof console === "undefined") return;
  console.log("[DEBUG] ${label}", ...args);
  }

/**

* Print a warning message in a consistent format.
  */
  function debugWarn(label, ...args) {
  if (typeof console === "undefined") return;
  console.warn("[DEBUG] ${label}", ...args);
  }

/**

* Print an error message in a consistent format.
  */
  function debugError(label, ...args) {
  if (typeof console === "undefined") return;
  console.error("[DEBUG] ${label}", ...args);
  }

/**

* Print a collapsed group in the console.
  */
  function debugGroup(label) {
  if (typeof console === "undefined" || typeof console.groupCollapsed !== "function") return;
  console.groupCollapsed("[DEBUG] ${label}");
  }

/**

* End the current debug group.
  */
  function debugGroupEnd() {
  if (typeof console === "undefined" || typeof console.groupEnd !== "function") return;
  console.groupEnd();
  }

/* ---------------------------------------------------------
STATE INSPECTION
--------------------------------------------------------- */

/**

* Print a labeled object snapshot.
  */
  function debugState(label, state) {
  if (typeof console === "undefined") return;
  console.log("[STATE] ${label}", structuredCloneSafe(state));
  }

/**

* Safely clone simple state for logging.
* Falls back to the original object when cloning fails.
  */
  function structuredCloneSafe(value) {
  try {
  if (typeof structuredClone === "function") {
  return structuredClone(value);
  }
  } catch {
  // Ignore clone failures and fall through.
  }

try {
return JSON.parse(JSON.stringify(value));
} catch {
return value;
}
}

/**

* Format a value for compact debug output.
  */
  function formatDebugValue(value) {
  if (value == null) return String(value);
  if (typeof value === "string") return ""${value}"";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return "[Array(${value.length})]";
  if (typeof value === "object") return "{${Object.keys(value).join(", ")}}";
  return String(value);
  }

/* ---------------------------------------------------------
TIMING HELPERS
--------------------------------------------------------- */

/**

* Measure how long a function takes to run.
* Returns the function result and logs the elapsed time.
  */
  function debugMeasure(label, fn) {
  const start = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  const result = fn();
  const end = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

debugLog("${label} took ${Math.round((end - start) * 1000) / 1000}ms");
return result;
}

/**

* Create a simple step timer for repeated measurements.
  */
  function createDebugTimer(label = "timer") {
  let startedAt = 0;

return {
start() {
startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
},

stop(message = label) {
  if (!startedAt) return 0;

  const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  const elapsed = now - startedAt;
  startedAt = 0;

  debugLog(`${message}: ${Math.round(elapsed * 1000) / 1000}ms`);
  return elapsed;
}

};
}

/* ---------------------------------------------------------
ASSERTIONS
--------------------------------------------------------- */

/**

* Assert that a condition is true.
* Throws an error when the condition fails.
  */
  function debugAssert(condition, message = "Assertion failed") {
  if (!condition) {
  throw new Error(message);
  }
  }

/**

* Assert that a value is not null or undefined.
  */
  function debugExists(value, message = "Expected value to exist") {
  if (value === null || value === undefined) {
  throw new Error(message);
  }
  return value;
  }

/* ---------------------------------------------------------
UI HELPERS
--------------------------------------------------------- */

/**

* Write a value into a debug text element if present.
  */
  function setDebugText(element, value) {
  if (!element) return false;
  element.textContent = String(value);
  return true;
  }

/**

* Update multiple debug fields from an object map.
  */
  function setDebugFields(fields = {}, values = {}) {
  if (!fields || typeof fields !== "object") return false;

for (const [key, element] of Object.entries(fields)) {
if (!element) continue;
if (!(key in values)) continue;
element.textContent = String(values[key]);
}

return true;
}

/**

* Show or hide a debug panel.
  */
  function setDebugVisible(element, visible) {
  if (!element) return false;
  element.hidden = !visible;
  return true;
  }

/* ---------------------------------------------------------
COLOR HELPERS
--------------------------------------------------------- */

/**

* Convert a number to a two-digit hexadecimal string.
  */
  function toHexByte(value) {
  const clamped = Math.max(0, Math.min(255, Math.round(value || 0)));
  return clamped.toString(16).padStart(2, "0");
  }

/**

* Build a hex color string from RGB components.
  */
  function rgbToHex(r, g, b) {
  return "#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}";
  }

/* ---------------------------------------------------------
EXPORTS
--------------------------------------------------------- */

export {
debugLog,
debugWarn,
debugError,
debugGroup,
debugGroupEnd,
debugState,
structuredCloneSafe,
formatDebugValue,
debugMeasure,
createDebugTimer,
debugAssert,
debugExists,
setDebugText,
setDebugFields,
setDebugVisible,
toHexByte,
rgbToHex
};

export default {
debugLog,
debugWarn,
debugError,
debugGroup,
debugGroupEnd,
debugState,
structuredCloneSafe,
formatDebugValue,
debugMeasure,
createDebugTimer,
debugAssert,
debugExists,
setDebugText,
setDebugFields,
setDebugVisible,
toHexByte,
rgbToHex
};
