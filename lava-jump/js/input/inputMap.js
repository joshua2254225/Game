/* =========================================================
FILE 5: js/input/inputMap.js

This file defines the control mapping dictionary.

Purpose:

- Translate raw keyboard/touch/button inputs into game actions
- Keep the rest of the game independent from device details
- Make control changes easy later
- Support desktop and mobile with the same action names

The input manager will use this map as its source of truth.
========================================================= */

/*
Action names used throughout the game.

The game logic should never ask:
- "Was W pressed?"
- "Was a touch button clicked?"

Instead, it should ask:
- "Is MOVE_FORWARD active?"
- "Is JUMP active?"

That makes the code easier to extend and maintain.
*/

const INPUT_ACTIONS = {
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
};

/*
Key bindings for desktop input.

Multiple physical inputs can point to the same action.
That is important because different players expect different
keyboard layouts.
*/
const KEY_BINDINGS = {
// Movement
KeyW: INPUT_ACTIONS.MOVE_FORWARD,
ArrowUp: INPUT_ACTIONS.MOVE_FORWARD,

KeyS: INPUT_ACTIONS.MOVE_BACK,
ArrowDown: INPUT_ACTIONS.MOVE_BACK,

KeyA: INPUT_ACTIONS.MOVE_LEFT,
ArrowLeft: INPUT_ACTIONS.MOVE_LEFT,

KeyD: INPUT_ACTIONS.MOVE_RIGHT,
ArrowRight: INPUT_ACTIONS.MOVE_RIGHT,

// Jump
Space: INPUT_ACTIONS.JUMP,
KeyJ: INPUT_ACTIONS.JUMP,
KeyK: INPUT_ACTIONS.JUMP,

// Menu and game flow
Escape: INPUT_ACTIONS.PAUSE,
Enter: INPUT_ACTIONS.CONFIRM,
NumpadEnter: INPUT_ACTIONS.CONFIRM,
Backspace: INPUT_ACTIONS.CANCEL,
KeyR: INPUT_ACTIONS.RESTART,

// Debug
Backquote: INPUT_ACTIONS.TOGGLE_DEBUG,
KeyF3: INPUT_ACTIONS.TOGGLE_DEBUG
};

/*
Gamepad bindings are included now so the project can grow later.
We do not need to implement gamepad support immediately, but
the dictionary is ready for it.
*/
const GAMEPAD_BINDINGS = {
buttonSouth: INPUT_ACTIONS.JUMP,
buttonEast: INPUT_ACTIONS.CANCEL,
buttonStart: INPUT_ACTIONS.PAUSE,
dpadUp: INPUT_ACTIONS.MOVE_FORWARD,
dpadDown: INPUT_ACTIONS.MOVE_BACK,
dpadLeft: INPUT_ACTIONS.MOVE_LEFT,
dpadRight: INPUT_ACTIONS.MOVE_RIGHT
};

/*
Touch bindings for mobile.

These IDs should match the button IDs used in index.html:
- touch-forward
- touch-left
- touch-right
- touch-jump

Later, touchControls.js and mobileInput.js will attach event
listeners and convert them into these action names.
*/
const TOUCH_BINDINGS = {
"touch-forward": INPUT_ACTIONS.MOVE_FORWARD,
"touch-back": INPUT_ACTIONS.MOVE_BACK,
"touch-left": INPUT_ACTIONS.MOVE_LEFT,
"touch-right": INPUT_ACTIONS.MOVE_RIGHT,
"touch-jump": INPUT_ACTIONS.JUMP,
"touch-pause": INPUT_ACTIONS.PAUSE,
"touch-restart": INPUT_ACTIONS.RESTART,
"touch-confirm": INPUT_ACTIONS.CONFIRM,
"touch-cancel": INPUT_ACTIONS.CANCEL
};

/*
Optional aliases.
These are useful when the same action may come from different
naming styles in different files.
*/
const ACTION_ALIASES = {
forward: INPUT_ACTIONS.MOVE_FORWARD,
back: INPUT_ACTIONS.MOVE_BACK,
left: INPUT_ACTIONS.MOVE_LEFT,
right: INPUT_ACTIONS.MOVE_RIGHT,
jump: INPUT_ACTIONS.JUMP,
pause: INPUT_ACTIONS.PAUSE,
restart: INPUT_ACTIONS.RESTART,
confirm: INPUT_ACTIONS.CONFIRM,
cancel: INPUT_ACTIONS.CANCEL,
debug: INPUT_ACTIONS.TOGGLE_DEBUG
};

/*
This object collects all input-related mappings in one place.
The input manager can import this single default export and
use the sections it needs.
*/
const inputMap = {
actions: INPUT_ACTIONS,
keys: KEY_BINDINGS,
gamepad: GAMEPAD_BINDINGS,
touch: TOUCH_BINDINGS,
aliases: ACTION_ALIASES
};

export default inputMap;
export {
INPUT_ACTIONS,
KEY_BINDINGS,
GAMEPAD_BINDINGS,
TOUCH_BINDINGS,
ACTION_ALIASES
};
