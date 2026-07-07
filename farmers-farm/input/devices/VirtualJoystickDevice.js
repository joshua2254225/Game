/*
================================================================================
 FARMERS FARM  —  src/input/devices/VirtualJoystickDevice.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 1 — Input Layer   |   FILE 21 of the project
 DEPENDS ON  : src/input/InputTranslator.js (file 17) — translateJoystickVector()
               only.
 USED BY     : src/input/InputManager.js (file 23) — instantiated ONLY when
               DeviceDetector.js (file 15) reports isTouchPrimary: true.
               Unlike the previous three device files, this one is NOT
               created unconditionally — it renders actual on-screen
               graphics that have no reason to exist on desktop.
================================================================================
 WHAT THIS FILE DOES
   The first device file with a visual footprint: it creates its own DOM
   (a base circle and a thumb circle), mounts into #mobile-controls-root,
   and tracks one finger's position within that base to drive the four
   movement commands via InputTranslator's translateJoystickVector().
   mount()/unmount() replace the start()/stop() lifecycle the previous
   three device files used, since there's DOM to create and remove here,
   not just listeners to attach.

 A DELIBERATE, TEMPORARY EXCEPTION TO "JS NEVER TOUCHES PRESENTATION"
   Every file so far has kept visual styling strictly in CSS. This one
   inline-styles its elements directly — on purpose, for now. pointer-events
   on the root is set inline because it's FUNCTIONALLY required for
   touchstart to ever reach this widget at all (#mobile-controls-root is
   pointer-events: none by default, per layout.css's convention), and the
   size/position/appearance values are inlined alongside it purely so this
   file is actually testable in Phase 1, rather than silently inert until
   Phase 13's css/components/mobile-controls.css exists. Expect Phase 13 to
   delete these inline styles in favor of a `.virtual-joystick` CSS rule —
   this is flagged as a known, temporary stand-in, not a new convention.

 WHY stopPropagation() IS CALLED IN EVERY HANDLER
   TouchDevice.js (file 20) listens for touchstart/touchmove/touchend
   globally on window, for camera drag/pinch. Without stopPropagation()
   here, a touch that starts ON the joystick would bubble up to window and
   ALSO be read by TouchDevice.js as a camera-rotate drag — moving the
   joystick would simultaneously spin the camera. Calling
   stopPropagation() in this file's handlers is what keeps the joystick's
   touch fully private to itself.

 WHY ELEMENT-SCOPED LISTENERS STILL WORK PAST THE BASE'S VISUAL EDGE
   Per the DOM Touch Events spec, once a touch STARTS on an element, that
   same element keeps receiving touchmove/touchend for that exact touch
   for its whole lifetime — even after the finger drags outside the
   element's visual bounds. This is "implicit capture," and it's why
   attaching touchmove/touchend directly to #baseElement (rather than
   window, like TouchDevice.js does) still correctly tracks a drag pushed
   past the joystick's edge, with no extra work needed.

 IDENTIFIER-BASED TOUCH TRACKING
   The player can have a second finger down elsewhere (camera drag) WHILE
   operating the joystick. Touch.identifier is a stable ID the browser
   assigns to a touch point for its whole lifetime — #activeTouchId tracks
   which specific identifier belongs to the joystick, so a touchmove event
   carrying multiple active touches always finds the right one rather than
   assuming touches[0] is always this widget's own.
================================================================================
*/

import { translateJoystickVector } from '../InputTranslator.js';

/**
 * @param {TouchList} touchList
 * @param {number} id
 * @returns {Touch|null}
 */
function findTouchById(touchList, id) {
  for (let i = 0; i < touchList.length; i++) {
    if (touchList[i].identifier === id) return touchList[i];
  }
  return null;
}

/**
 * VirtualJoystickDevice — an on-screen thumbstick reporting a normalized
 * 2D vector to InputTranslator.js's translateJoystickVector().
 */
export class VirtualJoystickDevice {
  #rootElement = null;
  #baseElement = null;
  #thumbElement = null;

  #activeTouchId = null;
  #baseCenter = { x: 0, y: 0 };
  #baseRadius = 1; // never 0 — avoids a division-by-zero before first layout

