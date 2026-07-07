/* =========================================================
FILE 31: js/systems/movementSystem.js

This file handles player movement in the world.

Purpose:

- Read input actions
- Convert input into player motion
- Apply speed, direction, and movement rules
- Keep movement logic separate from the game core

This system is intentionally focused on movement only.
Collision, damage, scoring, and camera behavior belong in
their own systems.
========================================================= */

import gameConfig from "../config/gameConfig.js";
import { clamp, vec3 } from "../utils/math.js";

/**

* MovementSystem

* ---

* Converts input into movement for the player entity.

* 

* The game core should call update() once per frame.

* This system reads the current input state and updates the

* player's position/velocity in a controlled way.
  */
  class MovementSystem {
  constructor(options = {}) {
  this.options = {
  debug: false,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  }

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
The game object is expected to provide:
- state.player
- state.input.activeActions
- inputManager (optional)
------------------------------------------------------- */
update(game, dt = 0.016) {
if (!game || !game.state || !game.state.player) return;

const player = game.state.player;
const actions = game.state.input?.activeActions || {};

if (!player.alive) return;

/*
  Movement intent is mapped to a simple 2D input vector.
  X = left/right
  Z = forward/back
*/
const moveX = this._getAxis(actions.MOVE_RIGHT, actions.MOVE_LEFT);
const moveZ = this._getAxis(actions.MOVE_FORWARD, actions.MOVE_BACK);

/*
  The player class already knows how to apply input.
  We just feed it a normalized movement intent.
*/
if (typeof player.setInput === "function") {
  player.setInput(moveX, moveZ);
} else {
  player.inputVector = vec3(moveX, 0, moveZ);
}

/*
  Let the player apply movement-related internal logic.
  This includes friction, jump state, and velocity updates.
*/
if (typeof player.applyMovement === "function") {
  player.applyMovement(dt);
}

/*
  Update basic velocity values if the player entity does not
  fully manage them on its own.
*/
if (!player.velocity) {
  player.velocity = vec3(0, 0, 0);
}

const speed = player.onGround
  ? player.moveSpeed ?? gameConfig.player.moveSpeed
  : (player.moveSpeed ?? gameConfig.player.moveSpeed) * (player.airControlMultiplier ?? gameConfig.player.airControlMultiplier);

player.velocity.x = clamp(moveX, -1, 1) * speed;
player.velocity.z = clamp(moveZ, -1, 1) * speed;

/*
  Jump input is handled here because movement and jumping are
  closely related. The actual jump physics still live in Player.
*/
if (actions.JUMP && typeof player.jump === "function") {
  player.jump();
}

/*
  Move the player forward in time.
  Player.integrate() applies position changes based on velocity.
*/
if (typeof player.integrate === "function") {
  player.integrate(dt);
} else {
  player.position.x += player.velocity.x * dt;
  player.position.y += player.velocity.y * dt;
  player.position.z += player.velocity.z * dt;
}

if (this.debug) {
  console.log("[MovementSystem]", {
    moveX,
    moveZ,
    velocity: { ...player.velocity },
    position: { ...player.position }
  });
}

}

/* -------------------------------------------------------
AXIS HELPERS
-------------------------------------------------------
Converts two boolean actions into a single axis value.
------------------------------------------------------- */
_getAxis(positive, negative) {
const p = Boolean(positive);
const n = Boolean(negative);

if (p && !n) return 1;
if (n && !p) return -1;
return 0;

}

/* -------------------------------------------------------
UTILITY HELPERS
------------------------------------------------------- */

applyKnockback(player, forceX = 0, forceY = 0, forceZ = 0) {
if (!player) return;

if (!player.velocity) {
  player.velocity = vec3(0, 0, 0);
}

player.velocity.x += forceX;
player.velocity.y += forceY;
player.velocity.z += forceZ;

}

stopPlayer(player) {
if (!player) return;

if (!player.velocity) {
  player.velocity = vec3(0, 0, 0);
}

player.velocity.x = 0;
player.velocity.z = 0;

}

setPlayerPosition(player, position) {
if (!player || !position) return;

if (typeof player.setPosition === "function") {
  player.setPosition(position);
  return;
}

player.position.x = position.x ?? player.position.x;
player.position.y = position.y ?? player.position.y;
player.position.z = position.z ?? player.position.z;

}

/* -------------------------------------------------------
DEBUG / SNAPSHOT
------------------------------------------------------- */

snapshot(game) {
const player = game?.state?.player || null;

return {
  hasPlayer: Boolean(player),
  playerPosition: player
    ? { ...player.position }
    : null,
  playerVelocity: player
    ? { ...player.velocity }
    : null
};

}
}

export default MovementSystem;
