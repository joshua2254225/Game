/* =========================================================
FILE 55: js/audio/soundLoader.js

This file handles loading sound assets for the game.

Purpose:

- Collect audio file paths in one place
- Load sounds with progress tracking
- Provide a simple manifest-based loading system
- Keep loading logic separate from playback logic

This file does not play audio.
It only prepares audio assets so AudioManager can use them.
========================================================= */

/**

* SoundLoader

* ---

* A small helper for preloading audio files before gameplay.

* 

* It supports a manifest of sound IDs and source URLs.

* The loader returns an organized asset map that can later be

* passed into the AudioManager.
  */
  class SoundLoader {
  constructor(options = {}) {
  this.options = {
  debug: false,
  ...options
  };
  
  this.debug = Boolean(this.options.debug);
  
  this.manifest = new Map();
  this.assets = new Map();
  this.errors = new Map();
  this.loading = false;
  this.progress = 0;
  }

/* -------------------------------------------------------
MANIFEST
------------------------------------------------------- */

add(id, srcOrSources, meta = {}) {
if (!id) {
throw new Error("[SoundLoader] Sound id is required.");
}

this.manifest.set(id, {
  id,
  srcOrSources,
  meta: {
    type: meta.type || "sfx",
    loop: Boolean(meta.loop),
    volume: typeof meta.volume === "number" ? meta.volume : 1,
    preload: meta.preload || "auto",
    ...meta
  }
});

if (this.debug) {
  console.log("[SoundLoader] added", id);
}

return this;

}

addMany(items = []) {
if (!Array.isArray(items)) return this;

for (const item of items) {
  if (!item) continue;
  this.add(item.id, item.srcOrSources ?? item.src ?? item.sources, item.meta || item);
}

return this;

}

remove(id) {
this.manifest.delete(id);
this.assets.delete(id);
this.errors.delete(id);
return this;
}

clear() {
this.manifest.clear();
this.assets.clear();
this.errors.clear();
this.progress = 0;
this.loading = false;
}

/* -------------------------------------------------------
LOADING
------------------------------------------------------- */

async loadAll() {
if (this.loading) {
return this.getSnapshot();
}

this.loading = true;
this.progress = 0;
this.assets.clear();
this.errors.clear();

const entries = Array.from(this.manifest.values());
const total = entries.length;

if (total === 0) {
  this.loading = false;
  this.progress = 1;
  return this.getSnapshot();
}

let loaded = 0;

for (const entry of entries) {
  try {
    const audio = await this._loadEntry(entry);
    this.assets.set(entry.id, {
      id: entry.id,
      audio,
      meta: { ...entry.meta }
    });
  } catch (error) {
    this.errors.set(entry.id, error);
    if (this.debug) {
      console.warn("[SoundLoader] failed to load", entry.id, error);
    }
  } finally {
    loaded += 1;
    this.progress = loaded / total;
  }
}

this.loading = false;
this.progress = 1;

if (this.debug) {
  console.log("[SoundLoader] load complete", this.getSnapshot());
}

return this.getSnapshot();

}

_loadEntry(entry) {
return new Promise((resolve, reject) => {
if (typeof Audio === "undefined") {
reject(new Error("Audio API is not available in this environment."));
return;
}

  const audio = new Audio();
  audio.preload = entry.meta.preload || "auto";
  audio.loop = Boolean(entry.meta.loop);
  audio.volume = typeof entry.meta.volume === "number" ? entry.meta.volume : 1;

  const sources = Array.isArray(entry.srcOrSources)
    ? entry.srcOrSources.filter(Boolean)
    : [entry.srcOrSources].filter(Boolean);

  if (sources.length === 0) {
    reject(new Error(`No audio source provided for sound "${entry.id}".`));
    return;
  }

  /*
    For the first version we use the first source in the list.
    The manifest can still store multiple sources so the project
    can expand fallback handling later if needed.
  */
  const source = sources[0];
  audio.src = source;

  const cleanup = () => {
    audio.removeEventListener("canplaythrough", onReady);
    audio.removeEventListener("error", onError);
  };

  const onReady = () => {
    cleanup();
    resolve(audio);
  };

  const onError = () => {
    cleanup();
    reject(new Error(`Failed to load audio source: ${source}`));
  };

  audio.addEventListener("canplaythrough", onReady, { once: true });
  audio.addEventListener("error", onError, { once: true });

  /*
    Some browsers may not fire canplaythrough reliably until
    playback is attempted or load() is called.
  */
  audio.load?.();

  /*
    If the audio is already cached and ready, the event may not
    fire in some browsers, so we check a readyState fallback.
  */
  if (audio.readyState >= 3) {
    cleanup();
    resolve(audio);
  }
});

}

/* -------------------------------------------------------
ASSET ACCESS
------------------------------------------------------- */

has(id) {
return this.assets.has(id);
}

hasError(id) {
return this.errors.has(id);
}

get(id) {
const asset = this.assets.get(id);
return asset ? asset.audio : null;
}

getMeta(id) {
const asset = this.assets.get(id);
return asset ? { ...asset.meta } : null;
}

getError(id) {
return this.errors.get(id) || null;
}

list() {
return Array.from(this.assets.values()).map((item) => ({
id: item.id,
meta: { ...item.meta }
}));
}

listErrors() {
return Array.from(this.errors.entries()).map(([id, error]) => ({
id,
error
}));
}

/* -------------------------------------------------------
MANIFEST HELPERS
------------------------------------------------------- */

getManifestIds() {
return Array.from(this.manifest.keys());
}

getPendingIds() {
const loaded = new Set(this.assets.keys());
const failed = new Set(this.errors.keys());

return this.getManifestIds().filter((id) => !loaded.has(id) && !failed.has(id));

}

getLoadCounts() {
return {
manifest: this.manifest.size,
loaded: this.assets.size,
failed: this.errors.size,
pending: this.getPendingIds().length
};
}

/* -------------------------------------------------------
CONVENIENCE
------------------------------------------------------- */

registerDefaultSounds() {
/*
This helper is optional. It gives the project a place to
register common sound IDs in a consistent format.
*/
return this.addMany([
{ id: "ui_click", srcOrSources: "assets/sounds/ui_click.mp3", meta: { type: "sfx" } },
{ id: "ui_back", srcOrSources: "assets/sounds/ui_back.mp3", meta: { type: "sfx" } },
{ id: "player_jump", srcOrSources: "assets/sounds/player_jump.mp3", meta: { type: "sfx" } },
{ id: "player_land", srcOrSources: "assets/sounds/player_land.mp3", meta: { type: "sfx" } },
{ id: "coin_pickup", srcOrSources: "assets/sounds/coin_pickup.mp3", meta: { type: "sfx" } },
{ id: "player_damage", srcOrSources: "assets/sounds/player_damage.mp3", meta: { type: "sfx" } },
{ id: "player_death", srcOrSources: "assets/sounds/player_death.mp3", meta: { type: "sfx" } },
{ id: "level_win", srcOrSources: "assets/sounds/level_win.mp3", meta: { type: "sfx" } },
{ id: "level_lose", srcOrSources: "assets/sounds/level_lose.mp3", meta: { type: "sfx" } },
{ id: "music_main", srcOrSources: "assets/sounds/music_main.mp3", meta: { type: "music", loop: true, volume: 0.8 } }
]);
}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

getSnapshot() {
return {
loading: this.loading,
progress: this.progress,
counts: this.getLoadCounts(),
errors: this.listErrors().map((item) => item.id)
};
}

/* -------------------------------------------------------
CLEANUP
------------------------------------------------------- */

destroy() {
for (const asset of this.assets.values()) {
if (asset?.audio) {
asset.audio.pause?.();
asset.audio.src = "";
asset.audio.load?.();
}
}

this.clear();

}
}

export default SoundLoader;
