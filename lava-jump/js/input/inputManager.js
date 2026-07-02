/* =========================================================
FILE 6: js/input/inputManager.js

This file is the central input brain for the game.

Purpose:

- Convert raw input events into named game actions
- Keep keyboard, touch, and future gamepad input unified
- Provide a dictionary-like action state that the game can read
- Make input logic easy to update without changing gameplay code

Design rule:
The rest of the game should not care whether an action came
from a keyboard key, a touch button, or a gamepad.
It should only care about action names such as:

 - MOVE_FORWARD
 - MOVE_LEFT
 - JUMP
 - PAUSE

This file is intentionally detailed so it is easy to understand
and easy to extend later.
========================================================= */

import inputMap from "./inputMap.js";
import gameConfig from "../config/gameConfig.js";

class InputManager {
constructor(options = {}) {
/*
options are intentionally flexible so the manager can be used
in many ways later without rewriting the class.

  Expected values:
    - targetElement: DOM element for touch/button interactions
    - enableKeyboard: boolean
    - enableTouch: boolean
    - enableGamepad: boolean
    - debug: boolean
*/
this.options = {
  targetElement: null,
  enableKeyboard: true,
  enableTouch: true,
  enableGamepad: false,
  debug: gameConfig.debug.enabledByDefault,
  ...options
};

/*
  The action states are stored like a dictionary.
  Each action gets its own mini state object.

  Example:
    this.state["JUMP"] = {
      active: false,
      pressed: false,
      released: false,
      value: 0
    }
*/
this.state = {};
this.actionNames = Object.values(inputMap.actions);

/*
  A normalized mapping of keyboard codes to actions.
  Example:
    KeyW -> MOVE_FORWARD
*/
this.keyBindings = { ...inputMap.keys };

/*
  Touch element IDs are mapped to actions.
  Example:
    touch-jump -> JUMP
*/
this.touchBindings = { ...inputMap.touch };

/*
  Alias map is useful when another file passes a shorthand name.
  Example:
    "forward" -> MOVE_FORWARD
*/
this.aliases = { ...inputMap.aliases };

/*
  Event listeners are stored so they can be removed later.
  This is important for cleanup when restarting or rebuilding.
*/
this.boundHandlers = [];

/*
  Pointer to the touch target element.
  If null, touch binding methods will do nothing until set.
*/
this.targetElement = this.options.targetElement;

/*
  Gamepad support is prepared for later. The system can poll
  connected controllers in the update loop.
*/
this.gamepadEnabled = Boolean(this.options.enableGamepad);

this._initializeState();
this._setupKeyboard();
this._setupTouch();

if (this.options.debug) {
  console.log("[InputManager] initialized", this.getSnapshot());
}

}

/* -------------------------------------------------------
INITIALIZATION HELPERS
------------------------------------------------------- */
_initializeState() {
for (const action of this.actionNames) {
this.state[action] = {
active: false,
pressed: false,
released: false,
value: 0,
lastChangedAt: 0
};
}
}

_setupKeyboard() {
if (!this.options.enableKeyboard || typeof window === "undefined") {
return;
}

const handleKeyDown = (event) => {
  const action = this._resolveKeyboardAction(event.code);
  if (!action) return;

  /*
    Prevent browser behavior on game keys when possible.
    This avoids page scrolling, accidental focus changes, and
    unwanted system shortcuts during gameplay.
  */
  event.preventDefault();
  this.setAction(action, true, 1);
};

const handleKeyUp = (event) => {
  const action = this._resolveKeyboardAction(event.code);
  if (!action) return;

  event.preventDefault();
  this.setAction(action, false, 0);
};

window.addEventListener("keydown", handleKeyDown, { passive: false });
window.addEventListener("keyup", handleKeyUp, { passive: false });

this.boundHandlers.push(["keydown", window, handleKeyDown]);
this.boundHandlers.push(["keyup", window, handleKeyUp]);

}

_setupTouch() {
if (!this.options.enableTouch || typeof document === "undefined") {
return;
}

/*
  Touch events can be attached directly to the target element
  or later connected by the touchControls.js file.
  This keeps the manager flexible.
*/
if (this.targetElement) {
  this.bindTouchTargets(this.targetElement);
}

}

/* -------------------------------------------------------
ACTION RESOLUTION
------------------------------------------------------- */
_resolveKeyboardAction(code) {
return this.keyBindings[code] || this.aliases[code] || null;
}

_resolveTouchAction(identifier) {
return this.touchBindings[identifier] || this.aliases[identifier] || null;
}

normalizeAction(action) {
if (!action) return null;

if (this.actionNames.includes(action)) {
  return action;
}

return this.aliases[action] || null;

}

/* -------------------------------------------------------
PUBLIC BINDING METHODS
------------------------------------------------------- */
setTargetElement(element) {
this.targetElement = element;
}

bindTouchTargets(rootElement) {
if (!rootElement || typeof rootElement.querySelectorAll !== "function") {
return;
}

/*
  We search for elements that either have an ID in the touch map
  or use a data-action attribute. That way, future files can use
  either style.
*/
const candidates = [];
for (const id of Object.keys(this.touchBindings)) {
  const found = rootElement.querySelector(`#${CSS.escape(id)}`);
  if (found) candidates.push(found);
}

const dataActionTargets = rootElement.querySelectorAll("[data-action]");
dataActionTargets.forEach((node) => candidates.push(node));

candidates.forEach((element) => {
  const action = this._actionFromTouchElement(element);
  if (!action) return;

  this._bindTouchElement(element, action);
});

}

_actionFromTouchElement(element) {
if (!element) return null;

const explicitId = element.id ? this._resolveTouchAction(element.id) : null;
if (explicitId) return explicitId;

const dataAction = element.getAttribute?.("data-action");
if (dataAction) {
  return this.normalizeAction(dataAction);
}

return null;

}

_bindTouchElement(element, action) {
/*
Use pointer events when possible so the same code can work
across touch screens, pens, and mouse interaction.
*/
const onPointerDown = (event) => {
event.preventDefault();
this.setAction(action, true, 1);
};

const onPointerUp = (event) => {
  event.preventDefault();
  this.setAction(action, false, 0);
};

const onPointerCancel = (event) => {
  event.preventDefault();
  this.setAction(action, false, 0);
};

element.addEventListener("pointerdown", onPointerDown, { passive: false });
element.addEventListener("pointerup", onPointerUp, { passive: false });
element.addEventListener("pointerleave", onPointerUp, { passive: false });
element.addEventListener("pointercancel", onPointerCancel, { passive: false });

this.boundHandlers.push(["pointerdown", element, onPointerDown]);
this.boundHandlers.push(["pointerup", element, onPointerUp]);
this.boundHandlers.push(["pointerleave", element, onPointerUp]);
this.boundHandlers.push(["pointercancel", element, onPointerCancel]);

}

/* -------------------------------------------------------
STATE MANAGEMENT
------------------------------------------------------- */
setAction(action, isActive, value = isActive ? 1 : 0) {
const normalized = this.normalizeAction(action);
if (!normalized || !this.state[normalized]) return;

const current = this.state[normalized];
const previousActive = current.active;

current.active = Boolean(isActive);
current.value = Number(value) || 0;
current.lastChangedAt = performance.now?.() ?? Date.now();

/*
  pressed/released are edge-triggered flags.
  - pressed becomes true on the frame the action starts
  - released becomes true on the frame the action ends
*/
if (!previousActive && current.active) {
  current.pressed = true;
} else if (previousActive && !current.active) {
  current.released = true;
}

if (this.options.debug) {
  console.log(`[InputManager] ${normalized} = ${current.active}`);
}

}

tap(action) {
/*
Convenience method for one-shot actions such as:
- JUMP from a button
- CONFIRM
- RESTART
*/
const normalized = this.normalizeAction(action);
if (!normalized) return;

this.setAction(normalized, true, 1);
this.setAction(normalized, false, 0);

}

isActive(action) {
const normalized = this.normalizeAction(action);
return Boolean(normalized && this.state[normalized]?.active);
}

wasPressed(action) {
const normalized = this.normalizeAction(action);
return Boolean(normalized && this.state[normalized]?.pressed);
}

wasReleased(action) {
const normalized = this.normalizeAction(action);
return Boolean(normalized && this.state[normalized]?.released);
}

getValue(action) {
const normalized = this.normalizeAction(action);
return normalized ? this.state[normalized]?.value ?? 0 : 0;
}

consumePressed(action) {
const normalized = this.normalizeAction(action);
if (!normalized || !this.state[normalized]) return false;

const pressed = this.state[normalized].pressed;
this.state[normalized].pressed = false;
return pressed;

}

consumeReleased(action) {
const normalized = this.normalizeAction(action);
if (!normalized || !this.state[normalized]) return false;

const released = this.state[normalized].released;
this.state[normalized].released = false;
return released;

}

/* -------------------------------------------------------
UPDATE LOOP
-------------------------------------------------------
This should be called once per frame by the game core.
It clears one-frame flags and can later poll gamepads.
------------------------------------------------------- /
update() {
/
Clear edge-triggered states every frame.
The game loop can read them once and then they disappear.
*/
for (const action of this.actionNames) {
const entry = this.state[action];
if (!entry) continue;

  entry.pressed = false;
  entry.released = false;
}

if (this.gamepadEnabled) {
  this.pollGamepads();
}

}

