/* =========================================================
FILE 9: js/input/mobileInput.js

This file handles mobile-specific input behavior.

Purpose:

- Detect touch and mobile-like interaction
- Convert swipes, taps, and touch gestures into actions
- Work together with touchControls.js and InputManager
- Keep mobile logic separate from desktop keyboard logic

Important design rule:
The game should not care whether a jump came from:

- a button tap
- a screen swipe
- a future gesture
- or another mobile input source

It should only receive the action name:

- JUMP
- MOVE_FORWARD
- MOVE_LEFT
- MOVE_RIGHT
- PAUSE
  ========================================================= */

import inputMap from "./inputMap.js";
import gameConfig from "../config/gameConfig.js";

/**

* MobileInput

* ---

* Handles touch gestures and mobile interaction behavior.

* 

* This class does not replace touchControls.js.

* Instead, it complements it by supporting gestures and

* screen-based actions that are not tied to a specific button.
  */
  class MobileInput {
  constructor(inputManager, options = {}) {
  this.inputManager = inputManager;
  
  this.options = {
  targetElement: null,
  enableGestures: true,
  enableTapToJump: true,
  enableSwipeMovement: true,
  preventScroll: true,
  swipeThresholdPx: gameConfig.input.swipeThresholdPx,
  tapThresholdMs: gameConfig.input.tapThresholdMs,
  debug: false,
  ...options
  };
  
  this.targetElement = this.options.targetElement;
  this.bound = false;
  
  this.touchState = {
  active: false,
  startX: 0,
  startY: 0,
  startTime: 0,
  lastX: 0,
  lastY: 0,
  pointerId: null,
  moved: false
  };
  
  this._onPointerDown = this._onPointerDown.bind(this);
  this._onPointerMove = this._onPointerMove.bind(this);
  this._onPointerUp = this._onPointerUp.bind(this);
  this._onPointerCancel = this._onPointerCancel.bind(this);
  }

/* -------------------------------------------------------
ATTACH / DETACH
------------------------------------------------------- */
bind(targetElement = this.targetElement) {
if (!targetElement || this.bound) return;

this.targetElement = targetElement;

/*
  Pointer events are preferred because they work across
  phones, tablets, styluses, and some browsers that unify
  touch and mouse input.
*/
targetElement.addEventListener("pointerdown", this._onPointerDown, { passive: false });
targetElement.addEventListener("pointermove", this._onPointerMove, { passive: false });
targetElement.addEventListener("pointerup", this._onPointerUp, { passive: false });
targetElement.addEventListener("pointercancel", this._onPointerCancel, { passive: false });

this.bound = true;

if (this.options.debug) {
  console.log("[MobileInput] bound");
}

}

unbind() {
if (!this.bound || !this.targetElement) return;

this.targetElement.removeEventListener("pointerdown", this._onPointerDown);
this.targetElement.removeEventListener("pointermove", this._onPointerMove);
this.targetElement.removeEventListener("pointerup", this._onPointerUp);
this.targetElement.removeEventListener("pointercancel", this._onPointerCancel);

this.bound = false;
this.targetElement = null;
this.resetTouchState();

if (this.options.debug) {
  console.log("[MobileInput] unbound");
}

}

/* -------------------------------------------------------
POINTER / TOUCH EVENT HANDLERS
------------------------------------------------------- */
_onPointerDown(event) {
if (!this._isPrimaryTouchLikeEvent(event)) return;

if (this.options.preventScroll) {
  event.preventDefault();
}

this.touchState.active = true;
this.touchState.startX = event.clientX;
this.touchState.startY = event.clientY;
this.touchState.lastX = event.clientX;
this.touchState.lastY = event.clientY;
this.touchState.startTime = performance.now?.() ?? Date.now();
this.touchState.pointerId = event.pointerId ?? null;
this.touchState.moved = false;

if (this.options.debug) {
  console.log("[MobileInput] pointerdown", {
    x: event.clientX,
    y: event.clientY
  });
}

}

_onPointerMove(event) {
if (!this.touchState.active) return;
if (this.touchState.pointerId !== null && event.pointerId !== this.touchState.pointerId) return;

if (this.options.preventScroll) {
  event.preventDefault();
}

const dx = event.clientX - this.touchState.startX;
const dy = event.clientY - this.touchState.startY;

this.touchState.lastX = event.clientX;
this.touchState.lastY = event.clientY;

if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
  this.touchState.moved = true;
}

/*
  When swipe movement is enabled, we can convert directional
  swipes into actions while the finger is still on screen.
  This makes the game feel responsive.
*/
if (this.options.enableSwipeMovement) {
  this._applyDirectionalSwipe(dx, dy);
}

if (this.options.debug) {
  console.log("[MobileInput] pointermove", { dx, dy });
}

}

