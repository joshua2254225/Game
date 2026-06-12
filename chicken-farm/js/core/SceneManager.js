// js/core/SceneManager.js
// Handles the game world objects, syncing state into the 3D scene,
// and providing a clean bridge between game logic and rendering.

export class SceneManager {
  constructor() {
    this.game = null;
    this.scene = null;
    this.camera = null;

    this.root = null;
    this.farmGroup = null;
    this.chickenGroup = null;
    this.buildingGroup = null;

    this.chickenMeshes = new Map();
    this.buildingMeshes = new Map();

    this.initialized = false;
    this.usesThree = typeof window !== "undefined" && typeof window.THREE !== "undefined";
  }

  init(game) {
    this.game = game || null;

    if (!this.usesThree) {
      this.initialized = true;
      return;
    }

    const THREE = window.THREE;

    this.scene = game?.renderer?.scene || null;
    this.camera = game?.renderer?.camera || null;

    if (!this.scene) {
      console.warn("[SceneManager] No scene available.");
      this.initialized = true;
      return;
    }

    this.createRootNodes(THREE);
    this.createEnvironment(THREE);
    this.syncFromState(game?.state || {});
    this.initialized = true;
  }

  createRootNodes(THREE) {
    this.root = new THREE.Group();
    this.root.name = "FarmRoot";

    this.farmGroup = new THREE.Group();
    this.farmGroup.name = "FarmGroup";

    this.chickenGroup = new THREE.Group();
    this.chickenGroup.name = "ChickenGroup";

    this.buildingGroup = new THREE.Group();
    this.buildingGroup.name = "BuildingGroup";

    this.root.add(this.farmGroup);
    this.root.add(this.buildingGroup);
    this.root.add(this.chickenGroup);

    this.scene.add(this.root);
  }

