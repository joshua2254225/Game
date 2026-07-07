/* =========================================================
FILE 38: js/levels/levelTemplate.js

This file defines the template for level data objects.

Purpose:

- Provide a standard structure for new levels
- Make level creation easy and consistent
- Keep levels data-driven instead of hardcoded
- Help future level files stay simple to read and edit

New levels can copy this template and fill in their own data.
The game loader will later read these objects and build the
actual world from them.
========================================================= */

import { vec3 } from "../utils/math.js";

/**

* createLevelTemplate()

* ---

* Returns a clean level object with all expected fields.

* 

* This is useful as:

* - a starting point for new levels

* - a fallback when level data is missing

* - a documentation example for future contributors
    */
    function createLevelTemplate(overrides = {}) {
    return {
    id: "level_template",
    name: "Template Level",
    description: "Use this file as a starting point for new levels.",
    objective: "Reach the end without falling into the lava.",
  
  /*
  Spawn point for the player at the beginning of the level.
  This is where the RespawnSystem can also return the player
  if no checkpoint has been activated.
  */
  spawn: vec3(0, 2, 0),
  
  /*
  Level collections are kept as arrays so the builder can
  easily convert them into entities later.
  */
  platforms: [],
  lava: [],
  lavaZones: [],
  obstacles: [],
  enemies: [],
  coins: [],
  checkpoints: [],
  
  /*
  Optional world settings for this level.
  These can override defaults from gameConfig when needed.
  */
  world: {
  gravity: null,
  lavaHeight: null,
  fog: null,
  ambientLight: null,
  skyColor: null
  },
  
  /*
  Optional progression fields.
  Useful later for win conditions, time goals, or score goals.
  */
  goals: {
  targetScore: null,
  targetTime: null,
  requiredCoins: null,
  requireAllCheckpoints: false
  },
  
  /*
  Optional level metadata.
  This can be used by UI, menus, or the level loader.
  */
  metadata: {
  theme: "default",
  difficulty: "easy",
  author: "unknown",
  version: "0.1.0"
  },
  
  /*
  Optional scripted events or level triggers.
  The first version does not need to use these yet, but
  the structure is ready for later expansions.
  */
  events: [],
  scripts: [],
  
  /*
  Optional notes for level designers.
  These do not affect gameplay.
  */
  notes: [],
  
  /*
  Additional custom data can be placed here without breaking
  the loader. This keeps the template flexible.
  */
  custom: {},
  
  ...overrides
  };
  }

/**

* createEmptyLevel()
* ---
* Returns a minimal level object with safe defaults.
  */
  function createEmptyLevel(id = "empty_level", name = "Empty Level") {
  return createLevelTemplate({
  id,
  name,
  description: "An empty level with no gameplay objects."
  });
  }

/**

* normalizeLevel(level)
* ---
* Ensures a level object has the minimum required fields.
* Useful when loading external level files.
  */
  function normalizeLevel(level = {}) {
  const template = createLevelTemplate();

return {
...template,
...level,
spawn: level.spawn
? vec3(level.spawn.x ?? 0, level.spawn.y ?? 2, level.spawn.z ?? 0)
: template.spawn,
platforms: Array.isArray(level.platforms) ? level.platforms : [],
lava: Array.isArray(level.lava) ? level.lava : [],
lavaZones: Array.isArray(level.lavaZones) ? level.lavaZones : [],
obstacles: Array.isArray(level.obstacles) ? level.obstacles : [],
enemies: Array.isArray(level.enemies) ? level.enemies : [],
coins: Array.isArray(level.coins) ? level.coins : [],
checkpoints: Array.isArray(level.checkpoints) ? level.checkpoints : [],
world: {
...template.world,
...(level.world || {})
},
goals: {
...template.goals,
...(level.goals || {})
},
metadata: {
...template.metadata,
...(level.metadata || {})
},
custom: {
...(level.custom || {})
}
};
}

export {
createLevelTemplate,
createEmptyLevel,
normalizeLevel
};

export default createLevelTemplate;
