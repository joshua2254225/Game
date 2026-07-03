/* =========================================================
FILE 11: js/data/constants.js

This file stores shared constants for the game.

Purpose:

- Keep important fixed values in one place
- Avoid hardcoding the same numbers or strings repeatedly
- Make balancing and updates easier
- Provide a clean shared source for other modules

This file should stay data-only.
It should not contain gameplay logic.
========================================================= */

const GAME_CONSTANTS = {
/* -------------------------------------------------------
GAME IDENTITY
------------------------------------------------------- */
GAME_NAME: "3D Lava Jump",
GAME_SLUG: "lava-jump",
GAME_VERSION: "0.1.0",
DEFAULT_LANGUAGE: "en",

/* -------------------------------------------------------
SYSTEM STATES
------------------------------------------------------- */
APP_STATE: {
BOOT: "boot",
MENU: "menu",
PLAYING: "playing",
PAUSED: "paused",
GAME_OVER: "game_over",
WIN: "win",
LOADING: "loading"
},

/* -------------------------------------------------------
PLAYER STATES
------------------------------------------------------- */
PLAYER_STATE: {
IDLE: "idle",
RUNNING: "running",
JUMPING: "jumping",
FALLING: "falling",
LANDED: "landed",
HURT: "hurt",
RESPAWNING: "respawning",
DEAD: "dead"
},

/* -------------------------------------------------------
INPUT ACTIONS
-------------------------------------------------------
These should match the action names used in inputMap.js
and gameConfig.js.
------------------------------------------------------- */
INPUT_ACTIONS: {
MOVE_FORWARD: "MOVE_FORWARD",
MOVE_BACK: "MOVE_BACK",
MOVE_LEFT: "MOVE_LEFT",
MOVE_RIGHT: "MOVE_RIGHT",
JUMP: "JUMP",
PAUSE: "PAUSE",
RESTART: "RESTART",
CONFIRM: "CONFIRM",
CANCEL: "CANCEL",
TOGGLE_DEBUG: "TOGGLE_DEBUG"
},

/* -------------------------------------------------------
RENDERING LIMITS
-------------------------------------------------------
Useful for resize logic, camera adjustments, and quality
scaling on weaker devices.
------------------------------------------------------- */
RENDER_LIMITS: {
MIN_WIDTH: 320,
MIN_HEIGHT: 240,
MAX_PIXEL_RATIO: 2,
DEFAULT_FPS_CAP: 60,
LOW_FPS_THRESHOLD: 30
},

/* -------------------------------------------------------
WORLD LIMITS
------------------------------------------------------- */
WORLD_LIMITS: {
MIN_X: -1000,
MAX_X: 1000,
MIN_Y: -100,
MAX_Y: 100,
MIN_Z: -1000,
MAX_Z: 1000
},

/* -------------------------------------------------------
PHYSICS HELPERS
-------------------------------------------------------
These are shared reference values for movement and
collision handling.
------------------------------------------------------- */
PHYSICS: {
EPSILON: 0.00001,
GROUND_EPSILON: 0.05,
VELOCITY_STOP_THRESHOLD: 0.01,
DEFAULT_DRAG: 0.92,
DEFAULT_AIR_DRAG: 0.985,
MAX_FALL_SPEED: -30,
MAX_HORIZONTAL_SPEED: 20
},

/* -------------------------------------------------------
CAMERA
------------------------------------------------------- */
CAMERA: {
DEFAULT_DISTANCE: 8.5,
DEFAULT_HEIGHT: 4.5,
DEFAULT_LOOK_AT_HEIGHT: 1.2,
DEFAULT_LERP_SPEED: 0.12,
DEFAULT_TILT: -0.12
},

/* -------------------------------------------------------
UI
------------------------------------------------------- */
UI: {
SAFE_PADDING: 12,
DEFAULT_TOAST_MS: 2200,
DEFAULT_OVERLAY_FADE_MS: 180,
DEFAULT_HUD_RATE_MS: 33,
DEFAULT_PANEL_RADIUS: 18
},

/* -------------------------------------------------------
MOBILE
------------------------------------------------------- */
MOBILE: {
LANDSCAPE_ONLY: true,
DEFAULT_SWIPE_THRESHOLD_PX: 28,
DEFAULT_TAP_THRESHOLD_MS: 220,
TOUCH_BUTTON_MIN_SIZE: 64,
MIN_WIDTH_FOR_CONTROLS: 640
},

/* -------------------------------------------------------
SCORING
------------------------------------------------------- */
SCORE: {
COIN_VALUE: 10,
CHECKPOINT_VALUE: 100,
LEVEL_COMPLETE_BONUS: 500,
FALL_PENALTY: 50,
TIME_BONUS_PER_SECOND: 2
},

/* -------------------------------------------------------
AUDIO
------------------------------------------------------- */
AUDIO: {
MASTER_VOLUME: 0.85,
MUSIC_VOLUME: 0.45,
SFX_VOLUME: 0.8,
DEFAULT_FADE_MS: 250
},

/* -------------------------------------------------------
COLORS
------------------------------------------------------- */
COLORS: {
BACKGROUND: "#07070b",
LAVA: "#ff4a1c",
LAVA_GLOW: "#ff8a3d",
PLATFORM: "#2f3240",
PLATFORM_EDGE: "#555a70",
PLAYER: "#f2f2f2",
PLAYER_ACCENT: "#ffb347",
COIN: "#ffd54a",
DANGER: "#ff3b30",
SUCCESS: "#45d483",
TEXT: "#ffffff",
TEXT_DIM: "rgba(255, 255, 255, 0.72)"
},

/* -------------------------------------------------------
KEY NAMES
-------------------------------------------------------
These are helpful when working with keyboard events.
------------------------------------------------------- */
KEY_NAMES: {
W: "KeyW",
A: "KeyA",
S: "KeyS",
D: "KeyD",
UP: "ArrowUp",
DOWN: "ArrowDown",
LEFT: "ArrowLeft",
RIGHT: "ArrowRight",
SPACE: "Space",
ESCAPE: "Escape",
ENTER: "Enter",
BACKSPACE: "Backspace",
R: "KeyR",
F3: "F3",
BACKQUOTE: "Backquote"
},

/* -------------------------------------------------------
FILE / FOLDER NAMES
-------------------------------------------------------
These are not required for gameplay, but they can help
later when loading assets or building tools.
------------------------------------------------------- */
PATHS: {
ASSETS: "assets",
TEXTURES: "assets/textures",
MODELS: "assets/models",
SOUNDS: "assets/sounds",
ICONS: "assets/icons",
LEVELS: "js/levels",
UI: "js/ui",
INPUT: "js/input",
SYSTEMS: "js/systems"
},

/* -------------------------------------------------------
DEBUG
------------------------------------------------------- */
DEBUG: {
ENABLED: false,
SHOW_COLLISIONS: false,
SHOW_BOUNDS: false,
LOG_INPUT: false,
LOG_STATE: false,
LOG_LEVELS: false
}
};

export default GAME_CONSTANTS;
export { GAME_CONSTANTS };
