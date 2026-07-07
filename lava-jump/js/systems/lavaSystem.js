/* =========================================================
FILE 34: js/systems/lavaSystem.js

This file handles lava-related gameplay behavior.

Purpose:

- Update lava entities over time
- Apply lava damage to the player
- Handle rising lava or animated hazard timing
- Keep lava rules separate from collision and movement

This system is focused on hazard behavior, not rendering.
It can work with one lava entity or many lava sources.
========================================================= */

import gameConfig from "../config/gameConfig.js";

/**

* LavaSystem

* ---

* Manages lava as an active hazard in the game world.

* 

* The game core should call update() once per frame.

* This system can animate lava, apply damage, and optionally

* make the lava rise or pulse over time.
  */
  class LavaSystem {
  constructor(options = {}) {
  this.options = {
  enableRisingLava: false,
  riseSpeed: 0.15,
  damagePerSecond: gameConfig.gameplay.lavaDamagePerSecond,
  debug: false,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  
  this.state = {
  elapsed: 0,
  lastRiseAt: 0,
  riseLevel: 0
  };
  }

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
Expected game fields:
- game.state.player
- game.state.entities.lava or game.entities.lava
------------------------------------------------------- */
update(game, dt = 0.016) {
if (!game || !game.state) return;

const player = game.state.player;
const world = game.state.entities || game.entities || {};
const lavaSources = this._collectLavaSources(world);

this.state.elapsed += dt;

for (const lava of lavaSources) {
  if (!lava) continue;

  if (typeof lava.update === "function") {
    lava.update(dt);
  }

  if (this.options.enableRisingLava && typeof lava.rise === "function") {
    this._updateRisingLava(lava, dt);
  }

  if (player && player.alive !== false) {
    this._applyDamage(lava, player, dt, game);
  }
}

if (this.debug) {
  console.log("[LavaSystem]", {
    lavaSources: lavaSources.length,
    elapsed: this.state.elapsed,
    riseLevel: this.state.riseLevel
  });
}

}

/* -------------------------------------------------------
LAVA COLLECTION
-------------------------------------------------------
Support different world shapes:
- world.lava as array
- world.lava as single object
- world.lavaZones as array
------------------------------------------------------- */
_collectLavaSources(world) {
const sources = [];

if (!world) return sources;

if (Array.isArray(world.lava)) {
  sources.push(...world.lava);
} else if (world.lava) {
  sources.push(world.lava);
}

if (Array.isArray(world.lavaZones)) {
  sources.push(...world.lavaZones);
}

return sources.filter(Boolean);

}

/* -------------------------------------------------------
DAMAGE
-------------------------------------------------------
Lava can damage the player over time when the player is
inside the hazard or below the lava surface.
------------------------------------------------------- */
_applyDamage(lava, player, dt, game) {
let damage = 0;

if (typeof lava.applyDamageToPlayer === "function") {
  damage = lava.applyDamageToPlayer(player, dt);
} else if (typeof lava.shouldDamageEntity === "function") {
  const shouldDamage = lava.shouldDamageEntity(player);
  if (shouldDamage && typeof player.takeDamage === "function") {
    const dps = lava.damagePerSecond ?? this.options.damagePerSecond;
    damage = dps * dt;
    player.takeDamage(damage, "lava");
  }
} else if (typeof lava.isPointInside === "function") {
  const inside = lava.isPointInside(player.position || player);
  if (inside && typeof player.takeDamage === "function") {
    const dps = lava.damagePerSecond ?? this.options.damagePerSecond;
    damage = dps * dt;
    player.takeDamage(damage, "lava");
  }
}

if (damage > 0 && game && typeof game.camera?.shakeCamera === "function") {
  game.camera.shakeCamera(0.22, 90);
}

return damage;

}

/* -------------------------------------------------------
RISING LAVA
-------------------------------------------------------
Useful for levels where the danger slowly climbs.
------------------------------------------------------- */
_updateRisingLava(lava, dt) {
if (typeof lava.rise !== "function") return;

const riseAmount = this.options.riseSpeed * dt;
lava.rise(riseAmount);

this.state.riseLevel += riseAmount;
this.state.lastRiseAt = performance.now?.() ?? Date.now();

}

/* -------------------------------------------------------
PUBLIC HELPERS
------------------------------------------------------- */

setRiseSpeed(value) {
this.options.riseSpeed = Math.max(0, Number(value) || 0);
}

setDamagePerSecond(value) {
this.options.damagePerSecond = Math.max(0, Number(value) || 0);
}

enableRisingLava(enabled = true) {
this.options.enableRisingLava = Boolean(enabled);
}

/**

* Force all lava sources to a specific height.
* This is useful for resets or level transitions.
  */
  setLavaHeight(world, height) {
  const sources = this._collectLavaSources(world);

for (const lava of sources) {
  if (!lava) continue;

  if (typeof lava.setHeight === "function") {
    lava.setHeight(height);
  } else if (typeof lava.setSurfaceLevel === "function") {
    lava.setSurfaceLevel(height);
  } else if (lava.position && typeof lava.position.y === "number") {
    lava.position.y = height;
  }
}

}

/**

* Return the highest lava surface currently in the world.
  */
  getHighestLavaHeight(world) {
  const sources = this._collectLavaSources(world);
  let highest = -Infinity;

for (const lava of sources) {
  if (!lava) continue;

  let height = null;

  if (typeof lava.getSurfaceLevel === "function") {
    height = lava.getSurfaceLevel();
  } else if (typeof lava.getSurfaceHeightAt === "function") {
    height = lava.getSurfaceHeightAt(0, 0);
  } else if (lava.position && typeof lava.position.y === "number") {
    height = lava.position.y;
  }

  if (Number.isFinite(height)) {
    highest = Math.max(highest, height);
  }
}

return highest === -Infinity ? gameConfig.world.lavaHeight : highest;

}

/**

* Check whether the player is currently in a dangerous lava area.
  */
  isPlayerInLava(player, world) {
  if (!player) return false;

const sources = this._collectLavaSources(world);
for (const lava of sources) {
  if (!lava) continue;

  if (typeof lava.shouldDamageEntity === "function" && lava.shouldDamageEntity(player)) {
    return true;
  }

  if (typeof lava.isPointInside === "function" && lava.isPointInside(player.position || player)) {
    return true;
  }
}

return false;

}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

snapshot(world) {
const sources = this._collectLavaSources(world);

return {
  sources: sources.length,
  enableRisingLava: this.options.enableRisingLava,
  riseSpeed: this.options.riseSpeed,
  damagePerSecond: this.options.damagePerSecond,
  elapsed: this.state.elapsed,
  riseLevel: this.state.riseLevel,
  highestHeight: this.getHighestLavaHeight(world)
};

}
}

export default LavaSystem;
