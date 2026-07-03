/*
================================================================================
 FARMERS FARM  —  src/core/EventBus.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 0 — Skeleton   |   FILE 11 of the project
 DEPENDS ON  : nothing — zero dependencies, pure vanilla JS (Map + Set).
 USED BY     : src/core/GameEngine.js already (file 9), via the `eventBus`
               singleton exported at the bottom. From here on, this is
               likely to become the single most-imported file in the whole
               project — nearly every gameplay system in every later phase
               (Wallet.js, HarvestSystem.js, WeatherSystem.js, UIManager.js,
               dozens more) will use it to announce or react to things
               without needing a direct reference to each other.
================================================================================
 WHAT THIS FILE DOES
   A publish/subscribe message bus. Any file can announce something
   happened (emit) without knowing or caring who's listening; any file can
   react to something happening (on) without needing a direct reference to
   whoever announced it. This is what keeps a 100+ file project from
   turning into a web of direct imports between every system that needs to
   talk to every other system.

 WHY Map + Set, NOT A PLAIN OBJECT + ARRAYS
   A plain object used as a string-keyed dictionary (`{}`) shares a
   prototype chain with Object.prototype — an event genuinely named
   "constructor" or "toString" would collide with an inherited property
   instead of behaving like a normal key. Map has no such prototype chain.
   Set (instead of Array) for the handlers themselves gets us automatic
   deduplication for free: registering the exact same function reference
   for the same event twice is never a real use case, so silently
   collapsing it to one registration is strictly a feature, not a
   footgun.

 EVENT NAMING CONVENTION
   `namespace:eventName`, colon-separated, camelCase after the colon —
   matching the one event already in use, 'engine:stateChanged' (see
   GameEngine.js). Keep new event names consistent with this as later
   phases add their own.

 A NOTE FOR LATER, NOT ACTED ON YET
   With only one event in use so far, there's nothing to centralize. Once
   many systems are emitting/listening across dozens of files, a typo'd
   event-name string (e.g. 'crop:harvestd') is a real, completely silent
   bug class — the mismatched listener just never fires, no error anywhere.
   If that starts happening in practice, consider a shared EventNames.js
   of exported string constants so a typo becomes an import error instead
   of a silent no-op. Not worth building ahead of an actual need yet.
================================================================================
*/

/**
 * EventBus — a small Map/Set-backed publish/subscribe system, deliberately
 * shaped like Node's built-in EventEmitter (on / once / off / emit) so it
 * needs no separate learning curve for anyone already familiar with that.
 */
export class EventBus {
  #listeners = new Map(); // eventName -> Set<handler>

  /**
   * Subscribes a handler to an event.
   *
   * @param {string} eventName
   * @param {(payload: any) => void} handler
   * @returns {() => void} An unsubscribe function — call it with no
   *   arguments later instead of having to keep a separate reference to
   *   `handler` around just to call off() with it.
   */
  on(eventName, handler) {
    if (!this.#listeners.has(eventName)) {
      this.#listeners.set(eventName, new Set());
    }
    this.#listeners.get(eventName).add(handler);

    return () => this.off(eventName, handler);
  }

  /**
   * Subscribes a handler that automatically unsubscribes itself the
   * moment it fires once. The unsubscribe happens BEFORE the handler is
   * actually called, so even a handler that synchronously re-triggers the
   * same event can't cause it to fire a second time.
   *
   * @param {string} eventName
   * @param {(payload: any) => void} handler
   * @returns {() => void} An unsubscribe function, same as on() — useful
   *   for canceling it before it ever fires.
   */
  once(eventName, handler) {
    const wrapped = (payload) => {
      this.off(eventName, wrapped);
      handler(payload);
    };
    return this.on(eventName, wrapped);
  }

  /**
   * Removes a specific handler from a specific event. Safe to call even
   * if that handler was never registered, or the event has no listeners
   * at all — this never throws.
   *
   * @param {string} eventName
   * @param {(payload: any) => void} handler
   */
  off(eventName, handler) {
    const handlers = this.#listeners.get(eventName);
    if (!handlers) return;

    handlers.delete(handler);
    if (handlers.size === 0) {
      this.#listeners.delete(eventName);
    }
  }

  /**
   * Synchronously calls every handler registered for eventName, passing
   * payload through unchanged. Each handler runs in its own try/catch —
   * one broken listener is logged and skipped, it never prevents the rest
   * of the game from reacting to the same event.
   *
   * @param {string} eventName
   * @param {any} [payload]
   * @returns {boolean} true if there was at least one listener, false if
   *   the event had none — mirrors Node's EventEmitter.emit() return value.
   */
  emit(eventName, payload) {
    const handlers = this.#listeners.get(eventName);
    if (!handlers || handlers.size === 0) return false;

    // Snapshot into an array before iterating: a handler that calls off()
    // — its own unsubscribe function, or someone else's, for the SAME
    // event — would otherwise mutate this Set while we're still looping
    // over it. Any such change only takes effect on the NEXT emit().
    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[Farmers Farm] Error in handler for "${eventName}":`, error);
      }
    }

    return true;
  }

  /**
   * @param {string} eventName
   * @returns {number} How many handlers are currently registered for this event.
   */
  listenerCount(eventName) {
    return this.#listeners.get(eventName)?.size ?? 0;
  }

  /**
   * Removes listeners. Pass an eventName to clear just that one event, or
   * call with no arguments to wipe every listener for every event. Mainly
   * useful for major scene transitions later on, and for tests.
   *
   * @param {string} [eventName]
   */
  clear(eventName) {
    if (eventName) {
      this.#listeners.delete(eventName);
    } else {
      this.#listeners.clear();
    }
  }
}

// The shared singleton every other file imports. See the file header for
// why this project uses one shared instance rather than threading an
// EventBus reference through every constructor that needs it.
export const eventBus = new EventBus();
