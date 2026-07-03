/* =========================================================
FILE 14: js/utils/time.js

This file contains reusable time helpers for the game.

Purpose:

- Keep frame timing and duration logic in one place
- Make countdowns, timers, cooldowns, and animations easier
- Provide safe helpers for working with milliseconds
- Keep game code cleaner and easier to read

This file is utility-only.
It should not know anything about levels, players, or UI.
========================================================= */

/* ---------------------------------------------------------
BASIC TIME HELPERS
--------------------------------------------------------- */

/**

* Return the current timestamp in milliseconds.
* Uses performance.now when available for better precision.
  */
  function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
  return performance.now();
  }

return Date.now();
}

/**

* Clamp a delta time value so very large frame jumps do not
* break gameplay when the tab is hidden or the device lags.
  */
  function clampDeltaTime(dt, maxDt = 0.05) {
  if (!Number.isFinite(dt)) return 0;
  return Math.min(Math.max(dt, 0), maxDt);
  }

/**

* Convert milliseconds to seconds.
  */
  function msToSeconds(ms) {
  return ms / 1000;
  }

/**

* Convert seconds to milliseconds.
  */
  function secondsToMs(seconds) {
  return seconds * 1000;
  }

/* ---------------------------------------------------------
FORMATTING
--------------------------------------------------------- */

/**

* Format a time value in seconds as M:SS.
* Example: 75 -> "1:15"
  */
  function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return "${minutes}:${String(remaining).padStart(2, "0")}";
  }

/**

* Format milliseconds as a rounded seconds string.
* Example: 1530 -> "1.5s"
  */
  function formatDuration(ms, precision = 1) {
  const seconds = msToSeconds(ms);
  return "${seconds.toFixed(precision)}s";
  }

/**

* Format a timestamp difference into a compact readable form.
* Good for debug values and cooldown displays.
  */
  function formatElapsed(ms) {
  if (ms < 1000) return "${Math.round(ms)}ms";
  return formatDuration(ms, 1);
  }

/* ---------------------------------------------------------
STOPWATCH
--------------------------------------------------------- */

/**

* Create a simple stopwatch object.
* It can be started, paused, resumed, and reset.
  */
  function createStopwatch(startRunning = false) {
  const state = {
  running: startRunning,
  startTime: startRunning ? nowMs() : 0,
  accumulated: 0,
  lastLap: 0
  };

return {
start() {
if (state.running) return;
state.running = true;
state.startTime = nowMs();
},

stop() {
  if (!state.running) return;
  state.accumulated += nowMs() - state.startTime;
  state.running = false;
  state.startTime = 0;
},

reset() {
  state.running = false;
  state.startTime = 0;
  state.accumulated = 0;
  state.lastLap = 0;
},

lap() {
  const elapsed = this.elapsed();
  const lapValue = elapsed - state.lastLap;
  state.lastLap = elapsed;
  return lapValue;
},

elapsed() {
  if (state.running) {
    return state.accumulated + (nowMs() - state.startTime);
  }

  return state.accumulated;
},

isRunning() {
  return state.running;
}

};
}

/* ---------------------------------------------------------
COUNTDOWN TIMER
--------------------------------------------------------- */

/**

* Create a countdown timer from a duration in milliseconds.
* Useful for level timers, timed challenges, or cooldown logic.
  */
  function createCountdown(durationMs) {
  const state = {
  durationMs: Math.max(0, durationMs || 0),
  startedAt: 0,
  running: false,
  pausedAt: 0,
  pausedTotal: 0
  };

return {
start() {
state.startedAt = nowMs();
state.running = true;
state.pausedAt = 0;
state.pausedTotal = 0;
},

pause() {
  if (!state.running || state.pausedAt !== 0) return;
  state.pausedAt = nowMs();
},

resume() {
  if (!state.running || state.pausedAt === 0) return;
  state.pausedTotal += nowMs() - state.pausedAt;
  state.pausedAt = 0;
},

stop() {
  state.running = false;
  state.startedAt = 0;
  state.pausedAt = 0;
  state.pausedTotal = 0;
},

remaining() {
  if (!state.running || state.startedAt === 0) return state.durationMs;

  const currentPause = state.pausedAt !== 0 ? nowMs() - state.pausedAt : 0;
  const elapsed = nowMs() - state.startedAt - state.pausedTotal - currentPause;
  return Math.max(0, state.durationMs - elapsed);
},

elapsed() {
  return Math.max(0, state.durationMs - this.remaining());
},

isRunning() {
  return state.running;
},

isExpired() {
  return this.remaining() <= 0;
},

progress() {
  if (state.durationMs <= 0) return 1;
  return 1 - this.remaining() / state.durationMs;
},

setDuration(ms) {
  state.durationMs = Math.max(0, ms || 0);
},

getDuration() {
  return state.durationMs;
}

};
}

