/* =========================================================
FILE 37: js/systems/respawnSystem.js

This file handles player respawning after death or falls.

Purpose:

- Return the player to the latest safe spawn point
- Keep respawn timing and invulnerability in one place
- Support checkpoints and level spawn locations
- Keep respawn flow separate from health and collision rules

This system is intentionally simple now, but it is ready for
future additions like respawn animation, fade effects, or
checkpoint-based progress restoration.
========================================================= */

import gameConfig from "../config/gameConfig.js";
import GAME_CONSTANTS from "../data/constants.js";
import { vec3 } from "../utils/math.js";

/**

* RespawnSystem

* ---

* Manages where and when the player comes back after death,

* lava falls, or other fail states.

* 

* The game core should call update() once per frame.

* Other systems can also call the helper methods directly when

* they need to trigger a respawn.
  */
  class RespawnSystem {
  constructor(options = {}) {
  this.options = {
  respawnDelayMs: 0,
  restoreHealthOnRespawn: true,
  grantInvulnerabilityOnRespawn: true,
  invulnerabilityMs: gameConfig.player.spawnInvulnerabilityMs,
  debug: false,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  
  this.state = {
  pending: false,
  requestedAt: 0,
  reason: null,
  lastRespawnAt: 0,
  respawnCount: 0
  };
  }

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
Expected game fields:
- game.state.player
- game.state.respawnPoint
- game.state.checkpointId
------------------------------------------------------- */
update(game, dt = 0.016) {
if (!game || !game.state || !game.state.player) return;

const player = game.state.player;

/*
  If a respawn has been requested, wait until the delay has
  elapsed, then bring the player back safely.
*/
if (this.state.pending) {
  const now = performance.now?.() ?? Date.now();
  const elapsed = now - this.state.requestedAt;

  if (elapsed >= this.options.respawnDelayMs) {
    this.respawnPlayer(game, this.state.reason || "pending");
    this.state.pending = false;
    this.state.reason = null;
  }
}

/*
  If the player is dead but the game has not yet requested a
  respawn, trigger one automatically when lives remain.
*/
if (player.alive === false && !this.state.pending) {
  const lives = typeof player.lives === "number" ? player.lives : 0;

  if (lives > 0) {
    this.requestRespawn(game, "auto_death");
  }
}

if (this.debug) {
  console.log("[RespawnSystem]", {
    pending: this.state.pending,
    respawnCount: this.state.respawnCount,
    lastRespawnAt: this.state.lastRespawnAt
  });
}

}

/* -------------------------------------------------------
REQUEST / CANCEL
------------------------------------------------------- */

requestRespawn(game, reason = "unknown") {
if (!game || !game.state) return false;

this.state.pending = true;
this.state.requestedAt = performance.now?.() ?? Date.now();
this.state.reason = reason;

if (this.debug) {
  console.log("[RespawnSystem] respawn requested:", reason);
}

return true;

}

cancelRespawn() {
this.state.pending = false;
this.state.requestedAt = 0;
this.state.reason = null;
}

isPending() {
return this.state.pending;
}

/* -------------------------------------------------------
RESPAWN LOGIC
-------------------------------------------------------
Places the player back at the current respawn point or at
the level spawn if no checkpoint has been set.
------------------------------------------------------- */

respawnPlayer(game, reason = "manual") {
if (!game || !game.state || !game.state.player) return false;

const player = game.state.player;
const state = game.state;

const point = this._getRespawnPoint(game);
if (!point) return false;

/*
  Move player to the respawn location.
  Player methods are preferred when available, but raw
  assignment works too.
*/
if (typeof player.respawn === "function") {
  player.respawn(point);
} else if (typeof player.setPosition === "function") {
  player.setPosition(point);
  player.alive = true;
  player.health = gameConfig.gameplay.startHealth;
  player.state = GAME_CONSTANTS.PLAYER_STATE.IDLE;
} else {
  player.position = vec3(point.x, point.y, point.z);
  player.alive = true;
  player.health = gameConfig.gameplay.startHealth;
  player.state = GAME_CONSTANTS.PLAYER_STATE.IDLE;
}

/*
  Clean up velocity and airborne state so the player does not
  immediately fall or slide after respawning.
*/
if (player.velocity) {
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.velocity.z = 0;
}

player.onGround = false;
player.inLava = false;
player.jumpsUsed = 0;

if (this.options.restoreHealthOnRespawn) {
  player.health = gameConfig.gameplay.startHealth;
}

if (this.options.grantInvulnerabilityOnRespawn) {
  const now = performance.now?.() ?? Date.now();
  player.isInvulnerable = true;
  player.invulnerableUntil = now + this.options.invulnerabilityMs;
}

state.isGameOver = false;
state.isPaused = false;
state.appState = GAME_CONSTANTS.APP_STATE.PLAYING;
state.flags.needsInputReset = true;

this.state.pending = false;
this.state.reason = null;
this.state.lastRespawnAt = performance.now?.() ?? Date.now();
this.state.respawnCount += 1;

if (typeof game.camera?.stopShake === "function") {
  game.camera.stopShake();
}

if (typeof game.inputManager?.reset === "function") {
  game.inputManager.reset();
}

if (this.debug) {
  console.log("[RespawnSystem] player respawned:", reason, point);
}

return true;

}

/* -------------------------------------------------------
RESPAWN POINT HELPERS
------------------------------------------------------- */

_getRespawnPoint(game) {
const state = game?.state || {};
const player = state.player || null;

/*
  Priority:
  1) game state respawn point from checkpoint
  2) player spawn point if the entity provides one
  3) level spawn point
  4) default origin
*/
if (state.respawnPoint) {
  return vec3(
    state.respawnPoint.x ?? 0,
    state.respawnPoint.y ?? 0,
    state.respawnPoint.z ?? 0
  );
}

if (player && typeof player.spawnPoint === "object") {
  return vec3(
    player.spawnPoint.x ?? 0,
    player.spawnPoint.y ?? 0,
    player.spawnPoint.z ?? 0
  );
}

const level = game.currentLevel || null;
if (level?.spawn) {
  return vec3(
    level.spawn.x ?? 0,
    level.spawn.y ?? 0,
    level.spawn.z ?? 0
  );
}

return vec3(0, 0, 0);

}

setRespawnPoint(game, point) {
if (!game || !game.state || !point) return false;

game.state.respawnPoint = {
  x: point.x ?? 0,
  y: point.y ?? 0,
  z: point.z ?? 0
};

if (this.debug) {
  console.log("[RespawnSystem] respawn point set:", game.state.respawnPoint);
}

return true;

}

clearRespawnPoint(game) {
if (!game || !game.state) return false;

game.state.respawnPoint = {
  x: 0,
  y: 0,
  z: 0
};

return true;

}

/* -------------------------------------------------------
CHECKPOINT INTEGRATION
-------------------------------------------------------
These helpers let checkpoint systems update respawn points
without knowing the internals of this system.
------------------------------------------------------- */

onCheckpointActivated(game, checkpoint) {
if (!checkpoint) return false;

const point = typeof checkpoint.getRespawnPoint === "function"
  ? checkpoint.getRespawnPoint()
  : {
      x: checkpoint.position?.x ?? 0,
      y: (checkpoint.position?.y ?? 0) + (checkpoint.respawnOffsetY ?? 1.2),
      z: checkpoint.position?.z ?? 0
    };

this.setRespawnPoint(game, point);

if (game?.state) {
  game.state.checkpointId = checkpoint.id || null;
}

return true;

}

onLevelStart(game) {
if (!game || !game.state) return false;

const level = game.currentLevel || null;
if (level?.spawn) {
  this.setRespawnPoint(game, level.spawn);
} else {
  this.clearRespawnPoint(game);
}

this.cancelRespawn();
return true;

}

/* -------------------------------------------------------
RESET / STATE
------------------------------------------------------- */

reset() {
this.state.pending = false;
this.state.requestedAt = 0;
this.state.reason = null;
this.state.lastRespawnAt = 0;
this.state.respawnCount = 0;
}

snapshot() {
return {
options: {
respawnDelayMs: this.options.respawnDelayMs,
restoreHealthOnRespawn: this.options.restoreHealthOnRespawn,
grantInvulnerabilityOnRespawn: this.options.grantInvulnerabilityOnRespawn,
invulnerabilityMs: this.options.invulnerabilityMs
},
state: { ...this.state }
};
}
}

export default RespawnSystem;
