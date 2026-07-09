/* =========================================================
FILE 58: js/config/controlsConfig.js

This file stores control and input configuration values.

Purpose:

- Keep desktop and mobile control settings in one place
- Make it easy to tune touch sensitivity and control behavior
- Support the input manager and touch controls
- Separate configuration from input logic

This file is data-only.
It should not contain event listeners or gameplay logic.
========================================================= */

const controlsConfig = {
/* -------------------------------------------------------
GENERAL INPUT BEHAVIOR
------------------------------------------------------- */
inputMode: "mixed",
enableKeyboard: true,
enableTouch: true,
enableGamepad: false,

/* -------------------------------------------------------
DESKTOP
------------------------------------------------------- */
desktop: {
preventDefaultOnGameKeys: true,
allowRepeat: false,
debugKeysEnabled: true,
keyboardSensitivity: 1.0
},

/* -------------------------------------------------------
MOBILE
------------------------------------------------------- */
mobile: {
requireLandscape: true,
showTouchControls: true,
showOrientationWarning: true,
enableTapToJump: true,
enableSwipeMovement: true,
enableSwipeLook: false,
showOnlyOnTouchDevices: true,
minWidthForControls: 640
},

/* -------------------------------------------------------
TOUCH INPUT TUNING
------------------------------------------------------- */
touch: {
swipeThresholdPx: 28,
tapThresholdMs: 220,
longPressThresholdMs: 450,
holdRepeatDelayMs: 160,
moveDeadzonePx: 4,
pointerCancelOnLeave: true
},

/* -------------------------------------------------------
TOUCH BUTTONS
------------------------------------------------------- */
touchButtons: {
size: 64,
sizeWide: 84,
opacity: 0.92,
scale: 1.0,
accentOpacity: 0.98,
borderRadius: 18
},

/* -------------------------------------------------------
ACTIONS
-------------------------------------------------------
These names must match the input manager and input map.
------------------------------------------------------- */
actions: {
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
DEFAULT KEY BINDINGS
------------------------------------------------------- */
keyBindings: {
KeyW: "MOVE_FORWARD",
ArrowUp: "MOVE_FORWARD",

KeyS: "MOVE_BACK",
ArrowDown: "MOVE_BACK",

KeyA: "MOVE_LEFT",
ArrowLeft: "MOVE_LEFT",

KeyD: "MOVE_RIGHT",
ArrowRight: "MOVE_RIGHT",

Space: "JUMP",
KeyJ: "JUMP",
KeyK: "JUMP",

Escape: "PAUSE",
Enter: "CONFIRM",
NumpadEnter: "CONFIRM",
Backspace: "CANCEL",
KeyR: "RESTART",

Backquote: "TOGGLE_DEBUG",
F3: "TOGGLE_DEBUG"

},

/* -------------------------------------------------------
DEFAULT TOUCH BINDINGS
-------------------------------------------------------
These should match the touch button IDs in index.html.
------------------------------------------------------- */
touchBindings: {
"touch-forward": "MOVE_FORWARD",
"touch-back": "MOVE_BACK",
"touch-left": "MOVE_LEFT",
"touch-right": "MOVE_RIGHT",
"touch-jump": "JUMP",
"touch-pause": "PAUSE",
"touch-restart": "RESTART",
"touch-confirm": "CONFIRM",
"touch-cancel": "CANCEL"
},

/* -------------------------------------------------------
GAMEPAD (PLANNED)
------------------------------------------------------- */
gamepad: {
enabled: false,
deadzone: 0.15,
buttons: {
south: "JUMP",
east: "CANCEL",
start: "PAUSE"
},
dpad: {
up: "MOVE_FORWARD",
down: "MOVE_BACK",
left: "MOVE_LEFT",
right: "MOVE_RIGHT"
}
},

/* -------------------------------------------------------
HAPTIC / FEEDBACK
------------------------------------------------------- */
feedback: {
enableVibration: true,
vibrationShortMs: 20,
vibrationMediumMs: 40,
vibrationLongMs: 80
},

/* -------------------------------------------------------
DEBUG
------------------------------------------------------- */
debug: {
logInputs: false,
showBindingMap: false,
showTouchAreaBounds: false,
showOrientationState: false
}
};

export default controlsConfig;
export { controlsConfig };
