/*
================================================================================
 FARMERS FARM  —  src/input/devices/VirtualButtonDevice.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 1 — Input Layer   |   FILE 22 of the project (last device file)
 DEPENDS ON  : src/input/InputTranslator.js (file 17) — translateVirtualButtonDown()
               and translateVirtualButtonUp() specifically. The three
               button IDs below (btn-interact, btn-pause, btn-camera-cycle)
               must stay in sync with InputTranslator's BUTTON_MAP — they're
               the same three keys, defined independently in each file
               rather than shared, since this file is presentation/DOM and
               that one is pure mapping logic.
 USED BY     : src/input/InputManager.js (file 23) — instantiated ONLY when
               isTouchPrimary is true, exactly like VirtualJoystickDevice.js.
================================================================================
 WHAT THIS FILE DOES
   Three on-screen buttons — interact, pause, camera-cycle — mounted
   bottom-right (mirroring the joystick's bottom-left). Uses real <button>
   elements rather than plain divs specifically to inherit reset.css's
   existing button rules for free: appearance stripped, and — usefully
   here — touch-action: manipulation, which removes the ~300ms tap-response
   delay some mobile browsers add and stops an accidental double-tap from
   being read as a browser zoom gesture.

 THE SAME TWO CARRY-OVERS FROM VirtualJoystickDevice.js
   - stopPropagation() in every handler, for the same reason: without it, a
     tap on these buttons would bubble to window and ALSO register with
     TouchDevice.js as the start of a camera-drag gesture.
   - Inline styling is a deliberate, temporary stand-in (position, size,
     pointer-events), not a new convention — Phase 13's
     css/components/mobile-controls.css is expected to replace it with real
     `.virtual-buttons__btn` rules.

 ALL THREE MAPPED COMMANDS HAPPEN TO BE DISCRETE — handling touchend anyway
   INTERACT, PAUSE, and CAMERA_CYCLE_MODE are all discrete (see
   CommandTypes.js), so translateVirtualButtonUp() is currently a no-op for
   every button here — dispatchCommandUp() in InputTranslator.js only does
   something for HELD commands. touchend/touchcancel are still wired up
   and call it anyway, so if a future held-type command is ever mapped to
   a virtual button, it works correctly without this file needing a
   second look. The visual .is-pressed toggle (added on touchstart,
   removed on touchend) is real and used regardless — that's just
   immediate visual feedback, independent of what the command turns out to
   do with the "up" half.

 event.currentTarget, NOT event.target
   All three buttons share the exact same handler functions rather than
   one closure each. event.currentTarget always refers to whichever
   button the listener is actually attached to (read via its
   data-button-id), regardless of which button was touched or whether it
   ever grows a child element (an icon span, say) that event.target could
   otherwise point to instead.
================================================================================
*/

import { translateVirtualButtonDown, translateVirtualButtonUp } from '../InputTranslator.js';

/** Must stay in sync with InputTranslator.js's BUTTON_MAP keys. */
const BUTTON_DEFINITIONS = [
  { id: 'btn-interact', icon: '✋', size: 70 },      // primary — used far more often than the other two
  { id: 'btn-pause', icon: '⏸️', size: 48 },
  { id: 'btn-camera-cycle', icon: '🎥', size: 48 },
];

/**
 * VirtualButtonDevice — three discrete on-screen action buttons reporting
 * to InputTranslator.js's translateVirtualButtonDown()/Up().
 */
export class VirtualButtonDevice {
  #rootElement = null;
  #buttonElements = new Map(); // buttonId -> HTMLButtonElement

  /**
   * Creates the buttons' DOM, mounts them, and starts listening.
   * @param {HTMLElement} parentElement - Expected to be #mobile-controls-root.
   */
  mount(parentElement) {
    this.#rootElement = document.createElement('div');
    this.#rootElement.className = 'virtual-buttons';
    // TEMPORARY inline baseline — see file header.
    this.#rootElement.style.cssText =
      'position: absolute; right: 24px; bottom: 24px; pointer-events: auto;' +
      'display: flex; align-items: flex-end; gap: 14px;';

    for (const { id, icon, size } of BUTTON_DEFINITIONS) {
      const button = document.createElement('button');
      button.className = 'virtual-buttons__btn';
      button.dataset.buttonId = id;
      button.textContent = icon;
      button.setAttribute('aria-label', id.replace('btn-', '').replace('-', ' '));
      button.style.cssText =
        `width: ${size}px; height: ${size}px; border-radius: 50%; font-size: ${size * 0.45}px;` +
        'display: flex; align-items: center; justify-content: center;' +
        'background: rgba(255,255,255,0.25); border: 2px solid rgba(255,255,255,0.4);' +
        'pointer-events: auto;';

      button.addEventListener('touchstart', this.#handleTouchStart, { passive: false });
      button.addEventListener('touchend', this.#handleTouchEnd);
      button.addEventListener('touchcancel', this.#handleTouchEnd);

      this.#buttonElements.set(id, button);
      this.#rootElement.appendChild(button);
    }

    parentElement.appendChild(this.#rootElement);
  }

  /** Removes every button's DOM and listeners. */
  unmount() {
    if (!this.#rootElement) return;

    for (const button of this.#buttonElements.values()) {
      button.removeEventListener('touchstart', this.#handleTouchStart);
      button.removeEventListener('touchend', this.#handleTouchEnd);
      button.removeEventListener('touchcancel', this.#handleTouchEnd);
    }

    this.#buttonElements.clear();
    this.#rootElement.remove();
    this.#rootElement = null;
  }

  /**
   * Shared by all three buttons — event.currentTarget picks out which one.
   * Not written as an arrow function out of any need for `this` here (it
   * isn't used); kept consistent with this project's usual event-handler
   * pattern anyway, so a future edit that DOES need `this` doesn't have
   * to remember to change how this method is declared.
   * @param {TouchEvent} event
   */
  #handleTouchStart = (event) => {
    event.stopPropagation();
    event.preventDefault();

    const button = event.currentTarget;
    button.classList.add('is-pressed');
    translateVirtualButtonDown(button.dataset.buttonId);
  };

  /** @param {TouchEvent} event */
  #handleTouchEnd = (event) => {
    event.stopPropagation();

    const button = event.currentTarget;
    button.classList.remove('is-pressed');
    translateVirtualButtonUp(button.dataset.buttonId);
  };
}
