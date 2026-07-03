/*
================================================================================
 FARMERS FARM  —  src/core/GameEngine.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 0 — Skeleton   |   FILE 9 of the project
 DEPENDS ON  : src/core/GameLoop.js, src/core/EventBus.js, src/core/Config.js,
               src/core/Constants.js — NONE of these exist yet. They're the
               next four files, in that order. Same "forward-reference a
               file that isn't built yet" situation as main.js importing
               this file, one message ago.
 USED BY     : src/main.js — the only file that ever does `new GameEngine()`.
================================================================================
 WHAT THIS FILE DOES
   Owns the game's heartbeat (the GameLoop instance) and its top-level state
   (currentState — boot / main menu / playing / paused / sleeping). Every
   later phase plugs INTO this file rather than this file reaching out to
   them: Phase 4's World.js, Phase 7's Player.js, etc. will all be wired up
   as properties on this class, but GameEngine itself never contains their
   logic — it only calls out to it. update() and render() are placeholders
   for exactly that reason: there is nothing to update or render yet.

 WHY eventBus IS IMPORTED AS A SINGLETON, NOT INSTANTIATED HERE
   EventBus.js (next-next file) will export both the class AND a single
   ready-made instance: `export const eventBus = new EventBus();`. Every
   file in the project that needs to emit or listen for something —
   Wallet.js, HarvestSystem.js, WeatherSystem.js, dozens of others —
   imports that SAME instance directly. The alternative (GameEngine creates
   one EventBus and passes it down through every constructor that needs it)
   would mean threading an eventBus parameter through nearly the whole
   codebase. A single shared instance is the pragmatic choice for a
   single-player, single-session game like this one.
   EventBus's public shape, decided here in advance since this file is the
   first to use it: `.emit(eventName, payload)` to publish, `.on(eventName,
   handler)` to subscribe — the same shape as Node's built-in EventEmitter,
   so it needs no separate explanation once it exists.
================================================================================
*/

import { GameLoop } from './GameLoop.js';
import { eventBus } from './EventBus.js';
import { CONFIG } from './Config.js';
import { GAME_STATE } from './Constants.js';

/**
 * GameEngine — the single top-level orchestrator for the whole game.
 *
 * main.js creates exactly one instance of this class and calls start() on
 * it. Everything else the game will ever do happens because GameEngine's
 * game loop calls update()/render() roughly 60 times a second, and those
 * methods delegate to whichever real systems exist by that point in the
 * build.
 */
export class GameEngine {
  constructor() {
    // --- Core singletons / data, available immediately ---
    this.eventBus = eventBus;
    this.config = CONFIG;
    this.currentState = GAME_STATE.BOOT;

    // --- Reserved for later phases ---
    // Declared as null now, purely so GameEngine's eventual full shape is
    // visible from day one (and editor autocomplete can see these exist),
    // even though nothing assigns to them yet. Nothing enforces these
    // stay null-until-set — that's just convention, not a language
    // guarantee — but it documents intent clearly for whoever (likely
    // future us) wires each one up.
    this.world = null;   // Phase 4  — World.js
    this.camera = null;  // Phase 3  — CameraController.js
    this.player = null;  // Phase 7  — Player.js

    // The loop calls back into THIS instance's own update/render methods
    // every frame — see GameLoop.js's contract, decided here in advance:
    // its constructor takes (updateCallback, renderCallback), in that order.
    this.gameLoop = new GameLoop(
      (deltaTime) => this.update(deltaTime),
      () => this.render()
    );
  }

  /**
   * Starts the engine. Called exactly once, by main.js.
   *
   * @returns {Promise<void>}
   */
  async start() {
    this.setState(GAME_STATE.BOOT);

    // Phase 2 will replace this comment with BootSequence.js driving the
    // splash screen -> studio intros -> main menu chain before gameplay
    // truly begins. For now there's nothing to boot INTO yet, so we just
    // start the loop directly — this makes the engine's heartbeat testable
    // on its own, independent of any screen/UI work still to come.
    this.gameLoop.start();
  }

  /** Stops the engine's game loop. Mirrors start() for symmetry. */
  stop() {
    this.gameLoop.stop();
  }

  /**
   * Runs once per frame, before render(). Placeholder for now.
   *
   * Once later phases exist, this is where GameEngine will delegate to
   * them in order — roughly: this.world?.update(deltaTime),
   * this.player?.update(deltaTime), TimeManager.update(deltaTime), and so
   * on. GameEngine itself will never contain gameplay logic directly.
   *
   * @param {number} deltaTime - Seconds elapsed since the previous frame.
   */
  update(deltaTime) {
    // Intentionally empty — nothing exists yet to update.
  }

  /**
   * Runs once per frame, after update(). Placeholder for now.
   *
   * Phase 3's Renderer.js will make this call something like
   * Renderer.render(this.world, this.camera) each frame instead.
   */
  render() {
    // Intentionally empty — Phase 3 hasn't given us a canvas context yet.
  }

  /**
   * Transitions the engine's top-level state and announces it on the
   * event bus so any system that cares (Phase 2's SceneManager, Phase 13's
   * UIManager) can react without GameEngine needing to know they exist.
   *
   * @param {string} newState - One of the GAME_STATE values from Constants.js.
   */
  setState(newState) {
    const previousState = this.currentState;
    this.currentState = newState;

    if (this.config.DEBUG_MODE) {
      console.log(`[Farmers Farm] State: ${previousState} -> ${newState}`);
    }

    this.eventBus.emit('engine:stateChanged', { from: previousState, to: newState });
  }
}
