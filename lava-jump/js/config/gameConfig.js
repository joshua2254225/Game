/* =========================================================
FILE 4: js/config/gameConfig.js

This file stores the core game configuration.

Purpose:

- Keep all important values in one place
- Make gameplay easy to tune without searching through code
- Separate design values from logic
- Allow future updates by changing only this file

This file is intentionally data-only.
No game logic should live here.
========================================================= */

const gameConfig = {
/* -------------------------------------------------------
GENERAL
-------------------------------------------------------
Basic app-wide settings.
------------------------------------------------------- */
gameName: "3D Lava Jump",
version: "0.1.0",
author: "OpenAI",
targetOrientation: "landscape",
isMobileFirst: false,

/* -------------------------------------------------------
RENDERING
-------------------------------------------------------
These settings will later be used by the renderer and
camera system.
------------------------------------------------------- */
rendering: {
backgroundColor: "#07070b",
clearAlpha: 1,
antialias: true,
shadowsEnabled: true,
pixelRatioLimit: 2,
fieldOfView: 65,
nearPlane: 0.1,
farPlane: 1000
},

/* -------------------------------------------------------
WORLD
-------------------------------------------------------
World scale values for platform spacing, lava size,
and movement tuning.
------------------------------------------------------- */
world: {
gravity: -22.0,
lavaHeight: -6.0,
platformSize: {
x: 4.0,
y: 1.0,
z: 4.0
},
platformGap: 2.5,
defaultGroundY: 0.0,
worldBounds: {
minX: -1000,
maxX: 1000,
minY: -100,
maxY: 100,
minZ: -1000,
maxZ: 1000
}
},

/* -------------------------------------------------------
PLAYER
-------------------------------------------------------
Player movement and jump settings.
These values should feel responsive but still controllable.
------------------------------------------------------- */
player: {
moveSpeed: 7.5,
strafeSpeed: 7.0,
sprintMultiplier: 1.35,
jumpForce: 10.5,
doubleJumpForce: 9.25,
maxJumps: 1,
airControlMultiplier: 0.72,
friction: 14.0,
airFriction: 2.0,
radius: 0.45,
height: 1.8,
spawnOffsetY: 1.2,
spawnInvulnerabilityMs: 1200,
fallDeathY: -15.0
},

/* -------------------------------------------------------
CAMERA
-------------------------------------------------------
Camera settings for a 3D third-person style view.
These numbers can be adjusted later for different levels.
------------------------------------------------------- */
camera: {
mode: "follow",
distance: 8.5,
height: 4.5,
lookAtHeight: 1.2,
lerpSpeed: 0.12,
tilt: -0.12,
shakeEnabled: true,
shakeIntensity: 0.18,
shakeDecay: 0.85
},

/* -------------------------------------------------------
INPUT
-------------------------------------------------------
Action names used by the input manager.
The whole game should depend on these action names,
not raw keyboard or touch values.
------------------------------------------------------- */
input: {
actions: [
"MOVE_FORWARD",
"MOVE_BACK",
"MOVE_LEFT",
"MOVE_RIGHT",
"JUMP",
"PAUSE",
"RESTART",
"CONFIRM",
"CANCEL",
"TOGGLE_DEBUG"
],

deadzone: 0.15,
holdRepeatDelayMs: 160,
swipeThresholdPx: 28,
tapThresholdMs: 220

},

/* -------------------------------------------------------
UI
-------------------------------------------------------
HUD, overlays, and menu behavior.
------------------------------------------------------- */
ui: {
showFpsCounter: false,
showDebugPanelByDefault: false,
toastDurationMs: 2200,
overlayFadeMs: 180,
hudUpdateRateMs: 33,
maxMessageLength: 96
},

/* -------------------------------------------------------
MOBILE
-------------------------------------------------------
Landscape mode is required for mobile. These values help
define when the touch controls and warning screen appear.
------------------------------------------------------- */
mobile: {
enableTouchControls: true,
requireLandscape: true,
orientationCheckIntervalMs: 250,
touchButtonOpacity: 0.92,
touchButtonScale: 1.0,
showControlsOnlyInGame: true,
minimumWidthForControls: 640
},

/* -------------------------------------------------------
GAMEPLAY
-------------------------------------------------------
General gameplay rules and score tuning.
------------------------------------------------------- */
gameplay: {
startLives: 3,
startHealth: 100,
lavaDamagePerSecond: 35,
coinValue: 10,
checkpointValue: 100,
levelCompleteBonus: 500,
fallPenalty: 50,
timeBonusEnabled: true,
timeBonusPerSecondRemaining: 2
},

/* -------------------------------------------------------
AUDIO
-------------------------------------------------------
Sound settings will be used later by the audio manager.
------------------------------------------------------- */
audio: {
masterVolume: 0.85,
musicVolume: 0.45,
sfxVolume: 0.8,
muteByDefault: false,
enableMusic: true,
enableSfx: true
},

/* -------------------------------------------------------
DEBUG
-------------------------------------------------------
Debug options for development and testing.
------------------------------------------------------- */
debug: {
enabledByDefault: false,
showCollisionBoxes: false,
showPlatformIDs: false,
showLevelBounds: false,
logInputEvents: false,
logStateChanges: false,
freezePhysics: false
},

/* -------------------------------------------------------
COLORS
-------------------------------------------------------
Shared color values used by the HUD, menus, effects, and
future level themes.
------------------------------------------------------- */
colors: {
lava: "#ff4a1c",
lavaGlow: "#ff8a3d",
platform: "#2f3240",
platformEdge: "#555a70",
player: "#f2f2f2",
playerAccent: "#ffb347",
coin: "#ffd54a",
danger: "#ff3b30",
success: "#45d483",
uiText: "#ffffff",
uiTextDim: "rgba(255, 255, 255, 0.72)"
}
};

export default gameConfig;
