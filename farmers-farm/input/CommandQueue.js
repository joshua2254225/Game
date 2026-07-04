/*
================================================================================
 FARMERS FARM  —  src/input/CommandQueue.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 1 — Input Layer   |   FILE 16 of the project
 DEPENDS ON  : nothing. Deliberately does NOT import CommandTypes.js — same
               reasoning as EventBus.js not knowing specific event names:
               this is a generic buffer that works with any string command
               name, trusting InputTranslator.js to only ever pass real
               ones from COMMAND_TYPE.
 USED BY     : src/input/InputTranslator.js (file 17, next) WRITES to this
               via setActive/trigger/accumulateValue. Later, gameplay
               controllers READ from it: CameraController.js (Phase 3),
               PlayerController.js (Phase 7), VehicleController.js (Phase 8).
================================================================================
 WHAT THIS FILE DOES
   Implements the three command "shapes" CommandTypes.js named but didn't
   solve: HELD commands persist until explicitly turned off; DISCRETE and
   VALUE-CARRYING commands are captured for exactly one frame, then cleared.

 WHY A SINGLETON, LIKE EventBus.js
   Same reasoning as GameEngine.js's note about eventBus: there is exactly
   one player and one input context in this single-player game, so every
   controller that needs to check "is MOVE_FORWARD active?" imports the
   same shared `commandQueue` instance directly, rather than each one
   needing a reference threaded through from InputManager.

 endFrame() — READ THIS BEFORE CALLING IT FROM ANYWHERE
   DISCRETE and VALUE-CARRYING commands are only meaningful for the frame
   they occurred in — INTERACT firing should be read by gameplay code
   exactly once, then forgotten; CAMERA_ROTATE's accumulated delta needs to
   reset to 0 once CameraController has applied it, or the camera would
   keep spinning from a drag that ended frames ago. endFrame() clears both.
   It is called ONCE per frame by InputManager.js (file 23), as the LAST
   step of that frame's input processing — after every controller has
   already had the chance to call wasTriggered()/getValue() for this
   frame, never before. Calling it earlier would silently make an
   INTERACT press invisible to whichever controller checks for it later
   in the same frame. HELD state (#activeCommands) is untouched by this —
   it has nothing to do with frame boundaries, only with whether the
   underlying key/button is still physically down.
================================================================================
*/

/**
 * CommandQueue — the buffer InputTranslator.js writes resolved commands
 * into, and every gameplay controller reads them back out of.
 */
export class CommandQueue {
  #activeCommands = new Set();    // HELD — persists until setInactive()
  #triggeredCommands = new Set(); // DISCRETE — cleared by endFrame()
  #commandValues = new Map();     // VALUE-CARRYING — cleared by endFrame()

  // --- HELD commands ---

  /** @param {string} command */
  setActive(command) {
    this.#activeCommands.add(command);
  }

  /** @param {string} command */
  setInactive(command) {
    this.#activeCommands.delete(command);
  }

  /**
   * @param {string} command
   * @returns {boolean} True for as long as the underlying input stays down.
   */
  isActive(command) {
    return this.#activeCommands.has(command);
  }

  /**
   * Defensive escape hatch: clears every currently-held command at once,
   * without needing to know which ones are held. Not called from within
   * this file — the intended caller is KeyboardDevice.js (file 18),
   * reacting to a window `blur` event. Losing focus mid-keypress (e.g.
   * alt-tabbing away while holding W) never fires the matching keyup, so
   * without this, MOVE_FORWARD could stay stuck "active" forever.
   */
  clearAllActive() {
    this.#activeCommands.clear();
  }

  // --- DISCRETE commands ---

  /** @param {string} command */
  trigger(command) {
    this.#triggeredCommands.add(command);
  }

  /**
   * @param {string} command
   * @returns {boolean} True if this command fired at any point during the
   *   CURRENT frame. Always false again after endFrame() runs.
   */
  wasTriggered(command) {
    return this.#triggeredCommands.has(command);
  }

  // --- VALUE-CARRYING commands ---

  /**
   * Adds to (not replaces) whatever's already accumulated for this
   * command this frame. A drag gesture can fire several raw mousemove/
   * touchmove events before the next animation frame even runs — summing
   * them means no movement between two rAF ticks is silently dropped.
   *
   * @param {string} command
   * @param {number} delta
   */
  accumulateValue(command, delta) {
    const current = this.#commandValues.get(command) ?? 0;
    this.#commandValues.set(command, current + delta);
  }

  /**
   * @param {string} command
   * @returns {number} The total accumulated delta for this command during
   *   the CURRENT frame, or 0 if nothing was accumulated — safe to use
   *   directly in a calculation without a separate existence check.
   */
  getValue(command) {
    return this.#commandValues.get(command) ?? 0;
  }

  // --- Frame lifecycle ---

  /**
   * Clears DISCRETE and VALUE-CARRYING state for the frame that just
   * finished. See the file header — call order matters here.
   */
  endFrame() {
    this.#triggeredCommands.clear();
    this.#commandValues.clear();
  }
}

// The shared singleton every input-writing and input-reading file imports.
export const commandQueue = new CommandQueue();
