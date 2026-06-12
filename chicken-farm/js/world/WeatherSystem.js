// js/world/WeatherSystem.js
// Manages weather states, durations, transitions, and farm gameplay effects.

export class WeatherSystem {
  constructor(config = {}) {
    this.world = config.world || null;
    this.eventBus = config.eventBus || null;

    this.weather = "sunny";
    this.previousWeather = "sunny";

    this.currentPhase = "clear";
    this.timer = 0;
    this.duration = 0;

    this.season = "spring";
    this.dayOfYear = 1;

    this.isStormActive = false;
    this.intensity = 0.5;

    this.weatherProfiles = {
      sunny: {
        minDuration: 8,
        maxDuration: 20,
        intensity: 0.35,
        eggRate: 1.0,
        stress: 0.95,
        feedUse: 1.0,
        waterUse: 1.0
      },
      cloudy: {
        minDuration: 6,
        maxDuration: 14,
        intensity: 0.4,
        eggRate: 0.99,
        stress: 1.0,
        feedUse: 1.0,
        waterUse: 1.0
      },
      rainy: {
        minDuration: 4,
        maxDuration: 12,
        intensity: 0.55,
        eggRate: 0.96,
        stress: 1.05,
        feedUse: 1.02,
        waterUse: 0.98
      },
      stormy: {
        minDuration: 2,
        maxDuration: 8,
        intensity: 0.8,
        eggRate: 0.9,
        stress: 1.15,
        feedUse: 1.08,
        waterUse: 1.0
      },
      foggy: {
        minDuration: 4,
        maxDuration: 10,
        intensity: 0.45,
        eggRate: 0.97,
        stress: 1.03,
        feedUse: 1.0,
        waterUse: 1.0
      },
      snowy: {
        minDuration: 4,
        maxDuration: 14,
        intensity: 0.65,
        eggRate: 0.88,
        stress: 1.12,
        feedUse: 1.1,
        waterUse: 0.95
      },
      hot: {
        minDuration: 5,
        maxDuration: 15,
        intensity: 0.6,
        eggRate: 0.93,
        stress: 1.1,
        feedUse: 1.05,
        waterUse: 1.12
      },
      cold: {
        minDuration: 6,
        maxDuration: 16,
        intensity: 0.5,
        eggRate: 0.92,
        stress: 1.08,
        feedUse: 1.06,
        waterUse: 0.98
      }
    };

    this.initialized = false;
  }

  init() {
    this.initialized = true;
    this.pickInitialWeather();
    this.rollDuration();
    this.emitUpdate();
    return this;
  }

  pickInitialWeather() {
    this.weather = "sunny";
    this.previousWeather = "sunny";
    this.currentPhase = "clear";
    this.isStormActive = false;
    this.intensity = this.weatherProfiles.sunny.intensity;
  }

  update(delta = 0) {
    if (!this.initialized) return;

    this.timer += Math.max(0, Number(delta) || 0);

    if (this.timer >= this.duration) {
      this.transitionWeather();
    }
  }

  transitionWeather() {
    this.previousWeather = this.weather;
    this.weather = this.chooseNextWeather();
    this.currentPhase = this.getPhaseForWeather(this.weather);
    this.isStormActive = this.weather === "stormy";
    this.intensity = this.weatherProfiles[this.weather]?.intensity ?? 0.5;
    this.timer = 0;
    this.rollDuration();

    this.emit("weather:changed", {
      weather: this.weather,
      previousWeather: this.previousWeather,
      phase: this.currentPhase,
      intensity: this.intensity,
      season: this.season,
      dayOfYear: this.dayOfYear
    });

    this.emitUpdate();
  }

  chooseNextWeather() {
    const season = String(this.season || "spring").toLowerCase();
    const roll = Math.random();

    if (season === "winter") {
      if (roll < 0.35) return "snowy";
      if (roll < 0.5) return "foggy";
      if (roll < 0.7) return "cold";
      return "cloudy";
    }

    if (season === "summer") {
      if (roll < 0.45) return "sunny";
      if (roll < 0.65) return "hot";
      if (roll < 0.82) return "cloudy";
      return "stormy";
    }

    if (season === "autumn") {
      if (roll < 0.35) return "rainy";
      if (roll < 0.5) return "foggy";
      if (roll < 0.75) return "cloudy";
      return "sunny";
    }

    // spring
    if (roll < 0.4) return "sunny";
    if (roll < 0.6) return "cloudy";
    if (roll < 0.8) return "rainy";
    return "stormy";
  }

  getPhaseForWeather(weatherName) {
    const value = String(weatherName || "").toLowerCase();

    if (value === "sunny") return "clear";
    if (value === "cloudy") return "overcast";
    if (value === "rainy") return "rain";
    if (value === "stormy") return "storm";
    if (value === "foggy") return "fog";
    if (value === "snowy") return "snow";
    if (value === "hot") return "heat";
    if (value === "cold") return "cold";

    return "clear";
  }

