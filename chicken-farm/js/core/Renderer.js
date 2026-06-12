// js/core/Renderer.js
// 3D renderer with graceful fallback if Three.js is not available yet.

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas || null;

    this.isReady = false;
    this.usesThree = typeof window !== "undefined" && typeof window.THREE !== "undefined";

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = null;

    this.fallbackCtx = null;
    this.fallbackWidth = 0;
    this.fallbackHeight = 0;

    this.resizeHandler = this.handleResize.bind(this);
  }

  init() {
    if (!this.canvas) {
      console.warn("[Renderer] No canvas provided.");
      return false;
    }

    if (this.usesThree) {
      this.initThree();
    } else {
      this.initFallback2D();
    }

    window.addEventListener("resize", this.resizeHandler);
    this.handleResize();
    this.isReady = true;
    return true;
  }

  initThree() {
    const THREE = window.THREE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b7d8);
    this.scene.fog = new THREE.Fog(0x87b7d8, 35, 220);

    this.camera = new THREE.PerspectiveCamera(
      60,
      1,
      0.1,
      1000
    );
    this.camera.position.set(0, 18, 28);
    this.camera.lookAt(0, 4, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.clock = new THREE.Clock();

    this.createBaseScene();
  }

  createBaseScene() {
    const THREE = window.THREE;

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(500, 500, 1, 1);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f6f34,
      roughness: 1.0,
      metalness: 0.0
    });

    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Soft ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambient);

    // Sun light
    const directional = new THREE.DirectionalLight(0xfff4d6, 2.0);
    directional.position.set(-20, 35, 18);
    directional.castShadow = true;

    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 120;
    directional.shadow.camera.left = -40;
    directional.shadow.camera.right = 40;
    directional.shadow.camera.top = 40;
    directional.shadow.camera.bottom = -40;

    this.scene.add(directional);

    // Simple barn placeholder
    const barnGroup = new THREE.Group();

    const barnBase = new THREE.Mesh(
      new THREE.BoxGeometry(8, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0xa05c35, roughness: 0.9 })
    );
    barnBase.position.set(8, 2.5, -6);
    barnBase.castShadow = true;
    barnBase.receiveShadow = true;
    barnGroup.add(barnBase);

    const barnRoof = new THREE.Mesh(
      new THREE.ConeGeometry(6.2, 3.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x7a2222, roughness: 1.0 })
    );
    barnRoof.position.set(8, 6.5, -6);
    barnRoof.rotation.y = Math.PI / 4;
    barnRoof.castShadow = true;
    barnGroup.add(barnRoof);

    this.scene.add(barnGroup);

    // Simple coop placeholder
    const coop = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.5, 3.5),
      new THREE.MeshStandardMaterial({ color: 0xc7a16b, roughness: 0.95 })
    );
    coop.position.set(-8, 1.25, 4);
    coop.castShadow = true;
    coop.receiveShadow = true;
    this.scene.add(coop);

    const coopRoof = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 1.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x6f1f1f, roughness: 1.0 })
    );
    coopRoof.position.set(-8, 3.3, 4);
    coopRoof.rotation.y = Math.PI / 4;
    coopRoof.castShadow = true;
    this.scene.add(coopRoof);

    // A few placeholder chickens
    this.chickenPlaceholders = [];
    const chickenGeometry = new THREE.SphereGeometry(0.45, 16, 16);
    const chickenMaterial = new THREE.MeshStandardMaterial({ color: 0xf0ead2, roughness: 1.0 });

    for (let i = 0; i < 6; i += 1) {
      const chicken = new THREE.Mesh(chickenGeometry, chickenMaterial);
      chicken.position.set(-2 + i * 1.2, 0.45, 2 + (i % 2) * 1.1);
      chicken.castShadow = true;
      chicken.receiveShadow = true;
      chicken.userData.baseY = chicken.position.y;
      chicken.userData.phase = Math.random() * Math.PI * 2;
      this.scene.add(chicken);
      this.chickenPlaceholders.push(chicken);
    }

    // Small water tank / silo placeholder
    const silo = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 6, 18),
      new THREE.MeshStandardMaterial({ color: 0xb8c2c8, roughness: 0.85, metalness: 0.1 })
    );
    silo.position.set(14, 3, 8);
    silo.castShadow = true;
    silo.receiveShadow = true;
    this.scene.add(silo);
  }

  initFallback2D() {
    this.fallbackCtx = this.canvas.getContext("2d");
  }

  handleResize() {
    if (!this.canvas) return;

    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    if (this.usesThree && this.renderer && this.camera) {
      this.renderer.setSize(width, height, false);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    } else if (this.fallbackCtx) {
      this.canvas.width = Math.floor(width);
      this.canvas.height = Math.floor(height);
      this.fallbackWidth = width;
      this.fallbackHeight = height;
    }
  }

  update(delta, state = {}) {
    if (!this.isReady) return;

    if (this.usesThree) {
      this.animateScene(delta, state);
    } else {
      this.drawFallback(state);
    }
  }

  animateScene(delta, state = {}) {
    if (!this.scene) return;

    // Gentle chicken bobbing
    if (this.chickenPlaceholders) {
      this.chickenPlaceholders.forEach((chicken, index) => {
        const phase = chicken.userData.phase || 0;
        chicken.position.y = chicken.userData.baseY + Math.sin(performance.now() * 0.003 + phase) * 0.08;
        chicken.rotation.y += delta * 0.25 + index * 0.0001;
      });
    }

    // Slight camera drift for life
    if (this.camera) {
      const t = performance.now() * 0.0001;
      this.camera.position.x = Math.sin(t) * 0.4;
      this.camera.lookAt(0, 3, 0);
    }
  }

  render(sceneManager, state = {}) {
    if (!this.isReady) return;

    if (this.usesThree && this.renderer && this.scene && this.camera) {
      if (sceneManager && typeof sceneManager.render === "function") {
        sceneManager.render(this.scene, this.camera, state);
      }

      this.renderer.render(this.scene, this.camera);
    } else {
      this.drawFallback(state);
    }
  }

  drawFallback(state = {}) {
    const ctx = this.fallbackCtx;
    if (!ctx || !this.canvas) return;

    const width = this.canvas.width || this.fallbackWidth || window.innerWidth;
    const height = this.canvas.height || this.fallbackHeight || window.innerHeight;

    ctx.clearRect(0, 0, width, height);

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#93c6e7");
    sky.addColorStop(0.6, "#c7e3b0");
    sky.addColorStop(1, "#416b34");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Ground
    ctx.fillStyle = "#335b2f";
    ctx.fillRect(0, height * 0.62, width, height * 0.38);

    // Barn
    ctx.fillStyle = "#9d5a35";
    ctx.fillRect(width * 0.58, height * 0.46, 130, 90);
    ctx.fillStyle = "#6f1f1f";
    ctx.beginPath();
    ctx.moveTo(width * 0.57, height * 0.46);
    ctx.lineTo(width * 0.645, height * 0.35);
    ctx.lineTo(width * 0.72, height * 0.46);
    ctx.closePath();
    ctx.fill();

    // Coop
    ctx.fillStyle = "#c8a26a";
    ctx.fillRect(width * 0.18, height * 0.54, 90, 50);
    ctx.fillStyle = "#6b2020";
    ctx.beginPath();
    ctx.moveTo(width * 0.17, height * 0.54);
    ctx.lineTo(width * 0.225, height * 0.48);
    ctx.lineTo(width * 0.28, height * 0.54);
    ctx.closePath();
    ctx.fill();

    // Chickens as dots
    const chickenCount = Math.max(3, Number(state.chickenCount || 0));
    ctx.fillStyle = "#f4f0e6";
    for (let i = 0; i < Math.min(chickenCount, 10); i += 1) {
      const x = width * 0.22 + i * 24;
      const y = height * 0.72 + Math.sin(performance.now() * 0.002 + i) * 3;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Overlay text
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "18px Segoe UI, sans-serif";
    ctx.fillText("Three.js not loaded yet — fallback view active.", 18, 30);
    ctx.font = "14px Segoe UI, sans-serif";
    ctx.fillText(`Day ${state.day ?? 1}  •  Money $${Math.max(0, Math.round(state.money ?? 0))}`, 18, 54);
  }

  dispose() {
    window.removeEventListener("resize", this.resizeHandler);

    if (this.renderer && typeof this.renderer.dispose === "function") {
      this.renderer.dispose();
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = null;
    this.fallbackCtx = null;
    this.chickenPlaceholders = null;
    this.isReady = false;
  }
}
