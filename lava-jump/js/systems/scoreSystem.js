/* =========================================================
FILE 35: js/systems/scoreSystem.js

This file handles score updates and scoring rules.

Purpose:

- Track score changes in one place
- Handle coin rewards, checkpoint rewards, and bonuses
- Keep scoring separate from movement and collision logic
- Make it easy to rebalance the game later

This system does not decide when an event happens.
It only applies score changes after other systems trigger them.
========================================================= */

import gameConfig from "../config/gameConfig.js";
import { clamp } from "../utils/math.js";

/**

* ScoreSystem

* ---

* Manages the player's score and related bonus logic.

* 

* The game core should call update() once per frame.

* Other systems can also call the helper methods directly

* when coins, checkpoints, or level-complete events occur.
  */
  class ScoreSystem {
  constructor(options = {}) {
  this.options = {
  coinValue: gameConfig.gameplay.coinValue,
  checkpointValue: gameConfig.gameplay.checkpointValue,
  levelCompleteBonus: gameConfig.gameplay.levelCompleteBonus,
  fallPenalty: gameConfig.gameplay.fallPenalty,
  timeBonusEnabled: gameConfig.gameplay.timeBonusEnabled,
  timeBonusPerSecondRemaining: gameConfig.gameplay.timeBonusPerSecondRemaining,
  debug: false,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  
  this.state = {
  totalScore: 0,
  coinsCollected: 0,
  checkpointsActivated: 0,
  bonusScore: 0,
  lastScoreEventAt: 0,
  lastScoreEventType: null
  };
  }

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
Expected game fields:
- game.state.player
- game.state.score
- game.state.coinsCollected
------------------------------------------------------- */
update(game, dt = 0.016) {
if (!game || !game.state || !game.state.player) return;

const player = game.state.player;

/*
  Keep the game state's score values aligned with the player
  entity whenever possible.
*/
this.state.totalScore = player.score ?? this.state.totalScore;
this.state.coinsCollected = player.coins ?? this.state.coinsCollected;

game.state.score = this.state.totalScore;
game.state.coinsCollected = this.state.coinsCollected;

if (this.debug) {
  console.log("[ScoreSystem]", {
    totalScore: this.state.totalScore,
    coinsCollected: this.state.coinsCollected,
    checkpointsActivated: this.state.checkpointsActivated
  });
}

}

/* -------------------------------------------------------
SCORE HELPERS
------------------------------------------------------- */

addScore(game, points = 0, reason = "generic") {
if (!game || !game.state || !game.state.player) return 0;

const player = game.state.player;
const value = Math.max(0, Number(points) || 0);

if (typeof player.addScore === "function") {
  player.addScore(value);
} else {
  player.score = (player.score || 0) + value;
}

this.state.totalScore = player.score || 0;
game.state.score = this.state.totalScore;

this._recordEvent(reason);

return this.state.totalScore;

}

addCoins(game, count = 1) {
if (!game || !game.state || !game.state.player) return 0;

const player = game.state.player;
const value = Math.max(0, Number(count) || 0);

if (typeof player.addCoins === "function") {
  player.addCoins(value);
} else {
  player.coins = (player.coins || 0) + value;
  player.score = (player.score || 0) + value * this.options.coinValue;
}

this.state.coinsCollected = player.coins || 0;
this.state.totalScore = player.score || this.state.totalScore;

game.state.coinsCollected = this.state.coinsCollected;
game.state.score = this.state.totalScore;

this._recordEvent("coin");

return this.state.coinsCollected;

}

addCheckpoint(game, checkpointId = null) {
if (!game || !game.state || !game.state.player) return 0;

const player = game.state.player;

if (typeof player.addScore === "function") {
  player.addScore(this.options.checkpointValue);
} else {
  player.score = (player.score || 0) + this.options.checkpointValue;
}

this.state.totalScore = player.score || 0;
this.state.checkpointsActivated += 1;

game.state.score = this.state.totalScore;
game.state.checkpointId = checkpointId;

this._recordEvent("checkpoint");

return this.state.totalScore;

}

addLevelCompleteBonus(game, timeRemaining = 0) {
if (!game || !game.state || !game.state.player) return 0;

const player = game.state.player;
const bonus = Math.max(0, Number(this.options.levelCompleteBonus) || 0);

let timeBonus = 0;
if (this.options.timeBonusEnabled) {
  const secondsLeft = Math.max(0, Number(timeRemaining) || 0);
  timeBonus = secondsLeft * this.options.timeBonusPerSecondRemaining;
}

const totalBonus = Math.round(bonus + timeBonus);

if (typeof player.addScore === "function") {
  player.addScore(totalBonus);
} else {
  player.score = (player.score || 0) + totalBonus;
}

this.state.totalScore = player.score || 0;
this.state.bonusScore += totalBonus;

game.state.score = this.state.totalScore;

this._recordEvent("level_complete");

return totalBonus;

}

applyFallPenalty(game) {
if (!game || !game.state || !game.state.player) return 0;

const player = game.state.player;
const penalty = Math.max(0, Number(this.options.fallPenalty) || 0);

if (penalty <= 0) return 0;

if (typeof player.addScore === "function") {
  player.addScore(-penalty);
} else {
  player.score = clamp((player.score || 0) - penalty, 0, Infinity);
}

this.state.totalScore = player.score || 0;
game.state.score = this.state.totalScore;

this._recordEvent("fall_penalty");

return penalty;

}

/* -------------------------------------------------------
LEVEL / EVENT WRAPPERS
-------------------------------------------------------
These methods make it easy for other systems to report events
without knowing the exact scoring formula.
------------------------------------------------------- */

onCoinCollected(game, coin = null) {
const value = coin?.value ?? this.options.coinValue;
this.addScore(game, value, "coin");
this.addCoins(game, 1);
}

onCheckpointActivated(game, checkpoint = null) {
const checkpointId = checkpoint?.id || null;
this.addCheckpoint(game, checkpointId);
}

onEnemyDefeated(game, enemy = null) {
/*
Enemy score rewards can be adjusted later. For now this uses
a simple coin-like reward or any custom bonus attached to the enemy.
*/
const reward = Math.max(0, Number(enemy?.scoreReward ?? 50) || 50);
this.addScore(game, reward, "enemy_defeated");
}

onObstacleDodged(game, obstacle = null) {
const reward = Math.max(0, Number(obstacle?.dodgeReward ?? 0) || 0);
if (reward > 0) {
this.addScore(game, reward, "obstacle_dodged");
}
}

onPlayerHit(game, amount = 0) {
/*
This hook is intentionally conservative.
Damage does not always have to reduce score, but the hook is
available if a future mode wants to penalize hits.
*/
const penalty = Math.max(0, Number(amount) || 0);
if (penalty > 0 && this.options.fallPenalty > 0) {
this.applyFallPenalty(game);
}
}

/* -------------------------------------------------------
RANK / STAGE HELPERS
-------------------------------------------------------
These are optional helpers for future UI or progression logic.
------------------------------------------------------- */

getScoreRank(score = this.state.totalScore) {
const value = Math.max(0, Number(score) || 0);

if (value >= 5000) return "S";
if (value >= 2500) return "A";
if (value >= 1500) return "B";
if (value >= 800) return "C";
if (value >= 300) return "D";
return "E";

}

getComboBonus(multiplier = 1) {
const safeMultiplier = Math.max(1, Number(multiplier) || 1);
return Math.round(10 * safeMultiplier);
}

/* -------------------------------------------------------
STATE MANAGEMENT
------------------------------------------------------- */

reset() {
this.state.totalScore = 0;
this.state.coinsCollected = 0;
this.state.checkpointsActivated = 0;
this.state.bonusScore = 0;
this.state.lastScoreEventAt = 0;
this.state.lastScoreEventType = null;
}

syncFromPlayer(player) {
if (!player) return;

this.state.totalScore = player.score || 0;
this.state.coinsCollected = player.coins || 0;

}

/* -------------------------------------------------------
INTERNAL EVENT TRACKING
------------------------------------------------------- */

_recordEvent(type) {
this.state.lastScoreEventType = type;
this.state.lastScoreEventAt = performance.now?.() ?? Date.now();
}

/* -------------------------------------------------------
ACCESSORS
------------------------------------------------------- */

getTotalScore() {
return this.state.totalScore;
}

getCoinsCollected() {
return this.state.coinsCollected;
}

getCheckpointCount() {
return this.state.checkpointsActivated;
}

getBonusScore() {
return this.state.bonusScore;
}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
options: {
coinValue: this.options.coinValue,
checkpointValue: this.options.checkpointValue,
levelCompleteBonus: this.options.levelCompleteBonus,
fallPenalty: this.options.fallPenalty,
timeBonusEnabled: this.options.timeBonusEnabled,
timeBonusPerSecondRemaining: this.options.timeBonusPerSecondRemaining
},
state: { ...this.state }
};
}
}

export default ScoreSystem;