  createEnvironment(THREE) {
    // A few simple objects that make the farm feel alive.
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x365f2e,
      roughness: 1.0,
      metalness: 0.0
    });

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300, 1, 1),
      groundMat
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = "GroundPlane";
    this.farmGroup.add(ground);

    const fenceMat = new THREE.MeshStandardMaterial({
      color: 0xb69a6d,
      roughness: 0.95
    });

    for (let i = 0; i < 16; i += 1) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 1.8, 0.2),
        fenceMat
      );
      post.position.set(-22 + i * 3, 0.9, -18);
      post.castShadow = true;
      post.receiveShadow = true;
      this.farmGroup.add(post);
    }

    const sun = new THREE.DirectionalLight(0xfff0d9, 1.8);
    sun.position.set(-18, 30, 18);
    sun.castShadow = true;

    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;

    this.scene.add(sun);

    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambient);
  }

  update(delta, state = {}) {
    if (!this.initialized) return;

    if (this.usesThree) {
      this.updateChickens(delta, state);
      this.updateBuildings(delta, state);
      this.updateWeather(delta, state);
    }
  }

  updateChickens(delta, state) {
    if (!this.chickenGroup || !this.usesThree) return;

    const THREE = window.THREE;
    const chickens = Array.isArray(state.chickens) ? state.chickens : [];

    // Create new meshes for any chickens not yet visualized.
    for (const chicken of chickens) {
      if (!this.chickenMeshes.has(chicken.id)) {
        const mesh = this.createChickenMesh(THREE, chicken);
        this.chickenMeshes.set(chicken.id, mesh);
        this.chickenGroup.add(mesh);
      }
    }

    // Remove meshes for chickens that no longer exist.
    for (const [id, mesh] of this.chickenMeshes.entries()) {
      const stillExists = chickens.some((chicken) => chicken.id === id);
      if (!stillExists) {
        this.chickenGroup.remove(mesh);
        this.disposeMesh(mesh);
        this.chickenMeshes.delete(id);
      }
    }

    // Animate and sync position.
    chickens.forEach((chicken, index) => {
      const mesh = this.chickenMeshes.get(chicken.id);
      if (!mesh) return;

      const pos = chicken.position || { x: 0, y: 0, z: 0 };
      const t = performance.now() * 0.001 + index;

      mesh.position.x = pos.x ?? 0;
      mesh.position.z = pos.z ?? 0;
      mesh.position.y = 0.45 + Math.sin(t * 3) * 0.05;

      mesh.rotation.y += delta * 0.8;
      mesh.scale.setScalar(this.getChickenScale(chicken));
    });
  }

  createChickenMesh(THREE, chicken) {
    const bodyColor = this.getChickenColor(chicken);

    const group = new THREE.Group();
    group.name = `Chicken_${chicken.id}`;

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 18, 18),
      new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 1.0
      })
    );
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = 0.05;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 1.0
      })
    );
    head.position.set(0.22, 0.42, 0);
    head.castShadow = true;
    group.add(head);

    const beak = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.14, 3),
      new THREE.MeshStandardMaterial({
        color: 0xd9a441,
        roughness: 1.0
      })
    );
    beak.rotation.z = Math.PI / 2;
    beak.position.set(0.42, 0.38, 0);
    beak.castShadow = true;
    group.add(beak);

    const comb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xb52a2a,
        roughness: 1.0
      })
    );
    comb.position.set(0.18, 0.62, 0.06);
    comb.scale.set(1.2, 1.0, 0.8);
    group.add(comb);

    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.22, 5),
      new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 1.0
      })
    );
    tail.rotation.z = -Math.PI / 2.4;
    tail.position.set(-0.35, 0.2, 0);
    tail.castShadow = true;
    group.add(tail);

    group.userData.baseY = 0.45;
    group.userData.phase = Math.random() * Math.PI * 2;
    group.userData.breed = chicken.breed || "Layer";

    return group;
  }

  getChickenColor(chicken) {
    const breed = (chicken?.breed || "layer").toLowerCase();

    if (breed.includes("brown")) return 0xb77a4a;
    if (breed.includes("black")) return 0x3a3a3a;
    if (breed.includes("white")) return 0xf3efe7;
    if (breed.includes("gold")) return 0xcfa24d;
    return 0xf0ead2;
  }

  getChickenScale(chicken) {
    const ageDays = Number(chicken?.ageDays || 0);
    const adultFactor = Math.min(1, ageDays / 90);
    return 0.8 + adultFactor * 0.35;
  }

  updateBuildings(delta, state) {
    if (!this.buildingGroup || !this.usesThree) return;

    const THREE = window.THREE;
    const buildings = Array.isArray(state.buildings) ? state.buildings : [];

    for (const building of buildings) {
      if (!this.buildingMeshes.has(building.id)) {
        const mesh = this.createBuildingMesh(THREE, building);
        this.buildingMeshes.set(building.id, mesh);
        this.buildingGroup.add(mesh);
      }
    }

    for (const [id, mesh] of this.buildingMeshes.entries()) {
      const stillExists = buildings.some((building) => building.id === id);
      if (!stillExists) {
        this.buildingGroup.remove(mesh);
        this.disposeMesh(mesh);
        this.buildingMeshes.delete(id);
      }
    }

    buildings.forEach((building) => {
      const mesh = this.buildingMeshes.get(building.id);
      if (!mesh) return;

      const pos = building.position || { x: 0, y: 0, z: 0 };
      mesh.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
      mesh.rotation.y = building.rotationY || 0;
      mesh.scale.setScalar(this.getBuildingScale(building));
    });
  }

  createBuildingMesh(THREE, building) {
    const type = (building?.type || "coop").toLowerCase();

    let baseColor = 0xa06a42;
    let roofColor = 0x742424;
    let width = 5;
    let height = 3;
    let depth = 4;

    if (type.includes("barn")) {
      baseColor = 0x9a5e36;
      roofColor = 0x6d1f1f;
      width = 8;
      height = 5;
      depth = 8;
    } else if (type.includes("warehouse")) {
      baseColor = 0xa9b0b6;
      roofColor = 0x6f7a80;
      width = 7;
      height = 4;
      depth = 6;
    } else if (type.includes("hatchery")) {
      baseColor = 0x9f8f63;
      roofColor = 0x5f5a44;
      width = 6;
      height = 3.8;
      depth = 5;
    }

    const group = new THREE.Group();
    group.name = `Building_${building.id}`;

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.95
      })
    );
    base.position.y = height / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(width, depth) * 0.72, height * 0.55, 4),
      new THREE.MeshStandardMaterial({
        color: roofColor,
        roughness: 1.0
      })
    );
    roof.position.y = height + 0.15;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    if (type.includes("coop")) {
      const perch = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.8, 0.15, depth * 0.25),
        new THREE.MeshStandardMaterial({
          color: 0xc9a16a,
          roughness: 1.0
        })
      );
      perch.position.set(0, 0.55, depth * 0.22);
      perch.castShadow = true;
      group.add(perch);
    }

    group.userData.level = building.level || 1;
    group.userData.health = building.health ?? 100;

    return group;
  }

  getBuildingScale(building) {
    const level = Math.max(1, Number(building?.level || 1));
    return 1 + (level - 1) * 0.08;
  }

  updateWeather(delta, state) {
    // Placeholder for future effects like rain fog, wind movement,
    // egg production boosts/penalties, etc.
    if (!this.scene) return;

    const weather = (state.weather || "sunny").toLowerCase();

    if (weather === "rainy" && this.scene.fog) {
      this.scene.fog.near = 22;
      this.scene.fog.far = 140;
    } else if (weather === "foggy" && this.scene.fog) {
      this.scene.fog.near = 8;
      this.scene.fog.far = 80;
    } else if (this.scene.fog) {
      this.scene.fog.near = 35;
      this.scene.fog.far = 220;
    }
  }

  syncFromState(state = {}) {
    if (!state || !this.usesThree) return;

    // Clear and rebuild if needed.
    this.update(0, state);
  }

  render(scene, camera, state) {
    // SceneManager does not own rendering yet.
    // This hook exists so future versions can add post-processing,
    // debug overlays, or scene transitions.
    return { scene, camera, state };
  }

  disposeMesh(mesh) {
    if (!mesh) return;

    mesh.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose?.();

      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat?.dispose?.());
        } else {
          child.material.dispose?.();
        }
      }
    });
  }

  dispose() {
    for (const mesh of this.chickenMeshes.values()) {
      this.disposeMesh(mesh);
    }

    for (const mesh of this.buildingMeshes.values()) {
      this.disposeMesh(mesh);
    }

    this.chickenMeshes.clear();
    this.buildingMeshes.clear();

    if (this.scene && this.root) {
      this.scene.remove(this.root);
    }

    this.scene = null;
    this.camera = null;
    this.root = null;
    this.farmGroup = null;
    this.chickenGroup = null;
    this.buildingGroup = null;
    this.game = null;
    this.initialized = false;
  }
}
