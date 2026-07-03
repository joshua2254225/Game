/*
================================================================================
 FARMERS FARM  —  src/core/GameLoop.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 0 — Skeleton   |   FILE 10 of the project
 DEPENDS ON  : src/core/Config.js — does not exist yet (file 12, two away).
               This file needs CONFIG.MAX_DELTA_TIME and CONFIG.DEBUG_MODE
               to exist once it's built.
 USED BY     : src/core/GameEngine.js — already built (file 9), and already
               committed to this exact contract: `new GameLoop(updateFn,
               renderFn)`, then `.start()` / `.stop()`. Nothing here
               deviates from that.
================================================================================
 WHAT THIS FILE DOES
   Wraps the browser's requestAnimationFrame into a clean, safe start/stop
   loop that calls updateCallback(deltaTime) then renderCallback() once per
   frame — handling two classic gotchas most simple game loops get wrong
   (see below) so nothing built on top of this ever has to think about them.

 WHY VARIABLE TIMESTEP, NOT FIXED-TIMESTEP-WITH-ACCUMULATOR
   Rigorous game engines often decouple update rate from render rate with a
   fixed timestep + accumulator, mainly for deterministic physics. This
   game has vehicle driving (Phase 8) but is single-player with no
   networked/replay determinism requirement, so that added complexity isn't
   earning its keep yet — especially with update()/render() still being
   empty placeholders. This is a deliberate "not yet" rather than an
   oversight: if Phase 8's vehicle physics later turns out to need more
   stability at variable frame rates, this file is the one place that
   would change, and nothing calling into it would need to.

 TWO GOTCHAS HANDLED HERE
   1. FIRST-FRAME DELTA: requestAnimationFrame's first callback has nothing
      to measure a delta against. Naively computing (timestamp - 0) would
      hand update() a bogus multi-second deltaTime on the very first frame.
      Fixed by treating the first callback as a measurement point only.
   2. BACKGROUNDED TAB: rAF pauses entirely while a tab is hidden. When the
      player returns, the next timestamp can be minutes ahead of the last
      one. Passed straight through, that would let a full-grown crop's
      worth of simulated time — or more — happen in a single update() call.
      Fixed by capping deltaTime at CONFIG.MAX_DELTA_TIME: the game
      effectively pauses while hidden and resumes normally, rather than
      trying to simulate the missing time all at once.

 WHY TRUE PRIVATE (#) FIELDS HERE, UNLIKE GameEngine.js
   GameEngine.js kept its properties public because other files are
   expected to read (and in one case, call) them — this.currentState,
   this.setState(). Everything in THIS class is pure internal bookkeeping
   that nothing outside should ever touch directly (no other file has any
   legitimate reason to poke at #lastTimestamp or call #tick itself), so
   real private fields are the more honest fit. The one exception is
   isRunning, exposed below through a read-only getter — worth being able
   to check from outside (or the browser console) without allowing
   anything to set it directly and desync it from the loop's real state.
================================================================================
*/

import { CONFIG } from './Config.js';

/**
 * GameLoop — wraps requestAnimationFrame into a safe, restartable loop.
 */
export class GameLoop {
  #updateCallback;
  #renderCallback;

  #isRunning = false;
  #rafId = null;
  #lastTimestamp = null;

  // FPS tracking, only active when CONFIG.DEBUG_MODE is on — see #trackFps.
  #frameCount = 0;
  #fpsTimer = 0;

  /**
   * @param {(deltaTime: number) => void} updateCallback - Called once per
   *   frame with the elapsed seconds (already capped) since the previous
   *   frame.
   * @param {() => void} renderCallback - Called once per frame, immediately
   *   after updateCallback.
   */
  constructor(updateCallback, renderCallback) {
    this.#updateCallback = updateCallback;
    this.#renderCallback = renderCallback;
  }

  /** True while the loop is actively ticking. Read-only from outside. */
  get isRunning() {
    return this.#isRunning;
  }

  /** Starts the loop. Safe to call again while already running — no-ops. */
  start() {
    if (this.#isRunning) return;
    this.#isRunning = true;
    this.#lastTimestamp = null; // re-arms the first-frame handling in #tick
    this.#rafId = requestAnimationFrame(this.#tick);
  }

  /** Stops the loop. Safe to call again while already stopped — no-ops. */
  stop() {
    if (!this.#isRunning) return;
    this.#isRunning = false;
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  /**
   * The actual per-frame callback handed to requestAnimationFrame.
   *
   * Declared as an arrow function class field — rather than a normal
   * method — specifically because it's passed BY REFERENCE into
   * requestAnimationFrame() below. A normal method loses its `this` when
   * called back that way; an arrow function field captures `this`
   * lexically at construction time, so it's always correctly bound to
   * this GameLoop instance no matter how the browser invokes it.
   *
   * @param {DOMHighResTimeStamp} timestamp
   */
  #tick = (timestamp) => {
    if (!this.#isRunning) return; // a stop() that raced this callback wins

    if (this.#lastTimestamp === null) {
      // First frame: just record the timestamp, nothing to diff yet.
      this.#lastTimestamp = timestamp;
      if (this.#isRunning) this.#rafId = requestAnimationFrame(this.#tick);
      return;
    }

    let deltaTime = (timestamp - this.#lastTimestamp) / 1000; // ms -> seconds
    this.#lastTimestamp = timestamp;
    deltaTime = Math.min(deltaTime, CONFIG.MAX_DELTA_TIME);

    this.#updateCallback(deltaTime);
    this.#renderCallback();

    if (CONFIG.DEBUG_MODE) {
      this.#trackFps(deltaTime);
    }

    // Re-check isRunning rather than assuming it's still true — either
    // callback above could have called stop() synchronously.
    if (this.#isRunning) {
      this.#rafId = requestAnimationFrame(this.#tick);
    }
  };

  /**
   * Logs an average FPS reading roughly once per second. Debug-only —
   * gated behind CONFIG.DEBUG_MODE at the call site in #tick, not in here,
   * so this method has exactly one job.
   *
   * @param {number} deltaTime - The same capped delta #tick just used.
   */
  #trackFps(deltaTime) {
    this.#frameCount += 1;
    this.#fpsTimer += deltaTime;

    if (this.#fpsTimer >= 1) {
      const fps = Math.round(this.#frameCount / this.#fpsTimer);
      console.log(`[Farmers Farm] ${fps} FPS`);
      this.#frameCount = 0;
      this.#fpsTimer = 0;
    }
  }
}
