/* =========================================================
FILE 22: js/core/game.js

This file is the central game controller.

Purpose:

- Own the main gameplay state machine
- Connect input, timing, camera, renderer, and future systems
- Control start, pause, resume, restart, and stop flow
- Provide a clean structure for later level and entity systems

This file is intentionally foundational.
It is written so later files can plug into it without needing
to redesign the whole project.

Note:
Some modules referenced here will be created later.
That is expected. This file establishes the architecture.
========================================================= */

import gameConfig from "../config/gameConfig.js";
import GAME_CONSTANTS from "../data/constants.js";
import gameStateTemplate, { createDefaultGameState } from "../data/gameState.js";
import Clock from "./clock.js";
import CameraController from "./camera.js";
import Renderer from "./renderer.js";
import ResizeManager from "./resize.js";
import { clamp, vec3, copyVec3 } from "../utils/math.js";
import { nowMs } from "../utils/time.js";
import { setText } from "../utils/dom.js";

/**

* Game

* ---

* The top-level gameplay controller.

* 

* It does not render every object itself and it does not directly

* implement level content. Instead, it orchestrates systems and keeps

* runtime state organized.

* 

* The structure is designed so that future files can be added without

* rewriting this core controller.
  */
  class Game {
  constructor(options = {}) {
  this.options = {
  canvas: null,
  hud: {},
  inputManager: null,
  renderer: null,
  debug: gameConfig.debug.enabledByDefault,
  ...options
  };
  
  this.canvas = this.options.canvas;
  this.hud = { ...this.options.hud };
  this.inputManager = this.options.inputManager;
  
  this.clock = new Clock({ autoStart: false });
  this.camera = new CameraController();
  this.renderer = this.options.renderer || new Renderer({ canvas: this.canvas });
  
  this.resizeManager = new ResizeManager({
  canvas: this.canvas,
  onResize: (size) => this._handleResize(size),
  debug: this.options.debug
  });
  
  this.state = createDefaultGameState();
  this.sessionStartTime = 0;
  this.lastUpdateTime = 0;
  
  this.running = false;
  this.paused = false;
  this.destroyed = false;
  
  this.currentLevel = null;
  this.currentLevelIndex = 0;
  this.levels = [];
  this.entities = {
  player: null,
  platforms: [],
  obstacles: [],
  enemies: [],
  coins: [],
  checkpoints: [],
  effects: []
  };
  
  this.systems = {
  movement: null,
  collision: null,
  jump: null,
  lava: null,
  score: null,
  health: null,
  respawn: null
  };
  
  this._boundFrame = this._frame.bind(this);
  this._queuedResize = false;
  
  this._initRenderer();
  this.resizeManager.bind();
  this._syncHud();
  }

/* -------------------------------------------------------
INITIALIZATION
------------------------------------------------------- */

_initRenderer() {
if (!this.renderer) {
this.renderer = new Renderer({ canvas: this.canvas });
} else if (!this.renderer.initialized && this.canvas) {
this.renderer.init(this.canvas);
}

if (this.canvas && this.renderer) {
  const initialSize = this.resizeManager.update();
  if (initialSize) {
    this.renderer.resize(initialSize.width, initialSize.height, initialSize.pixelRatio);
  }
}

}

setLevels(levels = []) {
this.levels = Array.isArray(levels) ? levels.slice() : [];
this.currentLevelIndex = clamp(this.currentLevelIndex, 0, Math.max(0, this.levels.length - 1));
}

setSystems(systems = {}) {
this.systems = {
...this.systems,
...systems
};
}

setPlayer(player) {
this.entities.player = player || null;
this.state.entities.player = player || null;
}

setWorldEntities(entities = {}) {
this.entities = {
...this.entities,
...entities
};

this.state.entities = {
  ...this.state.entities,
  ...entities
};

}

/* -------------------------------------------------------
GAME FLOW
------------------------------------------------------- */

start() {
if (this.destroyed) return;
if (this.running && !this.paused) return;

this.running = true;
this.paused = false;
this.sessionStartTime = nowMs();
this.lastUpdateTime = this.sessionStartTime;

this.state.appState = GAME_CONSTANTS.APP_STATE.PLAYING;
this.state.isRunning = true;
this.state.isPaused = false;
this.state.isGameOver = false;
this.state.isWin = false;
this.state.isInitialized = true;

this.clock.start();
this.resizeManager.update();

if (this.currentLevel == null && this.levels.length > 0) {
  this.loadLevel(0);
}

this._syncStateFromLevel();
this._syncHud();
this._requestFrame();

if (this.options.debug) {
  console.log("[Game] started");
}

}

pause() {
if (!this.running || this.paused) return;

this.paused = true;
this.state.appState = GAME_CONSTANTS.APP_STATE.PAUSED;
this.state.isPaused = true;
this.clock.pause();

if (this.options.debug) {
  console.log("[Game] paused");
}

}

resume() {
if (!this.running || !this.paused) return;

this.paused = false;
this.state.appState = GAME_CONSTANTS.APP_STATE.PLAYING;
this.state.isPaused = false;
this.clock.resume();
this._requestFrame();

if (this.options.debug) {
  console.log("[Game] resumed");
}

}

stop() {
this.running = false;
this.paused = false;
this.state.isRunning = false;
this.state.isPaused = false;
this.clock.stop();

if (this.options.debug) {
  console.log("[Game] stopped");
}

}

restart() {
const levelIndex = this.currentLevelIndex;
const levelCount = this.levels.length;

this.resetState();

this.running = true;
this.paused = false;
this.clock.reset();

if (levelCount > 0) {
  this.loadLevel(clamp(levelIndex, 0, levelCount - 1));
}

this.state.appState = GAME_CONSTANTS.APP_STATE.PLAYING;
this.state.isRunning = true;
this.state.isPaused = false;

this._syncStateFromLevel();
this._syncHud();
this._requestFrame();

if (this.options.debug) {
  console.log("[Game] restarted");
}

}

completeLevel() {
this.state.levelCompleted = true;
this.state.isWin = true;
this.state.appState = GAME_CONSTANTS.APP_STATE.WIN;
this.state.isRunning = false;
this.state.isPaused = false;

this.stop();

if (this.options.debug) {
  console.log("[Game] level complete");
}

}

gameOver(reason = "unknown") {
this.state.isGameOver = true;
this.state.appState = GAME_CONSTANTS.APP_STATE.GAME_OVER;
this.state.isRunning = false;
this.state.isPaused = false;
this.state.debug.lastError = reason;

this.stop();

if (this.options.debug) {
  console.log("[Game] game over:", reason);
}

}

/* -------------------------------------------------------
LEVEL CONTROL
------------------------------------------------------- */

loadLevel(index = 0) {
if (!Array.isArray(this.levels) || this.levels.length === 0) {
this.currentLevel = null;
return null;
}

const safeIndex = clamp(index, 0, this.levels.length - 1);
const level = this.levels[safeIndex] || null;

this.currentLevelIndex = safeIndex;
this.currentLevel = level;
this.state.currentLevelIndex = safeIndex;
this.state.currentLevelId = level?.id || null;
this.state.levelName = level?.name || "";
this.state.levelLoaded = Boolean(level);
this.state.levelCompleted = false;
this.state.checkpointId = null;

if (level?.spawn) {
  this.state.respawnPoint = {
    x: level.spawn.x ?? 0,
    y: level.spawn.y ?? 0,
    z: level.spawn.z ?? 0
  };
}

this._buildLevelEntities(level);
this._syncStateFromLevel();
this._syncHud();

if (this.options.debug) {
  console.log("[Game] loaded level", level?.id || safeIndex);
}

return level;

}

nextLevel() {
if (this.levels.length === 0) return null;

const nextIndex = this.currentLevelIndex + 1;
if (nextIndex >= this.levels.length) {
  this.completeLevel();
  return null;
}

this.resetState();
this.loadLevel(nextIndex);
this.start();
return this.currentLevel;

}

_buildLevelEntities(level) {
if (!level) {
this.setWorldEntities({
player: null,
platforms: [],
obstacles: [],
enemies: [],
coins: [],
checkpoints: [],
effects: []
});
return;
}

/*
  The level format is intentionally data-driven. Later, a
  levelBuilder can turn this into actual 3D objects.
*/
this.setWorldEntities({
  player: this.entities.player,
  platforms: Array.isArray(level.platforms) ? level.platforms.slice() : [],
  obstacles: Array.isArray(level.obstacles) ? level.obstacles.slice() : [],
  enemies: Array.isArray(level.enemies) ? level.enemies.slice() : [],
  coins: Array.isArray(level.coins) ? level.coins.slice() : [],
  checkpoints: Array.isArray(level.checkpoints) ? level.checkpoints.slice() : [],
  effects: []
});

}

_syncStateFromLevel() {
this.state.entities = {
player: this.entities.player,
platforms: this.entities.platforms,
obstacles: this.entities.obstacles,
enemies: this.entities.enemies,
coins: this.entities.coins,
checkpoints: this.entities.checkpoints,
effects: this.entities.effects
};

this.state.objectiveText =
  this.currentLevel?.objective ||
  "Reach the end without falling into the lava.";

}

/* -------------------------------------------------------
UPDATE LOOP
------------------------------------------------------- */

_requestFrame() {
if (this.destroyed || !this.running || this.paused) return;
if (this._frameRequested) return;

this._frameRequested = true;
requestAnimationFrame(this._boundFrame);

}

_frame(time) {
this._frameRequested = false;

if (this.destroyed || !this.running || this.paused) {
  return;
}

const dt = this.clock.update(time);
this.update(dt);
this.render();

this._requestFrame();

}

update(dt = 0.016) {
if (this.destroyed || !this.running || this.paused) return;

this.lastUpdateTime = nowMs();
this.state.world.deltaTime = dt;
this.state.world.elapsedMs += dt * 1000;
this.state.world.time += dt;

if (this.inputManager && typeof this.inputManager.update === "function") {
  this.inputManager.update();
  this._readInputState();
}

this._updateSystems(dt);
this._updateCamera(dt);
this._syncHud();

if (this.state.player && this.state.player.health <= 0) {
  this.gameOver("health_depleted");
}

if (this.state.player && this.state.player.position.y < gameConfig.player.fallDeathY) {
  this.gameOver("fell_out_of_world");
}

}

_updateSystems(dt) {
/*
Systems are optional and can be added gradually.
Each one is checked before use so the game can start with
only a subset of files implemented.
*/
if (this.systems.movement?.update) {
this.systems.movement.update(this, dt);
}

if (this.systems.jump?.update) {
  this.systems.jump.update(this, dt);
}

if (this.systems.collision?.update) {
  this.systems.collision.update(this, dt);
}

if (this.systems.lava?.update) {
  this.systems.lava.update(this, dt);
}

if (this.systems.score?.update) {
  this.systems.score.update(this, dt);
}

if (this.systems.health?.update) {
  this.systems.health.update(this, dt);
}

if (this.systems.respawn?.update) {
  this.systems.respawn.update(this, dt);
}

}

_updateCamera(dt) {
const player = this.state.player;
if (!player || !this.camera) return;

const cameraState = this.camera.update(dt, player.position);
this.state.camera.position = cameraState.position;
this.state.camera.target = cameraState.target;

}

_readInputState() {
if (!this.inputManager || !this.state) return;

const actions = this.state.input.activeActions;
actions.MOVE_FORWARD = this.inputManager.isActive(gameConfig.input.actions[0]);
actions.MOVE_BACK = this.inputManager.isActive(gameConfig.input.actions[1]);
actions.MOVE_LEFT = this.inputManager.isActive(gameConfig.input.actions[2]);
actions.MOVE_RIGHT = this.inputManager.isActive(gameConfig.input.actions[3]);
actions.JUMP = this.inputManager.wasPressed(gameConfig.input.actions[4]);
actions.PAUSE = this.inputManager.wasPressed(gameConfig.input.actions[5]);
actions.RESTART = this.inputManager.wasPressed(gameConfig.input.actions[6]);
actions.CONFIRM = this.inputManager.wasPressed(gameConfig.input.actions[7]);
actions.CANCEL = this.inputManager.wasPressed(gameConfig.input.actions[8]);
actions.TOGGLE_DEBUG = this.inputManager.wasPressed(gameConfig.input.actions[9]);

this.state.input.lastAction = this.inputManager.debugString();
this.state.input.lastActionTime = nowMs();

if (actions.PAUSE) {
  this.pause();
}

if (actions.RESTART) {
  this.restart();
}

}

/* -------------------------------------------------------
RENDERING
------------------------------------------------------- */

render() {
if (!this.renderer || !this.renderer.context) return;

this.renderer.clear();

/*
  Future renderer code will draw:
  - 3D world / terrain
  - player
  - lava surface
  - UI/debug primitives
*/

if (this.options.debug && this.state.debug.showBounds) {
  this.renderer.beginFrame();
  this.renderer.drawDebugGrid(50, "rgba(255,255,255,0.06)");
  this.renderer.endFrame();
}

}

/* -------------------------------------------------------
RESIZE / HUD
------------------------------------------------------- */

_handleResize(size) {
if (!size || !this.renderer) return;

this.renderer.resize(size.width, size.height, size.pixelRatio);
this.state.flags.needsResize = false;

}

_syncHud() {
if (!this.hud) return;

const player = this.state.player || {};
const score = this.state.score ?? player.score ?? 0;
const coins = this.state.coinsCollected ?? player.coins ?? 0;
const health = player.health ?? 100;
const objective = this.state.objectiveText || "";

setText(this.hud.scoreValue, String(score));
setText(this.hud.coinValue, String(coins));
setText(this.hud.timeValue, this._formatTime(this.state.world.time));
setText(this.hud.healthValue, `${Math.max(0, Math.round(health))}%`);
setText(this.hud.objectiveText, objective);

}

_formatTime(seconds) {
const total = Math.max(0, Math.floor(seconds || 0));
const minutes = Math.floor(total / 60);
const remaining = total % 60;
return "${minutes}:${String(remaining).padStart(2, "0")}";
}

/* -------------------------------------------------------
STATE MANAGEMENT
------------------------------------------------------- */

resetState() {
this.state = createDefaultGameState();
this.state.appState = GAME_CONSTANTS.APP_STATE.BOOT;
this.state.isInitialized = true;
this.state.meta.updatedAt = Date.now();

this.entities = {
  player: this.entities.player,
  platforms: [],
  obstacles: [],
  enemies: [],
  coins: [],
  checkpoints: [],
  effects: []
};

if (this.inputManager) {
  this.inputManager.reset();
}

if (this.camera) {
  this.camera.reset();
}

if (this.options.debug) {
  console.log("[Game] state reset");
}

}

/* -------------------------------------------------------
ACCESSORS
------------------------------------------------------- */

getState() {
return this.state;
}

getPlayer() {
return this.state.player;
}

getCurrentLevel() {
return this.currentLevel;
}

isRunning() {
return this.running && !this.paused;
}

isPaused() {
return this.paused;
}

/* -------------------------------------------------------
DEBUG / SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
running: this.running,
paused: this.paused,
currentLevelIndex: this.currentLevelIndex,
currentLevelId: this.state.currentLevelId,
score: this.state.score,
health: this.state.player?.health ?? 0,
camera: this.camera?.snapshot?.() || null,
clock: this.clock?.snapshot?.() || null
};
}

debugString() {
const levelId = this.state.currentLevelId || "none";
const score = this.state.score ?? 0;
const health = this.state.player?.health ?? 0;
return "Game[level=${levelId}, score=${score}, health=${health}]";
}

/* -------------------------------------------------------
CLEANUP
------------------------------------------------------- */

destroy() {
this.destroyed = true;
this.stop();

if (this.resizeManager) {
  this.resizeManager.destroy();
}

if (this.camera) {
  this.camera.destroy();
}

if (this.renderer) {
  this.renderer.destroy();
}

this.entities = {
  player: null,
  platforms: [],
  obstacles: [],
  enemies: [],
  coins: [],
  checkpoints: [],
  effects: []
};

this.currentLevel = null;
this.levels = [];
this.inputManager = null;
this.hud = {};

}
}

export default Game;
