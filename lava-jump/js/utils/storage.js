/* =========================================================
FILE 15: js/utils/storage.js

This file contains safe local storage helpers.

Purpose:

- Save and load simple game data in the browser
- Keep storage access in one place
- Handle missing or blocked storage safely
- Make high score, settings, and progress saving easier

Important:
This file only handles storage access.
It does not decide what the game should save.
========================================================= */

/* ---------------------------------------------------------
STORAGE AVAILABILITY
--------------------------------------------------------- */

/**

* Check whether browser storage is available.

* Some environments block localStorage or make it unavailable.
  */
  function isStorageAvailable() {
  try {
  if (typeof window === "undefined" || !window.localStorage) {
  return false;
  }
  
  const testKey = "lava_jump_storage_test";
  window.localStorage.setItem(testKey, "1");
  window.localStorage.removeItem(testKey);
  return true;
  } catch {
  return false;
  }
  }

/**

* Internal safe access helper.
* If storage is unavailable, the callback is skipped.
  */
  function withStorage(callback, fallback = null) {
  if (!isStorageAvailable()) {
  return fallback;
  }

try {
return callback(window.localStorage);
} catch {
return fallback;
}
}

/* ---------------------------------------------------------
BASIC GET / SET
--------------------------------------------------------- */

/**

* Save a string value.
  */
  function setString(key, value) {
  return withStorage((storage) => {
  storage.setItem(key, String(value));
  return true;
  }, false);
  }

/**

* Read a string value.
  */
  function getString(key, defaultValue = "") {
  return withStorage((storage) => {
  const value = storage.getItem(key);
  return value === null ? defaultValue : value;
  }, defaultValue);
  }

/**

* Save a JSON-serializable value.
  */
  function setJSON(key, value) {
  return withStorage((storage) => {
  storage.setItem(key, JSON.stringify(value));
  return true;
  }, false);
  }

/**

* Read a JSON value.

* Returns defaultValue when parsing fails or the key is missing.
  */
  function getJSON(key, defaultValue = null) {
  return withStorage((storage) => {
  const raw = storage.getItem(key);
  if (raw === null) return defaultValue;
  
  try {
  return JSON.parse(raw);
  } catch {
  return defaultValue;
  }
  }, defaultValue);
  }

/* ---------------------------------------------------------
NUMBER / BOOLEAN HELPERS
--------------------------------------------------------- */

/**

* Save a number value.
  */
  function setNumber(key, value) {
  return setString(key, Number(value));
  }

