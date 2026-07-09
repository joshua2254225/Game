/* =========================================================
FILE 54: js/audio/audioManager.js

This file manages all game audio in one place.

Purpose:

- Control master volume, music volume, and sfx volume
- Load and play sounds consistently
- Support mute, pause, and resume behavior
- Keep audio logic separate from gameplay logic

This file is intentionally built as a foundation.
It can start simple, then grow into a full audio system
without forcing other files to change much.
========================================================= */

import gameConfig from "../config/gameConfig.js";
import { getJSON, setJSON, STORAGE_KEYS } from "../utils/storage.js";

/**

* AudioManager

* ---

* A lightweight controller for background music and sound effects.

* 

* The first version uses HTMLAudioElement objects because they are

* simple, browser-friendly, and easy to manage.

* 

* Later, the system could be extended to use Web Audio API if needed.
  */
  class AudioManager {
  constructor(options = {}) {
  this.options = {
  masterVolume: gameConfig.audio.masterVolume,
  musicVolume: gameConfig.audio.musicVolume,
  sfxVolume: gameConfig.audio.sfxVolume,
  muteByDefault: gameConfig.audio.muteByDefault,
  enableMusic: gameConfig.audio.enableMusic,
  enableSfx: gameConfig.audio.enableSfx,
  debug: false,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  
  /*
  Audio elements are stored in maps so they can be loaded,
  reused, paused, or destroyed cleanly.
  */
  this.musicTracks = new Map();
  this.sfxTracks = new Map();
  this.currentMusicId = null;
  
  this.enabled = true;
  this.muted = Boolean(this.options.muteByDefault);
  
  this.masterVolume = this._clampVolume(this.options.masterVolume);
  this.musicVolume = this._clampVolume(this.options.musicVolume);
  this.sfxVolume = this._clampVolume(this.options.sfxVolume);
  
  this._loadPersistedSettings();
  this._applyGlobalVolume();
  }

/* -------------------------------------------------------
SETTINGS
------------------------------------------------------- */

_loadPersistedSettings() {
const saved = getJSON(STORAGE_KEYS.AUDIO, null);

if (!saved || typeof saved !== "object") {
  return;
}

if (typeof saved.masterVolume === "number") {
  this.masterVolume = this._clampVolume(saved.masterVolume);
}

if (typeof saved.musicVolume === "number") {
  this.musicVolume = this._clampVolume(saved.musicVolume);
}

if (typeof saved.sfxVolume === "number") {
  this.sfxVolume = this._clampVolume(saved.sfxVolume);
}

if (typeof saved.muted === "boolean") {
  this.muted = saved.muted;
}

}

saveSettings() {
return setJSON(STORAGE_KEYS.AUDIO, {
masterVolume: this.masterVolume,
musicVolume: this.musicVolume,
sfxVolume: this.sfxVolume,
muted: this.muted
});
}

/* -------------------------------------------------------
LOADING
-------------------------------------------------------
Audio can be registered with either a single source or
a list of sources for fallback compatibility.
------------------------------------------------------- */

loadMusic(id, srcOrSources, options = {}) {
const audio = this._createAudioElement(srcOrSources, {
loop: options.loop ?? true,
preload: options.preload ?? "auto"
});

if (!audio) return null;

this.musicTracks.set(id, {
  id,
  audio,
  options: {
    loop: options.loop ?? true,
    volume: this._clampVolume(options.volume ?? 1),
    fadeInMs: options.fadeInMs ?? 0,
    fadeOutMs: options.fadeOutMs ?? 0
  }
});

this._applyTrackVolume(id, "music");

if (this.debug) {
  console.log("[AudioManager] loaded music", id);
}

return audio;

}

loadSfx(id, srcOrSources, options = {}) {
const audio = this._createAudioElement(srcOrSources, {
loop: options.loop ?? false,
preload: options.preload ?? "auto"
});

if (!audio) return null;

this.sfxTracks.set(id, {
  id,
  audio,
  options: {
    loop: options.loop ?? false,
    volume: this._clampVolume(options.volume ?? 1)
  }
});

this._applyTrackVolume(id, "sfx");

if (this.debug) {
  console.log("[AudioManager] loaded sfx", id);
}

return audio;

}

_createAudioElement(srcOrSources, options = {}) {
if (typeof Audio === "undefined") {
return null;
}

const audio = new Audio();
audio.preload = options.preload ?? "auto";
audio.loop = Boolean(options.loop);

if (Array.isArray(srcOrSources)) {
  /*
    If multiple sources are provided, we use the first one here.
    More advanced fallback source selection can be added later.
  */
  audio.src = srcOrSources[0] || "";
} else {
  audio.src = srcOrSources || "";
}

return audio;

}

/* -------------------------------------------------------
PLAYBACK
------------------------------------------------------- */

playMusic(id, options = {}) {
if (!this.enabled || !this.options.enableMusic || this.muted) {
return false;
}

const entry = this.musicTracks.get(id);
if (!entry) return false;

const audio = entry.audio;

if (this.currentMusicId === id && !audio.paused) {
  return true;
}

this.stopMusic();

audio.loop = entry.options.loop;
audio.volume = this._resolveVolume(entry.options.volume, "music");
audio.currentTime = 0;

const playPromise = audio.play();
this.currentMusicId = id;

if (playPromise && typeof playPromise.catch === "function") {
  playPromise.catch((error) => {
    if (this.debug) {
      console.warn("[AudioManager] music play blocked", error);
    }
  });
}

if (this.debug) {
  console.log("[AudioManager] play music", id);
}

return true;

}

stopMusic() {
if (!this.currentMusicId) return false;

const entry = this.musicTracks.get(this.currentMusicId);
if (entry?.audio) {
  entry.audio.pause();
  entry.audio.currentTime = 0;
}

this.currentMusicId = null;
return true;

}

pauseMusic() {
const entry = this.musicTracks.get(this.currentMusicId);
if (!entry?.audio) return false;

entry.audio.pause();
return true;

}

resumeMusic() {
const entry = this.musicTracks.get(this.currentMusicId);
if (!entry?.audio) return false;

if (this.enabled && !this.muted && this.options.enableMusic) {
  const playPromise = entry.audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
  return true;
}

return false;

}

playSfx(id, options = {}) {
if (!this.enabled || !this.options.enableSfx || this.muted) {
return false;
}

const entry = this.sfxTracks.get(id);
if (!entry) return false;

const audio = entry.audio;
audio.loop = Boolean(options.loop ?? entry.options.loop);
audio.volume = this._resolveVolume(options.volume ?? entry.options.volume, "sfx");
audio.currentTime = 0;

const playPromise = audio.play();
if (playPromise && typeof playPromise.catch === "function") {
  playPromise.catch((error) => {
    if (this.debug) {
      console.warn("[AudioManager] sfx play blocked", error);
    }
  });
}

if (this.debug) {
  console.log("[AudioManager] play sfx", id);
}

return true;

}

stopSfx(id) {
const entry = this.sfxTracks.get(id);
if (!entry?.audio) return false;

entry.audio.pause();
entry.audio.currentTime = 0;
return true;

}

/* -------------------------------------------------------
VOLUME CONTROL
------------------------------------------------------- */

setMasterVolume(value) {
this.masterVolume = this._clampVolume(value);
this._applyGlobalVolume();
this.saveSettings();
}

setMusicVolume(value) {
this.musicVolume = this._clampVolume(value);
this._applyGlobalVolume();
this.saveSettings();
}

setSfxVolume(value) {
this.sfxVolume = this._clampVolume(value);
this._applyGlobalVolume();
this.saveSettings();
}

setMuted(muted = true) {
this.muted = Boolean(muted);
this._applyGlobalVolume();
this.saveSettings();
}

toggleMute(force) {
const next = typeof force === "boolean" ? force : !this.muted;
this.setMuted(next);
return this.muted;
}

_clampVolume(value) {
const numeric = Number(value);
if (!Number.isFinite(numeric)) return 0;
return Math.max(0, Math.min(1, numeric));
}

_resolveVolume(baseVolume, type) {
if (this.muted) return 0;

const master = this.masterVolume;
const local = this._clampVolume(baseVolume);

if (type === "music") {
  return master * this.musicVolume * local;
}

if (type === "sfx") {
  return master * this.sfxVolume * local;
}

return master * local;

}

_applyGlobalVolume() {
for (const [id, entry] of this.musicTracks.entries()) {
if (!entry?.audio) continue;
entry.audio.volume = this._resolveVolume(entry.options.volume, "music");
entry.audio.muted = this.muted;
}

for (const [id, entry] of this.sfxTracks.entries()) {
  if (!entry?.audio) continue;
  entry.audio.volume = this._resolveVolume(entry.options.volume, "sfx");
  entry.audio.muted = this.muted;
}

if (this.currentMusicId) {
  const current = this.musicTracks.get(this.currentMusicId);
  if (current?.audio) {
    current.audio.volume = this._resolveVolume(current.options.volume, "music");
    current.audio.muted = this.muted;
  }
}

}

_applyTrackVolume(id, type) {
const entry = type === "music"
? this.musicTracks.get(id)
: this.sfxTracks.get(id);

if (!entry?.audio) return;

entry.audio.volume = this._resolveVolume(entry.options.volume, type);
entry.audio.muted = this.muted;

}

/* -------------------------------------------------------
ENABLE / DISABLE
------------------------------------------------------- */

enable() {
this.enabled = true;
this._applyGlobalVolume();
}

disable() {
this.stopMusic();
this.enabled = false;
this._applyGlobalVolume();
}

isEnabled() {
return this.enabled;
}

isMuted() {
return this.muted;
}

/* -------------------------------------------------------
MUSIC HELPERS
------------------------------------------------------- */

hasMusic(id) {
return this.musicTracks.has(id);
}

hasSfx(id) {
return this.sfxTracks.has(id);
}

getMusicIds() {
return Array.from(this.musicTracks.keys());
}

getSfxIds() {
return Array.from(this.sfxTracks.keys());
}

setMusicTrackLoop(id, loop) {
const entry = this.musicTracks.get(id);
if (!entry?.audio) return false;

entry.options.loop = Boolean(loop);
entry.audio.loop = Boolean(loop);
return true;

}

setSfxTrackLoop(id, loop) {
const entry = this.sfxTracks.get(id);
if (!entry?.audio) return false;

entry.options.loop = Boolean(loop);
entry.audio.loop = Boolean(loop);
return true;

}

/* -------------------------------------------------------
PRESET EVENTS
-------------------------------------------------------
These helpers make it easy for the game to play sounds
without repeating audio IDs everywhere.
------------------------------------------------------- */

playUiClick() {
return this.playSfx("ui_click");
}

playUiBack() {
return this.playSfx("ui_back");
}

playJump() {
return this.playSfx("player_jump");
}

playLand() {
return this.playSfx("player_land");
}

playCoin() {
return this.playSfx("coin_pickup");
}

playDamage() {
return this.playSfx("player_damage");
}

playDeath() {
return this.playSfx("player_death");
}

playWin() {
return this.playSfx("level_win");
}

playLose() {
return this.playSfx("level_lose");
}

/* -------------------------------------------------------
CLEANUP
------------------------------------------------------- */

unloadMusic(id) {
const entry = this.musicTracks.get(id);
if (!entry) return false;

if (entry.audio) {
  entry.audio.pause();
  entry.audio.src = "";
  entry.audio.load?.();
}

this.musicTracks.delete(id);

if (this.currentMusicId === id) {
  this.currentMusicId = null;
}

return true;

}

unloadSfx(id) {
const entry = this.sfxTracks.get(id);
if (!entry) return false;

if (entry.audio) {
  entry.audio.pause();
  entry.audio.src = "";
  entry.audio.load?.();
}

this.sfxTracks.delete(id);
return true;

}

destroy() {
this.stopMusic();

for (const id of this.getMusicIds()) {
  this.unloadMusic(id);
}

for (const id of this.getSfxIds()) {
  this.unloadSfx(id);
}

this.enabled = false;
this.muted = true;

}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
enabled: this.enabled,
muted: this.muted,
masterVolume: this.masterVolume,
musicVolume: this.musicVolume,
sfxVolume: this.sfxVolume,
currentMusicId: this.currentMusicId,
musicCount: this.musicTracks.size,
sfxCount: this.sfxTracks.size
};
}
}

export default AudioManager;
