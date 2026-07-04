/*
================================================================================
 FARMERS FARM  —  src/input/devices/DeviceDetector.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 1 — Input Layer   |   FILE 15 of the project
 DEPENDS ON  : nothing — uses only the browser-native window.matchMedia API.
 USED BY     : src/input/InputManager.js (file 23, last of this phase) —
               will call detectDevice() once during setup to decide whether
               VirtualJoystickDevice.js / VirtualButtonDevice.js should be
               instantiated at all.
================================================================================
 WHAT THIS FILE DOES
   A single, one-time check — "is touch this device's PRIMARY input?" — run
   once at boot, not watched for changes afterward (a hybrid device
   switching input modes mid-session is a genuinely rare edge case this
   project isn't taking on).

 WHY THIS ISN'T NEEDED FOR EVERY DEVICE FILE, ONLY THE VIRTUAL ONES
   KeyboardDevice.js, MouseDevice.js, and TouchDevice.js (files 18-20) are
   just event listeners with zero visual footprint — listening for
   keydown/mousedown/touchstart on a device that never fires them costs
   nothing, so InputManager.js can simply set up all three unconditionally,
   every time, regardless of device type. VirtualJoystickDevice.js and
   VirtualButtonDevice.js (files 21-22) are different: they render actual
   on-screen graphics, which would look wrong cluttering a desktop screen
   that will never receive a touch event. THIS file exists specifically to
   answer the one question that actually changes behavior: should those
   two get created at all.

 WHY (hover: none) and (pointer: coarse), NOT navigator.maxTouchPoints
   This is the exact same signal already used in css/layout/landscape-lock.css,
   for the exact same reason explained there: it reads actual input
   CAPABILITY rather than guessing from screen size or touch hardware
   presence. navigator.maxTouchPoints > 0 was deliberately not added as a
   fallback here, for the same reason a width-based fallback was rejected
   in that CSS file — plenty of touchscreen Windows laptops report
   maxTouchPoints > 0 while still being fundamentally mouse-and-keyboard
   devices; OR-ing that in would reintroduce false positives on exactly
   the hardware this check is meant to exclude. JS and CSS agreeing on one
   definition of "touch device" here, rather than each inventing their
   own, is the point.
================================================================================
*/

/**
 * @typedef {object} DeviceInfo
 * @property {boolean} isTouchPrimary - True when touch (not a mouse/
 *   trackpad) is this device's primary input. Drives whether the virtual
 *   joystick/buttons get created at all. Returned as an object rather than
 *   a bare boolean so more fields can be added later (e.g. platform
 *   detection, if a real need for it ever shows up) without changing this
 *   function's signature for existing callers.
 */

/**
 * Checks the current device's input capability once. Intended to be
 * called a single time, during InputManager's own setup — not polled or
 * watched for changes over the life of the session.
 *
 * @returns {DeviceInfo}
 */
export function detectDevice() {
  const isTouchPrimary = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  return {
    isTouchPrimary,
  };
}
