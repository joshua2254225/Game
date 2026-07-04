/*
================================================================================
 FARMERS FARM  —  src/input/devices/KeyboardDevice.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 1 — Input Layer   |   FILE 18 of the project
 DEPENDS ON  : src/input/InputTranslator.js (file 17) — reports every raw
               key event there and touches nothing else. src/input/
               CommandQueue.js (file 16) — only for clearAllActive() on
               window blur, not for normal operation.
 USED BY     : src/input/InputManager.js (file 23) — instantiates this
               unconditionally on every device, desktop or mobile. As
               DeviceDetector.js's header already explained: listening for
               keydown/keyup on a device with no keyboard costs nothing,
               since the events simply never fire, so there's no touch-vs-
               desktop branching needed here at all.
================================================================================
 WHAT THIS FILE DOES
   Listens for raw keydown/keyup on the window and reports event.code to
   InputTranslator.js — nothing here knows what a "command" is, matching
   CommandTypes.js's "dumb listener" description of the whole device layer.
   Three real gotchas are handled here so nothing downstream has to think
   about them:

   1. OS KEY-REPEAT would fire a discrete command (INTERACT, PAUSE) MANY
      TIMES from a single physical press if left unguarded — holding E
      down for a second could otherwise harvest the same crop repeatedly.
      #heldKeys tracks which keys are already down and ignores repeat
      keydown events for them, only translating on the genuine up->down
      transition.

   2. TYPING INTO A TEXT FIELD (a future save-name input, a settings
      field) would otherwise fight with this listener — pressing "S" to
      type a farm name would also fire MOVE_BACKWARD. isTypingIntoField()
      below skips translation entirely whenever the focused element is an
      input/textarea/contenteditable.

   3. LOSING WINDOW FOCUS while a key is held (alt-tabbing away mid-W)
      never fires the matching keyup — the browser simply stops sending
      this page any events at all. Without handling it, MOVE_FORWARD
      would stay stuck active forever. The 'blur' listener below calls
      CommandQueue's clearAllActive(), exactly as that file's own header
      already documented this file would.
================================================================================
*/

import { translateKeyDown, translateKeyUp } from '../InputTranslator.js';
import { commandQueue } from '../CommandQueue.js';

/** Keys whose default browser behavior (page scroll, mainly) would be
 *  disruptive in a full-screen game, prevented regardless of whether the
 *  current KEY_MAP in InputTranslator.js happens to use them. */
const PREVENT_DEFAULT_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** @returns {boolean} True if the user is currently focused on a text-entry element. */
function isTypingIntoField() {
  const el = document.activeElement;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/**
 * KeyboardDevice — listens for raw keyboard events and reports them to
 * InputTranslator.js. Holds no game-logic state of its own beyond
 * tracking which physical keys are currently down.
 */
export class KeyboardDevice {
  #heldKeys = new Set();
  #isListening = false;

  /** @param {KeyboardEvent} event */
  #handleKeyDown = (event) => {
    if (isTypingIntoField()) return;
    if (this.#heldKeys.has(event.code)) return; // OS key-repeat, not a new press

    this.#heldKeys.add(event.code);

    if (PREVENT_DEFAULT_CODES.has(event.code)) {
      event.preventDefault();
    }

    translateKeyDown(event.code);
  };

  /** @param {KeyboardEvent} event */
  #handleKeyUp = (event) => {
    if (!this.#heldKeys.has(event.code)) return; // wasn't tracked as down — nothing to release

    this.#heldKeys.delete(event.code);
    translateKeyUp(event.code);
  };

  #handleWindowBlur = () => {
    this.#heldKeys.clear();
    commandQueue.clearAllActive();
  };

  /** Starts listening. Safe to call again while already listening — no-ops. */
  start() {
    if (this.#isListening) return;
    this.#isListening = true;

    window.addEventListener('keydown', this.#handleKeyDown);
    window.addEventListener('keyup', this.#handleKeyUp);
    window.addEventListener('blur', this.#handleWindowBlur);
  }

  /**
   * Stops listening and forgets locally-tracked held keys. Deliberately
   * does NOT call commandQueue.clearAllActive() here — that broader,
   * clear-everything action is reserved for the window-blur case above;
   * a plain stop() only needs to undo what this device itself did.
   */
  stop() {
    if (!this.#isListening) return;
    this.#isListening = false;

    window.removeEventListener('keydown', this.#handleKeyDown);
    window.removeEventListener('keyup', this.#handleKeyUp);
    window.removeEventListener('blur', this.#handleWindowBlur);

    this.#heldKeys.clear();
  }
}
