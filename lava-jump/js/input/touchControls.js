/* =========================================================
FILE 8: js/input/touchControls.js

This file creates and manages the on-screen touch controls.

Purpose:

- Show mobile-friendly control buttons in landscape mode
- Keep touch UI separate from keyboard input
- Let the InputManager receive the same action names as desktop
- Make the controls easy to style, show, hide, and extend

Important design rule:
This file should not contain gameplay logic.
It only creates touch UI and forwards user actions.
========================================================= */

import inputMap from "./inputMap.js";
import gameConfig from "../config/gameConfig.js";

/**

* TouchControls

* ---

* Builds and manages the mobile touch control layer.

* 

* This class is responsible for:

* - finding the touch UI container

* - creating buttons if needed

* - binding pointer/touch interactions

* - syncing with landscape-only mobile rules

* - forwarding actions to the InputManager
    */
    class TouchControls {
    constructor(inputManager, options = {}) {
    this.inputManager = inputManager;
  
  this.options = {
  container: null,
  autoCreate: false,
  showOnlyOnMobile: true,
  requireLandscape: gameConfig.mobile.requireLandscape,
  debug: false,
  ...options
  };
  
  this.container = this.options.container;
  this.buttons = new Map();
  this.visible = false;
  this.bound = false;
  
  this._onOrientationChange = this._onOrientationChange.bind(this);
  this._onResize = this._onResize.bind(this);
  }

/* -------------------------------------------------------
INIT
-------------------------------------------------------
Call init() after the DOM is ready and the container exists.
If autoCreate is enabled, the UI can be generated here too.
------------------------------------------------------- */
init() {
if (!this.container && this.options.autoCreate) {
this.container = this._createContainer();
}

if (!this.container) {
  if (this.options.debug) {
    console.warn("[TouchControls] No container found.");
  }
  return;
}

this._buildButtons();
this._bindSystemEvents();
this.updateVisibility();

if (this.options.debug) {
  console.log("[TouchControls] initialized");
}

}

setContainer(container) {
this.container = container;
this.buttons.clear();
}

/* -------------------------------------------------------
BUILD UI
-------------------------------------------------------
Buttons are created from the input map so that the visual
controls stay in sync with the action system.
------------------------------------------------------- */
_buildButtons() {
if (!this.container) return;

/*
  If the HTML already contains buttons, we reuse them.
  If not, and autoCreate is enabled, we generate them.
*/
const existing = this.container.querySelectorAll("[data-action], button[id^='touch-']");
if (existing.length > 0) {
  existing.forEach((button) => {
    const action = this._resolveButtonAction(button);
    if (!action) return;
    this._bindButton(button, action);
  });
  return;
}

if (!this.options.autoCreate) return;

const buttonSpecs = [
  {
    id: "touch-left",
    label: "◀",
    action: inputMap.actions.MOVE_LEFT,
    className: "touch-button"
  },
  {
    id: "touch-right",
    label: "▶",
    action: inputMap.actions.MOVE_RIGHT,
    className: "touch-button"
  },
  {
    id: "touch-forward",
    label: "▲",
    action: inputMap.actions.MOVE_FORWARD,
    className: "touch-button touch-button-wide"
  },
  {
    id: "touch-jump",
    label: "JUMP",
    action: inputMap.actions.JUMP,
    className: "touch-button touch-button-accent"
  }
];

for (const spec of buttonSpecs) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = spec.id;
  button.className = spec.className;
  button.textContent = spec.label;
  button.setAttribute("aria-label", spec.action);

  this.container.appendChild(button);
  this._bindButton(button, spec.action);
}

}

_createContainer() {
const el = document.createElement("aside");
el.className = "touch-ui";
el.setAttribute("aria-label", "Mobile touch controls");
document.body.appendChild(el);
return el;
}

_resolveButtonAction(button) {
if (!button) return null;

if (button.dataset?.action) {
  return this.inputManager.normalizeAction(button.dataset.action);
}

if (button.id && inputMap.touch[button.id]) {
  return inputMap.touch[button.id];
}

return null;

}

