/* =========================================================
FILE 33: js/systems/collisionSystem.js

This file handles collision detection and resolution.

Purpose:

- Check player collisions with platforms, lava, coins,
  checkpoints, obstacles, and enemies
- Keep all collision logic in one system
- Separate physics/contact checks from game rules
- Make it easier to add new collision types later

This file is intentionally structured to be easy to extend.
The first version uses simple AABB and sphere-style checks.
========================================================= */

import gameConfig from "../config/gameConfig.js";
import { clamp } from "../utils/math.js";

/**

* CollisionSystem

* ---

* Responsible for contact detection between the player and

* the world objects.

* 

* The game core can call update() every frame, and this system

* will decide what the player is touching.
  */
  class CollisionSystem {
  constructor(options = {}) {
  this.options = {
  debug: false,
  platformSnapTolerance: 0.18,
  playerBottomOffset: 0.02,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  }

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
Expected game fields:
- game.state.player
- game.entities or game.state.entities
- optional level/world collections
------------------------------------------------------- */
update(game, dt = 0.016) {
if (!game || !game.state || !game.state.player) return;

const player = game.state.player;
const world = game.state.entities || game.entities || {};

if (!player.alive) return;

this._resolvePlatformContacts(player, world.platforms || []);
this._resolveCoins(player, world.coins || []);
this._resolveCheckpoints(player, world.checkpoints || [], game);
this._resolveObstacles(player, world.obstacles || [], game);
this._resolveEnemies(player, world.enemies || [], game);
this._resolveLava(player, world.lava || [], game, dt);

if (this.debug) {
  console.log("[CollisionSystem]", {
    playerPosition: { ...player.position },
    onGround: player.onGround,
    health: player.health
  });
}

}

/* -------------------------------------------------------
PLATFORM COLLISION
-------------------------------------------------------
We treat platforms as AABBs with a top surface.
The player is snapped to the top when landing.
------------------------------------------------------- */
_resolvePlatformContacts(player, platforms) {
if (!Array.isArray(platforms) || platforms.length === 0) return;

const playerBounds = typeof player.getBounds === "function"
  ? player.getBounds()
  : this._makePlayerBounds(player);

let landed = false;

for (const platform of platforms) {
  if (!platform || platform.state?.active === false || platform.solid === false) {
    continue;
  }

  const platformBounds = typeof platform.getBounds === "function"
    ? platform.getBounds()
    : this._makeEntityBounds(platform);

  if (!platformBounds) continue;

  const horizontallyOverlapping =
    playerBounds.maxX > platformBounds.minX &&
    playerBounds.minX < platformBounds.maxX &&
    playerBounds.maxZ > platformBounds.minZ &&
    playerBounds.minZ < platformBounds.maxZ;

  if (!horizontallyOverlapping) continue;

  const platformTop = typeof platform.getTopSurfaceY === "function"
    ? platform.getTopSurfaceY()
    : platformBounds.maxY;

  const playerBottom = playerBounds.minY;

  const fallingOrLanding =
    player.velocity?.y <= 0 &&
    playerBottom <= platformTop + this.options.platformSnapTolerance &&
    playerBottom >= platformTop - 1.0;

  if (!fallingOrLanding) continue;

  if (typeof player.land === "function") {
    player.land(platformTop + this.options.playerBottomOffset);
  } else {
    player.position.y = platformTop + this.options.playerBottomOffset;
    player.velocity.y = 0;
    player.onGround = true;
    player.jumpsUsed = 0;
  }

  landed = true;
  break;
}

if (!landed && player.onGround) {
  /*
    If the player is no longer standing on a valid platform,
    clear the ground flag so gravity can take over.
  */
  const stillSupported = platforms.some((platform) => {
    if (!platform || platform.state?.active === false || platform.solid === false) {
      return false;
    }

    return typeof platform.isSupporting === "function"
      ? platform.isSupporting(player)
      : this._isPlayerOnPlatform(player, platform);
  });

  if (!stillSupported && typeof player.leaveGround === "function") {
    player.leaveGround();
  }
}

}

_isPlayerOnPlatform(player, platform) {
const p = player.position;
const b = typeof platform.getBounds === "function"
? platform.getBounds()
: this._makeEntityBounds(platform);

if (!b) return false;

const px = p.x;
const py = p.y;
const pz = p.z;

return (
  px >= b.minX &&
  px <= b.maxX &&
  pz >= b.minZ &&
  pz <= b.maxZ &&
  py <= b.maxY + this.options.platformSnapTolerance &&
  py >= b.maxY - 1.0
);

}

/* -------------------------------------------------------
COINS
-------------------------------------------------------
Coins are collected once and add score/coins.
------------------------------------------------------- */
_resolveCoins(player, coins) {
if (!Array.isArray(coins) || coins.length === 0) return;

for (const coin of coins) {
  if (!coin || coin.collected || coin.active === false) continue;

  let collected = false;

  if (typeof coin.applyToPlayer === "function") {
    collected = coin.applyToPlayer(player);
  } else if (typeof coin.intersectsEntity === "function") {
    collected = coin.intersectsEntity(player) && typeof coin.collect === "function"
      ? coin.collect()
      : false;

    if (collected) {
      if (typeof player.addCoins === "function") player.addCoins(1);
      if (typeof player.addScore === "function") player.addScore(coin.value ?? gameConfig.gameplay.coinValue);
    }
  }

  if (collected && this.debug) {
    console.log("[CollisionSystem] coin collected", coin.id || coin.name);
  }
}

}

/* -------------------------------------------------------
CHECKPOINTS
-------------------------------------------------------
A checkpoint can update the player's respawn point and
optionally reward score.
------------------------------------------------------- */
_resolveCheckpoints(player, checkpoints, game) {
if (!Array.isArray(checkpoints) || checkpoints.length === 0) return;

for (const checkpoint of checkpoints) {
  if (!checkpoint || checkpoint.active === false) continue;

  let activated = false;

  if (typeof checkpoint.applyToPlayer === "function") {
    activated = checkpoint.applyToPlayer(player, game);
  } else if (typeof checkpoint.intersectsEntity === "function") {
    activated = checkpoint.intersectsEntity(player);
    if (activated) {
      if (typeof checkpoint.setActivated === "function") {
        checkpoint.setActivated(true);
      }
      if (typeof player.setSpawnPoint === "function" && typeof checkpoint.getRespawnPoint === "function") {
        player.setSpawnPoint(checkpoint.getRespawnPoint());
      }
    }
  }

  if (activated && game && typeof game.setCheckpoint === "function") {
    game.setCheckpoint(checkpoint.id || null, checkpoint.getRespawnPoint?.() || null);
  }

  if (activated && this.debug) {
    console.log("[CollisionSystem] checkpoint activated", checkpoint.id || checkpoint.name);
  }
}

}

/* -------------------------------------------------------
OBSTACLES / ENEMIES
-------------------------------------------------------
Hazards can damage the player or trigger special effects.
------------------------------------------------------- */
_resolveObstacles(player, obstacles, game) {
if (!Array.isArray(obstacles) || obstacles.length === 0) return;

for (const obstacle of obstacles) {
  if (!obstacle || obstacle.active === false) continue;

  let hit = false;

  if (typeof obstacle.applyToPlayer === "function") {
    hit = obstacle.applyToPlayer(player);
  } else if (typeof obstacle.shouldDamageEntity === "function") {
    hit = obstacle.shouldDamageEntity(player);
    if (hit && typeof player.takeDamage === "function") {
      player.takeDamage(obstacle.damage ?? 1, obstacle.damageType || "obstacle");
    }
  } else if (typeof obstacle.intersectsEntity === "function") {
    hit = obstacle.intersectsEntity(player);
    if (hit && typeof player.takeDamage === "function") {
      player.takeDamage(obstacle.damage ?? 1, obstacle.damageType || "obstacle");
    }
  }

  if (hit && game && typeof game.camera?.shakeCamera === "function") {
    game.camera.shakeCamera(0.12, 120);
  }
}

}

_resolveEnemies(player, enemies, game) {
if (!Array.isArray(enemies) || enemies.length === 0) return;

for (const enemy of enemies) {
  if (!enemy || enemy.active === false || enemy.state?.alive === false) continue;

  let hit = false;

  if (typeof enemy.attackPlayer === "function") {
    hit = enemy.attackPlayer(player);
  } else if (typeof enemy.shouldAttackEntity === "function") {
    hit = enemy.shouldAttackEntity(player);
    if (hit && typeof player.takeDamage === "function") {
      player.takeDamage(enemy.damage ?? 1, enemy.type || "enemy");
    }
  } else if (typeof enemy.intersectsEntity === "function") {
    hit = enemy.intersectsEntity(player);
    if (hit && typeof player.takeDamage === "function") {
      player.takeDamage(enemy.damage ?? 1, enemy.type || "enemy");
    }
  }

  if (hit && game && typeof game.camera?.shakeCamera === "function") {
    game.camera.shakeCamera(0.18, 160);
  }
}

}

/* -------------------------------------------------------
LAVA
-------------------------------------------------------
Lava can exist as a single entity or a list of hazard zones.
------------------------------------------------------- */
_resolveLava(player, lavaSources, game, dt) {
if (!Array.isArray(lavaSources)) return;

for (const lava of lavaSources) {
  if (!lava || lava.active === false) continue;

  let damageApplied = 0;

  if (typeof lava.applyDamageToPlayer === "function") {
    damageApplied = lava.applyDamageToPlayer(player, dt);
  } else if (typeof lava.shouldDamageEntity === "function" && lava.shouldDamageEntity(player)) {
    const damage = (lava.damagePerSecond ?? gameConfig.gameplay.lavaDamagePerSecond) * dt;
    if (typeof player.takeDamage === "function") {
      player.takeDamage(damage, "lava");
      damageApplied = damage;
    }
  }

  if (damageApplied > 0 && game && typeof game.camera?.shakeCamera === "function") {
    game.camera.shakeCamera(0.22, 90);
  }
}

}

/* -------------------------------------------------------
HELPER BOUNDS
------------------------------------------------------- */

_makePlayerBounds(player) {
const size = player.size || { x: 0.9, y: player.height || 1.8, z: 0.9 };
return this._makeBoundsFromPositionSize(player.position || { x: 0, y: 0, z: 0 }, size);
}

_makeEntityBounds(entity) {
if (!entity) return null;

if (entity.bounds && typeof entity.bounds === "object") {
  return entity.bounds;
}

return this._makeBoundsFromPositionSize(entity.position || { x: 0, y: 0, z: 0 }, entity.size || { x: 1, y: 1, z: 1 });

}

_makeBoundsFromPositionSize(position, size) {
const halfX = (size?.x ?? 1) / 2;
const halfY = (size?.y ?? 1) / 2;
const halfZ = (size?.z ?? 1) / 2;

return {
  minX: (position?.x ?? 0) - halfX,
  minY: (position?.y ?? 0) - halfY,
  minZ: (position?.z ?? 0) - halfZ,
  maxX: (position?.x ?? 0) + halfX,
  maxY: (position?.y ?? 0) + halfY,
  maxZ: (position?.z ?? 0) + halfZ
};

}

/* -------------------------------------------------------
PUBLIC HELPERS
------------------------------------------------------- */

checkAabb(a, b) {
if (!a || !b) return false;

return !(
  a.maxX < b.minX ||
  a.minX > b.maxX ||
  a.maxY < b.minY ||
  a.minY > b.maxY ||
  a.maxZ < b.minZ ||
  a.minZ > b.maxZ
);

}

checkSpherePoint(center, radius, point) {
if (!center || !point) return false;

const dx = (point.x ?? 0) - (center.x ?? 0);
const dy = (point.y ?? 0) - (center.y ?? 0);
const dz = (point.z ?? 0) - (center.z ?? 0);

return (dx * dx + dy * dy + dz * dz) <= radius * radius;

}

clampPlayerInsideWorld(player, worldBounds = null) {
if (!player || !player.position) return;

const bounds = worldBounds || gameConfig.world.worldBounds || {
  minX: -1000,
  maxX: 1000,
  minY: -100,
  maxY: 100,
  minZ: -1000,
  maxZ: 1000
};

player.position.x = clamp(player.position.x, bounds.minX, bounds.maxX);
player.position.y = clamp(player.position.y, bounds.minY, bounds.maxY);
player.position.z = clamp(player.position.z, bounds.minZ, bounds.maxZ);

}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

snapshot(game) {
const player = game?.state?.player || null;
const world = game?.state?.entities || game?.entities || {};

return {
  hasPlayer: Boolean(player),
  platforms: Array.isArray(world.platforms) ? world.platforms.length : 0,
  coins: Array.isArray(world.coins) ? world.coins.length : 0,
  checkpoints: Array.isArray(world.checkpoints) ? world.checkpoints.length : 0,
  obstacles: Array.isArray(world.obstacles) ? world.obstacles.length : 0,
  enemies: Array.isArray(world.enemies) ? world.enemies.length : 0
};

}
}

export default CollisionSystem;
