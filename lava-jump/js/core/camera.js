/* =========================================================
FILE 20: js/core/camera.js

This file manages the game's camera behavior.

Purpose:

- Follow the player smoothly
- Keep the player centered in a readable way
- Support later effects like camera shake
- Keep camera math separate from rendering and gameplay

This camera is intentionally generic so it can work with
a future 3D renderer, including Three.js or a custom engine.
========================================================= */

import gameConfig from "../config/gameConfig.js";
import { clamp, lerp, vec3, copyVec3 } from "../utils/math.js";

/**

* CameraController

* ---

* A lightweight follow camera for the game world.

* 

* It stores:

* - position

* - target

* - offset

* - smoothing behavior

* - optional shake state

* 

* The camera does not decide gameplay. It only tracks the

* viewpoint so the player is easy to see.
  */
  class CameraController {
  constructor(options = {}) {
  this.options = {
  distance: gameConfig.camera.distance,
  height: gameConfig.camera.height,
  lookAtHeight: gameConfig.camera.lookAtHeight,
  lerpSpeed: gameConfig.camera.lerpSpeed,
  tilt: gameConfig.camera.tilt,
  shakeEnabled: gameConfig.camera.shakeEnabled,
  shakeIntensity: gameConfig.camera.shakeIntensity,
  shakeDecay: gameConfig.camera.shakeDecay,
  debug: false,
  ...options
  };
  
  this.position = vec3(0, 0, 0);
  this.target = vec3(0, 0, 0);
  this.offset = vec3(0, 0, 0);
  
  this.mode = "follow";
  
  this.shake = {
  active: false,
  intensity: 0,
  duration: 0,
  elapsed: 0
  };
  
  this._lastTrackedTarget = vec3(0, 0, 0);
  }

/* -------------------------------------------------------
MODE CONTROL
------------------------------------------------------- */

setMode(mode) {
this.mode = mode || "follow";
}

getMode() {
return this.mode;
}

/* -------------------------------------------------------
TARGET CONTROL
------------------------------------------------------- */

setTarget(target) {
if (!target) return;
copyVec3(this.target, target);
copyVec3(this._lastTrackedTarget, target);
}

getTarget() {
return { ...this.target };
}

/* -------------------------------------------------------
POSITION / OFFSET
------------------------------------------------------- */

setPosition(position) {
if (!position) return;
copyVec3(this.position, position);
}

getPosition() {
return { ...this.position };
}

setOffset(offset) {
if (!offset) return;
copyVec3(this.offset, offset);
}

getOffset() {
return { ...this.offset };
}

/* -------------------------------------------------------
FOLLOW BEHAVIOR
-------------------------------------------------------
The camera follows the target from behind and above.
This gives the player better visibility of the path ahead.
------------------------------------------------------- */

updateFollowTarget(playerPosition, dt = 0.016) {
if (!playerPosition) return;

/*
  Store the target for later camera smoothing.
  The camera wants to look slightly above the player so the
  forward path remains visible.
*/
this.setTarget({
  x: playerPosition.x,
  y: playerPosition.y + this.options.lookAtHeight,
  z: playerPosition.z
});

const followOffset = {
  x: this.offset.x,
  y: this.options.height,
  z: this.offset.z - this.options.distance
};

/*
  A basic follow camera:
  - position is placed behind the player
  - target is the player's upper body area
  - smoothing keeps motion gentle
*/
const desiredPosition = {
  x: playerPosition.x + followOffset.x,
  y: playerPosition.y + followOffset.y,
  z: playerPosition.z + followOffset.z
};

const alpha = clamp(this.options.lerpSpeed * (dt * 60), 0, 1);

this.position.x = lerp(this.position.x, desiredPosition.x, alpha);
this.position.y = lerp(this.position.y, desiredPosition.y, alpha);
this.position.z = lerp(this.position.z, desiredPosition.z, alpha);

this._lastTrackedTarget = { ...playerPosition };

}

/* -------------------------------------------------------
SHAKE
-------------------------------------------------------
Camera shake is useful for lava impacts, deaths, landings,
explosions, or other dramatic events.
------------------------------------------------------- */

shakeCamera(intensity = this.options.shakeIntensity, durationMs = 180) {
if (!this.options.shakeEnabled) return;

this.shake.active = true;
this.shake.intensity = Math.max(0, intensity);
this.shake.duration = Math.max(0, durationMs);
this.shake.elapsed = 0;

}

stopShake() {
this.shake.active = false;
this.shake.intensity = 0;
this.shake.duration = 0;
this.shake.elapsed = 0;
}

applyShake(dt = 0.016) {
if (!this.shake.active) return { x: 0, y: 0, z: 0 };

this.shake.elapsed += dt * 1000;

const progress = this.shake.duration <= 0
  ? 1
  : clamp(this.shake.elapsed / this.shake.duration, 0, 1);

const decay = 1 - progress;
const currentIntensity = this.shake.intensity * decay;

if (progress >= 1) {
  this.stopShake();
  return { x: 0, y: 0, z: 0 };
}

/*
  Keep the shake small. The goal is to feel impact, not to
  make the camera unreadable.
*/
return {
  x: (Math.random() * 2 - 1) * currentIntensity,
  y: (Math.random() * 2 - 1) * currentIntensity,
  z: (Math.random() * 2 - 1) * currentIntensity
};

}

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
The game loop should call update every frame.
------------------------------------------------------- */

update(dt = 0.016, playerPosition = null) {
if (this.mode === "follow" && playerPosition) {
this.updateFollowTarget(playerPosition, dt);
}

const shakeOffset = this.applyShake(dt);

return {
  position: {
    x: this.position.x + shakeOffset.x,
    y: this.position.y + shakeOffset.y,
    z: this.position.z + shakeOffset.z
  },
  target: { ...this.target },
  mode: this.mode,
  shakeActive: this.shake.active
};

}

/* -------------------------------------------------------
SNAPSHOT / DEBUG
------------------------------------------------------- */

snapshot() {
return {
mode: this.mode,
position: this.getPosition(),
target: this.getTarget(),
offset: this.getOffset(),
shake: { ...this.shake },
lastTrackedTarget: { ...this._lastTrackedTarget }
};
}

debugString() {
const p = this.position;
return "Camera(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})";
}

/* -------------------------------------------------------
RESET / CLEANUP
------------------------------------------------------- */

reset() {
this.position = vec3(0, 0, 0);
this.target = vec3(0, 0, 0);
this.offset = vec3(0, 0, 0);
this.mode = "follow";
this.stopShake();
this._lastTrackedTarget = vec3(0, 0, 0);
}

destroy() {
this.reset();
}
}

export default CameraController;
