/*
================================================================================
 FARMERS FARM  —  src/input/devices/MouseDevice.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 1 — Input Layer   |   FILE 19 of the project
 DEPENDS ON  : src/input/InputTranslator.js (file 17) — translateDragDelta()
               and translateZoomDelta() specifically. Does NOT need
               CommandQueue.js at all, unlike KeyboardDevice.js — see the
               note on window blur below for why.
 USED BY     : src/input/InputManager.js (file 23) — instantiated
               unconditionally on every device, same reasoning as
               KeyboardDevice.js: mouse events simply never fire on a
               pure touchscreen, so no device-type branching is needed here.
================================================================================
 WHAT THIS FILE DOES
   Implements the "hold and slide" camera gesture from the original brief
   for mouse users: right-button-drag rotates the camera, the wheel zooms
   it. This is also where the gesture-detection responsibility
   InputTranslator.js's header explicitly deferred gets implemented —
   deciding WHEN a drag is genuinely in progress lives here; that file
   just receives a trusted delta once this file decides one occurred.

 WHY RIGHT-CLICK-DRAG, NOT LEFT-CLICK
   The brief didn't specify a button. Right-click-drag for camera control
   is a well-established convention (common across simulation/strategy
   games) that leaves left-click free for a future click-to-interact or
   selection mechanic without the two ever competing for the same input.
   Easy to change in one place (DRAG_BUTTON below) if playtesting says
   otherwise.

 THREE DETAILS THAT ARE EASY TO GET WRONG HERE
   1. contextmenu SUPPRESSION — without preventDefault() on 'contextmenu',
      right-clicking to rotate the camera would also pop up the browser's
      native right-click menu on top of the game.
   2. DRAG ENDING OUTSIDE THE WINDOW — if the player drags fast enough and
      releases the button after the cursor has left the browser window
      entirely, no mouseup ever fires here to end the drag. #handleMouseMove
      defends against this by checking event.buttons directly on every
      move — if the right-button bit is gone, the drag silently ended
      somewhere we didn't catch, so it's treated as over right there.
   3. wheel EVENTS DEFAULT TO PASSIVE in modern browsers, which SILENTLY
      IGNORES preventDefault() calls inside the handler unless the
      listener is explicitly registered with { passive: false }. Missing
      this is a common, confusing bug — "preventDefault does nothing" —
      so it's called out explicitly at the addEventListener call below.
      (The same issue applies to touchstart/touchmove in TouchDevice.js,
      file 20, next.)

 WHY NO CommandQueue IMPORT, UNLIKE KeyboardDevice.js
   CAMERA_ROTATE and CAMERA_ZOOM are VALUE-CARRYING commands (per
   CommandTypes.js), not HELD ones — there's no persistent "active" state
   in commandQueue that a lost window-blur event could leave stuck. Losing
   focus mid-drag only needs to reset this file's OWN #isDragging flag,
   handled locally below, with nothing to clean up on the shared queue.
================================================================================
*/

import { translateDragDelta, translateZoomDelta } from '../InputTranslator.js';

/** Which mouse button triggers camera-rotate drag. 2 = right button. */
const DRAG_BUTTON = 2;

/** Bit for the right button within MouseEvent.buttons' bitmask, used to
 *  detect a drag that ended outside the window — see file header, point 2. */
const RIGHT_BUTTON_BIT = 2;

/**
 * MouseDevice — listens for right-click-drag (camera rotate) and wheel
 * (camera zoom), reporting resolved deltas to InputTranslator.js.
 */
export class MouseDevice {
  #isDragging = false;
  #lastX = 0;
  #isListening = false;

  /** @param {MouseEvent} event */
  #handleMouseDown = (event) => {
    if (event.button !== DRAG_BUTTON) return;
    this.#isDragging = true;
    this.#lastX = event.clientX;
  };

  /** @param {MouseEvent} event */
  #handleMouseMove = (event) => {
    if (!this.#isDragging) return;

    if (!(event.buttons & RIGHT_BUTTON_BIT)) {
      // The button was released somewhere we never got a mouseup for
      // (e.g. outside the browser window) — treat the drag as over.
      this.#isDragging = false;
      return;
    }

    const deltaX = event.clientX - this.#lastX;
    this.#lastX = event.clientX;
    translateDragDelta(deltaX);
  };

  /** @param {MouseEvent} event */
  #handleMouseUp = (event) => {
    if (event.button !== DRAG_BUTTON) return;
    this.#isDragging = false;
  };

  /** @param {MouseEvent} event */
  #handleContextMenu = (event) => {
    event.preventDefault();
  };

  /** @param {WheelEvent} event */
  #handleWheel = (event) => {
    event.preventDefault();
    translateZoomDelta(event.deltaY);
  };

  #handleWindowBlur = () => {
    this.#isDragging = false;
  };

  /** Starts listening. Safe to call again while already listening — no-ops. */
  start() {
    if (this.#isListening) return;
    this.#isListening = true;

    window.addEventListener('mousedown', this.#handleMouseDown);
    window.addEventListener('mousemove', this.#handleMouseMove);
    window.addEventListener('mouseup', this.#handleMouseUp);
    window.addEventListener('contextmenu', this.#handleContextMenu);
    // passive: false is required here — see file header, point 3.
    window.addEventListener('wheel', this.#handleWheel, { passive: false });
    window.addEventListener('blur', this.#handleWindowBlur);
  }

  /** Stops listening and resets local drag state. */
  stop() {
    if (!this.#isListening) return;
    this.#isListening = false;

    window.removeEventListener('mousedown', this.#handleMouseDown);
    window.removeEventListener('mousemove', this.#handleMouseMove);
    window.removeEventListener('mouseup', this.#handleMouseUp);
    window.removeEventListener('contextmenu', this.#handleContextMenu);
    window.removeEventListener('wheel', this.#handleWheel);
    window.removeEventListener('blur', this.#handleWindowBlur);

    this.#isDragging = false;
  }
}
