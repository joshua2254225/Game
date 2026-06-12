// js/world/Terrain.js
// Generates and manages terrain data for the chicken farm world.
// This version is designed to work with future 3D terrain meshes, path placement,
// building placement, and moisture/fertility gameplay systems.

export class Terrain {
  constructor(config = {}) {
    this.width = config.width || 200;
    this.depth = config.depth || 200;
    this.segmentCount = config.segmentCount || 64;

    this.seed = config.seed || Date.now();
    this.heightMap = [];
    this.biomeMap = [];
    this.moistureMap = [];
    this.fertilityMap = [];

    this.generated = false;
  }

  init() {
    this.generate();
    return this;
  }

  generate() {
    const size = this.segmentCount + 1;

    this.heightMap = this.create2DArray(size, size, 0);
    this.biomeMap = this.create2DArray(size, size, "grass");
    this.moistureMap = this.create2DArray(size, size, 0.5);
    this.fertilityMap = this.create2DArray(size, size, 0.7);

    for (let z = 0; z < size; z += 1) {
      for (let x = 0; x < size; x += 1) {
        const nx = x / this.segmentCount;
        const nz = z / this.segmentCount;

        const h = this.sampleHeight(nx, nz);
        const m = this.sampleMoisture(nx, nz);
        const f = this.sampleFertility(nx, nz);

        this.heightMap[z][x] = h;
        this.moistureMap[z][x] = m;
        this.fertilityMap[z][x] = f;
        this.biomeMap[z][x] = this.pickBiome(h, m, f);
      }
    }

    this.generated = true;
    return this;
  }

