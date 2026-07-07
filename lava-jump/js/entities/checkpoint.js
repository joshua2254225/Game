/* =========================================================
FILE 29: js/entities/checkpoint.js

This file defines checkpoint entities for the game.

Purpose:

- Mark respawn locations for the player
- Provide progress-saving points inside a level
- Keep checkpoint logic separate from the player and game core
- Make it easy to add checkpoint visuals and effects later

This file is designed so later systems can trigger:

- respawn updates
- score rewards
- visual feedback
- save progress behavior
  ========================================================= */

import { vec3 } from "../utils/math.js";

/**

* Checkpoint

* ---

* A simple world entity that can be activated when the player

* reaches it. Once activated, it may update the respawn point

* and optionally reward points.
  */
  class Checkpoint {
  constructor(options = {}) {
  this.options = {
  id: "checkpoint_${Math.random().toString(36).slice(2, 8)}",
  name: "Checkpoint",
  position: vec3(0, 0, 0),
  radius: 1.25,
  active: true,
  visible: true,
  oneTimeUse: false,
  scoreReward: 100,
  respawnOffsetY: 1.2,
  debug: false,
  ...options
  };
  
  this.id = this.options.id;
  this.name = this.options.name;
  
  this.position = vec3(
  this.options.position.x ?? 0,
  this.options.position.y ?? 0,
  this.options.position.z ?? 0
  );
  
  this.basePosition = vec3(
  this.position.x,
  this.position.y,
  this.position.z
  );
  
  this.radius = Math.max(0.1, Number(this.options.radius) || 1.25);
  this.active = Boolean(this.options.active);
  this.visible = Boolean(this.options.visible);
  this.oneTimeUse = Boolean(this.options.oneTimeUse);
  this.scoreReward = Math.max(0, Number(this.options.scoreReward) || 0);
  this.respawnOffsetY = Number(this.options.respawnOffsetY) || 0;
  
  this.activated = false;
  this.activationCount = 0;
  this.lastActivatedAt = 0;
  
  this.pulseTime = 0;
  this.glowStrength = 0.5;
  
  this.debug = Boolean(this.options.debug);
  }

/* -------------------------------------------------------
POSITION / RESET
------------------------------------------------------- */

setPosition(position) {
if (!position) return;

this.position.x = position.x ?? this.position.x;
this.position.y = position.y ?? this.position.y;
this.position.z = position.z ?? this.position.z;

this.basePosition.x = this.position.x;
this.basePosition.y = this.position.y;
this.basePosition.z = this.position.z;

}

reset(position = null) {
if (position) {
this.setPosition(position);
} else {
this.position.x = this.basePosition.x;
this.position.y = this.basePosition.y;
this.position.z = this.basePosition.z;
}

this.active = true;
this.visible = true;
this.activated = false;
this.activationCount = 0;
this.lastActivatedAt = 0;
this.pulseTime = 0;

}

/* -------------------------------------------------------
STATES
------------------------------------------------------- */

enable() {
this.active = true;
this.visible = true;
}

disable() {
this.active = false;
this.visible = false;
}

show() {
this.visible = true;
}

hide() {
this.visible = false;
}

setActivated(enabled = true) {
this.activated = Boolean(enabled);
}

isActivated() {
return this.activated;
}

isAvailable() {
return this.active && this.visible && (!this.oneTimeUse || !this.activated);
}

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
Checkpoints can pulse or glow when active.
The first version keeps the animation data simple.
------------------------------------------------------- */

update(dt = 0.016) {
if (!this.active) return;
this.pulseTime += dt;
}

getPulseValue() {
return 0.5 + Math.sin(this.pulseTime * 4.0) * 0.5;
}

getGlowValue() {
return this.glowStrength * this.getPulseValue();
}

/* -------------------------------------------------------
COLLISION
-------------------------------------------------------
Checkpoints use a simple spherical pickup area.
------------------------------------------------------- */

getCenter() {
return vec3(this.position.x, this.position.y, this.position.z);
}

intersectsPoint(point) {
if (!point || !this.isAvailable()) return false;

const dx = (point.x ?? 0) - this.position.x;
const dy = (point.y ?? 0) - this.position.y;
const dz = (point.z ?? 0) - this.position.z;

const distSq = dx * dx + dy * dy + dz * dz;
return distSq <= this.radius * this.radius;

}

intersectsEntity(entity) {
if (!entity || !this.isAvailable()) return false;

const point = entity.position || entity.getCenter?.() || entity;
return this.intersectsPoint(point);

}

/**

* Activate the checkpoint if the player reaches it.
* Returns true if activation happened.
  */
  applyToPlayer(player, game = null) {
  if (!player || !this.isAvailable()) return false;

const hit = this.intersectsEntity(player);
if (!hit) return false;

this.activated = true;
this.activationCount += 1;
this.lastActivatedAt = performance.now?.() ?? Date.now();

/*
  The checkpoint can update the player's respawn location.
  We keep this optional so the checkpoint can also be used
  in levels that only reward score.
*/
if (typeof player.setSpawnPoint === "function") {
  player.setSpawnPoint({
    x: this.position.x,
    y: this.position.y + this.respawnOffsetY,
    z: this.position.z
  });
}

if (typeof player.addScore === "function") {
  player.addScore(this.scoreReward);
}

if (game && typeof game.setCheckpoint === "function") {
  game.setCheckpoint(this.id, {
    x: this.position.x,
    y: this.position.y + this.respawnOffsetY,
    z: this.position.z
  });
}

if (this.oneTimeUse) {
  this.disable();
}

return true;

}

/* -------------------------------------------------------
RESPawn HELPERS
------------------------------------------------------- */

getRespawnPoint() {
return {
x: this.position.x,
y: this.position.y + this.respawnOffsetY,
z: this.position.z
};
}

setScoreReward(value) {
this.scoreReward = Math.max(0, Number(value) || 0);
}

setRadius(value) {
this.radius = Math.max(0.1, Number(value) || 0.1);
}

/* -------------------------------------------------------
DEBUG / SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
id: this.id,
name: this.name,
position: { ...this.position },
basePosition: { ...this.basePosition },
radius: this.radius,
active: this.active,
visible: this.visible,
activated: this.activated,
activationCount: this.activationCount,
scoreReward: this.scoreReward,
respawnOffsetY: this.respawnOffsetY,
oneTimeUse: this.oneTimeUse,
pulseTime: this.pulseTime
};
}

debugString() {
const p = this.position;
return "Checkpoint(${this.id} @ ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})";
}

/* -------------------------------------------------------
CLEANUP
------------------------------------------------------- */

destroy() {
this.disable();
this.activated = true;
}
}

export default Checkpoint;
