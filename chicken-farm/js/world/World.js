// js/world/World.js
// Creates and manages the farm world state: terrain, weather, time, and world events.

export class World {
  constructor(config = {}) {
    this.game = config.game || null;
    this.eventBus = config.eventBus || null;

    this.width = config.width || 200;
    this.depth = config.depth || 200;

    this.terrain = null;
    this.weather = "sunny";
    this.season = "spring";
    this.dayOfYear = 1;

    this.timeScale = 1;
    this.elapsed = 0;

    this.worldEvents = [];
    this.pools = [];
    this.paths = [];
    this.decorations = [];

    this.initialized = false;
  }

  init() {
    this.initialized = true;
    this.generateBaseWorld();
    this.emitWorldUpdate();
  }

  generateBaseWorld() {
    this.terrain = {
      grassLevel: 1,
      soilLevel: 0.2,
      moisture: 0.5,
      fertility: 0.75,
      slope: 0.08
    };

    this.pools = [
      { id: "pond_1", x: -24, z: -12, radius: 8 },
      { id: "ditch_1", x: 18, z: 22, radius: 4 }
    ];

    this.paths = [
      { id: "main_path", points: [{ x: -16, z: 12 }, { x: 0, z: 4 }, { x: 12, z: -8 }] }
    ];

    this.decorations = [
      { id: "tree_1", type: "tree", x: -35, z: -18 },
      { id: "tree_2", type: "tree", x: -28, z: 14 },
      { id: "rock_1", type: "rock", x: 30, z: -6 },
      { id: "sign_1", type: "sign", x: 6, z: 10 }
    ];
  }

  update(delta) {
    if (!this.initialized) return;

    this.elapsed += delta * this.timeScale;

    const dayLengthSeconds = 24 * 60;
    const minuteProgress = (delta * this.timeScale) * 60;

    if (this.game && this.game.state) {
      this.game.state.worldElapsed = (this.game.state.worldElapsed || 0) + delta;
    }

    if (this.elapsed >= dayLengthSeconds) {
      this.elapsed -= dayLengthSeconds;
      this.advanceDay();
    }

    this.updateWeatherCycle(minuteProgress);
  }

  advanceDay() {
    this.dayOfYear += 1;

    if (this.dayOfYear > 365) {
      this.dayOfYear = 1;
      this.advanceSeason();
    }

    this.generateWorldEvent();
    this.emitWorldUpdate();
  }

  advanceSeason() {
    const seasons = ["spring", "summer", "autumn", "winter"];
    const currentIndex = seasons.indexOf(this.season);
    this.season = seasons[(currentIndex + 1) % seasons.length];
  }

  updateWeatherCycle(minuteProgress) {
    // Simple weather drift model.
    const roll = Math.random();

    if (this.season === "winter") {
      if (roll < 0.08) this.setWeather("snowy");
      else if (roll < 0.16) this.setWeather("foggy");
      else this.setWeather("cold");
      return;
    }

    if (this.season === "summer") {
      if (roll < 0.1) this.setWeather("stormy");
      else if (roll < 0.2) this.setWeather("hot");
      else this.setWeather("sunny");
      return;
    }

    if (roll < 0.08) this.setWeather("rainy");
    else if (roll < 0.14) this.setWeather("foggy");
    else this.setWeather("sunny");
  }

  setWeather(weatherName) {
    const nextWeather = String(weatherName || "sunny").toLowerCase();
    if (this.weather === nextWeather) return;

    this.weather = nextWeather;
    this.emit("world:weatherChanged", {
      weather: this.weather,
      season: this.season,
      dayOfYear: this.dayOfYear
    });
  }

  generateWorldEvent() {
    const events = [
      { type: "marketShift", title: "Egg market changed", severity: "info" },
      { type: "equipmentWear", title: "Equipment needs attention", severity: "warning" },
      { type: "vetVisit", title: "Veterinarian inspection", severity: "info" },
      { type: "feedDelivery", title: "Feed delivery arrived", severity: "success" },
      { type: "stormAlert", title: "Bad weather is coming", severity: "warning" }
    ];

    const event = events[Math.floor(Math.random() * events.length)];
    const payload = {
      id: `${event.type}_${Date.now()}`,
      ...event,
      dayOfYear: this.dayOfYear,
      season: this.season,
      createdAt: new Date().toISOString()
    };

    this.worldEvents.push(payload);

    if (this.worldEvents.length > 20) {
      this.worldEvents.shift();
    }

    this.emit("world:event", payload);
    return payload;
  }

  getCurrentWeatherEffects() {
    switch (this.weather) {
      case "sunny":
        return { eggRate: 1.0, stress: 0.95, feedUse: 1.0 };
      case "rainy":
        return { eggRate: 0.96, stress: 1.05, feedUse: 1.02 };
      case "stormy":
        return { eggRate: 0.9, stress: 1.12, feedUse: 1.08 };
      case "snowy":
        return { eggRate: 0.88, stress: 1.15, feedUse: 1.1 };
      case "foggy":
        return { eggRate: 0.97, stress: 1.03, feedUse: 1.0 };
      case "hot":
        return { eggRate: 0.93, stress: 1.1, feedUse: 1.07 };
      case "cold":
        return { eggRate: 0.92, stress: 1.08, feedUse: 1.05 };
      default:
        return { eggRate: 1.0, stress: 1.0, feedUse: 1.0 };
    }
  }

  addDecoration(decoration) {
    if (!decoration || !decoration.id) return false;
    this.decorations.push(decoration);
    this.emitWorldUpdate();
    return true;
  }

  removeDecoration(id) {
    const before = this.decorations.length;
    this.decorations = this.decorations.filter((item) => item.id !== id);
    const changed = before !== this.decorations.length;

    if (changed) this.emitWorldUpdate();
    return changed;
  }

  addPath(path) {
    if (!path || !path.id) return false;
    this.paths.push(path);
    this.emitWorldUpdate();
    return true;
  }

  addPool(pool) {
    if (!pool || !pool.id) return false;
    this.pools.push(pool);
    this.emitWorldUpdate();
    return true;
  }

  getSnapshot() {
    return {
      width: this.width,
      depth: this.depth,
      weather: this.weather,
      season: this.season,
      dayOfYear: this.dayOfYear,
      terrain: this.terrain,
      pools: [...this.pools],
      paths: [...this.paths],
      decorations: [...this.decorations],
      worldEvents: [...this.worldEvents]
    };
  }

  applySnapshot(snapshot = {}) {
    this.width = snapshot.width || this.width;
    this.depth = snapshot.depth || this.depth;
    this.weather = snapshot.weather || this.weather;
    this.season = snapshot.season || this.season;
    this.dayOfYear = snapshot.dayOfYear || this.dayOfYear;
    this.terrain = snapshot.terrain || this.terrain;
    this.pools = Array.isArray(snapshot.pools) ? snapshot.pools : this.pools;
    this.paths = Array.isArray(snapshot.paths) ? snapshot.paths : this.paths;
    this.decorations = Array.isArray(snapshot.decorations) ? snapshot.decorations : this.decorations;
    this.worldEvents = Array.isArray(snapshot.worldEvents) ? snapshot.worldEvents : this.worldEvents;

    this.emitWorldUpdate();
  }

  emit(eventName, payload) {
    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit(eventName, payload);
    }
  }

  emitWorldUpdate() {
    this.emit("world:updated", this.getSnapshot());
  }

  dispose() {
    this.terrain = null;
    this.pools = [];
    this.paths = [];
    this.decorations = [];
    this.worldEvents = [];
    this.initialized = false;
  }
}
