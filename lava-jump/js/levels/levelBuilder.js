/* =========================================================
FILE 43: js/levels/levelBuilder.js

This file builds runtime level entities from level data.

Purpose:

- Convert plain level objects into usable game entities
- Keep level data separate from instantiated objects
- Make it easy to rebuild or reset a level
- Provide a single place for future spawning logic

This file does not decide gameplay rules.
It simply turns data into player/platform/lava/coin/etc.
objects that the systems can use.
========================================================= */

import Player from "../entities/player.js";
import Lava from "../entities/lava.js";
import Platform from "../entities/platform.js";
import Obstacle from "../entities/obstacle.js";
import Coin from "../entities/coin.js";
import Checkpoint from "../entities/checkpoint.js";
import Enemy from "../entities/enemy.js";
import { vec3 } from "../utils/math.js";

/**

* LevelBuilder

* ---

* Builds a level into runtime objects that the game can use.

* 

* The builder is intentionally strict about structure but flexible

* about data. It can accept plain level objects and convert them

* into entity instances.
  */
  class LevelBuilder {
  constructor(options = {}) {
  this.options = {
  debug: false,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  }

/* -------------------------------------------------------
MAIN BUILD METHOD
-------------------------------------------------------
Input:
- level: a normalized or raw level object
- context: optional runtime info like spawn overrides

 Output:
   - an object containing instantiated entities and metadata
 ------------------------------------------------------- */

build(level, context = {}) {
if (!level) {
return this._createEmptyBuild();
}

const spawn = this._toVec3(level.spawn || context.spawn || vec3(0, 2, 0));

const player = new Player({
  spawnPosition: spawn,
  debug: this.debug
});

player.setSpawnPoint(spawn);

const lava = this._buildLava(level);
const platforms = this._buildPlatforms(level);
const obstacles = this._buildObstacles(level);
const coins = this._buildCoins(level);
const checkpoints = this._buildCheckpoints(level);
const enemies = this._buildEnemies(level);

const build = {
  levelId: level.id || null,
  levelName: level.name || "",
  objective: level.objective || "",
  spawn,
  player,
  lava,
  platforms,
  obstacles,
  coins,
  checkpoints,
  enemies,
  metadata: {
    theme: level.metadata?.theme || "default",
    difficulty: level.metadata?.difficulty || "easy",
    author: level.metadata?.author || "unknown",
    version: level.metadata?.version || "0.1.0"
  },
  world: {
    gravity: level.world?.gravity ?? null,
    lavaHeight: level.world?.lavaHeight ?? null,
    fog: level.world?.fog ?? null,
    ambientLight: level.world?.ambientLight ?? null,
    skyColor: level.world?.skyColor ?? null
  }
};

if (this.debug) {
  console.log("[LevelBuilder] built", {
    levelId: build.levelId,
    platforms: build.platforms.length,
    coins: build.coins.length,
    checkpoints: build.checkpoints.length,
    obstacles: build.obstacles.length,
    enemies: build.enemies.length,
    lava: build.lava.length
  });
}

return build;

}

/* -------------------------------------------------------
ENTITY BUILDERS
------------------------------------------------------- */

_buildLava(level) {
const result = [];

if (Array.isArray(level.lava)) {
  for (const item of level.lava) {
    result.push(
      new Lava({
        id: item.id,
        name: item.name,
        height: item.height ?? item.position?.y ?? 0,
        damagePerSecond: item.damagePerSecond,
        color: item.color,
        glowColor: item.glowColor,
        debug: this.debug
      })
    );
  }
}

if (Array.isArray(level.lavaZones)) {
  for (const zone of level.lavaZones) {
    const lava = new Lava({
      id: zone.id,
      name: zone.name || "Lava Zone",
      height: zone.bounds?.minY ?? level.world?.lavaHeight ?? 0,
      damagePerSecond: zone.damagePerSecond,
      debug: this.debug
    });

    if (zone.bounds) {
      lava.setBounds(zone.bounds);
    }

    result.push(lava);
  }
}

return result;

}

_buildPlatforms(level) {
if (!Array.isArray(level.platforms)) return [];

return level.platforms.map((item, index) => new Platform({
  id: item.id,
  name: item.name || `Platform ${index + 1}`,
  position: this._toVec3(item.position || vec3(0, 0, 0)),
  size: this._toVec3(item.size || vec3(4, 1, 4)),
  type: item.type || "static",
  solid: item.solid ?? true,
  visible: item.visible ?? true,
  theme: item.theme || level.metadata?.theme || "default",
  index,
  checkpoint: Boolean(item.checkpoint),
  moving: Boolean(item.moving),
  crumble: Boolean(item.crumble),
  debug: this.debug
}));

}

_buildObstacles(level) {
if (!Array.isArray(level.obstacles)) return [];

return level.obstacles.map((item, index) => new Obstacle({
  id: item.id,
  name: item.name || `Obstacle ${index + 1}`,
  type: item.type || "hazard",
  position: this._toVec3(item.position || vec3(0, 0, 0)),
  size: this._toVec3(item.size || vec3(1, 1, 1)),
  damage: item.damage ?? 25,
  damageType: item.damageType || item.type || "generic",
  solid: item.solid ?? true,
  visible: item.visible ?? true,
  active: item.active ?? true,
  moving: Boolean(item.moving),
  spinning: Boolean(item.spinning),
  falling: Boolean(item.falling),
  crushing: Boolean(item.crushing),
  timed: Boolean(item.timed),
  speedX: item.speedX,
  speedY: item.speedY,
  speedZ: item.speedZ,
  cooldownMs: item.cooldownMs,
  hitOnce: item.hitOnce,
  debug: this.debug
}));

}

_buildCoins(level) {
if (!Array.isArray(level.coins)) return [];

return level.coins.map((item, index) => new Coin({
  id: item.id,
  name: item.name || `Coin ${index + 1}`,
  position: this._toVec3(item.position || vec3(0, 0, 0)),
  value: item.value,
  spinSpeed: item.spinSpeed,
  floatAmplitude: item.floatAmplitude,
  floatSpeed: item.floatSpeed,
  visible: item.visible ?? true,
  active: item.active ?? true,
  debug: this.debug
}));

}

_buildCheckpoints(level) {
if (!Array.isArray(level.checkpoints)) return [];

return level.checkpoints.map((item, index) => new Checkpoint({
  id: item.id,
  name: item.name || `Checkpoint ${index + 1}`,
  position: this._toVec3(item.position || vec3(0, 0, 0)),
  radius: item.radius,
  active: item.active ?? true,
  visible: item.visible ?? true,
  oneTimeUse: item.oneTimeUse ?? false,
  scoreReward: item.scoreReward,
  respawnOffsetY: item.respawnOffsetY,
  debug: this.debug
}));

}

_buildEnemies(level) {
if (!Array.isArray(level.enemies)) return [];

return level.enemies.map((item, index) => new Enemy({
  id: item.id,
  name: item.name || `Enemy ${index + 1}`,
  type: item.type || "patrol",
  position: this._toVec3(item.position || vec3(0, 0, 0)),
  size: this._toVec3(item.size || vec3(1, 1, 1)),
  damage: item.damage ?? 20,
  health: item.health ?? 1,
  active: item.active ?? true,
  visible: item.visible ?? true,
  solid: item.solid ?? true,
  patrol: item.patrol ?? false,
  chase: item.chase ?? false,
  hover: item.hover ?? false,
  bounce: item.bounce ?? false,
  rotate: item.rotate ?? false,
  timed: item.timed ?? false,
  patrolSpeed: item.patrolSpeed,
  patrolStart: item.patrolStart ? this._toVec3(item.patrolStart) : null,
  patrolEnd: item.patrolEnd ? this._toVec3(item.patrolEnd) : null,
  attackRange: item.attackRange,
  attackCooldownMs: item.attackCooldownMs,
  cooldownMs: item.cooldownMs,
  speedX: item.speedX,
  speedY: item.speedY,
  speedZ: item.speedZ,
  debug: this.debug
}));

}

/* -------------------------------------------------------
HELPERS
------------------------------------------------------- */

_toVec3(value) {
if (!value) return vec3(0, 0, 0);

if (typeof value.x === "number" || typeof value.y === "number" || typeof value.z === "number") {
  return vec3(value.x ?? 0, value.y ?? 0, value.z ?? 0);
}

if (Array.isArray(value)) {
  return vec3(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
}

return vec3(0, 0, 0);

}

_createEmptyBuild() {
return {
levelId: null,
levelName: "",
objective: "",
spawn: vec3(0, 2, 0),
player: new Player({
spawnPosition: vec3(0, 2, 0),
debug: this.debug
}),
lava: [],
platforms: [],
obstacles: [],
coins: [],
checkpoints: [],
enemies: [],
metadata: {
theme: "default",
difficulty: "easy",
author: "unknown",
version: "0.1.0"
},
world: {
gravity: null,
lavaHeight: null,
fog: null,
ambientLight: null,
skyColor: null
}
};
}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

snapshot(level) {
return {
hasLevel: Boolean(level),
levelId: level?.id || null,
levelName: level?.name || "",
platformCount: Array.isArray(level?.platforms) ? level.platforms.length : 0,
coinCount: Array.isArray(level?.coins) ? level.coins.length : 0,
checkpointCount: Array.isArray(level?.checkpoints) ? level.checkpoints.length : 0,
obstacleCount: Array.isArray(level?.obstacles) ? level.obstacles.length : 0,
enemyCount: Array.isArray(level?.enemies) ? level.enemies.length : 0
};
}
}

export default LevelBuilder;
