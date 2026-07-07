/* =========================================================
FILE 36: js/systems/healthSystem.js

This file handles player health, damage, healing, and death.

Purpose:

- Keep all health-related rules in one place
- Apply damage and healing cleanly
- Support invulnerability, damage cooldowns, and death flow
- Keep health logic separate from movement, collision, and score

This system is designed to stay simple at the start, but it
already supports the common rules a platform game needs.
========================================================= */

import gameConfig from "../config/gameConfig.js";
import GAME_CONSTANTS from "../data/constants.js";

/**

* HealthSystem

* ---

* Manages player health and related life/death state.

* 

* The game core should call update() once per frame, and other

* systems can call the helper methods when damage or healing occurs.
  */
  class HealthSystem {
  constructor(options = {}) {
  this.options = {
  maxHealth: gameConfig.gameplay.startHealth,
  startLives: gameConfig.gameplay.startLives,
  spawnInvulnerabilityMs: gameConfig.player.spawnInvulnerabilityMs,
  debug: false,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  
  this.state = {
  totalDamageTaken: 0,
  totalHealed: 0,
  deaths: 0,
  lastDamageAt: 0,
  lastHealAt: 0,
  lastDeathReason: null
  };
  }

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
Expected game fields:
- game.state.player
- game.state.isGameOver
------------------------------------------------------- */
update(game, dt = 0.016) {
if (!game || !game.state || !game.state.player) return;

const player = game.state.player;

/*
  Sync the player's invulnerability state if the player entity
  exposes a time-based invulnerability window.
*/
if (player.isInvulnerable && player.invulnerableUntil) {
  const now = performance.now?.() ?? Date.now();
  if (now >= player.invulnerableUntil) {
    player.isInvulnerable = false;
  }
}

/*
  If the player is dead and still has lives available, the
  system can later handle respawn logic or inform the game.
  Respawn itself is usually handled by the respawn system.
*/
if (player.health <= 0 && player.alive !== false) {
  this.killPlayer(game, "health_depleted");
}

if (this.debug) {
  console.log("[HealthSystem]", {
    health: player.health,
    lives: player.lives,
    totalDamageTaken: this.state.totalDamageTaken,
    totalHealed: this.state.totalHealed
  });
}

}

/* -------------------------------------------------------
DAMAGE
------------------------------------------------------- */

canTakeDamage(player) {
if (!player) return false;
if (player.alive === false) return false;
if (player.isInvulnerable) return false;

return true;

}

applyDamage(game, amount = 0, reason = "generic") {
if (!game || !game.state || !game.state.player) return 0;

const player = game.state.player;
if (!this.canTakeDamage(player)) return 0;

const damage = Math.max(0, Number(amount) || 0);
if (damage <= 0) return 0;

if (typeof player.takeDamage === "function") {
  player.takeDamage(damage, reason);
} else {
  player.health = Math.max(0, (player.health ?? this.options.maxHealth) - damage);
}

this.state.totalDamageTaken += damage;
this.state.lastDamageAt = performance.now?.() ?? Date.now();

if (player.health <= 0) {
  this.killPlayer(game, reason);
}

return damage;

}

applyPercentDamage(game, percent = 0, reason = "generic") {
const value = Math.max(0, Number(percent) || 0);
const maxHealth = this.options.maxHealth;
return this.applyDamage(game, (maxHealth * value) / 100, reason);
}

/* -------------------------------------------------------
HEALING
------------------------------------------------------- */

applyHeal(game, amount = 0, reason = "generic") {
if (!game || !game.state || !game.state.player) return 0;

const player = game.state.player;
if (player.alive === false) return 0;

const healValue = Math.max(0, Number(amount) || 0);
if (healValue <= 0) return 0;

const maxHealth = this.options.maxHealth;

if (typeof player.heal === "function") {
  player.heal(healValue);
} else {
  player.health = Math.min(maxHealth, (player.health ?? maxHealth) + healValue);
}

this.state.totalHealed += healValue;
this.state.lastHealAt = performance.now?.() ?? Date.now();

if (this.debug) {
  console.log("[HealthSystem] healed", healValue, reason);
}

return healValue;

}

restoreFullHealth(game) {
if (!game || !game.state || !game.state.player) return 0;

const player = game.state.player;
const maxHealth = this.options.maxHealth;
const missing = Math.max(0, maxHealth - (player.health ?? maxHealth));

if (missing > 0) {
  this.applyHeal(game, missing, "full_restore");
}

return maxHealth;

}

/* -------------------------------------------------------
INVULNERABILITY
------------------------------------------------------- */

grantInvulnerability(game, durationMs = this.options.spawnInvulnerabilityMs) {
if (!game || !game.state || !game.state.player) return false;

const player = game.state.player;
const now = performance.now?.() ?? Date.now();

player.isInvulnerable = true;
player.invulnerableUntil = now + Math.max(0, Number(durationMs) || 0);

if (this.debug) {
  console.log("[HealthSystem] invulnerable until", player.invulnerableUntil);
}

return true;

}

clearInvulnerability(game) {
if (!game || !game.state || !game.state.player) return false;

const player = game.state.player;
player.isInvulnerable = false;
player.invulnerableUntil = 0;

return true;

}

/* -------------------------------------------------------
LIVES / DEATH
------------------------------------------------------- */

loseLife(game) {
if (!game || !game.state || !game.state.player) return 0;

const player = game.state.player;
const lives = typeof player.loseLife === "function"
  ? player.loseLife()
  : Math.max(0, (player.lives ?? this.options.startLives) - 1);

player.lives = lives;
return lives;

}

killPlayer(game, reason = "unknown") {
if (!game || !game.state || !game.state.player) return false;

const player = game.state.player;

if (player.alive === false) {
  return false;
}

if (typeof player.kill === "function") {
  player.kill(reason);
} else {
  player.alive = false;
  player.health = 0;
  player.state = GAME_CONSTANTS.PLAYER_STATE.DEAD;
}

this.state.deaths += 1;
this.state.lastDeathReason = reason;
player.health = 0;

const livesLeft = this.loseLife(game);

/*
  If no lives remain, mark the game as over.
  Respawn handling can be done by a separate system when lives
  are still available.
*/
if (livesLeft <= 0) {
  game.gameOver?.(reason);
  if (game.state) {
    game.state.isGameOver = true;
    game.state.appState = GAME_CONSTANTS.APP_STATE.GAME_OVER;
  }
} else {
  if (game.state) {
    game.state.flags.needsInputReset = true;
  }
}

if (this.debug) {
  console.log("[HealthSystem] player killed", reason, "lives left:", livesLeft);
}

return true;

}

revivePlayer(game, position = null) {
if (!game || !game.state || !game.state.player) return false;

const player = game.state.player;

if (typeof player.revive === "function") {
  player.revive();
} else {
  player.alive = true;
  player.health = this.options.maxHealth;
  player.state = GAME_CONSTANTS.PLAYER_STATE.IDLE;
}

player.health = this.options.maxHealth;
player.lives = Math.max(0, player.lives ?? this.options.startLives);
player.isInvulnerable = true;
player.invulnerableUntil = (performance.now?.() ?? Date.now()) + this.options.spawnInvulnerabilityMs;

if (position) {
  if (typeof player.setPosition === "function") {
    player.setPosition(position);
  } else {
    player.position.x = position.x ?? player.position.x;
    player.position.y = position.y ?? player.position.y;
    player.position.z = position.z ?? player.position.z;
  }
}

if (this.debug) {
  console.log("[HealthSystem] player revived");
}

return true;

}

/* -------------------------------------------------------
EVENT WRAPPERS
-------------------------------------------------------
These helpers let collision or hazard systems report damage
without knowing the internal health implementation.
------------------------------------------------------- */

onLavaDamage(game, amount = 0) {
return this.applyDamage(game, amount, "lava");
}

onObstacleDamage(game, amount = 0) {
return this.applyDamage(game, amount, "obstacle");
}

onEnemyDamage(game, amount = 0) {
return this.applyDamage(game, amount, "enemy");
}

onHealPickup(game, amount = 0) {
return this.applyHeal(game, amount, "pickup");
}

onCheckpoint(game) {
/*
Checkpoints can safely restore invulnerability so the player
does not get instantly damaged after respawning.
*/
this.grantInvulnerability(game);
}

/* -------------------------------------------------------
STATE HELPERS
------------------------------------------------------- */

reset() {
this.state.totalDamageTaken = 0;
this.state.totalHealed = 0;
this.state.deaths = 0;
this.state.lastDamageAt = 0;
this.state.lastHealAt = 0;
this.state.lastDeathReason = null;
}

syncFromPlayer(player) {
if (!player) return;

if (typeof player.health === "number") {
  this.state.lastKnownHealth = player.health;
}

if (typeof player.lives === "number") {
  this.state.lastKnownLives = player.lives;
}

}

getTotalDamageTaken() {
return this.state.totalDamageTaken;
}

getTotalHealed() {
return this.state.totalHealed;
}

getDeaths() {
return this.state.deaths;
}

getLastDeathReason() {
return this.state.lastDeathReason;
}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
options: {
maxHealth: this.options.maxHealth,
startLives: this.options.startLives,
spawnInvulnerabilityMs: this.options.spawnInvulnerabilityMs
},
state: { ...this.state }
};
}
}

export default HealthSystem;