  create2DArray(rows, cols, defaultValue) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => defaultValue)
    );
  }

  // Deterministic pseudo-random function based on coordinates and seed.
  rand2D(x, z, offset = 0) {
    const s = Math.sin((x * 127.1 + z * 311.7 + this.seed + offset * 101.3)) * 43758.5453123;
    return s - Math.floor(s);
  }

  smoothStep(edge0, edge1, t) {
    const x = Math.max(0, Math.min(1, (t - edge0) / (edge1 - edge0)));
    return x * x * (3 - 2 * x);
  }

  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  sampleHeight(nx, nz) {
    // Gentle rural terrain:
    // - low rolling hills
    // - mostly flat center for buildings
    // - slightly rough edges
    const centerDistance = Math.hypot(nx - 0.5, nz - 0.5);
    const flatZone = 1 - this.smoothStep(0.0, 0.6, centerDistance);

    const baseNoise =
      (this.rand2D(nx * 6, nz * 6, 0) * 0.55) +
      (this.rand2D(nx * 14, nz * 14, 1) * 0.25) +
      (this.rand2D(nx * 32, nz * 32, 2) * 0.1);

    const rollingHills = Math.sin(nx * Math.PI * 3.2) * Math.cos(nz * Math.PI * 2.7) * 0.08;
    const subtleSlope = (nz - 0.5) * 0.04;

    // Flatten the center a bit for realistic farm construction.
    const flattened = this.lerp(baseNoise, baseNoise * 0.35, flatZone);

    let height = flattened + rollingHills + subtleSlope;

    // Normalize to a useful gameplay range.
    height = Math.max(0, Math.min(1, height));

    return height;
  }

  sampleMoisture(nx, nz) {
    const moistureNoise =
      (this.rand2D(nx * 8, nz * 8, 5) * 0.6) +
      (this.rand2D(nx * 16, nz * 16, 6) * 0.25);

    const waterBias = 1 - Math.abs(nx - 0.25) * 0.3;
    const result = moistureNoise * 0.7 + waterBias * 0.2;

    return Math.max(0, Math.min(1, result));
  }

  sampleFertility(nx, nz) {
    const fertilityNoise =
      (this.rand2D(nx * 7, nz * 7, 9) * 0.55) +
      (this.rand2D(nx * 19, nz * 19, 10) * 0.3);

    const centerBonus = 1 - Math.hypot(nx - 0.5, nz - 0.5) * 0.35;
    const result = fertilityNoise * 0.7 + centerBonus * 0.25;

    return Math.max(0, Math.min(1, result));
  }

  pickBiome(height, moisture, fertility) {
    if (height < 0.16) return "wetland";
    if (moisture > 0.78) return "mud";
    if (fertility > 0.82 && moisture > 0.5) return "pasture";
    if (height > 0.72) return "rock";
    return "grass";
  }

  getHeightAt(x, z) {
    if (!this.generated) return 0;

    const tx = this.worldToTerrainX(x);
    const tz = this.worldToTerrainZ(z);

    const x0 = Math.floor(tx);
    const z0 = Math.floor(tz);
    const x1 = Math.min(x0 + 1, this.segmentCount);
    const z1 = Math.min(z0 + 1, this.segmentCount);

    const sx = tx - x0;
    const sz = tz - z0;

    const h00 = this.heightMap[z0][x0];
    const h10 = this.heightMap[z0][x1];
    const h01 = this.heightMap[z1][x0];
    const h11 = this.heightMap[z1][x1];

    const hx0 = this.lerp(h00, h10, sx);
    const hx1 = this.lerp(h01, h11, sx);

    return this.lerp(hx0, hx1, sz);
  }

  getMoistureAt(x, z) {
    if (!this.generated) return 0.5;

    const tx = this.worldToTerrainX(x);
    const tz = this.worldToTerrainZ(z);

    const ix = Math.max(0, Math.min(this.segmentCount, Math.round(tx)));
    const iz = Math.max(0, Math.min(this.segmentCount, Math.round(tz)));

    return this.moistureMap[iz][ix];
  }

  getFertilityAt(x, z) {
    if (!this.generated) return 0.7;

    const tx = this.worldToTerrainX(x);
    const tz = this.worldToTerrainZ(z);

    const ix = Math.max(0, Math.min(this.segmentCount, Math.round(tx)));
    const iz = Math.max(0, Math.min(this.segmentCount, Math.round(tz)));

    return this.fertilityMap[iz][ix];
  }

  getBiomeAt(x, z) {
    if (!this.generated) return "grass";

    const tx = this.worldToTerrainX(x);
    const tz = this.worldToTerrainZ(z);

    const ix = Math.max(0, Math.min(this.segmentCount, Math.round(tx)));
    const iz = Math.max(0, Math.min(this.segmentCount, Math.round(tz)));

    return this.biomeMap[iz][ix];
  }

  worldToTerrainX(x) {
    const normalized = (x + this.width / 2) / this.width;
    return normalized * this.segmentCount;
  }

  worldToTerrainZ(z) {
    const normalized = (z + this.depth / 2) / this.depth;
    return normalized * this.segmentCount;
  }

  terrainToWorldX(ix) {
    const normalized = ix / this.segmentCount;
    return normalized * this.width - this.width / 2;
  }

  terrainToWorldZ(iz) {
    const normalized = iz / this.segmentCount;
    return normalized * this.depth - this.depth / 2;
  }

  getBuildabilityScore(x, z) {
    const height = this.getHeightAt(x, z);
    const moisture = this.getMoistureAt(x, z);
    const fertility = this.getFertilityAt(x, z);
    const biome = this.getBiomeAt(x, z);

    let score = 1.0;

    // Prefer flatter land
    score -= Math.abs(height - 0.35) * 0.8;

    // Avoid overly wet or muddy land
    if (biome === "wetland" || biome === "mud") {
      score -= 0.45;
    }

    // Slight boost for fertile pasture
    if (biome === "pasture") {
      score += 0.15;
    }

    // Moisture and fertility matter for realism
    score += (fertility - 0.5) * 0.25;
    score -= Math.max(0, moisture - 0.8) * 0.5;

    return Math.max(0, Math.min(1, score));
  }

  findBestBuildArea(radius = 6) {
    let best = null;
    let bestScore = -1;

    for (let z = -this.depth / 2; z <= this.depth / 2; z += radius) {
      for (let x = -this.width / 2; x <= this.width / 2; x += radius) {
        const score = this.getBuildabilityScore(x, z);

        if (score > bestScore) {
          bestScore = score;
          best = { x, z, score };
        }
      }
    }

    return best;
  }

  getSummary() {
    if (!this.generated) {
      return {
        generated: false,
        width: this.width,
        depth: this.depth,
        segmentCount: this.segmentCount
      };
    }

    let grass = 0;
    let pasture = 0;
    let wetland = 0;
    let mud = 0;
    let rock = 0;

    for (let z = 0; z < this.biomeMap.length; z += 1) {
      for (let x = 0; x < this.biomeMap[z].length; x += 1) {
        switch (this.biomeMap[z][x]) {
          case "grass":
            grass += 1;
            break;
          case "pasture":
            pasture += 1;
            break;
          case "wetland":
            wetland += 1;
            break;
          case "mud":
            mud += 1;
            break;
          case "rock":
            rock += 1;
            break;
          default:
            grass += 1;
            break;
        }
      }
    }

    return {
      generated: true,
      width: this.width,
      depth: this.depth,
      segmentCount: this.segmentCount,
      counts: {
        grass,
        pasture,
        wetland,
        mud,
        rock
      }
    };
  }

  reset(seed = Date.now()) {
    this.seed = seed;
    this.generated = false;
    this.heightMap = [];
    this.biomeMap = [];
    this.moistureMap = [];
    this.fertilityMap = [];
    return this.generate();
  }
}
