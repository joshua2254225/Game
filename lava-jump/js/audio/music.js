/* =========================================================
FILE 56: js/audio/music.js

This file manages background music behavior.

Purpose:

- Control the current background track
- Handle fade-in, fade-out, and crossfade behavior
- Keep music-specific logic separate from sound effects
- Make it easy to change tracks by scene or level

This file does not load the audio files themselves.
It expects an AudioManager or similar audio source to handle
the actual playback elements.
========================================================= */

/**

* MusicManager

* ---

* A lightweight controller for background music state.

* 

* This class can work with an AudioManager instance by calling

* its playMusic/stopMusic/pauseMusic/resumeMusic methods.

* 

* The first version keeps the logic simple and readable, while

* still leaving room for more advanced transitions later.
  */
  class MusicManager {
  constructor(audioManager, options = {}) {
  this.audioManager = audioManager;
  
  this.options = {
  defaultTrackId: null,
  fadeInMs: 250,
  fadeOutMs: 250,
  debug: false,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  
  this.state = {
  currentTrackId: null,
  nextTrackId: null,
  isPlaying: false,
  isFading: false,
  fadeProgress: 0,
  lastSwitchAt: 0
  };
  
  this._fadeTimer = null;
  }

/* -------------------------------------------------------
PLAYBACK CONTROL
------------------------------------------------------- */

play(trackId = this.options.defaultTrackId, options = {}) {
if (!this.audioManager || !trackId) return false;

this.stop();

const started = this.audioManager.playMusic(trackId, options);
if (!started) return false;

this.state.currentTrackId = trackId;
this.state.isPlaying = true;
this.state.isFading = false;
this.state.fadeProgress = 1;
this.state.lastSwitchAt = performance.now?.() ?? Date.now();

if (this.debug) {
  console.log("[MusicManager] play", trackId);
}

return true;

}

stop() {
if (!this.audioManager) return false;

this._clearFadeTimer();
this.audioManager.stopMusic();

this.state.currentTrackId = null;
this.state.nextTrackId = null;
this.state.isPlaying = false;
this.state.isFading = false;
this.state.fadeProgress = 0;

if (this.debug) {
  console.log("[MusicManager] stop");
}

return true;

}

pause() {
if (!this.audioManager) return false;
const result = this.audioManager.pauseMusic();

if (result) {
  this.state.isPlaying = false;
}

return result;

}

resume() {
if (!this.audioManager) return false;
const result = this.audioManager.resumeMusic();

if (result) {
  this.state.isPlaying = true;
  this.state.lastSwitchAt = performance.now?.() ?? Date.now();
}

return result;

}

/* -------------------------------------------------------
TRACK SWITCHING
------------------------------------------------------- */

switchTo(trackId, options = {}) {
if (!this.audioManager || !trackId) return false;

if (trackId === this.state.currentTrackId && this.state.isPlaying) {
  return true;
}

const fadeOutMs = Math.max(0, Number(options.fadeOutMs ?? this.options.fadeOutMs) || 0);
const fadeInMs = Math.max(0, Number(options.fadeInMs ?? this.options.fadeInMs) || 0);

if (fadeOutMs <= 0) {
  this.stop();
  return this.play(trackId, { fadeInMs });
}

this.state.nextTrackId = trackId;
this.state.isFading = true;
this.state.fadeProgress = 0;

this._clearFadeTimer();

if (this.debug) {
  console.log("[MusicManager] switching to", trackId);
}

this._fadeTimer = window.setTimeout(() => {
  this.audioManager.stopMusic();
  this.audioManager.playMusic(trackId, { fadeInMs });
  this.state.currentTrackId = trackId;
  this.state.nextTrackId = null;
  this.state.isFading = false;
  this.state.fadeProgress = 1;
  this.state.isPlaying = true;
  this.state.lastSwitchAt = performance.now?.() ?? Date.now();
  this._fadeTimer = null;
}, fadeOutMs);

return true;

}

/* -------------------------------------------------------
SCENE / LEVEL HELPERS
------------------------------------------------------- */

playMenuMusic(trackId = this.options.defaultTrackId) {
return this.switchTo(trackId, { fadeInMs: 250, fadeOutMs: 250 });
}

playLevelMusic(trackId) {
return this.switchTo(trackId, { fadeInMs: 250, fadeOutMs: 250 });
}

playWinMusic(trackId) {
return this.switchTo(trackId, { fadeInMs: 180, fadeOutMs: 180 });
}

playGameOverMusic(trackId) {
return this.switchTo(trackId, { fadeInMs: 180, fadeOutMs: 180 });
}

playDefault() {
return this.play(this.options.defaultTrackId);
}

/* -------------------------------------------------------
VOLUME HELPERS
------------------------------------------------------- */

setVolume(volume) {
if (!this.audioManager) return false;
this.audioManager.setMusicVolume(volume);
return true;
}

getVolume() {
return this.audioManager?.musicVolume ?? 0;
}

setMuted(muted = true) {
if (!this.audioManager) return false;
this.audioManager.setMuted(muted);
return true;
}

isMuted() {
return this.audioManager?.isMuted?.() ?? false;
}

/* -------------------------------------------------------
STATE HELPERS
------------------------------------------------------- */

isPlaying() {
return this.state.isPlaying;
}

isFading() {
return this.state.isFading;
}

getCurrentTrackId() {
return this.state.currentTrackId;
}

getNextTrackId() {
return this.state.nextTrackId;
}

getFadeProgress() {
return this.state.fadeProgress;
}

/* -------------------------------------------------------
INTERNAL
------------------------------------------------------- */

_clearFadeTimer() {
if (this._fadeTimer) {
clearTimeout(this._fadeTimer);
this._fadeTimer = null;
}
}

/* -------------------------------------------------------
RESET / DESTROY
------------------------------------------------------- */

reset() {
this.stop();
this.state.lastSwitchAt = 0;
}

destroy() {
this._clearFadeTimer();
this.stop();
this.audioManager = null;
}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
currentTrackId: this.state.currentTrackId,
nextTrackId: this.state.nextTrackId,
isPlaying: this.state.isPlaying,
isFading: this.state.isFading,
fadeProgress: this.state.fadeProgress,
lastSwitchAt: this.state.lastSwitchAt
};
}
}

export default MusicManager;
