/* =========================================================
FILE 7: js/input/desktopInput.js

This file handles desktop keyboard input.

Purpose:

- Listen for keyboard events
- Translate keys into game actions
- Send those actions to the central input manager
- Keep desktop control logic separate from the game itself

Important design rule:
This file does not decide gameplay.
It only reports input.
========================================================= */

import inputMap from "./inputMap.js";

/**

* DesktopInput

* ---

* Small helper that attaches keyboard listeners and forwards

* keyboard activity to the InputManager.

* 

* The InputManager is still the source of truth for action state.

* This class only feeds it.
  */
  class DesktopInput {
  constructor(inputManager, options = {}) {
  this.inputManager = inputManager;
  this.options = {
  preventDefault: true,
  enableRepeat: false,
  debug: false,
  ...options
  };
  
  this.keyBindings = inputMap.keys;
  this.bound = false;
  
  this._onKeyDown = this._onKeyDown.bind(this);
  this._onKeyUp = this._onKeyUp.bind(this);
  this._onBlur = this._onBlur.bind(this);
  }

/* -------------------------------------------------------
SETUP / TEARDOWN
------------------------------------------------------- */
bind(target = window) {
if (!target || this.bound) return;

this.target = target;

target.addEventListener("keydown", this._onKeyDown, { passive: false });
target.addEventListener("keyup", this._onKeyUp, { passive: false });
target.addEventListener("blur", this._onBlur);

this.bound = true;

if (this.options.debug) {
  console.log("[DesktopInput] bound");
}

}

unbind() {
if (!this.bound || !this.target) return;

this.target.removeEventListener("keydown", this._onKeyDown);
this.target.removeEventListener("keyup", this._onKeyUp);
this.target.removeEventListener("blur", this._onBlur);

this.bound = false;
this.target = null;

if (this.options.debug) {
  console.log("[DesktopInput] unbound");
}

}

/* -------------------------------------------------------
EVENT HANDLERS
------------------------------------------------------- */
_onKeyDown(event) {
const action = this.resolveAction(event.code);
if (!action) return;

if (this.options.preventDefault) {
  event.preventDefault();
}

/*
  If repeat is disabled, ignore repeated keydown events.
  This prevents one held key from firing many "pressed" edges.
*/
if (!this.options.enableRepeat && event.repeat) {
  return;
}

this.inputManager.setAction(action, true, 1);

if (this.options.debug) {
  console.log(`[DesktopInput] down: ${event.code} -> ${action}`);
}

}

_onKeyUp(event) {
const action = this.resolveAction(event.code);
if (!action) return;

if (this.options.preventDefault) {
  event.preventDefault();
}

this.inputManager.setAction(action, false, 0);

if (this.options.debug) {
  console.log(`[DesktopInput] up: ${event.code} -> ${action}`);
}

}

_onBlur() {
/*
If the browser window loses focus, release all actions.
This avoids "stuck key" problems when the player alt-tabs.
*/
this.inputManager.reset();

if (this.options.debug) {
  console.log("[DesktopInput] blur -> reset");
}

}

/* -------------------------------------------------------
RESOLUTION HELPERS
------------------------------------------------------- */
resolveAction(keyCode) {
return this.keyBindings[keyCode] || null;
}

isMapped(keyCode) {
return Boolean(this.resolveAction(keyCode));
}

getMappedAction(keyCode) {
return this.resolveAction(keyCode);
}

/* -------------------------------------------------------
OPTIONAL MANUAL ACTIONS
------------------------------------------------------- */
press(action) {
this.inputManager.setAction(action, true, 1);
}

release(action) {
this.inputManager.setAction(action, false, 0);
}

tap(action) {
this.inputManager.tap(action);
}
}

export default DesktopInput;
