/* =========================================================
FILE 57: js/audio/sfx.js

This file manages sound effect playback helpers.

Purpose:

- Provide a clear interface for playing short sounds
- Keep sound effect logic separate from music logic
- Make it easy to trigger UI, jump, coin, damage, and win sounds
- Keep the project modular and easy to extend

This file does not load audio files itself.
It expects an AudioManager instance to handle playback.
========================================================= */

/**

* SfxManager

* ---

* A small helper for triggering sound effects in a consistent way.

* 

* The class wraps an AudioManager and provides semantic methods

* like playJump(), playCoin(), and playDamage().

* 

* That keeps gameplay code readable and avoids repeating sound

* effect IDs all over the project.
  */
  class SfxManager {
  constructor(audioManager, options = {}) {
  this.audioManager = audioManager;
  
  this.options = {
  debug: false,
  debounceMs: 0,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  
  /*
  Last-play timestamps are stored per sound ID so we can
  optionally debounce spammy effects like footstep or damage.
  */
  this.lastPlayedAt = new Map();
  }

/* -------------------------------------------------------
CORE PLAYBACK
------------------------------------------------------- */

play(id, options = {}) {
if (!this.audioManager || !id) return false;

if (!this._canPlay(id)) {
  return false;
}

const played = this.audioManager.playSfx(id, options);

if (played) {
  this.lastPlayedAt.set(id, performance.now?.() ?? Date.now());
}

if (this.debug) {
  console.log("[SfxManager] play", id, played);
}

return played;

}

stop(id) {
if (!this.audioManager || !id) return false;
return this.audioManager.stopSfx(id);
}

/* -------------------------------------------------------
DEBOUNCE / COOLDOWN
------------------------------------------------------- */

_canPlay(id) {
const debounceMs = Math.max(0, Number(this.options.debounceMs) || 0);
if (debounceMs <= 0) return true;

const lastAt = this.lastPlayedAt.get(id) || 0;
const now = performance.now?.() ?? Date.now();

return (now - lastAt) >= debounceMs;

}

setDebounceMs(value) {
this.options.debounceMs = Math.max(0, Number(value) || 0);
}

getDebounceMs() {
return this.options.debounceMs;
}

clearDebounce(id = null) {
if (id === null) {
this.lastPlayedAt.clear();
return;
}

this.lastPlayedAt.delete(id);

}

/* -------------------------------------------------------
SEMANTIC HELPERS
-------------------------------------------------------
These methods keep the rest of the game easy to read.
------------------------------------------------------- */

playUiClick() {
return this.play("ui_click");
}

playUiBack() {
return this.play("ui_back");
}

playJump() {
return this.play("player_jump");
}

playLand() {
return this.play("player_land");
}

playCoin() {
return this.play("coin_pickup");
}

playDamage() {
return this.play("player_damage");
}

playDeath() {
return this.play("player_death");
}

playWin() {
return this.play("level_win");
}

playLose() {
return this.play("level_lose");
}

playCheckpoint() {
return this.play("checkpoint_reached");
}

playRespawn() {
return this.play("player_respawn");
}

playPause() {
return this.play("ui_pause");
}

playResume() {
return this.play("ui_resume");
}

/* -------------------------------------------------------
BATCH / EVENT HELPERS
------------------------------------------------------- */

playFromEvent(eventName) {
switch (eventName) {
case "jump":
return this.playJump();
case "land":
return this.playLand();
case "coin":
case "coin_collected":
return this.playCoin();
case "damage":
return this.playDamage();
case "death":
return this.playDeath();
case "win":
return this.playWin();
case "lose":
return this.playLose();
case "checkpoint":
return this.playCheckpoint();
case "respawn":
return this.playRespawn();
case "pause":
return this.playPause();
case "resume":
return this.playResume();
case "ui_click":
return this.playUiClick();
case "ui_back":
return this.playUiBack();
default:
return false;
}
}

playSequence(ids = [], delayMs = 0) {
if (!Array.isArray(ids) || ids.length === 0) return false;

ids.forEach((id, index) => {
  window.setTimeout(() => {
    this.play(id);
  }, Math.max(0, delayMs) * index);
});

return true;

}

/* -------------------------------------------------------
STATE HELPERS
------------------------------------------------------- */

hasPlayedRecently(id, withinMs = 250) {
const lastAt = this.lastPlayedAt.get(id);
if (!lastAt) return false;

const now = performance.now?.() ?? Date.now();
return (now - lastAt) <= withinMs;

}

/* -------------------------------------------------------
RESET / DESTROY
------------------------------------------------------- */

reset() {
this.lastPlayedAt.clear();
}

destroy() {
this.reset();
this.audioManager = null;
}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
debounceMs: this.options.debounceMs,
recentSounds: Array.from(this.lastPlayedAt.entries()).map(([id, time]) => ({
id,
time
}))
};
}
}

export default SfxManager;
