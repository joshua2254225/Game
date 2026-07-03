/* =========================================================
FILE 10: js/main.js

This is the main entry file for the game.

Purpose:

- Wait for the DOM to be ready
- Create the core game objects
- Connect input, UI, and rendering systems
- Start the main loop
- Keep initialization organized and easy to expand

This file should stay relatively small.
It is the bootstrap layer, not the full game itself.

Important:
Some imported modules referenced here will be created later.
That is normal. This file is written now so the project
structure stays clear from the beginning.
========================================================= */

import gameConfig from "./config/gameConfig.js";
import InputManager from "./input/inputManager.js";
import DesktopInput from "./input/desktopInput.js";
import TouchControls from "./input/touchControls.js";
import MobileInput from "./input/mobileInput.js";

/*
The following modules will be created in later steps.
They are listed here now so the startup flow is already planned.
When we make each file, this main entry will become fully usable.

Future imports will likely include:
- ./core/game.js
- ./core/renderer.js
- ./ui/hud.js
- ./ui/menu.js
- ./levels/levelLoader.js
*/

class LavaJumpApp {
constructor() {
/*
Core references are stored here so the app can manage:
- input
- touch controls
- desktop controls
- game state
- future rendering and UI objects
*/
this.dom = this._collectDom();
this.inputManager = null;
this.desktopInput = null;
this.touchControls = null;
this.mobileInput = null;

this.started = false;
this.initialized = false;
this.isLandscape = this._isLandscape();
this.isTouchDevice = this._isTouchDevice();

/*
  Update loop bookkeeping.
  We keep a requestAnimationFrame handle so we can cancel it
  later if needed.
*/
this.rafId = null;
this.lastFrameTime = 0;
this.accumulator = 0;

/*
  This will later hold the actual game core object.
  For now it is a placeholder for the future module.
*/
this.game = null;

this._bindEvents();

}

/* -------------------------------------------------------
DOM COLLECTION
-------------------------------------------------------
Gather references once at startup so the rest of the code
can use them without repeated queries.
------------------------------------------------------- */
_collectDom() {
const get = (id) => document.getElementById(id);

return {
  app: get("app"),
  gameStage: get("game-stage"),
  renderRoot: get("render-root"),
  canvas: get("game-canvas"),

  // HUD
  scoreValue: get("score-value"),
  coinValue: get("coin-value"),
  timeValue: get("time-value"),
  healthValue: get("health-value"),
  objectiveText: get("objective-text"),

  // Overlays
  startOverlay: get("start-overlay"),
  pauseOverlay: get("pause-overlay"),
  gameoverOverlay: get("gameover-overlay"),
  winOverlay: get("win-overlay"),
  startButton: get("start-button"),
  resumeButton: get("resume-button"),
  restartButton: get("restart-button"),
  nextLevelButton: get("next-level-button"),

  // Mobile UI
  touchUI: get("touch-ui"),
  touchLeft: get("touch-left"),
  touchRight: get("touch-right"),
  touchForward: get("touch-forward"),
  touchJump: get("touch-jump"),

  // Orientation / debug
  orientationWarning: get("orientation-warning"),
  debugPanel: get("debug-panel"),
  debugFps: get("debug-fps"),
  debugX: get("debug-x"),
  debugY: get("debug-y"),
  debugZ: get("debug-z"),
  debugState: get("debug-state")
};

}

/* -------------------------------------------------------
EVENT BINDING
-------------------------------------------------------
We keep all app-level event listeners here.
This makes cleanup and future updates much easier.
------------------------------------------------------- */
_bindEvents() {
if (typeof window === "undefined") return;

window.addEventListener("resize", () => this._handleViewportChange());
window.addEventListener("orientationchange", () => this._handleViewportChange());

document.addEventListener("visibilitychange", () => {
  /*
    If the tab becomes hidden, we can pause later.
    For now we only record the state and update the UI.
  */
  if (document.hidden && this.started) {
    this.pauseGame();
  }
});

}

/* -------------------------------------------------------
BOOT / INIT
-------------------------------------------------------
This is called once the DOM is ready.
------------------------------------------------------- */
async init() {
if (this.initialized) return;
this.initialized = true;

this._updateOrientationState();
this._setupInput();
this._setupTouchUI();
this._setupButtons();

/*
  The real game core will be created later.
  We keep the structure here so the app is ready to connect.
*/
this._showStartOverlay();
this._hideGameplayUI();

if (gameConfig.debug.enabledByDefault) {
  this._showDebugPanel(true);
}

this._writeDebugState("boot");

/*
  A small startup log helps while building the project.
  Later we can remove or reduce it.
*/
console.log(`[${gameConfig.gameName}] initialized`);

}

_setupInput() {
/*
InputManager is the central action dictionary.
It receives keyboard/touch/button input and turns it into
named actions like MOVE_FORWARD and JUMP.
*/
this.inputManager = new InputManager({
targetElement: this.dom.renderRoot || document.body,
enableKeyboard: true,
enableTouch: true,
enableGamepad: false,
debug: gameConfig.debug.logInputEvents
});

/*
  Desktop input listens to keyboard events.
  It forwards them to the InputManager.
*/
this.desktopInput = new DesktopInput(this.inputManager, {
  preventDefault: true,
  enableRepeat: false,
  debug: gameConfig.debug.logInputEvents
});

this.desktopInput.bind(window);

/*
  Touch controls are the visible mobile buttons.
  They are already in index.html, but this class binds them.
*/
this.touchControls = new TouchControls(this.inputManager, {
  container: this.dom.touchUI,
  autoCreate: false,
  showOnlyOnMobile: true,
  requireLandscape: gameConfig.mobile.requireLandscape,
  debug: gameConfig.debug.logInputEvents
});

this.touchControls.init();

/*
  MobileInput handles screen gestures such as taps and swipes.
  It works alongside the visible touch buttons.
*/
this.mobileInput = new MobileInput(this.inputManager, {
  targetElement: this.dom.gameStage || document.body,
  enableGestures: true,
  enableTapToJump: true,
  enableSwipeMovement: true,
  preventScroll: true,
  debug: gameConfig.debug.logInputEvents
});

this.mobileInput.bind();

/*
  The InputManager can also inspect touch buttons by ID.
  That way, the same action system can support several input styles.
*/
if (this.dom.touchUI) {
  this.inputManager.bindTouchTargets(this.dom.touchUI);
}

}

_setupTouchUI() {
if (!this.dom.touchUI) return;
this._updateTouchVisibility();
}

_setupButtons() {
if (this.dom.startButton) {
this.dom.startButton.addEventListener("click", () => this.startGame());
}

if (this.dom.resumeButton) {
  this.dom.resumeButton.addEventListener("click", () => this.resumeGame());
}

if (this.dom.restartButton) {
  this.dom.restartButton.addEventListener("click", () => this.restartGame());
}

if (this.dom.nextLevelButton) {
  this.dom.nextLevelButton.addEventListener("click", () => this.nextLevel());
}

}

/* -------------------------------------------------------
GAME FLOW
-------------------------------------------------------
These methods will later connect to the actual game core.
For now they manage the visible state and startup behavior.
------------------------------------------------------- */
startGame() {
this.started = true;
this._hideStartOverlay();
this._hideGameOverOverlay();
this._hideWinOverlay();
this._hidePauseOverlay();
this._showGameplayUI();
this._writeDebugState("running");

/*
  The actual game core will be started later once created.
  We keep this call safe so the file can be used before all
  future modules exist.
*/
if (this.game && typeof this.game.start === "function") {
  this.game.start();
}

this._beginLoop();

}

pauseGame() {
if (!this.started) return;
this._showPauseOverlay();
this._writeDebugState("paused");

if (this.game && typeof this.game.pause === "function") {
  this.game.pause();
}

}

resumeGame() {
if (!this.started) return;
this._hidePauseOverlay();
this._writeDebugState("running");

if (this.game && typeof this.game.resume === "function") {
  this.game.resume();
}

}

restartGame() {
/*
Restart should reset state, hide overlays, and start again.
Later the game core will reset level, score, player position,
and all runtime systems.
*/
this._hideGameOverOverlay();
this._hideWinOverlay();
this._hidePauseOverlay();
this._showGameplayUI();

if (this.inputManager) {
  this.inputManager.reset();
}

if (this.game && typeof this.game.restart === "function") {
  this.game.restart();
}

this.started = true;
this._writeDebugState("running");
this._beginLoop(true);

}

nextLevel() {
/*
The level system will be created later.
For now, this is a safe transition hook.
*/
if (this.game && typeof this.game.nextLevel === "function") {
this.game.nextLevel();
}

this._hideWinOverlay();
this._showGameplayUI();
this._writeDebugState("running");

}

gameOver() {
this._showGameOverOverlay();
this._writeDebugState("gameover");

if (this.game && typeof this.game.stop === "function") {
  this.game.stop();
}

}

winLevel() {
this._showWinOverlay();
this._writeDebugState("win");

if (this.game && typeof this.game.stop === "function") {
  this.game.stop();
}

}

/* -------------------------------------------------------
MAIN LOOP
-------------------------------------------------------
This is a safe bootstrap loop for now.
Later the real game object will handle update/render logic.
------------------------------------------------------- */
_beginLoop(forceRestart = false) {
if (forceRestart && this.rafId !== null) {
cancelAnimationFrame(this.rafId);
this.rafId = null;
}

if (this.rafId !== null) return;

this.lastFrameTime = performance.now();

const tick = (time) => {
  const dt = Math.min((time - this.lastFrameTime) / 1000, 0.05);
  this.lastFrameTime = time;

  this._update(dt);
  this.rafId = requestAnimationFrame(tick);
};

this.rafId = requestAnimationFrame(tick);

}

_update(dt) {
/*
Update the input manager once per frame so pressed/released
flags are cleared correctly.
*/
if (this.inputManager) {
this.inputManager.update();
}

/*
  The future game core will handle gameplay updates.
  Until then, we can still keep UI state responsive.
*/
this._updateOrientationState();
this._updateTouchVisibility();
this._updateDebugHud(dt);

if (this.game && typeof this.game.update === "function") {
  this.game.update(dt);
}

}

/* -------------------------------------------------------
VIEWPORT / ORIENTATION
------------------------------------------------------- */
_handleViewportChange() {
this._updateOrientationState();
this._updateTouchVisibility();

if (this.touchControls && typeof this.touchControls.updateVisibility === "function") {
  this.touchControls.updateVisibility();
}

}

_isLandscape() {
if (typeof window === "undefined") return true;
return window.innerWidth >= window.innerHeight;
}

_isTouchDevice() {
if (typeof navigator === "undefined") return false;
return (navigator.maxTouchPoints || 0) > 0;
}

_updateOrientationState() {
this.isLandscape = this._isLandscape();

const shouldWarn =
  this.isTouchDevice &&
  gameConfig.mobile.requireLandscape &&
  !this.isLandscape;

if (this.dom.orientationWarning) {
  this.dom.orientationWarning.hidden = !shouldWarn;
}

}

_updateTouchVisibility() {
if (!this.dom.touchUI) return;

const showControls =
  this.isTouchDevice &&
  (!gameConfig.mobile.requireLandscape || this.isLandscape);

this.dom.touchUI.style.display = showControls ? "flex" : "none";

}

/* -------------------------------------------------------
UI HELPERS
------------------------------------------------------- */
_showStartOverlay() {
this._setOverlay(this.dom.startOverlay, true);
}

_hideStartOverlay() {
this._setOverlay(this.dom.startOverlay, false);
}

_showPauseOverlay() {
this._setOverlay(this.dom.pauseOverlay, true);
}

_hidePauseOverlay() {
this._setOverlay(this.dom.pauseOverlay, false);
}

_showGameOverOverlay() {
this._setOverlay(this.dom.gameoverOverlay, true);
}

_hideGameOverOverlay() {
this._setOverlay(this.dom.gameoverOverlay, false);
}

_showWinOverlay() {
this._setOverlay(this.dom.winOverlay, true);
}

_hideWinOverlay() {
this._setOverlay(this.dom.winOverlay, false);
}

_setOverlay(element, visible) {
if (!element) return;
element.hidden = !visible;
element.classList.toggle("overlay-visible", visible);
}

_showGameplayUI() {
if (this.dom.hudValueGroup) {
this.dom.hudValueGroup.hidden = false;
}

if (this.dom.hudLayer) {
  this.dom.hudLayer.hidden = false;
}

}

_hideGameplayUI() {
if (this.dom.hudLayer) {
this.dom.hudLayer.hidden = false; // HUD exists but may be updated later
}
}

_showDebugPanel(visible) {
if (this.dom.debugPanel) {
this.dom.debugPanel.hidden = !visible;
}
}

_writeDebugState(state) {
if (this.dom.debugState) {
this.dom.debugState.textContent = String(state);
}
}

_updateDebugHud(dt) {
if (!this.dom.debugPanel || this.dom.debugPanel.hidden) return;

if (this.dom.debugFps) {
  const fps = dt > 0 ? Math.round(1 / dt) : 0;
  this.dom.debugFps.textContent = String(fps);
}

/*
  Position values are placeholders for now.
  Once the player and camera are implemented, we will feed
  real values into this panel.
*/
if (this.dom.debugX) this.dom.debugX.textContent = "0";
if (this.dom.debugY) this.dom.debugY.textContent = "0";
if (this.dom.debugZ) this.dom.debugZ.textContent = "0";

}

/* -------------------------------------------------------
CLEANUP
-------------------------------------------------------
Useful if we later need to destroy and rebuild the app.
------------------------------------------------------- */
destroy() {
if (this.rafId !== null) {
cancelAnimationFrame(this.rafId);
this.rafId = null;
}

if (this.desktopInput) {
  this.desktopInput.unbind();
}

if (this.mobileInput) {
  this.mobileInput.destroy();
}

if (this.touchControls) {
  this.touchControls.destroy();
}

if (this.inputManager) {
  this.inputManager.destroy();
}

this.started = false;
this.initialized = false;
this.game = null;

}
}

/* ---------------------------------------------------------
BOOTSTRAP

Wait until the DOM is ready, then create the app.
--------------------------------------------------------- */
function boot() {
const app = new LavaJumpApp();
app.init().catch((error) => {
console.error("[LavaJump] Failed to initialize", error);
});

/*
Expose a small debug hook during development.
This makes it easy to inspect the app from DevTools.
*/
window.__lavaJumpApp = app;
}

if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
boot();
}

export default LavaJumpApp;
