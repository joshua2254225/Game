/*
================================================================================
 FARMERS FARM  —  src/input/devices/TouchDevice.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 1 — Input Layer   |   FILE 20 of the project
 DEPENDS ON  : src/input/InputTranslator.js (file 17) — translateDragDelta()
               and translateZoomDelta(), the same two functions
               MouseDevice.js uses. No CommandQueue import, same reasoning
               as that file: nothing here sets a HELD command.
 USED BY     : src/input/InputManager.js (file 23) — instantiated
               unconditionally on every device; touch events simply never
               fire on a mouse-and-keyboard desktop.
================================================================================
 WHAT THIS FILE DOES
   The touch equivalent of MouseDevice.js: one finger dragging rotates the
   camera, two fingers pinching zoom it. This is the most involved of the
   five device files because, unlike a mouse, touch input can shift
   between "modes" mid-gesture — a second finger can land while the first
   is still dragging, or one finger of a pinch can lift while the other
   stays down — and each of those transitions needs a clean reference
   point or the very next movement reads as a huge, jarring jump.

 HOW THE MODE-SWITCHING IS HANDLED
   Rather than tracking a separate "current mode" flag that could get out
   of sync with reality, every handler just asks event.touches.length
   directly: 1 touch means drag, 2+ means pinch. #resync() is called from
   BOTH touchstart and touchend/touchcancel — any event that changes how
   many fingers are down — and re-establishes whichever reference point
   (#lastX for drag, #lastPinchDistance for pinch) the NEW touch count
   needs. touchmove never resets anything; it only reads the reference
   point #resync already set up and reports the difference.

 THIS GAME'S CAMERA_ZOOM SIGN CONVENTION (stated here for the first time,
 applies equally to MouseDevice.js's raw wheel deltaY passthrough)
   Positive = zoom out, negative = zoom in. Fingers moving apart
   (deltaDistance increases) is a zoom-IN gesture, so the sign is flipped
   below before it's sent on.

 preventDefault() ALONGSIDE touch-action: none — belt and suspenders,
 not redundant
   css/base/reset.css already sets touch-action: none globally, which
   should stop the browser's native pinch-zoom/scroll on its own. The
   explicit preventDefault() calls here are a defensive second layer in
   case any future file ever sets a different touch-action on some
   in-between element without realizing the consequence. Both listeners
   below need { passive: false } for preventDefault() to have any effect
   at all — see MouseDevice.js's header for why that flag matters.
================================================================================
*/

import { translateDragDelta, translateZoomDelta } from '../InputTranslator.js';

/**
 * @param {Touch} touchA
 * @param {Touch} touchB
 * @returns {number} Straight-line distance between two touch points.
 */
function getPinchDistance(touchA, touchB) {
  const dx = touchB.clientX - touchA.clientX;
  const dy = touchB.clientY - touchA.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * TouchDevice — listens for single-finger drag (camera rotate) and
 * two-finger pinch (camera zoom), reporting resolved deltas to
 * InputTranslator.js exactly like MouseDevice.js does for desktop.
 */
export class TouchDevice {
  #lastX = 0;
  #lastPinchDistance = 0;
  #isListening = false;

  /**
   * Re-establishes whichever reference point the CURRENT touch count
   * needs. Called whenever the number of fingers down changes.
   * @param {TouchList} touches
   */
  #resync(touches) {
    if (touches.length === 1) {
      this.#lastX = touches[0].clientX;
    } else if (touches.length >= 2) {
      this.#lastPinchDistance = getPinchDistance(touches[0], touches[1]);
    }
    // touches.length === 0: nothing left to track, gesture fully ended.
  }

  /** @param {TouchEvent} event */
  #handleTouchStart = (event) => {
    event.preventDefault();
    this.#resync(event.touches);
  };

  /** @param {TouchEvent} event */
  #handleTouchMove = (event) => {
    event.preventDefault();

    const touches = event.touches;

    if (touches.length === 1) {
      const deltaX = touches[0].clientX - this.#lastX;
      this.#lastX = touches[0].clientX;
      translateDragDelta(deltaX);
    } else if (touches.length >= 2) {
      const currentDistance = getPinchDistance(touches[0], touches[1]);
      const deltaDistance = currentDistance - this.#lastPinchDistance;
      this.#lastPinchDistance = currentDistance;
      translateZoomDelta(-deltaDistance); // apart = zoom in = negative, see file header
    }
  };

  /**
   * Shared by touchend AND touchcancel — an interrupted gesture (an
   * incoming call, a system swipe) needs the exact same cleanup as a
   * normal finger lift, or the next gesture would start from stale data.
   * @param {TouchEvent} event
   */
  #handleTouchEndOrCancel = (event) => {
    this.#resync(event.touches);
  };

  /** Starts listening. Safe to call again while already listening — no-ops. */
  start() {
    if (this.#isListening) return;
    this.#isListening = true;

    window.addEventListener('touchstart', this.#handleTouchStart, { passive: false });
    window.addEventListener('touchmove', this.#handleTouchMove, { passive: false });
    window.addEventListener('touchend', this.#handleTouchEndOrCancel);
    window.addEventListener('touchcancel', this.#handleTouchEndOrCancel);
  }

  /** Stops listening. */
  stop() {
    if (!this.#isListening) return;
    this.#isListening = false;

    window.removeEventListener('touchstart', this.#handleTouchStart);
    window.removeEventListener('touchmove', this.#handleTouchMove);
    window.removeEventListener('touchend', this.#handleTouchEndOrCancel);
    window.removeEventListener('touchcancel', this.#handleTouchEndOrCancel);
  }
}