/* -------------------------------------------------------
GAMEPAD SUPPORT
-------------------------------------------------------
This is prepared now so it can be expanded later.
For the first version, it keeps the structure ready.
------------------------------------------------------- */
pollGamepads() {
if (typeof navigator === "undefined" || !navigator.getGamepads) {
return;
}

const pads = navigator.getGamepads();
if (!pads) return;

for (const pad of pads) {
  if (!pad || !pad.connected) continue;

  /*
    Simple example mapping:
    - dpad buttons for movement
    - south button for jump
    - start for pause

    Later we can make this more advanced.
  */
  const dpadUp = pad.buttons?.[12]?.pressed;
  const dpadDown = pad.buttons?.[13]?.pressed;
  const dpadLeft = pad.buttons?.[14]?.pressed;
  const dpadRight = pad.buttons?.[15]?.pressed;

  const south = pad.buttons?.[0]?.pressed;
  const east = pad.buttons?.[1]?.pressed;
  const start = pad.buttons?.[9]?.pressed;

  if (dpadUp) this.setAction(inputMap.actions.MOVE_FORWARD, true, 1);
  if (dpadDown) this.setAction(inputMap.actions.MOVE_BACK, true, 1);
  if (dpadLeft) this.setAction(inputMap.actions.MOVE_LEFT, true, 1);
  if (dpadRight) this.setAction(inputMap.actions.MOVE_RIGHT, true, 1);

  this.setAction(inputMap.actions.JUMP, Boolean(south), south ? 1 : 0);
  this.setAction(inputMap.actions.CANCEL, Boolean(east), east ? 1 : 0);
  this.setAction(inputMap.actions.PAUSE, Boolean(start), start ? 1 : 0);
}

}

