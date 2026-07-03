/*
================================================================================
 FARMERS FARM  —  src/core/Constants.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 0 — Skeleton   |   FILE 13 of the project (Phase 0 — done)
 DEPENDS ON  : nothing — pure data, zero imports.
 USED BY     : src/core/GameEngine.js already (file 9), for GAME_STATE.
               Later: CameraController.js (Phase 3) for CAMERA_MODE,
               SeasonManager.js (Phase 6) for SEASON/SEASON_ORDER,
               WeatherSystem.js (Phase 6) for WEATHER_TYPE, DayNightCycle.js
               (Phase 6) for DAY_PHASE.
================================================================================
 WHAT THIS FILE DOES
   Every fixed, structural "this can only ever be one of N known values"
   identifier in the game lives here — the small, stable enums that define
   the shape of the game's core state machine, decided directly from
   already-specified requirements rather than invented ahead of need.

 WHY SEVERAL NAMED EXPORTS HERE, BUT ONE SINGLE OBJECT IN Config.js
   Config.js exports one CONFIG object with nested categories, because its
   contents are one cohesive "settings bag" naturally read together. Each
   enum here is its own separate export instead (GameEngine.js already
   relies on this: `import { GAME_STATE } from './Constants.js'`, not
   `CONSTANTS.GAME_STATE`) — an enum is closer to a small standalone type
   than a setting, and a file that only needs CAMERA_MODE shouldn't have to
   pull in every other enum just to get it.

 WHAT'S DELIBERATELY NOT HERE
   - Command identifiers (MOVE_FORWARD, CAMERA_ROTATE, ...) belong to
     src/input/CommandTypes.js — the very next file, Phase 1 — not here.
   - Content catalogs — crop types, building types, vehicle types, NPC
     types — are NOT enumerated here. Unlike the five values below, those
     lists are genuinely open-ended (more crops or buildings can always be
     added) and are data, not structure — they belong in their own
     src/data/*.json files once Phases 8-11 design that content with real
     context, the same discipline Config.js applied to weather probabilities.

 VALUE CASING: lowercase_snake_case strings, on purpose
   Every enum VALUE below (not the key — keys stay UPPER_SNAKE_CASE, the
   normal JS constant convention) is a plain lowercase string like
   'winter', not 'WINTER' or 'Winter'. This isn't arbitrary: variables.css
   already documented that css/themes/seasons.css will key off a
   `[data-season="winter"]` attribute selector later — so
   `document.body.dataset.season = SEASON.WINTER` needs to produce exactly
   that string. Keeping every enum value in this same plain, CSS-friendly
   casing means any of them can be safely used in a class name or
   data-attribute later without a separate conversion step.
================================================================================
*/

/**
 * Recursively freezes an object (and arrays, which are objects too) so
 * none of these enums can be mutated at runtime. Duplicated from
 * Config.js rather than imported from a shared utility — see that file's
 * header for why these two data modules are each meant to stand
 * completely on their own, dependency-free.
 *
 * @param {object} obj
 * @returns {object} The same object, frozen at every level.
 */
function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object') {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

/**
 * The engine's top-level state — see GameEngine.js's setState(). Deeper,
 * more granular sub-states (which studio-intro card is showing, which
 * menu tab is open) belong to whichever later system owns that screen,
 * not here — this only covers the handful of states the ENGINE itself
 * needs to distinguish.
 */
export const GAME_STATE = deepFreeze({
  BOOT: 'boot',
  MAIN_MENU: 'main_menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  SLEEPING: 'sleeping',
});

/**
 * The three camera perspectives, exactly as specified: inside the
 * vehicle, behind/chasing the vehicle, and a top-down 90° aerial view
 * (vehicle-only — you can't see yourself from above on foot). Consumed by
 * CameraController.js and its three cameraModes/ files in Phase 3.
 */
export const CAMERA_MODE = deepFreeze({
  IN_VEHICLE: 'in_vehicle',
  CHASE: 'chase',
  TOP_DOWN: 'top_down',
});

/** The four seasons. */
export const SEASON = deepFreeze({
  SPRING: 'spring',
  SUMMER: 'summer',
  AUTUMN: 'autumn',
  WINTER: 'winter',
});

/**
 * The seasons' cycle order, built from SEASON's own values above rather
 * than re-typed as fresh strings — one less place a typo could sneak in.
 * Starts at spring by convention (the traditional start of a growing
 * year); SeasonManager.js (Phase 6) is free to start the game's calendar
 * at whichever index makes sense once it exists.
 */
export const SEASON_ORDER = deepFreeze([
  SEASON.SPRING,
  SEASON.SUMMER,
  SEASON.AUTUMN,
  SEASON.WINTER,
]);

/**
 * The weather states specified so far: rain, clear/sun, thunderstorm, and
 * fog. "Sun" is named CLEAR here — the conventional term for a weather
 * SYSTEM's "no precipitation" state, to avoid confusion with an actual sun
 * object/sprite if the game ever draws one. The original brief mentioned
 * "and others," so WeatherSystem.js (Phase 6) may extend this list —
 * nothing beyond these four is invented ahead of that.
 */
export const WEATHER_TYPE = deepFreeze({
  CLEAR: 'clear',
  RAIN: 'rain',
  THUNDERSTORM: 'thunderstorm',
  FOG: 'fog',
});

/**
 * Whether the in-game clock currently reads as day or night — distinct
 * from GAME_STATE.PLAYING/PAUSED, which is about the ENGINE's mode, not
 * the WORLD's current time of day. Consumed by DayNightCycle.js (Phase 6)
 * for lighting, and later by NPCSchedule.js for where NPCs should be.
 */
export const DAY_PHASE = deepFreeze({
  DAY: 'day',
  NIGHT: 'night',
});
