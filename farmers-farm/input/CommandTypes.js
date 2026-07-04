/*
================================================================================
 FARMERS FARM  —  src/input/CommandTypes.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 1 — Input Layer   |   FILE 14 of the project
 DEPENDS ON  : nothing — pure data, zero imports.
 USED BY     : src/input/InputTranslator.js (file 17, three away) — its
               device-to-command mapping table is built directly against
               these names. Later, every gameplay controller that reads
               input: PlayerController.js (Phase 7), VehicleController.js
               (Phase 8), CameraController.js (Phase 3).
================================================================================
 WHAT THIS FILE DOES
   Names every abstract command the game recognizes — the vocabulary
   InputTranslator.js translates raw device events INTO, and the only
   vocabulary gameplay code ever checks against. Nothing in this file
   knows or cares whether a command came from a key, a mouse drag, or a
   thumb on a virtual joystick.

 THREE DIFFERENT "SHAPES" OF COMMAND, GROUPED BELOW BY COMMENT — same enum,
 but CommandQueue.js (next file) will need to treat them differently:
   - HELD    — true for as long as the input stays down (MOVE_FORWARD is
               "active" every frame W is held, not just the frame it was
               first pressed).
   - DISCRETE — fires once per press, regardless of how long it's held
               (INTERACT, PAUSE, CAMERA_CYCLE_MODE — holding the key longer
               doesn't mean "interact more").
   - VALUE-CARRYING — discrete-ish, but arrives WITH a number attached
               (CAMERA_ROTATE needs how far the mouse/finger dragged;
               CAMERA_ZOOM needs how far the wheel/pinch moved). How that
               payload actually attaches to a command is CommandQueue.js's
               problem to solve next, not this file's — this file only
               names the command.

 VALUE CASING: UPPER_SNAKE_CASE, unlike Constants.js's lowercase strings
   Constants.js deliberately used lowercase values ('winter', not
   'WINTER') because those values are state that can end up in a CSS
   data-attribute. Commands never will — they're a pure JS-to-JS signal
   between the input layer and gameplay code, nothing external ever reads
   one. Keeping the value identical to the key (MOVE_FORWARD: 'MOVE_FORWARD')
   instead makes a stray console.log of an active command set instantly
   readable as "these are commands," not arbitrary lowercase strings.

 A NOTE ON THE THIRD COPY OF deepFreeze() BELOW
   This is now duplicated in Config.js, Constants.js, and here — each a
   genuinely standalone, dependency-free data module by design. Three
   small, identical copies of a stable ~10-line helper is still a
   reasonable trade for that independence. If a FOURTH data module ends up
   needing it, that's the actual trigger to extract it into a shared
   src/utils/ObjectUtils.js — not before, and not preemptively here.
================================================================================
*/

/**
 * Recursively freezes an object so none of these command names can be
 * mutated at runtime. See the note above for why this is copied rather
 * than imported from a shared file.
 *
 * @param {object} obj
 * @returns {object} The same object, frozen at every level.
 */
function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object') {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

export const COMMAND_TYPE = deepFreeze({

  // --- Movement (HELD) ---
  // On-foot walking AND vehicle driving both consume these same four
  // commands — whichever controller is currently active (PlayerController
  // vs VehicleController, Phase 7/8) interprets MOVE_FORWARD contextually
  // as "walk" or "accelerate." This is the whole point of a unified
  // command layer: the W key or joystick-up never needs to know which of
  // those two meanings currently applies.
  MOVE_FORWARD: 'MOVE_FORWARD',
  MOVE_BACKWARD: 'MOVE_BACKWARD',
  MOVE_LEFT: 'MOVE_LEFT',
  MOVE_RIGHT: 'MOVE_RIGHT',

  // --- Interaction (DISCRETE) ---
  // One generic "use/interact with whatever I'm facing" command, not a
  // separate one per activity. Talking to an NPC, entering a vehicle,
  // harvesting a ready crop, getting into bed — all of that is CONTEXTUAL
  // meaning decided by gameplay code in later phases, not by the input
  // layer, which only ever reports "the interact command fired."
  INTERACT: 'INTERACT',

  // --- Camera (VALUE-CARRYING) ---
  // Matches the brief exactly: hold-and-slide to rotate, in or out of a
  // vehicle; a separate discrete command to cycle between the three
  // perspectives (in-vehicle / chase / top-down — see CAMERA_MODE in
  // Constants.js), since no specific input for that was specified yet —
  // InputTranslator.js will need to pick a reasonable default (likely a
  // key on desktop, a HUD button on mobile) when it's built.
  CAMERA_ROTATE: 'CAMERA_ROTATE',
  CAMERA_ZOOM: 'CAMERA_ZOOM',
  CAMERA_CYCLE_MODE: 'CAMERA_CYCLE_MODE', // discrete, not value-carrying

  // --- System (DISCRETE) ---
  PAUSE: 'PAUSE',

});