/**

* Read a number value.
  */
  function getNumber(key, defaultValue = 0) {
  const raw = getString(key, null);
  if (raw === null || raw === "") return defaultValue;

const parsed = Number(raw);
return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**

* Save a boolean value.
  */
  function setBoolean(key, value) {
  return setString(key, value ? "true" : "false");
  }

/**

* Read a boolean value.
  */
  function getBoolean(key, defaultValue = false) {
  const raw = getString(key, null);
  if (raw === null) return defaultValue;

if (raw === "true") return true;
if (raw === "false") return false;
return defaultValue;
}

/* ---------------------------------------------------------
REMOVAL / CLEARING
--------------------------------------------------------- */

/**

* Remove a single key from storage.
  */
  function removeItem(key) {
  return withStorage((storage) => {
  storage.removeItem(key);
  return true;
  }, false);
  }

/**

* Clear all storage.
* Use with care. Usually only for development or full resets.
  */
  function clearStorage() {
  return withStorage((storage) => {
  storage.clear();
  return true;
  }, false);
  }

/* ---------------------------------------------------------
KEY NAMES

These constants help avoid typos when saving game data.
--------------------------------------------------------- */
const STORAGE_KEYS = {
HIGH_SCORE: "lava_jump_high_score",
SETTINGS: "lava_jump_settings",
SAVE_DATA: "lava_jump_save_data",
LAST_LEVEL: "lava_jump_last_level",
AUDIO: "lava_jump_audio",
DEBUG: "lava_jump_debug"
};

/* ---------------------------------------------------------
HIGH SCORE HELPERS
--------------------------------------------------------- */

/**

* Save a new high score if it is higher than the current one.
* Returns the stored high score after the update.
  */
  function saveHighScore(score) {
  const current = getNumber(STORAGE_KEYS.HIGH_SCORE, 0);
  const next = Math.max(current, Number(score) || 0);
  setNumber(STORAGE_KEYS.HIGH_SCORE, next);
  return next;
  }

/**

* Read the stored high score.
  */
  function loadHighScore() {
  return getNumber(STORAGE_KEYS.HIGH_SCORE, 0);
  }

/**

* Reset the stored high score.
  */
  function resetHighScore() {
  return removeItem(STORAGE_KEYS.HIGH_SCORE);
  }

/* ---------------------------------------------------------
SETTINGS HELPERS

These are general-purpose wrappers for game settings.
--------------------------------------------------------- */

/**

* Save a settings object.
  */
  function saveSettings(settings) {
  return setJSON(STORAGE_KEYS.SETTINGS, settings);
  }

/**

* Load a settings object.
  */
  function loadSettings(defaultValue = {}) {
  const value = getJSON(STORAGE_KEYS.SETTINGS, defaultValue);
  return value && typeof value === "object" ? value : defaultValue;
  }

/**

* Reset settings to default by removing the key.
  */
  function resetSettings() {
  return removeItem(STORAGE_KEYS.SETTINGS);
  }

/* ---------------------------------------------------------
SAVE DATA HELPERS

These are useful later when the game supports progress saving.
--------------------------------------------------------- */

/**

* Save generic game progress data.
  */
  function saveGameData(data) {
  return setJSON(STORAGE_KEYS.SAVE_DATA, data);
  }

/**

* Load generic game progress data.
  */
  function loadGameData(defaultValue = null) {
  return getJSON(STORAGE_KEYS.SAVE_DATA, defaultValue);
  }

/**

* Reset saved game data.
  */
  function resetGameData() {
  return removeItem(STORAGE_KEYS.SAVE_DATA);
  }

/* ---------------------------------------------------------
MISC HELPERS
--------------------------------------------------------- */

/**

* Save the last played level ID.
  */
  function saveLastLevel(levelId) {
  return setString(STORAGE_KEYS.LAST_LEVEL, levelId);
  }

/**

* Load the last played level ID.
  */
  function loadLastLevel(defaultValue = "") {
  return getString(STORAGE_KEYS.LAST_LEVEL, defaultValue);
  }

/**

* Save audio settings separately if needed.
  */
  function saveAudioSettings(audioSettings) {
  return setJSON(STORAGE_KEYS.AUDIO, audioSettings);
  }

/**

* Load audio settings.
  */
  function loadAudioSettings(defaultValue = {}) {
  const value = getJSON(STORAGE_KEYS.AUDIO, defaultValue);
  return value && typeof value === "object" ? value : defaultValue;
  }

/**

* Save debug preferences.
  */
  function saveDebugSettings(debugSettings) {
  return setJSON(STORAGE_KEYS.DEBUG, debugSettings);
  }

/**

* Load debug preferences.
  */
  function loadDebugSettings(defaultValue = {}) {
  const value = getJSON(STORAGE_KEYS.DEBUG, defaultValue);
  return value && typeof value === "object" ? value : defaultValue;
  }

/* ---------------------------------------------------------
EXPORTS
--------------------------------------------------------- */

export {
isStorageAvailable,
withStorage,
setString,
getString,
setJSON,
getJSON,
setNumber,
getNumber,
setBoolean,
getBoolean,
removeItem,
clearStorage,
STORAGE_KEYS,
saveHighScore,
loadHighScore,
resetHighScore,
saveSettings,
loadSettings,
resetSettings,
saveGameData,
loadGameData,
resetGameData,
saveLastLevel,
loadLastLevel,
saveAudioSettings,
loadAudioSettings,
saveDebugSettings,
loadDebugSettings
};

export default {
isStorageAvailable,
withStorage,
setString,
getString,
setJSON,
getJSON,
setNumber,
getNumber,
setBoolean,
getBoolean,
removeItem,
clearStorage,
STORAGE_KEYS,
saveHighScore,
loadHighScore,
resetHighScore,
saveSettings,
loadSettings,
resetSettings,
saveGameData,
loadGameData,
resetGameData,
saveLastLevel,
loadLastLevel,
saveAudioSettings,
loadAudioSettings,
saveDebugSettings,
loadDebugSettings
};
