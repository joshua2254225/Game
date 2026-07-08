/*
================================================================================
 FARMERS FARM  —  src/core/SceneManager.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 2 — Boot Flow & Studio Intros   |   FILE 24 of the project
 DEPENDS ON  : #screen-root (index.html/layout.css) and the CSS custom
               property --duration-scene (variables.css), read dynamically
               rather than imported — see below for why. No JS imports.
 USED BY     : src/core/BootSequence.js (file 25, next) — creates ONE
               SceneManager and calls switchTo() repeatedly to drive
               splash -> studio intro A -> studio intro B -> main menu.
               GameEngine.js is intentionally NOT updated this message —
               that wiring happens next, alongside BootSequence.js, since
               that's the file that actually replaces the boot-flow
               placeholder comment left in GameEngine.start().
================================================================================
 WHAT THIS FILE DOES
   A generic full-screen swapper. SceneManager has no idea what a "splash
   screen" or "studio intro" is — it only knows how to take any object
   shaped like { mount(container), unmount() } (the exact same interface
   VirtualJoystickDevice.js and VirtualButtonDevice.js already use),
   fade the current one out, swap it for a new one, and fade that in.
   Deciding WHICH screen to show WHEN is BootSequence.js's job entirely;
   this file only knows how to make ONE swap happen cleanly.

 WHY THE TRANSITION DURATION IS READ FROM CSS AT RUNTIME, NOT IMPORTED
   setTimeout() below needs to wait exactly as long as the CSS fade takes,
   or the sequencing would either cut the fade-out short or add a dead
   pause waiting too long. Rather than hardcoding a JS number that has to
   be manually kept in sync with variables.css's --duration-scene forever,
   getSceneTransitionDurationMs() reads the CSS custom property directly —
   change the value in ONE place (variables.css) and both the visual
   transition and the JS sequencing stay in sync automatically. A hardcoded
   600 is kept as a fallback only for the unlikely case the property isn't
   readable yet.

 THE EXPECTED CSS THIS FILE IS BUILT AGAINST (not written yet)
   This file only toggles a class — `.scene-wrapper--visible` — on a
   wrapper div it creates inside #screen-root. It does not apply any
   opacity/transition CSS itself (this file has no business touching
   presentation, same rule as everywhere else in the project). Once
   css/animations/transitions.css exists, it's expected to define
   something along these lines:
     .scene-wrapper { opacity: 0; transition: opacity var(--duration-scene) var(--ease-standard); }
     .scene-wrapper--visible { opacity: 1; }
   Until then, switching screens will happen instantly with no visible
   fade — functionally correct, just unstyled, the same "expected and
   fine" gap every forward-referenced file in this project has had.

 SEQUENTIAL FADE, NOT A CROSS-FADE
   The old screen fully fades out and is unmounted BEFORE the new one
   mounts and fades in — never both visible at once. A true cross-fade
   would need two screens coexisting in the DOM with coordinated opacity,
   which no screen module needs to know or care about this way. The brief
   gap in between (screen-root fully transparent, revealing the canvas/
   body background beneath) reads as an intentional beat, not a glitch.
================================================================================
*/

/**
 * @typedef {object} Screen
 * @property {(container: HTMLElement) => void} mount
 * @property {() => void} unmount
 */

const FALLBACK_TRANSITION_DURATION_MS = 600; // matches variables.css's --duration-scene as of this writing

/** @returns {number} The current --duration-scene value, in milliseconds. */
function getSceneTransitionDurationMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--duration-scene');
  const parsed = parseFloat(raw); // parseFloat('600ms') === 600 — the unit suffix is simply ignored
  return Number.isNaN(parsed) ? FALLBACK_TRANSITION_DURATION_MS : parsed;
}

/**
 * SceneManager — swaps full-screen "screen" modules into #screen-root, one
 * at a time, with a fade between them.
 */
export class SceneManager {
  #screenRoot;
  #wrapper;
  #currentScreen = null;

  constructor() {
    this.#screenRoot = document.getElementById('screen-root');

    this.#wrapper = document.createElement('div');
    this.#wrapper.className = 'scene-wrapper';
    this.#screenRoot.appendChild(this.#wrapper);
  }

  /**
   * Fades out and unmounts whatever screen is currently showing (if any),
   * then mounts and fades in the new one.
   *
   * @param {Screen} screen
   * @returns {Promise<void>} Resolves once the new screen is mounted and
   *   its fade-in has been started — NOT once the fade-in visually
   *   finishes. Callers that want to display a screen for an exact
   *   duration should start their own timer from this resolution point.
   */
  async switchTo(screen) {
    if (this.#currentScreen) {
      await this.#fadeOutCurrent();
      this.#currentScreen.unmount();
      this.#wrapper.innerHTML = ''; // defensive: a clean slate even if unmount() missed something
    }

    this.#currentScreen = screen;
    screen.mount(this.#wrapper);
    this.#fadeInCurrent();
  }

  /** @returns {Promise<void>} Resolves after the fade-out duration has elapsed. */
  #fadeOutCurrent() {
    return new Promise((resolve) => {
      this.#wrapper.classList.remove('scene-wrapper--visible');
      setTimeout(resolve, getSceneTransitionDurationMs());
    });
  }

  #fadeInCurrent() {
    // Forces a synchronous layout read, which flushes the class removal
    // above before this next class change — otherwise the browser can
    // batch both changes together and the transition never visibly
    // triggers. Matters most on the very first switchTo() call, where
    // there's no natural gap beforehand like there is after an awaited
    // fade-out.
    void this.#wrapper.offsetWidth;
    this.#wrapper.classList.add('scene-wrapper--visible');
  }
}
