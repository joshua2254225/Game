// js/world/WaterSystem.js
// Manages ponds, wells, water lines, water storage, and consumption logic.

export class WaterSystem {
  constructor(config = {}) {
    this.world = config.world || null;
    this.eventBus = config.eventBus || null;

    this.sources = [];
    this.storage = [];
    this.pipes = [];

    this.totalCapacity = 0;
    this.currentWater = 0;

    this.initialized = false;
  }

  init() {
    this.generateDefaultWaterNetwork();
    this.recalculateTotals();
    this.initialized = true;
    this.emitUpdate();
    return this;
  }

  generateDefaultWaterNetwork() {
    this.sources = [
      {
        id: "pond_source",
        type: "pond",
        capacity: 5000,
        outputPerMinute: 12,
        quality: 0.88,
        position: { x: -28, y: 0, z: -10 }
      },
      {
        id: "well_source",
        type: "well",
        capacity: 2500,
        outputPerMinute: 8,
        quality: 0.96,
        position: { x: 12, y: 0, z: 16 }
      }
    ];

    this.storage = [
      {
        id: "tank_1",
        type: "water_tank",
        capacity: 1200,
        current: 780,
        position: { x: 4, y: 0, z: 6 }
      }
    ];

    this.pipes = [
      {
        id: "main_pipe",
        type: "pipe",
        from: "pond_source",
        to: "tank_1",
        flowRate: 6
      }
    ];
  }

  update(delta = 0) {
    if (!this.initialized) return;

    this.fillStorage(delta);
    this.recalculateTotals();
    return delta;
  }

  fillStorage(delta) {
    const minutes = Math.max(0, Number(delta) || 0) * 60;
    if (minutes <= 0) return;

    for (const source of this.sources) {
      const produced = (source.outputPerMinute || 0) * minutes;
      this.distributeWater(produced);
    }
  }

  distributeWater(amount) {
    let remaining = Math.max(0, Number(amount) || 0);

    for (const tank of this.storage) {
      if (remaining <= 0) break;

      const freeSpace = Math.max(0, (tank.capacity || 0) - (tank.current || 0));
      const added = Math.min(freeSpace, remaining);

      tank.current = (tank.current || 0) + added;
      remaining -= added;
    }

    if (remaining > 0 && this.storage.length > 0) {
      // If tanks are full, excess water is effectively lost/overflowed.
      this.emit("water:overflow", { amount: remaining });
    }

    this.emitUpdate();
  }

  consumeWater(amount) {
    const requested = Math.max(0, Number(amount) || 0);
    if (requested <= 0) return 0;

    let remaining = requested;
    let consumed = 0;

    for (const tank of this.storage) {
      if (remaining <= 0) break;

      const available = Math.max(0, tank.current || 0);
      const taken = Math.min(available, remaining);

      tank.current = available - taken;
      remaining -= taken;
      consumed += taken;
    }

    this.currentWater = this.getCurrentStoredWater();
    this.emitUpdate();
    return consumed;
  }

  addSource(source) {
    if (!source || typeof source !== "object") return false;
    if (!source.id) source.id = `water_source_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

    this.sources.push({
      type: "pond",
      capacity: 1000,
      outputPerMinute: 5,
      quality: 0.9,
      position: { x: 0, y: 0, z: 0 },
      ...source
    });

    this.recalculateTotals();
    this.emitUpdate();
    return true;
  }

  addStorage(storage) {
    if (!storage || typeof storage !== "object") return false;
    if (!storage.id) storage.id = `water_storage_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

    this.storage.push({
      type: "water_tank",
      capacity: 1000,
      current: 0,
      position: { x: 0, y: 0, z: 0 },
      ...storage
    });

    this.recalculateTotals();
    this.emitUpdate();
    return true;
  }

  addPipe(pipe) {
    if (!pipe || typeof pipe !== "object") return false;
    if (!pipe.id) pipe.id = `pipe_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

    if (!pipe.from || !pipe.to) return false;

    this.pipes.push({
      type: "pipe",
      flowRate: 4,
      ...pipe
    });

    this.emitUpdate();
    return true;
  }

  removeFeature(id) {
    const before = this.getFeatureCount();

    this.sources = this.sources.filter((item) => item.id !== id);
    this.storage = this.storage.filter((item) => item.id !== id);
    this.pipes = this.pipes.filter((item) => item.id !== id);

    const after = this.getFeatureCount();

    if (before !== after) {
      this.recalculateTotals();
      this.emitUpdate();
      return true;
    }

    return false;
  }

  getFeatureCount() {
    return this.sources.length + this.storage.length + this.pipes.length;
  }

  recalculateTotals() {
    this.totalCapacity = this.storage.reduce((sum, tank) => sum + (tank.capacity || 0), 0);
    this.currentWater = this.getCurrentStoredWater();
  }

  getCurrentStoredWater() {
    return this.storage.reduce((sum, tank) => sum + (tank.current || 0), 0);
  }

  getSourceCapacity() {
    return this.sources.reduce((sum, source) => sum + (source.capacity || 0), 0);
  }

  getAverageWaterQuality() {
    if (this.sources.length === 0) return 0;

    const total = this.sources.reduce((sum, source) => sum + (source.quality || 0), 0);
    return total / this.sources.length;
  }

  getWaterPercentage() {
    if (this.totalCapacity <= 0) return 0;
    return Math.max(0, Math.min(1, this.currentWater / this.totalCapacity));
  }

  needsRefill(threshold = 0.3) {
    return this.getWaterPercentage() < threshold;
  }

  getStatus() {
    return {
      sources: this.sources.length,
      storageUnits: this.storage.length,
      pipes: this.pipes.length,
      totalCapacity: this.totalCapacity,
      currentWater: this.currentWater,
      percentage: this.getWaterPercentage(),
      quality: this.getAverageWaterQuality()
    };
  }

  getSnapshot() {
    return {
      sources: [...this.sources],
      storage: [...this.storage],
      pipes: [...this.pipes],
      totalCapacity: this.totalCapacity,
      currentWater: this.currentWater
    };
  }

  applySnapshot(snapshot = {}) {
    this.sources = Array.isArray(snapshot.sources) ? snapshot.sources : this.sources;
    this.storage = Array.isArray(snapshot.storage) ? snapshot.storage : this.storage;
    this.pipes = Array.isArray(snapshot.pipes) ? snapshot.pipes : this.pipes;

    this.recalculateTotals();
    this.emitUpdate();
  }

  emit(eventName, payload) {
    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit(eventName, payload);
    }
  }

  emitUpdate() {
    this.emit("water:updated", this.getSnapshot());
  }

  dispose() {
    this.sources = [];
    this.storage = [];
    this.pipes = [];
    this.totalCapacity = 0;
    this.currentWater = 0;
    this.initialized = false;
    this.world = null;
    this.eventBus = null;
  }
}
