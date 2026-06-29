/**
 * ============================================================================
 * CITY RACER — main.js
 * ============================================================================
 * Application entry point. The only job of this file is to:
 *
 *   1. Wait for the DOM to be ready.
 *   2. Verify that all hard dependencies are present (Three.js, CONFIG, etc).
 *   3. Fix mobile viewport height (100vh quirk on iOS/Android).
 *   4. Boot the game via Game.init().
 *   5. Wire page-lifecycle events (visibility change, beforeunload).
 *   6. Catch and display any fatal startup errors.
 *
 * No game logic lives here. Everything is delegated to Game.js.
 * ============================================================================
 */

'use strict';

(function () {

  // ══════════════════════════════════════════════════════════════════════════
  // REQUIRED GLOBALS  (must be present before boot)
  // ══════════════════════════════════════════════════════════════════════════

  const REQUIRED_GLOBALS = [
    'THREE',
    'CONFIG',
    'MathUtils',
    'ProceduralTextures',
    'SaveSystem',
    'Renderer',
    'Camera',
    'InputManager',
    'Sky',
    'CityMap',
    'RoadBuilder',
    'BuildingGenerator',
    'Props',
    'Water',
    'Bridges',
    'Vehicle',
    'PlayerCar',
    'TrafficCar',
    'PoliceCar',
    'TrafficSystem',
    'PoliceSystem',
    'EconomySystem',
    'PassengerSystem',
    'RaceSystem',
    'Markers',
    'Garage',
    'CarDealer',
    'Minimap',
    'HUD',
    'Notifications',
    'MenuManager',
    'Game',
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE VIEWPORT FIX
  // Browsers report 100vh including the address bar on mobile.
  // We compute the real inner height once and cache it as --real-vh.
  // ══════════════════════════════════════════════════════════════════════════

  function _fixMobileVH() {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--real-vh', `${vh}px`);
    };
    setVH();
    window.addEventListener('resize',            setVH, { passive: true });
    window.addEventListener('orientationchange', setVH, { passive: true });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FATAL ERROR OVERLAY
  // If anything explodes before the game canvas is up, show a readable
  // fallback so the user is not left with a blank black screen.
  // ══════════════════════════════════════════════════════════════════════════

  function _showFatalError(title, detail) {
    console.error('[CityRacer]', title, detail || '');

    // Hide the loading screen if still visible
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'none';

    const overlay = document.createElement('div');
    overlay.id = 'fatal-error-overlay';
    Object.assign(overlay.style, {
      position       : 'fixed',
      inset          : '0',
      background     : '#0a0c10',
      display        : 'flex',
      flexDirection  : 'column',
      alignItems     : 'center',
      justifyContent : 'center',
      zIndex         : '99999',
      fontFamily     : '"Orbitron", "Segoe UI", sans-serif',
      color          : '#ff3333',
      padding        : '2rem',
      textAlign      : 'center',
      gap            : '1rem',
    });

    overlay.innerHTML = `
      <div style="font-size:3rem">💥</div>
      <div style="font-size:1.4rem;font-weight:900;letter-spacing:0.1em">
        ${title}
      </div>
      <div style="font-size:0.85rem;color:#aaa;max-width:520px;line-height:1.7;">
        ${detail || ''}
      </div>
      <button onclick="location.reload()"
              style="margin-top:1rem;padding:0.7rem 2rem;
                     background:#ff3333;color:#000;border:none;
                     border-radius:6px;font-weight:700;cursor:pointer;
                     font-size:0.9rem;letter-spacing:0.08em;">
        ↺ RELOAD
      </button>`;

    document.body.appendChild(overlay);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEPENDENCY CHECK
  // ══════════════════════════════════════════════════════════════════════════

  function _checkDependencies() {
    const missing = REQUIRED_GLOBALS.filter(name => typeof window[name] === 'undefined');
    if (missing.length === 0) return true;

    _showFatalError(
      'Missing Dependencies',
      `The following scripts did not load correctly:<br><br>
       <code style="color:#ff8800">${missing.join(', ')}</code><br><br>
       Check your internet connection and that all &lt;script&gt; tags in
       index.html are present and in the correct order.`
    );
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE LIFECYCLE — VISIBILITY CHANGE
  // Pause the RAF loop when the player switches tabs; resume on return.
  // ══════════════════════════════════════════════════════════════════════════

  function _bindVisibilityChange() {
    document.addEventListener('visibilitychange', () => {
      if (!window.Game) return;

      const state = Game.getState ? Game.getState() : null;
      if (!state) return;

      if (document.hidden) {
        // Tab hidden — pause if currently playing
        if (state === Game.STATES.FREE_ROAM   ||
            state === Game.STATES.RACING      ||
            state === Game.STATES.TAXI_MISSION) {
          // We don't call setState directly — Game.js is the authority.
          // Simulate an Escape key press so the existing pause logic fires.
          if (window.InputManager && typeof InputManager.simulatePress === 'function') {
            InputManager.simulatePress('pause');
          }
        }
      }
      // On return we do nothing: the user explicitly resumes via the Pause menu.
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE LIFECYCLE — BEFORE UNLOAD
  // Trigger a final save whenever the player closes or refreshes the tab.
  // ══════════════════════════════════════════════════════════════════════════

  function _bindBeforeUnload() {
    window.addEventListener('beforeunload', () => {
      try {
        if (window.SaveSystem && window.Game) {
          const player = Game.getPlayer ? Game.getPlayer() : null;
          if (player) {
            // SaveSystem.save is synchronous (localStorage), so this is safe.
            // Game.js builds the payload; we trigger via the auto-save path.
            if (typeof Game._autoSave === 'function') Game._autoSave();
          }
        }
      } catch (_) {
        // Never block unload
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GLOBAL ERROR HANDLER
  // Last-resort catch for any uncaught exception after boot.
  // ══════════════════════════════════════════════════════════════════════════

  function _bindGlobalErrorHandlers() {
    window.addEventListener('error', e => {
      // Only surface errors that aren't already handled
      if (e.defaultPrevented) return;
      console.error('[CityRacer] Uncaught error:', e.message, e.filename, e.lineno);
    });

    window.addEventListener('unhandledrejection', e => {
      console.error('[CityRacer] Unhandled promise rejection:', e.reason);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BOOT SEQUENCE
  // ══════════════════════════════════════════════════════════════════════════

  async function _boot() {
    _fixMobileVH();
    _bindGlobalErrorHandlers();

    if (!_checkDependencies()) return;

    _bindVisibilityChange();
    _bindBeforeUnload();

    try {
      await Game.init();
    } catch (err) {
      _showFatalError(
        'Startup Failed',
        `An error occurred while initialising City Racer:<br><br>
         <code style="color:#ff8800">${err?.message || String(err)}</code><br><br>
         Open the browser console for the full stack trace.`
      );
      console.error('[CityRacer] Game.init() threw:', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ENTRY POINT
  // ══════════════════════════════════════════════════════════════════════════

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    // DOM already ready (e.g. script placed at end of <body>)
    _boot();
  }

}());
