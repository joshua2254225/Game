/* =========================================================
FILE 30: js/entities/enemy.js

This file defines enemy entities for the game.

Purpose:

- Represent hazards or hostile creatures in the world
- Keep enemy behavior separate from player and core systems
- Support future AI, patrol, attack, and movement patterns
- Provide a data-friendly base for different enemy types

This file is intentionally flexible.
The first version keeps the logic simple, but the structure
is ready for more advanced behavior later.
========================================================= */

import { vec3, clamp } from "../utils/math.js";
import gameConfig from "../config/gameConfig.js";

/**

* Enemy

* ---

* A hostile entity that can move, patrol, hurt the player,

* or act as an obstacle in the level.

* 

* The first version keeps the enemy generic so it can be used

* for many future enemy styles:

* - patrol enemy

* - hovering enemy

* - lava creature

* - projectile source

* - chase enemy
    */
    class Enemy {
    constructor(options = {}) {
    this.options = {
    id: "enemy_${Math.random().toString(36).slice(2, 8)}",
    name: "Enemy",
    type: "patrol",
    position: vec3(0, 0, 0),
    size: vec3(1, 1, 1),
    damage: 20,
    health: 1,
    active: true,
    visible: true,
    solid: true,
    debug: false,
    ...options
    };
  
  this.id = this.options.id;
  this.name = this.options.name;
  this.type = this.options.type;
  
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
  
  this.size = vec3(
  this.options.size.x ?? 1,
  this.options.size.y ?? 1,
  this.options.size.z ?? 1
  );
  
  this.damage = Math.max(0, Number(this.options.damage) || 0);
  this.health = Math.max(1, Number(this.options.health) || 1);
  
  this.active = Boolean(this.options.active);
  this.visible = Boolean(this.options.visible);
  this.solid = Boolean(this.options.solid);
  
  this.state = {
  alive: true,
  stunned: false,
  aggressive: false,
  highlighted: false,
  timer: 0,
  cooldown: 0,
  attackCooldown: 0
  };
  
  this.behavior = {
  patrol: Boolean(this.options.patrol),
  chase: Boolean(this.options.chase),
  hover: Boolean(this.options.hover),
  bounce: Boolean(this.options.bounce),
  rotate: Boolean(this.options.rotate),
  timed: Boolean(this.options.timed)
  };
  
  this.motion = {
  speedX: Number(this.options.speedX) || 0,
  speedY: Number(this.options.speedY) || 0,
  speedZ: Number(this.options.speedZ) || 0,
  directionX: Number(this.options.directionX) || 0,
  directionZ: Number(this.options.directionZ) || 0,
  phase: Number(this.options.phase) || 0
  };
  
  this.patrol = {
  enabled: Boolean(this.options.patrol),
  start: this.options.patrolStart
  ? vec3(
  this.options.patrolStart.x ?? this.position.x,
  this.options.patrolStart.y ?? this.position.y,
  this.options.patrolStart.z ?? this.position.z
  )
  : vec3(this.position.x, this.position.y, this.position.z),
  end: this.options.patrolEnd
  ? vec3(
  this.options.patrolEnd.x ?? this.position.x,
  this.options.patrolEnd.y ?? this.position.y,
  this.options.patrolEnd.z ?? this.position.z
  )
  : vec3(this.position.x + 3, this.position.y, this.position.z),
  t: 0,
  speed: Math.max(0.1, Number(this.options.patrolSpeed) || 1.2),
  forward: true
  };
  
  this.attackRange = Math.max(0.1, Number(this.options.attackRange) || 1.5);
  this.attackCooldownMs = Math.max(0, Number(this.options.attackCooldownMs) || 700);
  this.cooldownMs = Math.max(0, Number(this.options.cooldownMs) || 0);
  this.lastDamagedAt = 0;
  this.lastAttackAt = 0;
  
  this.color = this.options.color || gameConfig.colors.danger;
  
  this.debug = Boolean(this.options.debug);
  }

/* -------------------------------------------------------
POSITION / SIZE
------------------------------------------------------- */

setPosition(position) {
if (!position) return;
this.position.x = position.x ?? this.position.x;
this.position.y = position.y ?? this.position.y;
this.position.z = position.z ?? this.position.z;
}

setSize(size) {
if (!size) return;
this.size.x = Math.max(0.1, size.x ?? this.size.x);
this.size.y = Math.max(0.1, size.y ?? this.size.y);
this.size.z = Math.max(0.1, size.z ?? this.size.z);
}

moveBy(dx = 0, dy = 0, dz = 0) {
this.position.x += dx;
this.position.y += dy;
this.position.z += dz;
}

/* -------------------------------------------------------
STATES
------------------------------------------------------- */

enable() {
this.active = true;
this.state.alive = true;
this.visible = true;
}

disable() {
this.active = false;
this.state.alive = false;
}

show() {
this.visible = true;
}

hide() {
this.visible = false;
}

stun(durationMs = 500) {
this.state.stunned = true;
this.state.cooldown = Math.max(this.state.cooldown, durationMs);
}

highlight(enabled = true) {
this.state.highlighted = Boolean(enabled);
}

kill() {
this.state.alive = false;
this.disable();
}

revive() {
this.state.alive = true;
this.active = true;
this.visible = true;
this.health = Math.max(1, this.health);
}

isAlive() {
return this.state.alive && this.active;
}

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
The enemy can patrol, hover, chase, or animate.
The first version provides simple hooks for movement.
------------------------------------------------------- */

update(dt = 0.016, context = {}) {
if (!this.isAlive()) return;

this.state.timer += dt;

if (this.state.cooldown > 0) {
  this.state.cooldown = Math.max(0, this.state.cooldown - dt * 1000);
  if (this.state.cooldown <= 0) {
    this.state.stunned = false;
  }
}

if (this.state.attackCooldown > 0) {
  this.state.attackCooldown = Math.max(0, this.state.attackCooldown - dt * 1000);
}

if (this.behavior.rotate) {
  this.motion.phase += dt;
}

if (this.behavior.hover) {
  const hoverOffset = Math.sin(this.state.timer * 2.2) * 0.15;
  this.position.y = this.basePosition.y + hoverOffset;
}

if (this.behavior.bounce) {
  const bounce = Math.sin(this.state.timer * 3.0) * 0.08;
  this.position.y = this.basePosition.y + bounce;
}

if (this.behavior.patrol) {
  this._updatePatrol(dt);
}

if (this.behavior.chase && context.targetPosition) {
  this._updateChase(dt, context.targetPosition);
}

if (this.behavior.timed && this.state.timer > 2.0) {
  this.highlight(true);
}

}

_updatePatrol(dt) {
const start = this.patrol.start;
const end = this.patrol.end;

const direction = this.patrol.forward ? 1 : -1;
const target = this.patrol.forward ? end : start;

const dx = target.x - this.position.x;
const dy = target.y - this.position.y;
const dz = target.z - this.position.z;

const distance = Math.hypot(dx, dy, dz);
const speed = this.patrol.speed;

if (distance <= 0.05) {
  this.patrol.forward = !this.patrol.forward;
  return;
}

const step = Math.min(distance, speed * dt);
this.position.x += (dx / distance) * step * direction;
this.position.y += (dy / distance) * step * direction;
this.position.z += (dz / distance) * step * direction;

this.patrol.t += dt;

}

_updateChase(dt, targetPosition) {
const dx = (targetPosition.x ?? 0) - this.position.x;
const dy = (targetPosition.y ?? 0) - this.position.y;
const dz = (targetPosition.z ?? 0) - this.position.z;

const distance = Math.hypot(dx, dy, dz);
if (distance <= 0.001) return;

const speed = Math.max(0.1, this.motion.speedX || 1.5);
const step = Math.min(distance, speed * dt);

this.position.x += (dx / distance) * step;
this.position.y += (dy / distance) * step * 0.25;
this.position.z += (dz / distance) * step;

}

/* -------------------------------------------------------
GEOMETRY / COLLISION
------------------------------------------------------- */

getBounds() {
const halfX = this.size.x / 2;
const halfY = this.size.y / 2;
const halfZ = this.size.z / 2;

return {
  minX: this.position.x - halfX,
  minY: this.position.y - halfY,
  minZ: this.position.z - halfZ,
  maxX: this.position.x + halfX,
  maxY: this.position.y + halfY,
  maxZ: this.position.z + halfZ
};

}

getCenter() {
return vec3(this.position.x, this.position.y, this.position.z);
}

containsPoint(point) {
if (!point || !this.active) return false;

const b = this.getBounds();
const px = point.x ?? 0;
const py = point.y ?? 0;
const pz = point.z ?? 0;

return (
  px >= b.minX &&
  px <= b.maxX &&
  py >= b.minY &&
  py <= b.maxY &&
  pz >= b.minZ &&
  pz <= b.maxZ
);

}

intersectsEntity(entity) {
if (!entity || !this.active) return false;

const boundsA = this.getBounds();
const boundsB = typeof entity.getBounds === "function"
  ? entity.getBounds()
  : entity.bounds || null;

if (!boundsB) {
  const point = entity.position || entity;
  return this.containsPoint(point);
}

return !(
  boundsA.maxX < boundsB.minX ||
  boundsA.minX > boundsB.maxX ||
  boundsA.maxY < boundsB.minY ||
  boundsA.minY > boundsB.maxY ||
  boundsA.maxZ < boundsB.minZ ||
  boundsA.minZ > boundsB.maxZ
);

}

/* -------------------------------------------------------
DAMAGE / INTERACTION
------------------------------------------------------- */

canAttack() {
return this.isAlive() && this.state.attackCooldown <= 0;
}

shouldAttackEntity(entity) {
if (!entity || !this.canAttack()) return false;

const entityPoint = entity.position || entity.getCenter?.() || entity;
const myPoint = this.getCenter();

const dx = (entityPoint.x ?? 0) - myPoint.x;
const dy = (entityPoint.y ?? 0) - myPoint.y;
const dz = (entityPoint.z ?? 0) - myPoint.z;

return Math.hypot(dx, dy, dz) <= this.attackRange;

}

attackPlayer(player) {
if (!player || !this.shouldAttackEntity(player)) return false;

const applied = typeof player.takeDamage === "function"
  ? player.takeDamage(this.damage, this.type)
  : false;

if (applied) {
  this.state.attackCooldown = this.attackCooldownMs;
  this.lastAttackAt = performance.now?.() ?? Date.now();
  this.state.aggressive = true;
  return true;
}

return false;

}

takeDamage(amount = 1, reason = "player") {
if (!this.isAlive()) return false;

const damage = Math.max(0, Number(amount) || 0);
if (damage <= 0) return false;

this.health -= damage;
this.lastDamagedAt = performance.now?.() ?? Date.now();
this.state.highlighted = true;

if (this.health <= 0) {
  this.kill();
} else {
  this.stun(this.cooldownMs || 350);
}

if (this.debug) {
  console.log("[Enemy] damaged:", reason, damage);
}

return true;

}

setDamage(value) {
this.damage = Math.max(0, Number(value) || 0);
}

setHealth(value) {
this.health = Math.max(1, Number(value) || 1);
if (this.health > 0 && !this.state.alive) {
this.revive();
}
}

setAttackRange(value) {
this.attackRange = Math.max(0.1, Number(value) || 0.1);
}

setAttackCooldown(ms) {
this.attackCooldownMs = Math.max(0, Number(ms) || 0);
}

/* -------------------------------------------------------
PATROL HELPERS
------------------------------------------------------- */

setPatrolPoints(start, end) {
if (start) {
this.patrol.start = vec3(
start.x ?? this.patrol.start.x,
start.y ?? this.patrol.start.y,
start.z ?? this.patrol.start.z
);
}

if (end) {
  this.patrol.end = vec3(
    end.x ?? this.patrol.end.x,
    end.y ?? this.patrol.end.y,
    end.z ?? this.patrol.end.z
  );
}

this.patrol.forward = true;

}

setPatrolSpeed(value) {
this.patrol.speed = Math.max(0.1, Number(value) || 0.1);
}

resetToBasePosition() {
this.position.x = this.basePosition.x;
this.position.y = this.basePosition.y;
this.position.z = this.basePosition.z;
this.patrol.t = 0;
this.patrol.forward = true;
}

/* -------------------------------------------------------
DEBUG / SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
id: this.id,
name: this.name,
type: this.type,
position: { ...this.position },
basePosition: { ...this.basePosition },
size: { ...this.size },
damage: this.damage,
health: this.health,
active: this.active,
visible: this.visible,
solid: this.solid,
state: { ...this.state },
behavior: { ...this.behavior },
motion: { ...this.motion },
patrol: {
enabled: this.patrol.enabled,
start: { ...this.patrol.start },
end: { ...this.patrol.end },
t: this.patrol.t,
speed: this.patrol.speed,
forward: this.patrol.forward
},
attackRange: this.attackRange,
attackCooldownMs: this.attackCooldownMs,
cooldownMs: this.cooldownMs
};
}

debugString() {
const p = this.position;
return "Enemy(${this.type} @ ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})";
}

/* -------------------------------------------------------
CLEANUP
------------------------------------------------------- */

destroy() {
this.disable();
this.hide();
this.state.stunned = true;
}
}

export default Enemy;
