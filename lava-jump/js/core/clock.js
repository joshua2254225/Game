/* =========================================================
FILE 18: js/core/clock.js

This file manages game timing and frame delta calculations.

Purpose:

- Track time between frames
- Provide stable delta time values for simulation
- Support pause/resume behavior
- Make update loops easier to read and maintain

This file is a core utility for the game loop.
It should remain small, focused, and reliable.
========================================================= */

import { clampDeltaTime, nowMs } from "../utils/time.js";

/**

* Clock

* ---

* A lightweight timing helper used by the game loop.

* 

* It stores:

* - the last frame timestamp

* - the current delta time

* - total elapsed running time

* - pause state

* 

* The clock does not update gameplay directly.

* It only measures time so other systems can use it.
  */
  class Clock {
  constructor(options = {}) {
  this.options = {
  maxDelta: 0.05,
  autoStart: true,
  ...options
  };
  
  this.running = false;
  this.paused = false;
  
  this.lastTime = 0;
  this.delta = 0;
  this.elapsed = 0;
  this.totalFrames = 0;
  
  this.pauseStartedAt = 0;
  this.pausedDuration = 0;
  
  if (this.options.autoStart) {
  this.start();
  }
  }

/* -------------------------------------------------------
START / STOP
------------------------------------------------------- */

start() {
this.running = true;
this.paused = false;
this.lastTime = nowMs();
this.delta = 0;
this.elapsed = 0;
this.totalFrames = 0;
this.pauseStartedAt = 0;
this.pausedDuration = 0;
}

stop() {
this.running = false;
this.paused = false;
this.delta = 0;
this.pauseStartedAt = 0;
}

reset() {
this.start();
}

/* -------------------------------------------------------
PAUSE / RESUME
------------------------------------------------------- */

pause() {
if (!this.running || this.paused) return;

this.paused = true;
this.pauseStartedAt = nowMs();

}

resume() {
if (!this.running || !this.paused) return;

const resumedAt = nowMs();
this.pausedDuration += resumedAt - this.pauseStartedAt;
this.pauseStartedAt = 0;
this.paused = false;
this.lastTime = resumedAt;

}

isPaused() {
return this.paused;
}

isRunning() {
return this.running;
}

/* -------------------------------------------------------
UPDATE
-------------------------------------------------------
Call once per frame.
Returns the current delta time in seconds.
------------------------------------------------------- */

update(currentTime = nowMs()) {
if (!this.running) {
this.delta = 0;
return 0;
}

if (this.paused) {
  this.delta = 0;
  return 0;
}

const rawDelta = (currentTime - this.lastTime) / 1000;
this.delta = clampDeltaTime(rawDelta, this.options.maxDelta);

this.lastTime = currentTime;
this.elapsed += this.delta;
this.totalFrames += 1;

return this.delta;

}

/* -------------------------------------------------------
ACCESSORS
------------------------------------------------------- */

getDelta() {
return this.delta;
}

getElapsed() {
return this.elapsed;
}

getFrames() {
return this.totalFrames;
}

getTime() {
return this.lastTime;
}

getPausedDuration() {
return this.pausedDuration;
}

/* -------------------------------------------------------
FPS HELPERS
------------------------------------------------------- */

getFps() {
if (this.delta <= 0) return 0;
return Math.round(1 / this.delta);
}

getAverageFrameMs() {
if (this.delta <= 0) return 0;
return this.delta * 1000;
}

/* -------------------------------------------------------
DEBUG / SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
running: this.running,
paused: this.paused,
delta: this.delta,
elapsed: this.elapsed,
totalFrames: this.totalFrames,
pausedDuration: this.pausedDuration,
lastTime: this.lastTime
};
}
}

export default Clock;
