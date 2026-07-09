/* =========================================================
FILE 59: js/config/levelConfig.js

This file stores general level configuration values.

Purpose:

- Keep shared level-related values in one place
- Make level balancing easier
- Provide defaults for level loading and building
- Separate configuration from level data files

This file is data-only.
It should not contain runtime level logic.
========================================================= */

const levelConfig = {
/* -------------------------------------------------------
GENERAL LEVEL FLOW
------------------------------------------------------- */
defaultStartLevelId: "level01",
maxLevels: 999,
allowLevelLooping: false,
allowLevelSelect: true,

/* -------------------------------------------------------
DEFAULT WORLD VALUES
------------------------------------------------------- */
world: {
gravity: -22,
lavaHeight: -6,
ambientLight: 0.8,
skyColor: "#1b1b2a",
fog: null
},

/* -------------------------------------------------------
DEFAULT GOALS
------------------------------------------------------- */
goals: {
targetScore: 100,
targetTime: 120,
requiredCoins: 0,
requireAllCheckpoints: false
},

/* -------------------------------------------------------
SPAWN / CHECKPOINTS
------------------------------------------------------- */
spawn: {
x: 0,
y: 2,
z: 0
},

checkpoint: {
respawnOffsetY: 1.2,
scoreReward: 100,
oneTimeUse: true,
radius: 1.4
},

/* -------------------------------------------------------
ENTITY DEFAULTS
------------------------------------------------------- */
platform: {
size: {
x: 4,
y: 1,
z: 4
},
solid: true,
visible: true
},

lava: {
damagePerSecond: 35,
riseSpeed: 0.15,
glowStrength: 0.5
},

coin: {
value: 10,
spinSpeed: 2.4,
floatAmplitude: 0.2,
floatSpeed: 1.5
},

obstacle: {
damage: 25,
cooldownMs: 0,
hitOnce: false
},

enemy: {
damage: 20,
health: 1,
attackRange: 1.5,
attackCooldownMs: 700,
patrolSpeed: 1.2
},

/* -------------------------------------------------------
LEVEL THEMING
-------------------------------------------------------
These are default theme labels for later use by the renderer
or by a level-building tool.
------------------------------------------------------- */
themes: {
starter: {
name: "Starter",
accent: "#ffb347"
},
lava: {
name: "Lava",
accent: "#ff6a00"
},
bridge: {
name: "Bridge",
accent: "#45d483"
},
molten: {
name: "Molten",
accent: "#ff3b30"
},
finish: {
name: "Finish",
accent: "#45d483"
}
},

/* -------------------------------------------------------
VALIDATION LIMITS
------------------------------------------------------- */
validation: {
minPlatformCount: 1,
maxPlatformCount: 500,
minCoinCount: 0,
maxCoinCount: 1000,
minCheckpointCount: 0,
maxCheckpointCount: 50,
minEnemyCount: 0,
maxEnemyCount: 100,
minObstacleCount: 0,
maxObstacleCount: 200
},

/* -------------------------------------------------------
PROGRESSION
------------------------------------------------------- */
progression: {
unlockNextLevelOnWin: true,
keepCheckpointBetweenAttempts: true,
saveCompletedLevels: true
},

/* -------------------------------------------------------
DEBUG
------------------------------------------------------- */
debug: {
logLevelLoad: false,
logLevelBuild: false,
showLevelBounds: false,
showSpawnPoint: false
}
};

export default levelConfig;
export { levelConfig };
