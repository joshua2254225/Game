/* =========================================================
FILE 23: js/core/sceneManager.js

This file manages game scenes and screen states.

Purpose:

- Switch between menu, gameplay, pause, game over, and win states
- Keep scene transitions organized in one place
- Make it easy to add new scenes later
- Keep UI state separate from gameplay logic

This file does not run the game simulation.
It only manages which scene is active and how transitions
between scenes are handled.
========================================================= */

import GAME_CONSTANTS from "../data/constants.js";

/**

* SceneManager

* ---

* A small controller for scene transitions.

* 

* It tracks:

* - the current scene

* - the previous scene

* - registered scene handlers

* - optional transition hooks

* 

* Scenes are intentionally abstract here so the project can grow

* without needing a rewrite.
  */
  class SceneManager {
  constructor(options = {}) {
  this.options = {
  debug: false,
  ...options
  };
  
  this.scenes = new Map();
  this.currentSceneId = null;
  this.previousSceneId = null;
  
  this.transitioning = false;
  this.transitionStartAt = 0;
  this.transitionDurationMs = 180;
  
  this.hooks = {
  beforeChange: null,
  afterChange: null
  };
  }

/* -------------------------------------------------------
SCENE REGISTRATION
------------------------------------------------------- */

register(sceneId, scene) {
if (!sceneId) {
throw new Error("[SceneManager] sceneId is required.");
}

this.scenes.set(sceneId, scene);

if (this.options.debug) {
  console.log("[SceneManager] registered", sceneId);
}

return scene;

}

unregister(sceneId) {
if (!this.scenes.has(sceneId)) return false;

const scene = this.scenes.get(sceneId);
if (scene && typeof scene.destroy === "function") {
  scene.destroy();
}

this.scenes.delete(sceneId);

if (this.currentSceneId === sceneId) {
  this.currentSceneId = null;
}

if (this.previousSceneId === sceneId) {
  this.previousSceneId = null;
}

if (this.options.debug) {
  console.log("[SceneManager] unregistered", sceneId);
}

return true;

}

has(sceneId) {
return this.scenes.has(sceneId);
}

get(sceneId) {
return this.scenes.get(sceneId) || null;
}

list() {
return Array.from(this.scenes.keys());
}

/* -------------------------------------------------------
HOOKS
------------------------------------------------------- */

setHooks(hooks = {}) {
this.hooks = {
...this.hooks,
...hooks
};
}

/* -------------------------------------------------------
TRANSITIONS
------------------------------------------------------- */

async change(sceneId, payload = {}) {
if (!this.has(sceneId)) {
throw new Error("[SceneManager] Scene not found: ${sceneId}");
}

if (this.transitioning) {
  return false;
}

this.transitioning = true;
this.transitionStartAt = performance.now?.() ?? Date.now();

const nextScene = this.get(sceneId);
const prevScene = this.get(this.currentSceneId);

if (typeof this.hooks.beforeChange === "function") {
  await this.hooks.beforeChange({
    from: this.currentSceneId,
    to: sceneId,
    previousScene: prevScene,
    nextScene,
    payload
  });
}

if (prevScene && typeof prevScene.exit === "function") {
  await prevScene.exit(payload);
}

this.previousSceneId = this.currentSceneId;
this.currentSceneId = sceneId;

if (nextScene && typeof nextScene.enter === "function") {
  await nextScene.enter(payload);
}

if (typeof this.hooks.afterChange === "function") {
  await this.hooks.afterChange({
    from: this.previousSceneId,
    to: sceneId,
    previousScene: prevScene,
    nextScene,
    payload
  });
}

this.transitioning = false;

if (this.options.debug) {
  console.log("[SceneManager] changed to", sceneId);
}

return true;

}

/**

* Change scenes immediately without transition hooks.
* Useful for resets or emergency state changes.
  */
  force(sceneId, payload = {}) {
  if (!this.has(sceneId)) {
  throw new Error("[SceneManager] Scene not found: ${sceneId}");
  }

const prevScene = this.get(this.currentSceneId);
const nextScene = this.get(sceneId);

if (prevScene && typeof prevScene.exit === "function") {
  prevScene.exit(payload);
}

this.previousSceneId = this.currentSceneId;
this.currentSceneId = sceneId;

if (nextScene && typeof nextScene.enter === "function") {
  nextScene.enter(payload);
}

this.transitioning = false;

return true;

}

/* -------------------------------------------------------
CURRENT SCENE
------------------------------------------------------- */

getCurrent() {
return this.get(this.currentSceneId);
}

getPrevious() {
return this.get(this.previousSceneId);
}

getCurrentId() {
return this.currentSceneId;
}

getPreviousId() {
return this.previousSceneId;
}

is(sceneId) {
return this.currentSceneId === sceneId;
}

/* -------------------------------------------------------
PREDEFINED SCENE IDS
-------------------------------------------------------
These constants match the app flow used throughout the game.
------------------------------------------------------- */

getSceneIds() {
return {
BOOT: GAME_CONSTANTS.APP_STATE.BOOT,
MENU: GAME_CONSTANTS.APP_STATE.MENU,
PLAYING: GAME_CONSTANTS.APP_STATE.PLAYING,
PAUSED: GAME_CONSTANTS.APP_STATE.PAUSED,
GAME_OVER: GAME_CONSTANTS.APP_STATE.GAME_OVER,
WIN: GAME_CONSTANTS.APP_STATE.WIN,
LOADING: GAME_CONSTANTS.APP_STATE.LOADING
};
}

/* -------------------------------------------------------
UPDATE / RENDER
-------------------------------------------------------
Scenes may optionally provide update/render methods.
The manager simply forwards calls to the active scene.
------------------------------------------------------- */

update(dt, context = {}) {
const scene = this.getCurrent();
if (!scene || typeof scene.update !== "function") return;

scene.update(dt, context);

}

render(context = {}) {
const scene = this.getCurrent();
if (!scene || typeof scene.render !== "function") return;

scene.render(context);

}

resize(size, context = {}) {
const scene = this.getCurrent();
if (!scene || typeof scene.resize !== "function") return;

scene.resize(size, context);

}

/* -------------------------------------------------------
TRANSITION STATE
------------------------------------------------------- */

isTransitioning() {
return this.transitioning;
}

getTransitionProgress() {
if (!this.transitioning) return 1;

const now = performance.now?.() ?? Date.now();
const elapsed = now - this.transitionStartAt;
if (this.transitionDurationMs <= 0) return 1;

const progress = elapsed / this.transitionDurationMs;
return Math.max(0, Math.min(1, progress));

}

setTransitionDuration(ms) {
this.transitionDurationMs = Math.max(0, Number(ms) || 0);
}

/* -------------------------------------------------------
DEFAULT SCENE HELPERS
-------------------------------------------------------
These helpers make it easy to register simple scene objects
without repeating the same shape everywhere.
------------------------------------------------------- */

createScene(definition = {}) {
return {
enter: definition.enter || null,
exit: definition.exit || null,
update: definition.update || null,
render: definition.render || null,
resize: definition.resize || null,
destroy: definition.destroy || null
};
}

/* -------------------------------------------------------
RESET / CLEANUP
------------------------------------------------------- */

reset() {
const current = this.getCurrent();
if (current && typeof current.exit === "function") {
current.exit({ reset: true });
}

this.currentSceneId = null;
this.previousSceneId = null;
this.transitioning = false;
this.transitionStartAt = 0;

}

destroy() {
for (const [sceneId, scene] of this.scenes.entries()) {
if (scene && typeof scene.destroy === "function") {
scene.destroy();
}

  if (this.options.debug) {
    console.log("[SceneManager] destroyed scene", sceneId);
  }
}

this.scenes.clear();
this.reset();
this.hooks = {
  beforeChange: null,
  afterChange: null
};

}
}

export default SceneManager;
