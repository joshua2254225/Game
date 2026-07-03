/*
================================================================================
 FARMERS FARM  —  src/core/Config.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 0 — Skeleton   |   FILE 12 of the project
 DEPENDS ON  : nothing — pure data, zero imports.
 USED BY     : src/core/GameEngine.js and src/core/GameLoop.js already
               (files 9 and 10, for DEBUG_MODE and MAX_DELTA_TIME). Later:
               TimeManager.js (Phase 6) for TIME.*, Wallet.js (Phase 9) for
               ECONOMY.*, SleepSystem.js (Phase 11) for SLEEP.*.
================================================================================
 WHAT THIS FILE DOES
   Every tunable number in the game lives here, and only here. Changing how
   long a day lasts, how much starting money the player has, or how long
   the sleep screen shows, is a one-line edit in this file — no hunting
   through gameplay system files to find where a number was hardcoded.

 CONFIG vs CONSTANTS.JS (next file) — where a new value belongs
   Config.js holds NUMBERS you might want to rebalance (durations, amounts,
   thresholds). Constants.js (file 13) holds NAMES — enums/IDs that define
   the shape of the game's data model (state names, type identifiers) more
   than its balance. "How long is a day" is a Config question; "what are
   the four seasons called" is a Constants question.

 STRUCTURE: FLAT TOP-LEVEL KEYS vs GROUPED CATEGORIES
   DEBUG_MODE and MAX_DELTA_TIME stay flat, top-level properties — that's
   the exact shape GameEngine.js and GameLoop.js already depend on
   (`this.config.DEBUG_MODE`, `CONFIG.MAX_DELTA_TIME`), and nothing here
   should quietly break an existing contract. Every NEW category
   introduced in this file (TIME, ECONOMY, SLEEP) is grouped in its own
   nested object instead, since this file is only going to grow as more
   phases add their own tunables, and a flat 40-property object gets a lot
   harder to scan than a handful of clearly-labeled groups.

 SOME VALUES BELOW ARE PLACEHOLDERS — clearly marked where they are
   Day/night length and the sleep-screen duration come directly from
   already-decided specs. Starting money and season length don't have a
   precise spec yet (a "balanced" starting budget genuinely can't be
   chosen in isolation — it depends on shop prices that don't exist until
   Phase 9), so those are reasonable placeholders, flagged as such, not
   final numbers pretending to be more considered than they are.
================================================================================
*/

// Intermediate values so FULL_CYCLE_DURATION_SECONDS below can be derived
// from these two instead of a third hardcoded number risking drift from them.
const DAY_DURATION_SECONDS = 8100;   // 2h 15m of real time = one in-game day
const NIGHT_DURATION_SECONDS = 6300; // 1h 45m of real time = one in-game night

/**
 * Recursively freezes an object and every nested object inside it.
 * Object.freeze() alone is shallow — CONFIG.TIME would stay fully mutable
 * even with the outer CONFIG object frozen. Declared locally rather than
 * pulled from a shared utility file: Config.js and Constants.js are each
 * meant to be standalone, dependency-free data modules (the same "zero
 * dependencies" spirit as css/base/reset.css), so this ~10-line helper is
 * duplicated once, in Constants.js, rather than introducing a shared
 * import between two files that should each stand entirely on their own.
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

export const CONFIG = deepFreeze({

  // ============================================================
  // ENGINE — flat, top-level. Already relied upon by GameEngine.js
  // and GameLoop.js; do not nest these without updating both.
  // ============================================================

  /** Gates console logging: engine state changes (GameEngine.js) and the
   *  once-per-second FPS reading (GameLoop.js). Flip to false before any
   *  build meant for someone other than us to play. */
  DEBUG_MODE: true,

  /** Hard cap, in seconds, on the deltaTime handed to GameEngine.update()
   *  each frame — see GameLoop.js's header for exactly why this exists
   *  (a backgrounded browser tab can otherwise hand update() a jump of
   *  several minutes the moment the player returns). */
  MAX_DELTA_TIME: 0.1,


  // ============================================================
  // TIME — the day/night cycle and season pacing.
  // Consumed by Phase 6's TimeManager.js / SeasonManager.js.
  // ============================================================

  TIME: {
    /** 2h 15m of real-world time = one in-game day. */
    DAY_DURATION_SECONDS,

    /** 1h 45m of real-world time = one in-game night. */
    NIGHT_DURATION_SECONDS,

    /** Derived, not independently set: one full day+night cycle in
     *  real-world seconds. Works out to exactly 4 real hours. */
    FULL_CYCLE_DURATION_SECONDS: DAY_DURATION_SECONDS + NIGHT_DURATION_SECONDS,

    /** PLACEHOLDER. How many in-game days each of the four seasons
     *  (winter/spring/summer/autumn — see Constants.js) lasts before the
     *  next one begins. 7 gives an easy-to-reason-about ~28-day year;
     *  revisit once Phase 6 has real seasonal content to pace against. */
    DAYS_PER_SEASON: 7,
  },


  // ============================================================
  // ECONOMY — starting resources.
  // Consumed by Phase 9's Wallet.js.
  // ============================================================

  ECONOMY: {
    /** PLACEHOLDER. Meant to be "a little money, but enough to survive
     *  1-3 weeks" — genuinely can't be balanced precisely until Phase 9
     *  defines what seeds/tools/food actually cost. 500 is a reasonable
     *  round starting point to build the economy system against. */
    STARTING_MONEY: 500,
  },


  // ============================================================
  // SLEEP — the fast-forward-through-the-night mechanic.
  // Consumed by Phase 11's SleepSystem.js.
  // ============================================================

  SLEEP: {
    /** The black "Sleeping…" screen shows for somewhere between these two
     *  values, in real-world seconds, while in-game time (crop growth
     *  included) fast-forwards by however much game-time the player chose
     *  to sleep through. A short random-ish range here, rather than one
     *  fixed number, keeps repeated sleeps from feeling mechanically identical. */
    SCREEN_MIN_DURATION_SECONDS: 10,
    SCREEN_MAX_DURATION_SECONDS: 15,
  },

});
