/* =========================================================
FILE 44: js/ui/hud.js

This file manages the in-game heads-up display.

Purpose:

- Update score, coins, time, and health values
- Keep HUD logic separate from gameplay systems
- Make it easy to refresh or replace the UI later
- Provide a clean central place for game status text

The HUD should only display state.
It should not decide gameplay rules.
========================================================= */

import { setText, setAttr } from "../utils/dom.js";
import { formatTime } from "../utils/time.js";

/**

* HUD

* ---

* A lightweight UI controller for the game display.

* 

* It reads values from the game state and writes them into the

* appropriate DOM elements.
  */
  class HUD {
  constructor(options = {}) {
  this.options = {
  debug: false,
  ...options
  };
  
  this.elements = {
  scoreValue: null,
  coinValue: null,
  timeValue: null,
  healthValue: null,
  objectiveText: null,
  levelText: null,
  livesValue: null,
  debugState: null
  };
  
  this.visible = true;
  this.debug = Boolean(this.options.debug);
  
  this.state = {
  lastScore: null,
  lastCoins: null,
  lastTime: null,
  lastHealth: null,
  lastObjective: null,
  lastLevel: null,
  lastLives: null
  };
  }

/* -------------------------------------------------------
BINDING
------------------------------------------------------- */

bind(elements = {}) {
this.elements = {
...this.elements,
...elements
};

if (this.debug) {
  console.log("[HUD] bound elements");
}

}

setElement(name, element) {
if (!(name in this.elements)) return false;
this.elements[name] = element;
return true;
}

getElement(name) {
return this.elements[name] || null;
}

/* -------------------------------------------------------
VISIBILITY
------------------------------------------------------- */

show() {
this.visible = true;
this._toggleRoot(true);
}

hide() {
this.visible = false;
this._toggleRoot(false);
}

toggle(force) {
const next = typeof force === "boolean" ? force : !this.visible;
next ? this.show() : this.hide();
return this.visible;
}

isVisible() {
return this.visible;
}

_toggleRoot(visible) {
const root =
this.elements.root ||
this.elements.hudLayer ||
null;

if (!root) return;
root.hidden = !visible;

}

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
The game core or UI manager can call update() every frame
or only when state changes.
------------------------------------------------------- */

update(gameState = null) {
if (!gameState) return;

const player = gameState.player || {};
const score = gameState.score ?? player.score ?? 0;
const coins = gameState.coinsCollected ?? player.coins ?? 0;
const health = player.health ?? 100;
const lives = player.lives ?? 0;
const time = gameState.world?.time ?? 0;
const objective = gameState.objectiveText || "";
const levelName = gameState.levelName || "";

this.setScore(score);
this.setCoins(coins);
this.setTime(time);
this.setHealth(health);
this.setObjective(objective);
this.setLevelName(levelName);
this.setLives(lives);

if (this.elements.debugState && gameState.appState) {
  setText(this.elements.debugState, String(gameState.appState));
}

}

/* -------------------------------------------------------
VALUE SETTERS
------------------------------------------------------- */

setScore(value) {
const next = Number(value) || 0;
if (this.state.lastScore === next) return;
this.state.lastScore = next;
setText(this.elements.scoreValue, String(next));
}

setCoins(value) {
const next = Number(value) || 0;
if (this.state.lastCoins === next) return;
this.state.lastCoins = next;
setText(this.elements.coinValue, String(next));
}

setTime(value) {
const next = Math.max(0, Number(value) || 0);
const formatted = formatTime(next);
if (this.state.lastTime === formatted) return;
this.state.lastTime = formatted;
setText(this.elements.timeValue, formatted);
}

setHealth(value) {
const next = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
if (this.state.lastHealth === next) return;
this.state.lastHealth = next;
setText(this.elements.healthValue, "${next}%");
}

setObjective(text) {
const next = text == null ? "" : String(text);
if (this.state.lastObjective === next) return;
this.state.lastObjective = next;
setText(this.elements.objectiveText, next);
}

setLevelName(name) {
const next = name == null ? "" : String(name);
if (this.state.lastLevel === next) return;
this.state.lastLevel = next;
setText(this.elements.levelText, next);
}

setLives(value) {
const next = Math.max(0, Math.floor(Number(value) || 0));
if (this.state.lastLives === next) return;
this.state.lastLives = next;
setText(this.elements.livesValue, String(next));
}

/* -------------------------------------------------------
STATUS / NOTICES
------------------------------------------------------- */

setPauseState(isPaused) {
if (this.elements.debugState) {
setText(this.elements.debugState, isPaused ? "paused" : "running");
}
}

setGameOverState() {
if (this.elements.debugState) {
setText(this.elements.debugState, "game_over");
}
}

setWinState() {
if (this.elements.debugState) {
setText(this.elements.debugState, "win");
}
}

setLevelProgress(progress = 0) {
if (!this.elements.levelProgress) return;

const next = Math.max(0, Math.min(1, Number(progress) || 0));
setAttr(this.elements.levelProgress, "value", next);

}

flashMessage(message, durationMs = 1200) {
if (!this.elements.message) return;

setText(this.elements.message, message);

if (this._messageTimer) {
  clearTimeout(this._messageTimer);
  this._messageTimer = null;
}

this._messageTimer = setTimeout(() => {
  setText(this.elements.message, "");
  this._messageTimer = null;
}, Math.max(0, Number(durationMs) || 0));

}

/* -------------------------------------------------------
RESET
------------------------------------------------------- */

reset() {
this.state.lastScore = null;
this.state.lastCoins = null;
this.state.lastTime = null;
this.state.lastHealth = null;
this.state.lastObjective = null;
this.state.lastLevel = null;
this.state.lastLives = null;

this.setScore(0);
this.setCoins(0);
this.setTime(0);
this.setHealth(100);
this.setObjective("");
this.setLevelName("");
this.setLives(0);

}

destroy() {
if (this._messageTimer) {
clearTimeout(this._messageTimer);
this._messageTimer = null;
}

this.elements = {};
this.visible = false;

}
}

export default HUD;