_onPointerUp(event) {
if (!this.touchState.active) return;
if (this.touchState.pointerId !== null && event.pointerId !== this.touchState.pointerId) return;

if (this.options.preventScroll) {
  event.preventDefault();
}

const endTime = performance.now?.() ?? Date.now();
const elapsedMs = endTime - this.touchState.startTime;

const dx = event.clientX - this.touchState.startX;
const dy = event.clientY - this.touchState.startY;

/*
  A short tap can be treated as JUMP.
  That gives mobile players a quick one-touch action.
*/
if (this.options.enableTapToJump && this._isTap(elapsedMs, dx, dy)) {
  this.inputManager.tap(inputMap.actions.JUMP);
  if (this.options.debug) {
    console.log("[MobileInput] tap -> JUMP");
  }
}

/*
  When a swipe ends, we can finalize a direction if needed.
  This supports a more direct "flick to move" feel.
*/
if (this.options.enableSwipeMovement) {
  this._finalizeSwipe(dx, dy);
}

this.resetTouchState();

if (this.options.debug) {
  console.log("[MobileInput] pointerup", { elapsedMs, dx, dy });
}

}

_onPointerCancel(event) {
if (this.options.preventScroll) {
event.preventDefault();
}

this.resetTouchState();

if (this.options.debug) {
  console.log("[MobileInput] pointercancel");
}

}

/* -------------------------------------------------------
GESTURE LOGIC
------------------------------------------------------- /
_isPrimaryTouchLikeEvent(event) {
/
On some browsers, pointerType may be "touch", "pen", or "mouse".
We keep mouse support possible here, but this class is mainly
intended for touch screens.
*/
if (!event) return false;

const pointerType = event.pointerType || "touch";
return pointerType === "touch" || pointerType === "pen";

}

_isTap(elapsedMs, dx, dy) {
const distance = Math.hypot(dx, dy);
return elapsedMs <= this.options.tapThresholdMs && distance <= this.options.swipeThresholdPx * 0.35;
}

_applyDirectionalSwipe(dx, dy) {
const threshold = this.options.swipeThresholdPx;

/*
  We only treat the gesture as directional if it crosses
  a clear threshold. Small movements are ignored.
*/
if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
  return;
}

/*
  This game is landscape-first.
  Horizontal swipes usually feel best for left/right movement.
  Vertical swipes can be used for forward/back or jump if needed.
*/
if (Math.abs(dx) > Math.abs(dy)) {
  if (dx > threshold) {
    this.inputManager.setAction(inputMap.actions.MOVE_RIGHT, true, 1);
    this.inputManager.setAction(inputMap.actions.MOVE_LEFT, false, 0);
  } else if (dx < -threshold) {
    this.inputManager.setAction(inputMap.actions.MOVE_LEFT, true, 1);
    this.inputManager.setAction(inputMap.actions.MOVE_RIGHT, false, 0);
  }
} else {
  if (dy < -threshold) {
    this.inputManager.setAction(inputMap.actions.MOVE_FORWARD, true, 1);
    this.inputManager.setAction(inputMap.actions.MOVE_BACK, false, 0);
  } else if (dy > threshold) {
    this.inputManager.setAction(inputMap.actions.MOVE_BACK, true, 1);
    this.inputManager.setAction(inputMap.actions.MOVE_FORWARD, false, 0);
  }
}

}

_finalizeSwipe(dx, dy) {
const threshold = this.options.swipeThresholdPx;

/*
  When the finger leaves the screen, release any swipe-driven
  actions so movement does not remain stuck.
*/
if (Math.abs(dx) >= threshold || Math.abs(dy) >= threshold) {
  this.releaseSwipeActions();
}

}

releaseSwipeActions() {
this.inputManager.setAction(inputMap.actions.MOVE_FORWARD, false, 0);
this.inputManager.setAction(inputMap.actions.MOVE_BACK, false, 0);
this.inputManager.setAction(inputMap.actions.MOVE_LEFT, false, 0);
this.inputManager.setAction(inputMap.actions.MOVE_RIGHT, false, 0);
}

/* -------------------------------------------------------
STATE HELPERS
------------------------------------------------------- */
resetTouchState() {
this.touchState.active = false;
this.touchState.startX = 0;
this.touchState.startY = 0;
this.touchState.startTime = 0;
this.touchState.lastX = 0;
this.touchState.lastY = 0;
this.touchState.pointerId = null;
this.touchState.moved = false;
}

isTouchActive() {
return this.touchState.active;
}

getTouchState() {
return { ...this.touchState };
}

/*
Useful helper for menus or overlays that want to know
whether the current device is likely touch-based.
*/
isTouchDevice() {
if (typeof navigator === "undefined") return false;
return (navigator.maxTouchPoints || 0) > 0;
}

isLandscape() {
if (typeof window === "undefined") return true;
return window.innerWidth >= window.innerHeight;
}

shouldEnableControls() {
if (!this.isTouchDevice()) return false;
if (!gameConfig.mobile.requireLandscape) return true;
return this.isLandscape();
}

/* -------------------------------------------------------
MANUAL ACTION BRIDGES
-------------------------------------------------------
These methods are useful if another file wants to trigger
mobile-style behavior without a real touch gesture.
------------------------------------------------------- */
tap(action) {
const normalized = this.inputManager.normalizeAction(action);
if (!normalized) return;
this.inputManager.tap(normalized);
}

press(action) {
const normalized = this.inputManager.normalizeAction(action);
if (!normalized) return;
this.inputManager.setAction(normalized, true, 1);
}

release(action) {
const normalized = this.inputManager.normalizeAction(action);
if (!normalized) return;
this.inputManager.setAction(normalized, false, 0);
}

/* -------------------------------------------------------
CLEANUP
------------------------------------------------------- */
destroy() {
this.unbind();
}
}

export default MobileInput;