/* -------------------------------------------------------
SNAPSHOTS AND DEBUGGING
------------------------------------------------------- /
getSnapshot() {
/
Return a deep-ish copy of the state so other systems can
inspect input without mutating the live state.
*/
const snapshot = {};

for (const action of this.actionNames) {
  snapshot[action] = { ...this.state[action] };
}

return {
  actions: snapshot,
  enabled: {
    keyboard: Boolean(this.options.enableKeyboard),
    touch: Boolean(this.options.enableTouch),
    gamepad: Boolean(this.gamepadEnabled)
  }
};

}

debugString() {
const active = this.actionNames
.filter((action) => this.isActive(action))
.join(", ");

return active.length > 0 ? active : "none";

}

/* -------------------------------------------------------
RESET / CLEANUP
------------------------------------------------------- */
reset() {
for (const action of this.actionNames) {
if (!this.state[action]) continue;

  this.state[action].active = false;
  this.state[action].pressed = false;
  this.state[action].released = false;
  this.state[action].value = 0;
  this.state[action].lastChangedAt = 0;
}

}

destroy() {
/*
Remove all event listeners that were created by this manager.
This is very important for restart flows and hot reload flows.
*/
for (const [type, element, handler] of this.boundHandlers) {
element.removeEventListener(type, handler);
}

this.boundHandlers.length = 0;
this.reset();

}
}

/*
The game will usually create one input manager instance and share
it through the core game object.
*/
export default InputManager;
