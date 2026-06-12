// js/world/RoadSystem.js
// Manages roads, dirt paths, driveways, and route helpers for farm structures.

export class RoadSystem {
  constructor(config = {}) {
    this.world = config.world || null;
    this.eventBus = config.eventBus || null;

    this.roads = [];
    this.paths = [];
    this.driveways = [];

    this.initialized = false;
  }

  init() {
    this.generateDefaultRoadNetwork();
    this.initialized = true;
    this.emitUpdate();
    return this;
  }

  generateDefaultRoadNetwork() {
    this.roads = [
      {
        id: "main_road",
        type: "road",
        width: 4.5,
        points: [
          { x: -40, z: 18 },
          { x: -18, z: 14 },
          { x: 0, z: 10 },
          { x: 20, z: 2 },
          { x: 42, z: -6 }
        ]
      }
    ];

    this.paths = [
      {
        id: "coop_path",
        type: "path",
        width: 1.8,
        points: [
          { x: -4, z: 8 },
          { x: -8, z: 10 },
          { x: -12, z: 12 },
          { x: -16, z: 14 }
        ]
      }
    ];

    this.driveways = [
      {
        id: "barn_driveway",
        type: "driveway",
        width: 3,
        points: [
          { x: 10, z: -2 },
          { x: 14, z: -4 },
          { x: 18, z: -6 }
        ]
      }
    ];
  }

  update(delta) {
    if (!this.initialized) return;

    // Placeholder for future path wear, vehicle traffic, mud accumulation,
    // and maintenance calculations.
    return delta;
  }

  addRoad(road) {
    const valid = this.validateLineFeature(road);
    if (!valid) return false;

    this.roads.push(this.normalizeFeature(road, "road"));
    this.emitUpdate();
    return true;
  }

  addPath(path) {
    const valid = this.validateLineFeature(path);
    if (!valid) return false;

    this.paths.push(this.normalizeFeature(path, "path"));
    this.emitUpdate();
    return true;
  }

  addDriveway(driveway) {
    const valid = this.validateLineFeature(driveway);
    if (!valid) return false;

    this.driveways.push(this.normalizeFeature(driveway, "driveway"));
    this.emitUpdate();
    return true;
  }

  removeFeature(id) {
    const before =
      this.roads.length + this.paths.length + this.driveways.length;

    this.roads = this.roads.filter((item) => item.id !== id);
    this.paths = this.paths.filter((item) => item.id !== id);
    this.driveways = this.driveways.filter((item) => item.id !== id);

    const after =
      this.roads.length + this.paths.length + this.driveways.length;

    if (before !== after) {
      this.emitUpdate();
      return true;
    }

    return false;
  }

  validateLineFeature(feature) {
    if (!feature || typeof feature !== "object") return false;
    if (!Array.isArray(feature.points) || feature.points.length < 2) return false;

    for (const point of feature.points) {
      if (typeof point?.x !== "number" || typeof point?.z !== "number") {
        return false;
      }
    }

    return true;
  }

  normalizeFeature(feature, fallbackType = "road") {
    return {
      id: feature.id || `${fallbackType}_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      type: feature.type || fallbackType,
      width: typeof feature.width === "number" ? feature.width : 2,
      points: feature.points.map((point) => ({
        x: point.x,
        z: point.z
      })),
      surface: feature.surface || this.getDefaultSurfaceForType(feature.type || fallbackType),
      createdAt: feature.createdAt || new Date().toISOString()
    };
  }

  getDefaultSurfaceForType(type) {
    const value = String(type || "").toLowerCase();

    if (value.includes("road")) return "asphalt";
    if (value.includes("drive")) return "gravel";
    return "dirt";
  }

  getAllFeatures() {
    return {
      roads: [...this.roads],
      paths: [...this.paths],
      driveways: [...this.driveways]
    };
  }

  getFeatureCount() {
    return this.roads.length + this.paths.length + this.driveways.length;
  }

  clear() {
    this.roads = [];
    this.paths = [];
    this.driveways = [];
    this.emitUpdate();
  }

  getLength(points = []) {
    if (!Array.isArray(points) || points.length < 2) return 0;

    let total = 0;

    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const dx = (b.x || 0) - (a.x || 0);
      const dz = (b.z || 0) - (a.z || 0);
      total += Math.hypot(dx, dz);
    }

    return total;
  }

  getClosestPointOnFeature(featureId, x, z) {
    const feature = this.findFeatureById(featureId);
    if (!feature) return null;

    const points = feature.points || [];
    if (points.length === 0) return null;
    if (points.length === 1) return { ...points[0], distance: Math.hypot(x - points[0].x, z - points[0].z) };

    let closest = null;
    let bestDist = Infinity;

    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const candidate = this.closestPointOnSegment(a, b, { x, z });
      if (candidate.distance < bestDist) {
        bestDist = candidate.distance;
        closest = candidate;
      }
    }

    return closest;
  }

  closestPointOnSegment(a, b, p) {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = p.x - a.x;
    const apz = p.z - a.z;

    const abLenSq = abx * abx + abz * abz;
    const t = abLenSq > 0 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq)) : 0;

    const x = a.x + abx * t;
    const z = a.z + abz * t;
    const distance = Math.hypot(p.x - x, p.z - z);

    return { x, z, t, distance };
  }

  findFeatureById(id) {
    return (
      this.roads.find((item) => item.id === id) ||
      this.paths.find((item) => item.id === id) ||
      this.driveways.find((item) => item.id === id) ||
      null
    );
  }

  emitUpdate() {
    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit("roads:updated", this.getAllFeatures());
    }
  }

  dispose() {
    this.clear();
    this.initialized = false;
    this.world = null;
    this.eventBus = null;
  }
}
