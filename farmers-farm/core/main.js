/*
================================================================================
 FARMERS FARM  —  src/main.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 0 — Skeleton   |   FILE 8 of the project (first JS file)
 DEPENDS ON  : src/core/GameEngine.js — does NOT exist yet, it's the very
               next file. Until it does, this module's import will fail to
               resolve if the page is actually loaded in a browser — same
               "expected to be broken mid-build" situation as index.html's
               CSS links were before Phase 0's CSS files existed.
 USED BY     : nothing imports main.js — it's the ROOT of the import graph.
               index.html's single <script type="module" src="src/main.js">
               tag is the only thing that ever loads it.
================================================================================
 WHAT THIS FILE DOES
   Creates the one and only GameEngine instance for this session and hands
   off control to it. That's it — main.js is deliberately kept almost
   empty. Actual orchestration (setting up the event bus, the game loop,
   eventually the boot/studio-intro sequence) is GameEngine's job, not
   this file's. An entry point that does real work becomes the one file
   nobody can safely touch without re-reading the whole thing — the exact
   opposite of what a 100+ file project needs.

 PROJECT-WIDE JS CONVENTIONS ESTABLISHED HERE (the first JS file is the
 right place to fix these, since every one of the ~90 JS files still to
 come will follow them):

   1. NAMED EXPORTS ONLY — never `export default`.
      `export class GameEngine { ... }`  →  `import { GameEngine } from ...`
      A default export's local name is arbitrary at the import site, which
      gets confusing across a codebase this size; a named export is the
      same recognizable name everywhere it's imported, and tooling
      (auto-import, "find all references") works far better against it.

   2. EXPLICIT ".js" EXTENSIONS ON EVERY IMPORT.
      Native browser ES modules — which is all we're using, no bundler —
      require the real file extension. Omitting it (common habit if
      you're used to bundler-based tooling) silently 404s in a plain
      browser.

   3. ONE PRIMARY EXPORT PER FILE, matching the filename exactly.
      GameEngine.js exports `GameEngine`, EventBus.js exports `EventBus`,
      and so on — the same rule that gave us one CSS concern per file
      applies here to JS classes/modules.
================================================================================
*/

import { GameEngine } from './core/GameEngine.js';

/**
 * Boots the game.
 *
 * Wrapped in try/catch because this is the OUTERMOST layer of the entire
 * application — if literally anything below this point throws while
 * starting up, this is the last place able to catch it and show the
 * player something readable instead of a silently blank/frozen screen.
 *
 * @returns {Promise<void>}
 */
async function boot() {
  console.log('[Farmers Farm] Boot sequence started.');

  try {
    const engine = new GameEngine();
    await engine.start();
  } catch (error) {
    handleFatalBootError(error);
  }
}

/**
 * Last-resort error handler for a failed boot.
 *
 * Repurposes the static loading message already sitting in index.html
 * (#static-boot-fallback) — the one piece of markup guaranteed to still
 * be on screen at this point, precisely because GameEngine never got far
 * enough to replace it with a real screen.
 *
 * @param {Error} error - Whatever broke the boot sequence.
 */
function handleFatalBootError(error) {
  console.error('[Farmers Farm] Fatal error during boot:', error);

  const fallback = document.getElementById('static-boot-fallback');
  if (fallback) {
    fallback.innerHTML = '<p>Something went wrong loading Farmers Farm. Please refresh the page.</p>';
  }
}

// No DOMContentLoaded wrapper needed: type="module" scripts are deferred
// by the browser automatically (see the DEV NOTE in index.html), so the
// DOM — including #static-boot-fallback above — is already fully parsed
// and available by the time this line runs.
boot();