  rollDuration() {
    const profile = this.weatherProfiles[this.weather] || this.weatherProfiles.sunny;
    const min = profile.minDuration;
    const max = profile.maxDuration;
    this.duration = min + Math.random() * (max - min);
  }

  setWeather(weatherName, force = false) {
    const next = String(weatherName || "sunny").toLowerCase();
    if (!force && this.weather === next) return false;

    this.previousWeather = this.weather;
    this.weather = next;
    this.currentPhase = this.getPhaseForWeather(next);
    this.isStormActive = next === "stormy";
    this.intensity = this.weatherProfiles[next]?.intensity ?? 0.5;
    this.timer = 0;
    this.rollDuration();

    this.emit("weather:changed", {
      weather: this.weather,
      previousWeather: this.previousWeather,
      phase: this.currentPhase,
      intensity: this.intensity,
      season: this.season,
      dayOfYear: this.dayOfYear
    });

    this.emitUpdate();
    return true;
  }

  setSeason(seasonName) {
    const next = String(seasonName || "spring").toLowerCase();
    this.season = next;
    this.emit("weather:seasonChanged", { season: this.season });
    this.emitUpdate();
  }

  setDayOfYear(day) {
    const value = Number(day);
    if (!Number.isFinite(value)) return;

    this.dayOfYear = Math.max(1, Math.min(365, Math.floor(value)));
    this.emit("weather:dayChanged", { dayOfYear: this.dayOfYear });
    this.emitUpdate();
  }

  getEffects() {
    const profile = this.weatherProfiles[this.weather] || this.weatherProfiles.sunny;

    return {
      weather: this.weather,
      phase: this.currentPhase,
      intensity: this.intensity,
      eggRate: profile.eggRate,
      stress: profile.stress,
      feedUse: profile.feedUse,
      waterUse: profile.waterUse,
      visibility: this.getVisibilityFactor(),
      movement: this.getMovementFactor()
    };
  }

  getVisibilityFactor() {
    switch (this.weather) {
      case "foggy":
        return 0.55;
      case "stormy":
        return 0.65;
      case "snowy":
        return 0.7;
      case "rainy":
        return 0.82;
      default:
        return 1.0;
    }
  }

  getMovementFactor() {
    switch (this.weather) {
      case "stormy":
        return 0.88;
      case "snowy":
        return 0.9;
      case "hot":
        return 0.94;
      case "cold":
        return 0.93;
      case "rainy":
        return 0.96;
      default:
        return 1.0;
    }
  }

  getMoodLabel() {
    switch (this.weather) {
      case "sunny":
        return "Calm";
      case "cloudy":
        return "Mild";
      case "rainy":
        return "Wet";
      case "stormy":
        return "Severe";
      case "foggy":
        return "Low Visibility";
      case "snowy":
        return "Cold";
      case "hot":
        return "Hot";
      case "cold":
        return "Chilly";
      default:
        return "Unknown";
    }
  }

  getStormRisk() {
    const season = String(this.season || "spring").toLowerCase();

    if (season === "summer") return 0.18;
    if (season === "spring") return 0.12;
    if (season === "autumn") return 0.09;
    if (season === "winter") return 0.04;

    return 0.1;
  }

  forceStorm() {
    return this.setWeather("stormy", true);
  }

  forceClear() {
    return this.setWeather("sunny", true);
  }

  getSnapshot() {
    return {
      weather: this.weather,
      previousWeather: this.previousWeather,
      currentPhase: this.currentPhase,
      timer: this.timer,
      duration: this.duration,
      season: this.season,
      dayOfYear: this.dayOfYear,
      isStormActive: this.isStormActive,
      intensity: this.intensity
    };
  }

  applySnapshot(snapshot = {}) {
    this.weather = snapshot.weather || this.weather;
    this.previousWeather = snapshot.previousWeather || this.previousWeather;
    this.currentPhase = snapshot.currentPhase || this.currentPhase;
    this.timer = Number(snapshot.timer || this.timer);
    this.duration = Number(snapshot.duration || this.duration);
    this.season = snapshot.season || this.season;
    this.dayOfYear = Number(snapshot.dayOfYear || this.dayOfYear);
    this.isStormActive = Boolean(snapshot.isStormActive);
    this.intensity = Number.isFinite(snapshot.intensity)
      ? snapshot.intensity
      : this.intensity;

    this.emitUpdate();
  }

  emit(eventName, payload) {
    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit(eventName, payload);
    }
  }

  emitUpdate() {
    this.emit("weather:updated", this.getSnapshot());
  }

  dispose() {
    this.weather = "sunny";
    this.previousWeather = "sunny";
    this.currentPhase = "clear";
    this.timer = 0;
    this.duration = 0;
    this.season = "spring";
    this.dayOfYear = 1;
    this.isStormActive = false;
    this.intensity = 0.5;
    this.initialized = false;
    this.world = null;
    this.eventBus = null;
  }
}
