/* =========================================================
FILE 32: js/systems/jumpSystem.js

This file handles player jumping behavior.

Purpose:

- Read jump input from the game state
- Trigger player jump actions
- Control jump timing and jump availability
- Keep jump logic separate from movement and collision

This system is intentionally focused on jumping only.
The Player entity still owns the physics details, while this
system decides when jump actions should happen.
========================================================= */

import gameConfig from "../config/gameConfig.js";

/**

* JumpSystem

* ---

* Reads jump-related input and tells the player when to jump.

* 

* The game core should call update() once per frame.

* This keeps the input-to-jump flow easy to maintain and later

* extend with mechanics like coyote time, double jump rules,

* or jump buffering.
  */
  class JumpSystem {
  constructor(options = {}) {
  this.options = {
  enableJumpBuffer: true,
  jumpBufferMs: 120,
  enableCoyoteTime: true,
  coyoteTimeMs: 100,
  debug: false,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  
  this.state = {
  lastJumpPressedAt: 0,
  lastGroundedAt: 0
  };
  }

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
Expected game fields:
- game.state.player
- game.state.input.activeActions
------------------------------------------------------- */
update(game, dt = 0.016) {
if (!game || !game.state || !game.state.player) return;

const player = game.state.player;
const actions = game.state.input?.activeActions || {};

if (!player.alive) return;

const now = performance.now?.() ?? Date.now();

if (player.onGround) {
  this.state.lastGroundedAt = now;
}

/*
  Record the moment the jump input was pressed.
  This lets us support jump buffering, which feels better
  when the player presses jump slightly before landing.
*/
if (actions.JUMP) {
  this.state.lastJumpPressedAt = now;
}

const jumpReady = this._canTriggerJump(player, now);

if (jumpReady && actions.JUMP) {
  this._triggerJump(player, now);
  game.state.input.activeActions.JUMP = false;
}

/*
  If the player is already airborne, we still allow the
  Player entity to continue its own jump/fall simulation.
*/
if (typeof player.update === "function") {
  // Do not call player.update() here if the game core already does.
  // This system only handles jump decisions.
}

if (this.debug) {
  console.log("[JumpSystem]", {
    onGround: player.onGround,
    jumpsUsed: player.jumpsUsed,
    lastJumpPressedAt: this.state.lastJumpPressedAt,
    lastGroundedAt: this.state.lastGroundedAt
  });
}

}

/* -------------------------------------------------------
JUMP RULES
------------------------------------------------------- */

_canTriggerJump(player, now) {
if (!player || !player.alive) return false;

const bufferEnabled = this.options.enableJumpBuffer;
const coyoteEnabled = this.options.enableCoyoteTime;

const bufferedJumpOk = bufferEnabled
  ? (now - this.state.lastJumpPressedAt) <= this.options.jumpBufferMs
  : true;

const groundedOrCoyoteOk = player.onGround || (
  coyoteEnabled
    ? (now - this.state.lastGroundedAt) <= this.options.coyoteTimeMs
    : false
);

/*
  If the player has jump capacity available, allow the jump.
  The Player class can handle whether this is a normal jump
  or a double jump.
*/
const hasJumpMethod = typeof player.jump === "function";

return Boolean(hasJumpMethod && bufferedJumpOk && groundedOrCoyoteOk);

}

_triggerJump(player, now) {
if (!player || typeof player.jump !== "function") return false;

const jumped = player.jump();

if (jumped) {
  this.state.lastJumpPressedAt = 0;
  this.state.lastGroundedAt = now;

  if (this.debug) {
    console.log("[JumpSystem] jump triggered");
  }
}

return jumped;

}

/* -------------------------------------------------------
INPUT BUFFERING
-------------------------------------------------------
These helpers let other systems or UI buttons trigger jump
without directly knowing about the timing logic.
------------------------------------------------------- */

requestJump() {
this.state.lastJumpPressedAt = performance.now?.() ?? Date.now();
}

clearJumpRequest() {
this.state.lastJumpPressedAt = 0;
}

forceJump(player) {
if (!player || typeof player.jump !== "function") return false;
return player.jump();
}

/* -------------------------------------------------------
STATE HELPERS
------------------------------------------------------- */

getState() {
return { ...this.state };
}

setJumpBufferMs(value) {
this.options.jumpBufferMs = Math.max(0, Number(value) || 0);
}

setCoyoteTimeMs(value) {
this.options.coyoteTimeMs = Math.max(0, Number(value) || 0);
}

enableBuffering(enabled = true) {
this.options.enableJumpBuffer = Boolean(enabled);
}

enableCoyoteTime(enabled = true) {
this.options.enableCoyoteTime = Boolean(enabled);
}

/* -------------------------------------------------------
DEBUG / SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
options: {
enableJumpBuffer: this.options.enableJumpBuffer,
jumpBufferMs: this.options.jumpBufferMs,
enableCoyoteTime: this.options.enableCoyoteTime,
coyoteTimeMs: this.options.coyoteTimeMs
},
state: { ...this.state }
};
}
}

export default JumpSystem;
