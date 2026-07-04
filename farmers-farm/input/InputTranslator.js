/*
================================================================================
 FARMERS FARM  —  src/input/InputTranslator.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 1 — Input Layer   |   FILE 17 of the project
 DEPENDS ON  : src/input/CommandTypes.js (file 14), src/input/CommandQueue.js
               (file 16), src/core/Config.js (file 12, just extended with
               an INPUT section for this file specifically).
 USED BY     : the five device files, not yet built — KeyboardDevice.js,
               MouseDevice.js, TouchDevice.js, VirtualJoystickDevice.js,
               VirtualButtonDevice.js (files 18-22). Every one of them
               calls INTO this file; this file never calls back into any
               of them, and never touches the DOM itself.
================================================================================
 WHAT THIS FILE DOES
   This is the file the whole input architecture described in the original
   planning doc was built around: whatever the physical input was — a
   keyboard key, a mouse drag, a thumb on a virtual joystick — it resolves
   here into the exact same commands from CommandTypes.js, written into
   the shared commandQueue. Nothing past this file ever sees a raw browser
   event again.

 event.code, NOT event.key, FOR KEYBOARD MAPPING
   KEY_MAP below is keyed on values like 'KeyW', not 'w'. event.key
   reflects the actual character produced — with Caps Lock on, pressing
   the W key reports event.key === 'W', which a lowercase 'w' map entry
   would silently miss, breaking movement the moment Caps Lock is on.
   event.code reports the PHYSICAL key position regardless of modifiers or
   keyboard layout, which is what a game control scheme actually wants.
   KeyboardDevice.js (file 18) needs to pass event.code here, not event.key.

 THE HELD vs DISCRETE SPLIT LIVES HERE, NOT IN CommandQueue.js
   CommandQueue.js exposes setActive/setInactive (held) and trigger
   (discrete) as two unrelated capabilities — it has no opinion on which
   commands are which. HELD_COMMANDS below is that opinion, decided once,
   here, and reused by both the keyboard and virtual-button pathways
   (dispatchCommandDown/Up) so the two don't duplicate the same branching
   logic.

 WHAT THIS FILE DELIBERATELY DOESN'T DO
   Gesture detection — deciding WHEN a mouse/touch drag is actually in
   progress (as opposed to just idle pointer movement) — is NOT handled
   here. That's MouseDevice.js's and TouchDevice.js's job: track their own
   pointer-down/pointer-up state, and only call translateDragDelta() /
   translateZoomDelta() while a gesture is genuinely active. This file
   trusts whatever delta it's handed and just scales it.
================================================================================
*/

import { COMMAND_TYPE } from './CommandTypes.js';
import { commandQueue } from './CommandQueue.js';
import { CONFIG } from '../core/Config.js';

/**
 * Keyboard mapping: physical key (event.code) -> command. Both WASD and
 * arrow keys are mapped to the same four movement commands so either
 * works. These specific bindings (E for interact, Escape for pause, C for
 * camera-cycle) are sensible defaults, not fixed forever — a future
 * settings/key-rebind feature would only ever need to change this table.
 */
const KEY_MAP = {
  KeyW: COMMAND_TYPE.MOVE_FORWARD,
  ArrowUp: COMMAND_TYPE.MOVE_FORWARD,
  KeyS: COMMAND_TYPE.MOVE_BACKWARD,
  ArrowDown: COMMAND_TYPE.MOVE_BACKWARD,
  KeyA: COMMAND_TYPE.MOVE_LEFT,
  ArrowLeft: COMMAND_TYPE.MOVE_LEFT,
  KeyD: COMMAND_TYPE.MOVE_RIGHT,
  ArrowRight: COMMAND_TYPE.MOVE_RIGHT,
  KeyE: COMMAND_TYPE.INTERACT,
  Escape: COMMAND_TYPE.PAUSE,
  KeyC: COMMAND_TYPE.CAMERA_CYCLE_MODE,
};

/**
 * Virtual (on-screen) button mapping: button identifier -> command. Movement
 * is NOT listed here — it comes through translateJoystickVector() below
 * instead, since a virtual joystick is a continuous 2D input, not four
 * discrete buttons. VirtualButtonDevice.js (file 22) is expected to use
 * these exact identifiers for whichever DOM elements it creates.
 */
const BUTTON_MAP = {
  'btn-interact': COMMAND_TYPE.INTERACT,
  'btn-pause': COMMAND_TYPE.PAUSE,
  'btn-camera-cycle': COMMAND_TYPE.CAMERA_CYCLE_MODE,
};

/** The only commands that persist while held, per CommandTypes.js. Every
 *  command not in this set is treated as discrete (fire-once). */
