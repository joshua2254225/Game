// js/core/EventBus.js
// Small, reliable event system for game systems to communicate cleanly.

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, callback) {
    if (typeof eventName !== "string" || !eventName.trim()) {
      throw new Error("EventBus.on: eventName must be a non-empty string.");
    }

    if (typeof callback !== "function") {
      throw new Error("EventBus.on: callback must be a function.");
    }

    const name = eventName.trim();

    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }

    this.listeners.get(name).add(callback);

    return () => this.off(name, callback);
  }

  once(eventName, callback) {
    if (typeof callback !== "function") {
      throw new Error("EventBus.once: callback must be a function.");
    }

    const off = this.on(eventName, (...args) => {
      off();
      callback(...args);
    });

    return off;
  }

  off(eventName, callback) {
    const name = String(eventName).trim();
    const set = this.listeners.get(name);

    if (!set) return false;

    const removed = set.delete(callback);

    if (set.size === 0) {
      this.listeners.delete(name);
    }

    return removed;
  }

  emit(eventName, payload) {
    const name = String(eventName).trim();
    const set = this.listeners.get(name);

    if (!set || set.size === 0) return false;

    const callbacks = Array.from(set);

    for (const callback of callbacks) {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[EventBus] Error in "${name}" listener:`, error);
      }
    }

    return true;
  }

  clear(eventName) {
    if (typeof eventName === "undefined") {
      this.listeners.clear();
      return;
    }

    const name = String(eventName).trim();
    this.listeners.delete(name);
  }

  listenerCount(eventName) {
    const name = String(eventName).trim();
    const set = this.listeners.get(name);
    return set ? set.size : 0;
  }

  eventNames() {
    return Array.from(this.listeners.keys());
  }

  has(eventName) {
    const name = String(eventName).trim();
    return this.listeners.has(name);
  }
}
