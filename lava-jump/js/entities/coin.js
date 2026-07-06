/* =========================================================
FILE 28: js/entities/coin.js

This file defines collectible coin entities for the game.

Purpose:

- Represent score pickups in the level
- Keep collectible behavior separate from player logic
- Support animation, visibility, and collection state
- Make it easy to add different collectible types later

This file is intentionally small and expandable.
Coins can be reused for normal points, bonus items, or keys
in future levels.
========================================================= */

import gameConfig from "../config/gameConfig.js";
import { vec3 } from "../utils/math.js";

/**

* Coin

* ---

* A collectible entity that the player can pick up.

* 

* The first version keeps the coin simple:

* - it has a position

* - it can animate

* - it can be collected once

* - it gives score when collected
    */
    class Coin {
    constructor(options = {}) {
    this.options = {
    id: "coin_${Math.random().toString(36).slice(2, 8)}",
    name: "Coin",
    position: vec3(0, 0, 0),
    value: gameConfig.gameplay.coinValue,
    spinSpeed: 2.4,
    floatAmplitude: 0.2,
    floatSpeed: 1.5,
    visible: true,
    active: true,
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
  
  this.value = Math.max(0, Number(this.options.value) || 0);
  this.spinSpeed = Number(this.options.spinSpeed) || 0;
  this.floatAmplitude = Number(this.options.floatAmplitude) || 0;
  this.floatSpeed = Number(this.options.floatSpeed) || 0;
  
  this.visible = Boolean(this.options.visible);
  this.active = Boolean(this.options.active);
  this.collected = false;
  
  this.rotation = 0;
  this.floatTime = 0;
  this.pulseTime = 0;
  
  this.bounds = {
  radius: 0.35
  };
  
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

this.collected = false;
this.active = true;
this.visible = true;
this.rotation = 0;
this.floatTime = 0;
this.pulseTime = 0;

}

/* -------------------------------------------------------
STATES
------------------------------------------------------- */

show() {
this.visible = true;
}

hide() {
this.visible = false;
}

enable() {
this.active = true;
this.show();
}

disable() {
this.active = false;
this.hide();
}

collect() {
if (!this.active || this.collected) return false;

this.collected = true;
this.disable();
return true;

}

isCollected() {
return this.collected;
}

isAvailable() {
return this.active && !this.collected && this.visible;
}

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
Coins can spin and float to make them easier to spot.
The actual visuals will be handled later by the renderer.
------------------------------------------------------- */

update(dt = 0.016) {
if (!this.active || this.collected) return;

this.rotation += this.spinSpeed * dt;
this.floatTime += dt;
this.pulseTime += dt;

const floatOffset = Math.sin(this.floatTime * this.floatSpeed) * this.floatAmplitude;
this.position.y = this.basePosition.y + floatOffset;

}

/* -------------------------------------------------------
COLLISION
-------------------------------------------------------
The coin uses a small radius for simple pickup detection.
This makes it easy to collect with a player sphere or AABB.
------------------------------------------------------- */

getCenter() {
return vec3(this.position.x, this.position.y, this.position.z);
}

getRadius() {
return this.bounds.radius;
}

intersectsPoint(point) {
if (!point || this.collected || !this.active) return false;

const dx = (point.x ?? 0) - this.position.x;
const dy = (point.y ?? 0) - this.position.y;
const dz = (point.z ?? 0) - this.position.z;

const distanceSq = dx * dx + dy * dy + dz * dz;
const radius = this.bounds.radius;

return distanceSq <= radius * radius;

}

intersectsEntity(entity) {
if (!entity || this.collected || !this.active) return false;

const point = entity.position || entity.getCenter?.() || entity;
return this.intersectsPoint(point);

}

/**

* Apply collection to a player-like entity.
* Returns true when the coin was successfully collected.
  */
  applyToPlayer(player) {
  if (!player || !this.active || this.collected) return false;

const intersects = this.intersectsEntity(player);
if (!intersects) return false;

const collected = this.collect();
if (!collected) return false;

if (typeof player.addCoins === "function") {
  player.addCoins(1);
}

if (typeof player.addScore === "function") {
  player.addScore(this.value);
}

return true;

}

/* -------------------------------------------------------
SCORE / VALUE
------------------------------------------------------- */

setValue(value) {
this.value = Math.max(0, Number(value) || 0);
}

getValue() {
return this.value;
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
value: this.value,
visible: this.visible,
active: this.active,
collected: this.collected,
rotation: this.rotation,
floatTime: this.floatTime,
pulseTime: this.pulseTime
};
}

debugString() {
const p = this.position;
return "Coin(${this.id} @ ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})";
}

/* -------------------------------------------------------
CLEANUP
------------------------------------------------------- */

destroy() {
this.disable();
this.collected = true;
}
}

export default Coin;