const HELD_COMMANDS = new Set([
  COMMAND_TYPE.MOVE_FORWARD,
  COMMAND_TYPE.MOVE_BACKWARD,
  COMMAND_TYPE.MOVE_LEFT,
  COMMAND_TYPE.MOVE_RIGHT,
]);

/**
 * Shared "a command's input just started" handling for both keyboard and
 * virtual buttons — the one place that decides setActive() vs trigger().
 * @param {string} command
 */
function dispatchCommandDown(command) {
  if (HELD_COMMANDS.has(command)) {
    commandQueue.setActive(command);
  } else {
    commandQueue.trigger(command);
  }
}

/**
 * Shared "a command's input just ended" handling. Discrete commands have
 * nothing to do here — they already fired on the way down.
 * @param {string} command
 */
function dispatchCommandUp(command) {
  if (HELD_COMMANDS.has(command)) {
    commandQueue.setInactive(command);
  }
}

// --- Keyboard ---

/** @param {string} code - event.code, e.g. 'KeyW' — see file header for why. */
export function translateKeyDown(code) {
  const command = KEY_MAP[code];
  if (command) dispatchCommandDown(command);
}

/** @param {string} code - event.code */
export function translateKeyUp(code) {
  const command = KEY_MAP[code];
  if (command) dispatchCommandUp(command);
}

// --- Virtual buttons ---

/** @param {string} buttonId - one of BUTTON_MAP's keys above. */
export function translateVirtualButtonDown(buttonId) {
  const command = BUTTON_MAP[buttonId];
  if (command) dispatchCommandDown(command);
}

/** @param {string} buttonId */
export function translateVirtualButtonUp(buttonId) {
  const command = BUTTON_MAP[buttonId];
  if (command) dispatchCommandUp(command);
}

// --- Virtual joystick ---

/**
 * Translates the joystick thumb's current offset from center into the
 * four movement commands, independently thresholded per axis — pushing
 * diagonally correctly activates two commands at once (e.g. FORWARD +
 * RIGHT), the same as pressing W+D together on a keyboard.
 *
 * Releasing the joystick is not a separate function: call this with
 * (0, 0) and every axis falls back below the deadzone naturally, which
 * deactivates all four commands through the exact same path.
 *
 * @param {number} x - Horizontal offset, normalized -1 (full left) to
 *   1 (full right).
 * @param {number} y - Vertical offset, normalized using SCREEN
 *   convention: -1 is full up/forward, 1 is full down/backward — the
 *   same sign convention VirtualJoystickDevice.js's own touch
 *   coordinates will already be in, so no flipping is needed there.
 */
export function translateJoystickVector(x, y) {
  const deadzone = CONFIG.INPUT.JOYSTICK_DEADZONE;

  setHeldCommandActive(COMMAND_TYPE.MOVE_FORWARD, y < -deadzone);
  setHeldCommandActive(COMMAND_TYPE.MOVE_BACKWARD, y > deadzone);
  setHeldCommandActive(COMMAND_TYPE.MOVE_LEFT, x < -deadzone);
  setHeldCommandActive(COMMAND_TYPE.MOVE_RIGHT, x > deadzone);
}

/**
 * @param {string} command
 * @param {boolean} shouldBeActive
 */
function setHeldCommandActive(command, shouldBeActive) {
  if (shouldBeActive) {
    commandQueue.setActive(command);
  } else {
    commandQueue.setInactive(command);
  }
}

// --- Camera (mouse drag + touch drag, wheel + pinch) ---

/**
 * Feeds a horizontal drag distance into CAMERA_ROTATE. Only ever called
 * WHILE a drag gesture is genuinely active — see the file header for why
 * that gating happens in MouseDevice.js/TouchDevice.js, not here.
 *
 * @param {number} deltaX - Raw screen pixels moved since the last event.
 */
export function translateDragDelta(deltaX) {
  commandQueue.accumulateValue(
    COMMAND_TYPE.CAMERA_ROTATE,
    deltaX * CONFIG.INPUT.CAMERA_ROTATE_SENSITIVITY
  );
}

/**
 * Feeds a zoom amount into CAMERA_ZOOM — a mouse wheel tick or a pinch
 * gesture's change in finger-to-finger distance, either one.
 *
 * @param {number} delta - Positive or negative raw zoom amount.
 */
export function translateZoomDelta(delta) {
  commandQueue.accumulateValue(
    COMMAND_TYPE.CAMERA_ZOOM,
    delta * CONFIG.INPUT.CAMERA_ZOOM_SENSITIVITY
  );
}