/* ---------------------------------------------------------
FRAME TIMER
--------------------------------------------------------- */

/**

* Create a small helper for measuring frame durations.
* This is useful for FPS calculations and debug panels.
  */
  function createFrameTimer(sampleSize = 60) {
  const samples = [];
  let last = nowMs();

return {
mark() {
const current = nowMs();
const delta = current - last;
last = current;

  samples.push(delta);
  if (samples.length > sampleSize) {
    samples.shift();
  }

  return delta;
},

getAverageDelta() {
  if (samples.length === 0) return 0;
  const total = samples.reduce((sum, value) => sum + value, 0);
  return total / samples.length;
},

getFps() {
  const delta = this.getAverageDelta();
  if (delta <= 0) return 0;
  return Math.round(1000 / delta);
},

reset() {
  samples.length = 0;
  last = nowMs();
}

};
}

/* ---------------------------------------------------------
COOLDOWNS
--------------------------------------------------------- */

/**

* Check whether a cooldown has expired.
  */
  function isCooldownReady(lastUsedAt, cooldownMs, currentTime = nowMs()) {
  return currentTime - lastUsedAt >= cooldownMs;
  }

/**

* Return the remaining cooldown time in milliseconds.
  */
  function getCooldownRemaining(lastUsedAt, cooldownMs, currentTime = nowMs()) {
  return Math.max(0, cooldownMs - (currentTime - lastUsedAt));
  }

/**

* Create a reusable cooldown helper.
  */
  function createCooldown(cooldownMs) {
  let lastUsedAt = -Infinity;

return {
ready(currentTime = nowMs()) {
return isCooldownReady(lastUsedAt, cooldownMs, currentTime);
},

use(currentTime = nowMs()) {
  if (!this.ready(currentTime)) return false;
  lastUsedAt = currentTime;
  return true;
},

remaining(currentTime = nowMs()) {
  return getCooldownRemaining(lastUsedAt, cooldownMs, currentTime);
},

reset() {
  lastUsedAt = -Infinity;
},

setDuration(ms) {
  cooldownMs = Math.max(0, ms || 0);
},

getDuration() {
  return cooldownMs;
}

};
}

/* ---------------------------------------------------------
SCHEDULING HELPERS
--------------------------------------------------------- */

/**

* Returns true when the current time is at or past a target time.
  */
  function hasReachedTime(targetTimeMs, currentTimeMs = nowMs()) {
  return currentTimeMs >= targetTimeMs;
  }

/**

* Returns the time left until a target timestamp.
  */
  function timeUntil(targetTimeMs, currentTimeMs = nowMs()) {
  return Math.max(0, targetTimeMs - currentTimeMs);
  }

/**

* Returns true when a duration has passed since a start time.
  */
  function hasElapsed(startTimeMs, durationMs, currentTimeMs = nowMs()) {
  return currentTimeMs - startTimeMs >= durationMs;
  }

/* ---------------------------------------------------------
EXPORTS
--------------------------------------------------------- */

export {
nowMs,
clampDeltaTime,
msToSeconds,
secondsToMs,
formatTime,
formatDuration,
formatElapsed,
createStopwatch,
createCountdown,
createFrameTimer,
isCooldownReady,
getCooldownRemaining,
createCooldown,
hasReachedTime,
timeUntil,
hasElapsed
};

export default {
nowMs,
clampDeltaTime,
msToSeconds,
secondsToMs,
formatTime,
formatDuration,
formatElapsed,
createStopwatch,
createCountdown,
createFrameTimer,
isCooldownReady,
getCooldownRemaining,
createCooldown,
hasReachedTime,
timeUntil,
hasElapsed
};