_bindButton(button, action) {
if (!button || !action) return;

/*
  Pointer events are preferred because they work across:
  - touch
  - stylus
  - mouse
*/
const onPointerDown = (event) => {
  event.preventDefault();
  this.inputManager.setAction(action, true, 1);
  button.classList.add("is-active");
};

const onPointerUp = (event) => {
  event.preventDefault();
  this.inputManager.setAction(action, false, 0);
  button.classList.remove("is-active");
};

const onPointerCancel = (event) => {
  event.preventDefault();
  this.inputManager.setAction(action, false, 0);
  button.classList.remove("is-active");
};

const onPointerLeave = (event) => {
  event.preventDefault();
  this.inputManager.setAction(action, false, 0);
  button.classList.remove("is-active");
};

button.addEventListener("pointerdown", onPointerDown, { passive: false });
button.addEventListener("pointerup", onPointerUp, { passive: false });
button.addEventListener("pointercancel", onPointerCancel, { passive: false });
button.addEventListener("pointerleave", onPointerLeave, { passive: false });

this.buttons.set(button.id || action, {
  element: button,
  action,
  handlers: {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onPointerLeave
  }
});

}

/* -------------------------------------------------------
SYSTEM EVENTS
------------------------------------------------------- */
_bindSystemEvents() {
if (this.bound) return;

window.addEventListener("resize", this._onResize);
window.addEventListener("orientationchange", this._onOrientationChange);

this.bound = true;

}

_unbindSystemEvents() {
if (!this.bound) return;

window.removeEventListener("resize", this._onResize);
window.removeEventListener("orientationchange", this._onOrientationChange);

this.bound = false;

}

_onResize() {
this.updateVisibility();
}

_onOrientationChange() {
/*
Some browsers fire orientationchange before the viewport
is fully updated, so we wait a tiny bit before re-checking.
*/
window.setTimeout(() => this.updateVisibility(), 50);
}

/* -------------------------------------------------------
VISIBILITY
-------------------------------------------------------
On mobile, controls should generally appear only in landscape.
The game will show the orientation warning in portrait.
------------------------------------------------------- */
updateVisibility() {
if (!this.container) return;

const shouldShow = this.shouldBeVisible();
this.visible = shouldShow;
this.container.style.display = shouldShow ? "flex" : "none";

if (this.options.debug) {
  console.log("[TouchControls] visible =", shouldShow);
}

}

shouldBeVisible() {
if (!this.options.showOnlyOnMobile) {
return true;
}

/*
  Basic mobile detection:
  If touch points are available, the device is likely touch-based.
  This is a practical runtime check, not a perfect one.
*/
const isTouchDevice =
  typeof navigator !== "undefined" &&
  (navigator.maxTouchPoints || 0) > 0;

if (!isTouchDevice) {
  return false;
}

if (!this.options.requireLandscape) {
  return true;
}

const isLandscape = window.innerWidth >= window.innerHeight;
return isLandscape;

}

/* -------------------------------------------------------
STATE HELPERS
------------------------------------------------------- */
show() {
if (!this.container) return;
this.container.style.display = "flex";
this.visible = true;
}

hide() {
if (!this.container) return;
this.container.style.display = "none";
this.visible = false;
}

toggle(force) {
const next = typeof force === "boolean" ? force : !this.visible;
next ? this.show() : this.hide();
}

isVisible() {
return this.visible;
}

/* -------------------------------------------------------
MANUAL BUTTON ACCESS
-------------------------------------------------------
Useful later if a menu or tutorial wants to flash one button,
disable a control, or add a special action.
------------------------------------------------------- */
getButton(actionOrId) {
const direct = this.buttons.get(actionOrId);
if (direct) return direct.element;

for (const item of this.buttons.values()) {
  if (item.action === actionOrId) {
    return item.element;
  }
}

return null;

}

setButtonEnabled(actionOrId, enabled) {
const button = this.getButton(actionOrId);
if (!button) return;

button.disabled = !enabled;
button.classList.toggle("is-disabled", !enabled);

}

setButtonActive(actionOrId, active) {
const button = this.getButton(actionOrId);
if (!button) return;

button.classList.toggle("is-active", active);

}

pulseButton(actionOrId, durationMs = 150) {
const button = this.getButton(actionOrId);
if (!button) return;

button.classList.add("is-active");
window.setTimeout(() => {
  button.classList.remove("is-active");
}, durationMs);

}

/* -------------------------------------------------------
CLEANUP
------------------------------------------------------- */
destroy() {
this._unbindSystemEvents();

for (const { element, handlers } of this.buttons.values()) {
  element.removeEventListener("pointerdown", handlers.onPointerDown);
  element.removeEventListener("pointerup", handlers.onPointerUp);
  element.removeEventListener("pointercancel", handlers.onPointerCancel);
  element.removeEventListener("pointerleave", handlers.onPointerLeave);
  element.classList.remove("is-active");
}

this.buttons.clear();
this.visible = false;

}
}

export default TouchControls;
