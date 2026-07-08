/* =========================================================
FILE 42: js/levels/levelLoader.js

This file loads and manages level data.

Purpose:

- Collect level definitions in one place
- Provide a clean way to get a level by ID or index
- Normalize level data so the game can rely on a standard shape
- Keep level loading separate from level building and gameplay

This loader works with plain data objects.
It does not create the actual 3D world itself. That job will
later belong to the level builder and game systems.
========================================================= */

import { normalizeLevel } from "./levelTemplate.js";
import level01 from "./level01.js";
import level02 from "./level02.js";
import level03 from "./level03.js";

/**

* LevelLoader

* ---

* Stores registered levels and returns normalized copies of them.

* 

* This class is intentionally data-driven so that new level files

* can be added later with minimal changes.
  */
  class LevelLoader {
  constructor(options = {}) {
  this.options = {
  debug: false,
  autoRegisterDefaults: true,
  ...options
  };
  
  this.levels = new Map();
  this.order = [];
  this.debug = Boolean(this.options.debug);
  
  if (this.options.autoRegisterDefaults) {
  this.register(level01);
  this.register(level02);
  this.register(level03);
  }
  }

/* -------------------------------------------------------
REGISTRATION
------------------------------------------------------- */

register(level) {
const normalized = normalizeLevel(level || {});
if (!normalized.id) {
throw new Error("[LevelLoader] Level must have an id.");
}

this.levels.set(normalized.id, normalized);

if (!this.order.includes(normalized.id)) {
  this.order.push(normalized.id);
}

if (this.debug) {
  console.log("[LevelLoader] registered", normalized.id);
}

return normalized;

}

unregister(levelId) {
if (!this.levels.has(levelId)) return false;

this.levels.delete(levelId);
this.order = this.order.filter((id) => id !== levelId);

if (this.debug) {
  console.log("[LevelLoader] unregistered", levelId);
}

return true;

}

clear() {
this.levels.clear();
this.order.length = 0;
}

/* -------------------------------------------------------
LOOKUP
------------------------------------------------------- */

has(levelId) {
return this.levels.has(levelId);
}

get(levelId) {
const level = this.levels.get(levelId);
return level ? normalizeLevel(level) : null;
}

getByIndex(index = 0) {
if (this.order.length === 0) return null;

const safeIndex = Math.max(0, Math.min(index, this.order.length - 1));
const levelId = this.order[safeIndex];
return this.get(levelId);

}

getFirst() {
return this.getByIndex(0);
}

getLast() {
return this.getByIndex(this.order.length - 1);
}

list() {
return this.order
.map((id) => this.levels.get(id))
.filter(Boolean)
.map((level) => normalizeLevel(level));
}

count() {
return this.order.length;
}

/* -------------------------------------------------------
LOADING
------------------------------------------------------- */

load(levelIdOrIndex = 0) {
if (typeof levelIdOrIndex === "string") {
return this.get(levelIdOrIndex);
}

return this.getByIndex(levelIdOrIndex);

}

loadNext(currentLevelId = null) {
if (this.order.length === 0) return null;

if (!currentLevelId) {
  return this.getByIndex(0);
}

const currentIndex = this.order.indexOf(currentLevelId);
if (currentIndex === -1) return this.getByIndex(0);

const nextIndex = currentIndex + 1;
if (nextIndex >= this.order.length) return null;

return this.getByIndex(nextIndex);

}

loadPrevious(currentLevelId = null) {
if (this.order.length === 0) return null;

if (!currentLevelId) {
  return this.getByIndex(0);
}

const currentIndex = this.order.indexOf(currentLevelId);
if (currentIndex <= 0) return this.getByIndex(0);

return this.getByIndex(currentIndex - 1);

}

/* -------------------------------------------------------
NORMALIZATION / VALIDATION
------------------------------------------------------- */

normalize(level) {
return normalizeLevel(level);
}

validate(level) {
const normalized = normalizeLevel(level || {});
const errors = [];

if (!normalized.id) {
  errors.push("Level id is missing.");
}

if (!normalized.name) {
  errors.push("Level name is missing.");
}

if (!normalized.spawn) {
  errors.push("Spawn point is missing.");
}

if (!Array.isArray(normalized.platforms)) {
  errors.push("Platforms must be an array.");
}

if (!Array.isArray(normalized.coins)) {
  errors.push("Coins must be an array.");
}

if (!Array.isArray(normalized.checkpoints)) {
  errors.push("Checkpoints must be an array.");
}

if (!Array.isArray(normalized.obstacles)) {
  errors.push("Obstacles must be an array.");
}

if (!Array.isArray(normalized.enemies)) {
  errors.push("Enemies must be an array.");
}

if (!Array.isArray(normalized.lava) && !Array.isArray(normalized.lavaZones)) {
  errors.push("Lava or lavaZones should be an array.");
}

return {
  valid: errors.length === 0,
  errors,
  level: normalized
};

}

/* -------------------------------------------------------
BULK OPERATIONS
------------------------------------------------------- */

registerMany(levels = []) {
if (!Array.isArray(levels)) return [];

const results = [];
for (const level of levels) {
  results.push(this.register(level));
}

return results;

}

replaceAll(levels = []) {
this.clear();
return this.registerMany(levels);
}

/* -------------------------------------------------------
SELECTION HELPERS
------------------------------------------------------- */

findByName(name = "") {
const lower = String(name).toLowerCase();
return this.list().find((level) => String(level.name).toLowerCase() === lower) || null;
}

findByDifficulty(difficulty = "") {
const lower = String(difficulty).toLowerCase();
return this.list().filter((level) => String(level.metadata?.difficulty || "").toLowerCase() === lower);
}

findByTheme(theme = "") {
const lower = String(theme).toLowerCase();
return this.list().filter((level) => String(level.metadata?.theme || "").toLowerCase() === lower);
}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
count: this.count(),
order: [...this.order],
levels: this.list().map((level) => ({
id: level.id,
name: level.name,
difficulty: level.metadata?.difficulty || "unknown",
theme: level.metadata?.theme || "unknown"
}))
};
}
}

const defaultLevelLoader = new LevelLoader();

export default LevelLoader;
export { defaultLevelLoader };
