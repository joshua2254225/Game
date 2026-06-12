// js/core/Game.js

export class Game {
  constructor(config = {}) {
    this.canvas = config.canvas || null;
    this.hud = config.hud || {};

    this.renderer = null;
    this.sceneManager = null;
    this.saveManager = null;
    this.eventBus = null;

    this.running = false;
    this.paused = false;
    this.lastTime = 0;
    this.rafId = null;

    this.state = {
      money: 500,
      day: 1,
      timeMinutes: 360, // 06:00
      chickenCount: 0,
      weather: "sunny",
      farmName: "My Chicken Farm",
      chickens: [],
      buildings: [],
      inventory: {
        feed: 25,
        water: 50,
        eggs: 0
      },
      stats: {
        eggsSold: 0,
        totalIncome: 0,
        totalExpenses: 0
      }
    };
  }

  start() {
    if (this.running) return;

    this.ensureCoreSystems();
    this.bindCoreEvents();
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();

    this.updateHUD();
    this.loop(this.lastTime);
  }

  stop() {
    this.running = false;
    this.paused = false;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.renderer && typeof this.renderer.dispose === "function") {
      this.renderer.dispose();
    }
  }

  setPaused(value) {
    this.paused = Boolean(value);

    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit("game:paused", this.paused);
    }
  }

  togglePause() {
    this.setPaused(!this.paused);
  }

  ensureCoreSystems() {
    if (!this.eventBus && window.GameEventBus) {
      this.eventBus = new window.GameEventBus();
    } else if (!this.eventBus) {
      this.eventBus = this.createFallbackEventBus();
    }

    if (!this.renderer) {
      this.renderer = this.createRendererFallback();
    }

    if (!this.sceneManager) {
      this.sceneManager = this.createSceneManagerFallback();
    }

    if (!this.saveManager) {
      this.saveManager = this.createSaveManagerFallback();
    }

    if (this.sceneManager && typeof this.sceneManager.init === "function") {
      this.sceneManager.init(this);
    }
  }

  bindCoreEvents() {
    if (!this.eventBus || typeof this.eventBus.on !== "function") return;

    this.eventBus.on("farm:moneyChanged", (money) => {
      this.state.money = money;
      this.updateHUD();
    });

    this.eventBus.on("farm:dayChanged", (day) => {
      this.state.day = day;
      this.updateHUD();
    });

    this.eventBus.on("farm:timeChanged", (minutes) => {
      this.state.timeMinutes = minutes;
      this.updateHUD();
    });

    this.eventBus.on("farm:chickenCountChanged", (count) => {
      this.state.chickenCount = count;
      this.updateHUD();
    });

    this.eventBus.on("farm:notify", (payload) => {
      this.showNotification(payload?.message || "Message", payload?.type || "success");
    });
  }

  loop(time) {
    if (!this.running) return;

    const delta = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    if (!this.paused) {
      this.update(delta);
    }

    this.render();
    this.rafId = requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  update(delta) {
    this.advanceClock(delta);

    if (this.sceneManager && typeof this.sceneManager.update === "function") {
      this.sceneManager.update(delta, this.state);
    }

    this.updateHUD();
  }

  render() {
    if (this.renderer && typeof this.renderer.render === "function") {
      this.renderer.render(this.sceneManager, this.state);
    }
  }

  advanceClock(delta) {
    // Realistic but simple time speed:
    // 1 real second = 1 in-game minute
    const minutesPerSecond = 1;
    const gainedMinutes = delta * minutesPerSecond;

    this.state.timeMinutes += gainedMinutes;

    if (this.state.timeMinutes >= 1440) {
      this.state.timeMinutes -= 1440;
      this.state.day += 1;

      this.payDailyCosts();
      this.processDailyFarmProduction();
      this.updateHUD();

      this.notify(`Day ${this.state.day} begins.`, "success");
    }
  }

  payDailyCosts() {
    const dailyFeedCost = Math.max(0, Math.round(this.state.chickenCount * 0.12));
    const dailyWaterCost = Math.max(0, Math.round(this.state.chickenCount * 0.04));
    const upkeep = Math.max(0, Math.round(this.state.buildings.length * 2));

    const total = dailyFeedCost + dailyWaterCost + upkeep;

    this.state.money -= total;
    this.state.stats.totalExpenses += total;

    this.notify(`Daily costs: $${total}`, "warning");
  }

  processDailyFarmProduction() {
    const eggsProduced = Math.round(this.state.chickenCount * 0.8);
    this.state.inventory.eggs += eggsProduced;

    if (eggsProduced > 0) {
      this.notify(`${eggsProduced} eggs collected overnight.`, "success");
    }
  }

  updateHUD() {
    const moneyEl = this.hud.moneyValue;
    const dayEl = this.hud.dayValue;
    const timeEl = this.hud.timeValue;
    const chickenEl = this.hud.chickenCount;

    if (moneyEl) moneyEl.textContent = `$${Math.max(0, Math.round(this.state.money))}`;
    if (dayEl) dayEl.textContent = String(this.state.day);
    if (timeEl) timeEl.textContent = this.formatTime(this.state.timeMinutes);
    if (chickenEl) chickenEl.textContent = String(this.state.chickenCount);
  }

  formatTime(totalMinutes) {
    const mins = Math.floor(totalMinutes) % 1440;
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  notify(message, type = "success") {
    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit("farm:notify", { message, type });
      return;
    }

    this.showNotification(message, type);
  }

  showNotification(message, type = "success") {
    const area = this.hud.notificationArea;
    if (!area) return;

    const note = document.createElement("div");
    note.className = `notification notification--${type} animate-slide-up`;
    note.textContent = message;

    area.appendChild(note);

    window.setTimeout(() => {
      note.classList.add("is-dismissing");
      window.setTimeout(() => note.remove(), 250);
    }, 2400);
  }

  addMoney(amount) {
    this.state.money += Number(amount) || 0;
    this.state.stats.totalIncome += Math.max(0, Number(amount) || 0);
    this.updateHUD();
  }

  spendMoney(amount) {
    const value = Math.max(0, Number(amount) || 0);
    if (this.state.money < value) return false;

    this.state.money -= value;
    this.state.stats.totalExpenses += value;
    this.updateHUD();
    return true;
  }

  addChicken(chickenData = {}) {
    const chicken = {
      id: chickenData.id || `chicken_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      name: chickenData.name || "Chicken",
      ageDays: chickenData.ageDays || 0,
      health: chickenData.health ?? 100,
      hunger: chickenData.hunger ?? 100,
      thirst: chickenData.thirst ?? 100,
      stress: chickenData.stress ?? 0,
      eggChance: chickenData.eggChance ?? 0.65,
      breed: chickenData.breed || "Layer",
      position: chickenData.position || { x: 0, y: 0, z: 0 }
    };

    this.state.chickens.push(chicken);
    this.state.chickenCount = this.state.chickens.length;
    this.updateHUD();

    return chicken;
  }

  removeChicken(chickenId) {
    const before = this.state.chickens.length;
    this.state.chickens = this.state.chickens.filter((chicken) => chicken.id !== chickenId);
    const after = this.state.chickens.length;

    if (before !== after) {
      this.state.chickenCount = after;
      this.updateHUD();
      return true;
    }

    return false;
  }

  addBuilding(buildingData = {}) {
    const building = {
      id: buildingData.id || `building_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      type: buildingData.type || "coop",
      level: buildingData.level || 1,
      position: buildingData.position || { x: 0, y: 0, z: 0 },
      health: buildingData.health ?? 100
    };

    this.state.buildings.push(building);
    return building;
  }

  getSaveData() {
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      state: this.state
    };

    return JSON.stringify(payload);
  }

  loadFromSave(savedData) {
    try {
      const parsed = typeof savedData === "string" ? JSON.parse(savedData) : savedData;
      if (!parsed || !parsed.state) throw new Error("Invalid save data");

      this.state = {
        ...this.state,
        ...parsed.state,
        inventory: {
          ...this.state.inventory,
          ...(parsed.state.inventory || {})
        },
        stats: {
          ...this.state.stats,
          ...(parsed.state.stats || {})
        },
        chickens: Array.isArray(parsed.state.chickens) ? parsed.state.chickens : [],
        buildings: Array.isArray(parsed.state.buildings) ? parsed.state.buildings : []
      };

      this.state.chickenCount = this.state.chickens.length;
      this.updateHUD();

      if (this.sceneManager && typeof this.sceneManager.syncFromState === "function") {
        this.sceneManager.syncFromState(this.state);
      }

      this.notify("Save loaded successfully.", "success");
      return true;
    } catch (error) {
      console.error("Failed to load save:", error);
      this.notify("Could not load save file.", "danger");
      return false;
    }
  }

  createFallbackEventBus() {
    const listeners = new Map();

    return {
      on: (eventName, callback) => {
        if (!listeners.has(eventName)) listeners.set(eventName, []);
        listeners.get(eventName).push(callback);
      },
      emit: (eventName, payload) => {
        const handlers = listeners.get(eventName) || [];
        handlers.forEach((handler) => handler(payload));
      }
    };
  }

  createRendererFallback() {
    return {
      render: () => {
        const ctx = this.canvas?.getContext?.("2d");
        if (!ctx || !this.canvas) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = "#162019";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = "#cfe7c2";
        ctx.font = "24px Segoe UI, sans-serif";
        ctx.fillText("3D renderer will be added in the next files.", 24, 48);
      },
      dispose: () => {}
    };
  }

  createSceneManagerFallback() {
    return {
      init: () => {},
      update: () => {},
      syncFromState: () => {}
    };
  }

  createSaveManagerFallback() {
    return {
      save: (data) => {
        localStorage.setItem("chickenFarm3D_save", data);
      },
      load: () => localStorage.getItem("chickenFarm3D_save")
    };
  }
}