  /**
   * Creates the joystick's DOM, mounts it, and starts listening.
   * @param {HTMLElement} parentElement - Expected to be #mobile-controls-root.
   */
  mount(parentElement) {
    this.#rootElement = document.createElement('div');
    this.#rootElement.className = 'virtual-joystick';
    // TEMPORARY inline baseline — see file header. Phase 13 replaces this
    // block with css/components/mobile-controls.css targeting the same
    // class names (.virtual-joystick, __base, __thumb).
    this.#rootElement.style.cssText = 'position: absolute; left: 24px; bottom: 24px; pointer-events: auto;';

    this.#baseElement = document.createElement('div');
    this.#baseElement.className = 'virtual-joystick__base';
    this.#baseElement.style.cssText =
      'position: relative; width: 120px; height: 120px; border-radius: 50%;' +
      'background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.4);';

    this.#thumbElement = document.createElement('div');
    this.#thumbElement.className = 'virtual-joystick__thumb';
    this.#thumbElement.style.cssText =
      'position: absolute; top: 50%; left: 50%; width: 50px; height: 50px; margin: -25px;' +
      'border-radius: 50%; background: rgba(255,255,255,0.5);';

    this.#baseElement.appendChild(this.#thumbElement);
    this.#rootElement.appendChild(this.#baseElement);
    parentElement.appendChild(this.#rootElement);

    this.#baseElement.addEventListener('touchstart', this.#handleTouchStart, { passive: false });
    this.#baseElement.addEventListener('touchmove', this.#handleTouchMove, { passive: false });
    this.#baseElement.addEventListener('touchend', this.#handleTouchEnd);
    this.#baseElement.addEventListener('touchcancel', this.#handleTouchEnd);
  }

  /** Removes the joystick's DOM and listeners entirely. */
  unmount() {
    if (!this.#rootElement) return;

    this.#baseElement.removeEventListener('touchstart', this.#handleTouchStart);
    this.#baseElement.removeEventListener('touchmove', this.#handleTouchMove);
    this.#baseElement.removeEventListener('touchend', this.#handleTouchEnd);
    this.#baseElement.removeEventListener('touchcancel', this.#handleTouchEnd);

    this.#rootElement.remove();
    this.#rootElement = null;
    this.#baseElement = null;
    this.#thumbElement = null;
  }

  /** @param {TouchEvent} event */
  #handleTouchStart = (event) => {
    event.stopPropagation();
    event.preventDefault();

    if (this.#activeTouchId !== null) return; // already tracking a finger, ignore a second one

    const touch = event.changedTouches[0];
    this.#activeTouchId = touch.identifier;

    // Measured fresh on every gesture start rather than cached once at
    // mount time, so this stays correct even if layout ever changes
    // (orientation change, future responsive repositioning) between uses.
    const rect = this.#baseElement.getBoundingClientRect();
    this.#baseCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    this.#baseRadius = rect.width / 2;

    this.#updateFromTouch(touch);
  };

  /** @param {TouchEvent} event */
  #handleTouchMove = (event) => {
    if (this.#activeTouchId === null) return;

    const touch = findTouchById(event.changedTouches, this.#activeTouchId);
    if (!touch) return; // this event describes a DIFFERENT touch, not the joystick's

    event.stopPropagation();
    event.preventDefault();

    this.#updateFromTouch(touch);
  };

  /** @param {TouchEvent} event */
  #handleTouchEnd = (event) => {
    const touch = findTouchById(event.changedTouches, this.#activeTouchId);
    if (!touch) return;

    event.stopPropagation();

    this.#activeTouchId = null;
    this.#thumbElement.style.transform = 'translate(0, 0)'; // snap back to center
    translateJoystickVector(0, 0); // release — falls below deadzone on every axis
  };

  /**
   * Computes the clamped thumb position (visual) and the normalized
   * vector (logical), then reports the latter onward.
   * @param {Touch} touch
   */
  #updateFromTouch(touch) {
    const dx = touch.clientX - this.#baseCenter.x;
    const dy = touch.clientY - this.#baseCenter.y;

    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), this.#baseRadius);
    const angle = Math.atan2(dy, dx);

    const thumbX = Math.cos(angle) * distance;
    const thumbY = Math.sin(angle) * distance;
    this.#thumbElement.style.transform = `translate(${thumbX}px, ${thumbY}px)`;

    // Normalized -1..1 per axis. y keeps screen convention (down is
    // positive) to match exactly what InputTranslator.js's
    // translateJoystickVector() documents expecting — no flipping here.
    translateJoystickVector(thumbX / this.#baseRadius, thumbY / this.#baseRadius);
  }
}
