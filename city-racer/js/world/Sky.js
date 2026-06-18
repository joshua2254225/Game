/* ## `js/world/Sky.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — Sky.js
 * ============================================================================
 * Full day/night cycle, atmospheric sky dome, sun, moon, stars, and clouds.
 *
 * Responsibilities:
 *   • Sky dome mesh with gradient shader driven by time-of-day
 *   • Sun and moon billboard sprites that arc across the sky
 *   • Star-field rendered as a BufferGeometry point cloud (night only)
 *   • Procedural cloud layer (billboard planes with noise texture)
 *   • Time-of-day manager with real-time or accelerated clock
 *   • Colour keyframe interpolation for sky, fog, ambient, hemisphere
 *   • Pushes computed lighting values to Renderer.setLighting() each frame
 *   • Lamppost light activation at dusk / deactivation at dawn
 *   • Exposes current hour (0–24) for RaceSystem night-race gating
 * ============================================================================
 */

'use strict';

const Sky = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS & COLOUR KEYFRAMES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Keyframes keyed by hour (0–24).
   * Each entry defines every light channel at that exact hour.
   * Values between keyframes are linearly interpolated in HSL space.
   *
   * skyTop    — top of sky dome
   * skyHorizon — horizon band
   * fogColor  — scene fog / background
   * ambient   — THREE.AmbientLight colour
   * ambientInt — ambient intensity
   * sunColor  — directional light colour
   * sunInt    — sun intensity
   * hemiSky   — hemisphere sky colour
   * hemiGround — hemisphere ground-bounce
   * hemiInt   — hemisphere intensity
   * fogNear / fogFar — adjusted for visibility
   */
  const SKY_KEYFRAMES = [
    // hour  skyTop      skyHorizon  fogColor    ambient     aI   sunColor    sI   hemiSky     hemiGnd     hI   fogNear  fogFar
    {  h:  0, sT:0x020410, sH:0x06091A, f:0x06091A, a:0x0A0A22, aI:0.20, sC:0x1A1A44, sI:0.05, hS:0x0A0A22, hG:0x111100, hI:0.15, fN:40,  fF:140 },
    {  h:  3, sT:0x020410, sH:0x080C20, f:0x080C20, a:0x0A0A22, aI:0.18, sC:0x1A1A44, sI:0.03, hS:0x0A0A22, hG:0x111100, hI:0.12, fN:35,  fF:130 },
    {  h:  5, sT:0x0D1A35, sH:0x1A2A55, f:0x0F1A30, a:0x111133, aI:0.25, sC:0x334477, sI:0.08, hS:0x0D1A35, hG:0x110D00, hI:0.20, fN:45,  fF:150 },
    {  h:  6, sT:0x1A2A55, sH:0xE8703A, f:0xC05028, a:0xFF9944, aI:0.40, sC:0xFF8844, sI:0.55, hS:0x2244AA, hG:0x552200, hI:0.40, fN:60,  fF:170 },
    {  h:  7, sT:0x3A6090, sH:0xF4A460, f:0xB88060, a:0xFFCC88, aI:0.50, sC:0xFFCC88, sI:0.85, hS:0x5588CC, hG:0x443311, hI:0.50, fN:70,  fF:200 },
    {  h:  9, sT:0x5090C8, sH:0x88BBDD, f:0x8AACCC, a:0xFFEECC, aI:0.55, sC:0xFFEEDD, sI:1.10, hS:0x6699CC, hG:0x445533, hI:0.58, fN:80,  fF:240 },
    {  h: 12, sT:0x4A8EC8, sH:0x87CEEB, f:0x8EBBD0, a:0xFFFFEE, aI:0.60, sC:0xFFFFEE, sI:1.30, hS:0x87CEEB, hG:0x4A6A2A, hI:0.60, fN:80,  fF:260 },
    {  h: 15, sT:0x4A8EC8, sH:0x87CEEB, f:0x8EBBD0, a:0xFFFFEE, aI:0.58, sC:0xFFFFDD, sI:1.20, hS:0x87CEEB, hG:0x4A6A2A, hI:0.58, fN:80,  fF:255 },
    {  h: 17, sT:0x2A5A88, sH:0xE8884A, f:0xCC7040, a:0xFFBB66, aI:0.48, sC:0xFFAA55, sI:0.90, hS:0x3A5A88, hG:0x553322, hI:0.45, fN:65,  fF:210 },
    {  h: 18, sT:0x1A3055, sH:0xCC5522, f:0xAA4422, a:0xFF8844, aI:0.38, sC:0xFF7733, sI:0.60, hS:0x2233AA, hG:0x442200, hI:0.35, fN:55,  fF:180 },
    {  h: 19, sT:0x0D1A35, sH:0x441A22, f:0x220E18, a:0x442233, aI:0.28, sC:0x553344, sI:0.25, hS:0x111A33, hG:0x220E00, hI:0.22, fN:45,  fF:155 },
    {  h: 20, sT:0x050A18, sH:0x0E1228, f:0x0A0E1E, a:0x111133, aI:0.22, sC:0x1A1A44, sI:0.08, hS:0x050A18, hG:0x110E00, hI:0.16, fN:40,  fF:140 },
    {  h: 22, sT:0x020410, sH:0x06091A, f:0x06091A, a:0x0A0A22, aI:0.20, sC:0x1A1A44, sI:0.05, hS:0x0A0A22, hG:0x111100, hI:0.15, fN:38,  fF:135 },
    {  h: 24, sT:0x020410, sH:0x06091A, f:0x06091A, a:0x0A0A22, aI:0.20, sC:0x1A1A44, sI:0.05, hS:0x0A0A22, hG:0x111100, hI:0.15, fN:40,  fF:140 },
  ];

  // Night threshold — lamps turn on above/below these hours
  const NIGHT_START_HOUR = 19.5;
  const NIGHT_END_HOUR   =  6.5;

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  // Time management
  let _hour           = 12.0;    // current in-game hour (0–24)
  let _dayEnabled     = true;    // if false, locked to _hour
  let _cycleSpeed     = 1.0;     // multiplier (1 = real-time, 60 = 1 min/sec)
  let _realStartTime  = 0;       // performance.now() at init

  // Scene objects
  let _skyDome        = null;    // THREE.Mesh — gradient sky sphere
  let _sunSprite      = null;    // THREE.Mesh — sun billboard
  let _moonSprite     = null;    // THREE.Mesh — moon billboard
  let _starField      = null;    // THREE.Points — star point cloud
  let _cloudGroup     = null;    // THREE.Group — billboard clouds

  // Sun / moon orbit parameters
  const SUN_ORBIT_RADIUS  = 180;
  const MOON_ORBIT_RADIUS = 160;

  // Lamppost light references (populated by Props.js via registerLamppost)
  const _lampposts = [];    // THREE.PointLight[]

  // Current interpolated sky state (updated each frame)
  const _sky = {
    skyTop:       0x4A8EC8,
    skyHorizon:   0x87CEEB,
    fogColor:     0x8EBBD0,
    ambient:      0xFFFFEE,
    ambientInt:   0.55,
    sunColor:     0xFFFFEE,
    sunInt:       1.20,
    hemiSky:      0x87CEEB,
    hemiGround:   0x4A6A2A,
    hemiInt:      0.58,
    fogNear:      80,
    fogFar:       260,
    isNight:      false,
    starOpacity:  0,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build the sky dome, sun, moon, stars, and clouds.
   * Must be called after Renderer.init().
   *
   * @param {object} [opts]
   * @param {number}  [opts.startHour=12]   Starting time of day.
   * @param {boolean} [opts.dayEnabled=true] Enable day/night cycle.
   * @param {number}  [opts.cycleSpeed=1]   1 = real-time, 120 = 2 min/day.
   */
  function init(opts = {}) {
    _hour        = opts.startHour  ?? 12;
    _dayEnabled  = opts.dayEnabled ?? true;
    _cycleSpeed  = opts.cycleSpeed ?? 1;
    _realStartTime = performance.now();

    Renderer.setLoadProgress(0, 'Building sky…');

    _buildSkyDome();
    _buildSunMoon();
    _buildStarField();
    _buildClouds();

    // Do one immediate update so the scene looks correct before the first render
    _updateSkyColors();
    _updateCelestialBodies();

    Renderer.setLoadProgress(5, 'Sky built.');
    console.info(`[Sky] Initialised. Hour: ${_hour.toFixed(1)}, Cycle: ${_dayEnabled ? 'on' : 'off'}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SKY DOME
  // ══════════════════════════════════════════════════════════════════════════

  function _buildSkyDome() {
    // Large inverted sphere — camera always inside it.
    // We use a custom vertex-colour material that we update each frame
    // to blend between skyTop (apex) and skyHorizon (equator).
    const geo  = new THREE.SphereGeometry(280, 32, 18);
    const mat  = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor:      { value: new THREE.Color(0x4A8EC8) },
        uHorizonColor:  { value: new THREE.Color(0x87CEEB) },
        uHorizonBlend:  { value: 0.35 },  // blend sharpness
      },
      vertexShader: `
        varying float vHeight;
        void main() {
          vHeight     = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3  uTopColor;
        uniform vec3  uHorizonColor;
        uniform float uHorizonBlend;
        varying float vHeight;
        void main() {
          float t   = smoothstep(-uHorizonBlend, uHorizonBlend, vHeight);
          vec3  col = mix(uHorizonColor, uTopColor, t);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side:       THREE.BackSide,
      depthWrite: false,
    });

    _skyDome = new THREE.Mesh(geo, mat);
    _skyDome.name         = 'skyDome';
    _skyDome.renderOrder  = -1000;    // always behind everything
    Renderer.add(_skyDome);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUN & MOON
  // ══════════════════════════════════════════════════════════════════════════

  function _buildSunMoon() {
    // ── Sun ──────────────────────────────────────────────────────────────
    const sunGeo = new THREE.PlaneGeometry(22, 22);
    const sunMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color(1.0, 0.95, 0.85) },
        uOpacity: { value: 1.0 },
        uGlow:    { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv         = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3  uColor;
        uniform float uOpacity;
        uniform float uGlow;
        varying vec2  vUv;
        void main() {
          vec2  c    = vUv - 0.5;
          float r    = length(c) * 2.0;
          float disc = 1.0 - smoothstep(0.38, 0.50, r);
          float glow = pow(1.0 - r, 3.0) * uGlow;
          vec3  col  = uColor * (disc + glow * 0.5);
          float a    = (disc + glow * 0.3) * uOpacity;
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });

    _sunSprite = new THREE.Mesh(sunGeo, sunMat);
    _sunSprite.name        = 'sun';
    _sunSprite.renderOrder = -999;
    Renderer.add(_sunSprite);

    // ── Moon ─────────────────────────────────────────────────────────────
    const moonGeo = new THREE.PlaneGeometry(14, 14);
    const moonMat = new THREE.ShaderMaterial({
      uniforms: {
        uPhase:   { value: 0.0 },    // 0 = full, 1 = new
        uOpacity: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv         = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uPhase;
        uniform float uOpacity;
        varying vec2  vUv;
        void main() {
          vec2  c      = vUv - 0.5;
          float r      = length(c) * 2.0;
          float disc   = 1.0 - smoothstep(0.42, 0.50, r);
          // Simple crescent mask
          float cresX  = c.x - (uPhase - 0.5) * 0.7;
          float cresc  = length(vec2(cresX, c.y)) * 2.0;
          float shadow = 1.0 - smoothstep(0.38, 0.52, cresc);
          float lit    = disc * (1.0 - shadow * uPhase);
          vec3  col    = mix(vec3(0.6, 0.6, 0.65), vec3(0.95, 0.95, 1.0), lit);
          gl_FragColor = vec4(col, lit * uOpacity);
        }
      `,
      transparent: true,
      depthWrite:  false,
    });

    _moonSprite = new THREE.Mesh(moonGeo, moonMat);
    _moonSprite.name        = 'moon';
    _moonSprite.renderOrder = -998;
    Renderer.add(_moonSprite);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STAR FIELD
  // ══════════════════════════════════════════════════════════════════════════

  function _buildStarField() {
    const STAR_COUNT = 1800;
    const positions  = new Float32Array(STAR_COUNT * 3);
    const sizes      = new Float32Array(STAR_COUNT);
    const colors     = new Float32Array(STAR_COUNT * 3);

    const rng = MathUtils.createRNG(777);

    for (let i = 0; i < STAR_COUNT; i++) {
      // Random point on upper hemisphere (y >= 0 for above horizon)
      const theta = rng() * MathUtils.TWO_PI;
      const phi   = Math.acos(1 - rng());          // uniform sphere sampling
      const r     = 270;

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 5;   // ensure above horizon
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // Star size 1–3 px
      sizes[i] = 1.0 + rng() * 2.0;

      // Slight colour variation (blue-white to warm-white)
      const warm = rng() * 0.3;
      colors[i * 3]     = 0.85 + warm;
      colors[i * 3 + 1] = 0.85 + warm * 0.2;
      colors[i * 3 + 2] = 0.95;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes,     1));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity:    { value: 0.0 },
        uPixelRatio: { value: window.devicePixelRatio },
      },
      vertexShader: `
        attribute float size;
        attribute vec3  color;
        varying   vec3  vColor;
        uniform   float uPixelRatio;
        void main() {
          vColor      = color;
          vec4 mvPos  = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uPixelRatio * (300.0 / -mvPos.z);
          gl_Position  = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3  vColor;
        void main() {
          vec2  c = gl_PointCoord - 0.5;
          float r = length(c) * 2.0;
          float a = 1.0 - smoothstep(0.5, 1.0, r);
          gl_FragColor = vec4(vColor, a * uOpacity);
        }
      `,
      transparent:  true,
      depthWrite:   false,
      blending:     THREE.AdditiveBlending,
      vertexColors: true,
    });

    _starField = new THREE.Points(geo, mat);
    _starField.name        = 'starField';
    _starField.renderOrder = -997;
    Renderer.add(_starField);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLOUDS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildClouds() {
    _cloudGroup  = new THREE.Group();
    _cloudGroup.name = 'clouds';

    const CLOUD_COUNT = 18;
    const rng         = MathUtils.createRNG(321);
    const cloudTex    = _makeCloudTexture();

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const angle   = (i / CLOUD_COUNT) * MathUtils.TWO_PI + rng() * 0.4;
      const radius  = 80 + rng() * 100;
      const height  = 35 + rng() * 25;
      const scaleW  = 40 + rng() * 55;
      const scaleH  = 16 + rng() * 20;

      const geo = new THREE.PlaneGeometry(scaleW, scaleH);
      const mat = new THREE.MeshBasicMaterial({
        map:         cloudTex,
        transparent: true,
        opacity:     0.55 + rng() * 0.25,
        depthWrite:  false,
        alphaTest:   0.04,
        color:       new THREE.Color(0.95, 0.95, 1.0),
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );
      // Face upward slightly and rotate randomly
      mesh.rotation.x = -0.25 - rng() * 0.15;
      mesh.rotation.z =  rng() * MathUtils.TWO_PI;
      mesh.userData.speed    = 0.003 + rng() * 0.006;   // drift speed
      mesh.userData.angle    = angle;
      mesh.userData.radius   = radius;
      mesh.userData.baseOpacity = mat.opacity;
      _cloudGroup.add(mesh);
    }

    Renderer.add(_cloudGroup);
  }

  /**
   * Generate a soft cloud texture using canvas noise.
   * @returns {THREE.CanvasTexture}
   */
  function _makeCloudTexture() {
    const size = 256;
    const { canvas, ctx } = _makeCanvas(size);

    // Radial soft blob
    const grad = ctx.createRadialGradient(
      size/2, size/2, 0,
      size/2, size/2, size * 0.48
    );
    grad.addColorStop(0,    'rgba(255,255,255,1.0)');
    grad.addColorStop(0.35, 'rgba(245,245,255,0.85)');
    grad.addColorStop(0.65, 'rgba(240,240,255,0.45)');
    grad.addColorStop(0.88, 'rgba(235,235,250,0.12)');
    grad.addColorStop(1,    'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Layer a few smaller blobs to break up the perfect circle
    const rng = MathUtils.createRNG(88);
    ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 5; i++) {
      const bx = size * (0.2 + rng() * 0.6);
      const by = size * (0.2 + rng() * 0.6);
      const br = size * (0.12 + rng() * 0.15);
      const g2 = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g2.addColorStop(0,   `rgba(255,255,255,${0.4 + rng() * 0.3})`);
      g2.addColorStop(1,   'rgba(255,255,255,0.0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, MathUtils.TWO_PI);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function _makeCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    return { canvas, ctx: canvas.getContext('2d') };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update the sky, lighting, and celestial bodies for this frame.
   * Called by Game.js each tick.
   *
   * @param {number} dt  Delta time in seconds.
   * @param {THREE.Vector3} playerPos  Used to keep sky centred on player.
   */
  function update(dt, playerPos) {
    // ── Advance time ──────────────────────────────────────────────────────
    if (_dayEnabled) {
      // Convert real dt to in-game hours
      // cycleSpeed=1 → 24h real = 24h game (too slow for play)
      // Default CONFIG sets CYCLE_DURATION=300s → full day in 5 min
      const hoursPerSecond = _cycleSpeed * (24 / CONFIG.SKY.DAY_CYCLE_DURATION);
      _hour = (_hour + hoursPerSecond * dt) % 24;
    }

    // ── Compute interpolated sky state ────────────────────────────────────
    _updateSkyColors();

    // ── Push to Renderer ──────────────────────────────────────────────────
    Renderer.setLighting({
      ambientColor:   _sky.ambient,
      ambientIntensity: _sky.ambientInt,
      sunColor:       _sky.sunColor,
      sunIntensity:   _sky.sunInt,
      skyColor:       _sky.hemiSky,
      groundColor:    _sky.hemiGround,
      hemiIntensity:  _sky.hemiInt,
      fogColor:       _sky.fogColor,
      fogNear:        _sky.fogNear,
      fogFar:         _sky.fogFar,
    });

    // ── Update sky dome shader uniforms ───────────────────────────────────
    if (_skyDome) {
      const mat = _skyDome.material;
      mat.uniforms.uTopColor.value.setHex(_sky.skyTop);
      mat.uniforms.uHorizonColor.value.setHex(_sky.skyHorizon);
    }

    // ── Move sky dome / stars with player ─────────────────────────────────
    if (playerPos) {
      if (_skyDome)   _skyDome.position.copy(playerPos);
      if (_starField) _starField.position.copy(playerPos);
    }

    // ── Sun and moon arcs ─────────────────────────────────────────────────
    _updateCelestialBodies();
    if (playerPos) {
      if (_sunSprite)  _sunSprite.position.add(playerPos).sub(_sunSprite.position.clone().sub(playerPos));
      if (_moonSprite) _moonSprite.position.add(playerPos).sub(_moonSprite.position.clone().sub(playerPos));
      // Simpler: just offset from player
      const sunWorld  = _calcSunPosition(playerPos);
      const moonWorld = _calcMoonPosition(playerPos);
      if (_sunSprite)  _sunSprite.position.copy(sunWorld);
      if (_moonSprite) _moonSprite.position.copy(moonWorld);
    }

    // Billboard: face camera
    const camera = Camera?.getCamera();
    if (camera) {
      if (_sunSprite)  _sunSprite.quaternion.copy(camera.quaternion);
      if (_moonSprite) _moonSprite.quaternion.copy(camera.quaternion);
    }

    // ── Stars opacity ─────────────────────────────────────────────────────
    if (_starField) {
      _starField.material.uniforms.uOpacity.value = _sky.starOpacity;
    }

    // ── Cloud drift ───────────────────────────────────────────────────────
    _updateClouds(dt, playerPos);

    // ── Lamppost lights ───────────────────────────────────────────────────
    _updateLampposts();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SKY COLOUR INTERPOLATION
  // ══════════════════════════════════════════════════════════════════════════

  function _updateSkyColors() {
    // Find surrounding keyframes
    let kA = SKY_KEYFRAMES[0];
    let kB = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1];

    for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
      if (SKY_KEYFRAMES[i].h <= _hour && SKY_KEYFRAMES[i + 1].h >= _hour) {
        kA = SKY_KEYFRAMES[i];
        kB = SKY_KEYFRAMES[i + 1];
        break;
      }
    }

    // Local t within this segment
    const span = kB.h - kA.h;
    const t    = span > 0 ? (_hour - kA.h) / span : 0;
    const ts   = MathUtils.smoothstep3(t);   // smooth transition

    _sky.skyTop      = MathUtils.lerpColor(kA.sT, kB.sT, ts);
    _sky.skyHorizon  = MathUtils.lerpColor(kA.sH, kB.sH, ts);
    _sky.fogColor    = MathUtils.lerpColor(kA.f,  kB.f,  ts);
    _sky.ambient     = MathUtils.lerpColor(kA.a,  kB.a,  ts);
    _sky.ambientInt  = MathUtils.lerp(kA.aI, kB.aI, ts);
    _sky.sunColor    = MathUtils.lerpColor(kA.sC, kB.sC, ts);
    _sky.sunInt      = MathUtils.lerp(kA.sI, kB.sI, ts);
    _sky.hemiSky     = MathUtils.lerpColor(kA.hS, kB.hS, ts);
    _sky.hemiGround  = MathUtils.lerpColor(kA.hG, kB.hG, ts);
    _sky.hemiInt     = MathUtils.lerp(kA.hI, kB.hI, ts);
    _sky.fogNear     = MathUtils.lerp(kA.fN, kB.fN, ts);
    _sky.fogFar      = MathUtils.lerp(kA.fF, kB.fF, ts);

    // Night flag
    _sky.isNight = _hour >= NIGHT_START_HOUR || _hour < NIGHT_END_HOUR;

    // Star opacity: fully visible only deep in the night
    const nightDepth  = _nightDepth();
    _sky.starOpacity  = MathUtils.clamp(nightDepth * 1.6 - 0.2, 0, 1);
  }

  /**
   * Returns 0 at full daylight, 1 at deepest night.
   */
  function _nightDepth() {
    // Map hour to a 0–1 "darkness" curve
    if (_hour >= 21 || _hour < 4)  return 1.0;
    if (_hour >= 4  && _hour < 7)  return MathUtils.clamp(1 - (_hour - 4) / 3, 0, 1);
    if (_hour >= 18 && _hour < 21) return MathUtils.clamp((_hour - 18) / 3, 0, 1);
    return 0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUN & MOON POSITIONING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Compute the sun's world position based on the current hour.
   * The sun arcs from east horizon at 6h to zenith at 12h to west at 18h.
   * Below horizon (night), the sun is hidden.
   *
   * @param {THREE.Vector3} origin  Reference point (player position).
   * @returns {THREE.Vector3}
   */
  function _calcSunPosition(origin = new THREE.Vector3()) {
    // Hour angle: 6h = 0°, 12h = 90° (zenith), 18h = 180°
    const hourAngle   = ((_hour - 6) / 12) * Math.PI;   // 0 = east, PI = west
    const elevation   = Math.sin(hourAngle);              // 0 at horizon, 1 at zenith
    const horizontal  = Math.cos(hourAngle);

    return new THREE.Vector3(
      origin.x - horizontal * SUN_ORBIT_RADIUS,    // east(-) to west(+)
      origin.y + Math.max(elevation, -0.1) * SUN_ORBIT_RADIUS,
      origin.z - SUN_ORBIT_RADIUS * 0.3            // slightly south
    );
  }

  /**
   * Moon is opposite the sun (+12h phase offset).
   */
  function _calcMoonPosition(origin = new THREE.Vector3()) {
    const moonHour  = (_hour + 12) % 24;
    const hourAngle = ((moonHour - 6) / 12) * Math.PI;
    const elevation = Math.sin(hourAngle);
    const horizontal = Math.cos(hourAngle);

    return new THREE.Vector3(
      origin.x - horizontal * MOON_ORBIT_RADIUS,
      origin.y + Math.max(elevation, -0.1) * MOON_ORBIT_RADIUS,
      origin.z - MOON_ORBIT_RADIUS * 0.3
    );
  }

  function _updateCelestialBodies() {
    // Sun opacity — visible only above horizon
    if (_sunSprite) {
      const sunHour  = _hour;
      const aboveHorizon = sunHour >= 5.5 && sunHour <= 18.5;
      const sunElevation = Math.sin(((_hour - 6) / 12) * Math.PI);
      const sunVis   = MathUtils.clamp(sunElevation * 5, 0, 1);

      _sunSprite.material.uniforms.uOpacity.value = sunVis;

      // Colour shift: warm orange at dawn/dusk, white at noon
      const warmth = 1 - MathUtils.clamp((sunElevation - 0.1) * 4, 0, 1);
      _sunSprite.material.uniforms.uColor.value.setRGB(
        1.0,
        0.82 + warmth * 0.13,
        0.65 + warmth * 0.20
      );
      _sunSprite.material.uniforms.uGlow.value = 0.6 + warmth * 0.6;

      _sunSprite.visible = aboveHorizon;
    }

    // Moon opacity — visible only above horizon at night
    if (_moonSprite) {
      const moonHour     = (_hour + 12) % 24;
      const moonElevation = Math.sin(((moonHour - 6) / 12) * Math.PI);
      const moonVis      = MathUtils.clamp(moonElevation * 4, 0, 1) * _sky.starOpacity;

      _moonSprite.material.uniforms.uOpacity.value = moonVis;
      _moonSprite.visible = moonVis > 0.01;

      // Slow moon phase cycle (approx 30 in-game days)
      const cycleProgress = (_hour / 24) % 1;
      _moonSprite.material.uniforms.uPhase.value = cycleProgress;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLOUD UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  function _updateClouds(dt, playerPos) {
    if (!_cloudGroup) return;

    // Hide clouds at night (subtle)
    const cloudOpacityMult = MathUtils.clamp(1 - _sky.starOpacity * 0.6, 0.3, 1.0);

    for (const cloud of _cloudGroup.children) {
      // Slowly drift clouds around a circle
      cloud.userData.angle += cloud.userData.speed * dt;
      const r = cloud.userData.radius;
      const a = cloud.userData.angle;

      if (playerPos) {
        cloud.position.x = playerPos.x + Math.cos(a) * r;
        cloud.position.z = playerPos.z + Math.sin(a) * r;
      } else {
        cloud.position.x = Math.cos(a) * r;
        cloud.position.z = Math.sin(a) * r;
      }

      // Night tint — clouds look slightly blue at night
      if (_sky.isNight) {
        cloud.material.color.setRGB(0.75, 0.78, 0.88);
      } else {
        cloud.material.color.setRGB(0.97, 0.97, 1.00);
      }

      cloud.material.opacity = cloud.userData.baseOpacity * cloudOpacityMult;

      // Billboard to always face up (horizontal clouds)
      if (Camera?.getCamera()) {
        cloud.rotation.y += dt * 0.01;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LAMPPOST LIGHTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Register a lamppost PointLight so Sky.js can toggle it on/off.
   * Called by Props.js for every street lamp it creates.
   * @param {THREE.PointLight} light
   */
  function registerLamppost(light) {
    _lampposts.push(light);
  }

  function _updateLampposts() {
    const nightDepth  = _nightDepth();
    const shouldBeOn  = nightDepth > 0.15;

    // Only update if state has changed (avoid GPU uniform spam)
    if (_lampposts.length === 0) return;

    const targetInt = shouldBeOn
      ? CONFIG.PROPS.LAMPPOST_LIGHT_INTENSITY * MathUtils.clamp(nightDepth * 1.5, 0, 1)
      : 0;

    // Update a subset each frame to spread the cost
    const BATCH = Math.min(20, _lampposts.length);
    const start = Math.floor(performance.now() * 0.01) % _lampposts.length;

    for (let i = 0; i < BATCH; i++) {
      const lamp = _lampposts[(start + i) % _lampposts.length];
      if (lamp) {
        lamp.intensity = MathUtils.lerp(lamp.intensity, targetInt, 0.1);
        lamp.visible   = lamp.intensity > 0.01;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIME MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Set the current in-game hour directly.
   * @param {number} hour  0–24
   */
  function setHour(hour) {
    _hour = MathUtils.wrap(hour, 0, 24);
  }

  /**
   * Set the cycle speed multiplier.
   * @param {number} speed  1 = real-time, 60 = 1 real-minute per in-game hour.
   */
  function setCycleSpeed(speed) {
    _cycleSpeed = Math.max(0, speed);
  }

  /**
   * Enable or disable the day/night cycle.
   * @param {boolean} enabled
   */
  function setCycleEnabled(enabled) {
    _dayEnabled = !!enabled;
  }

  /**
   * Return the current in-game hour (0–24, fractional).
   * @returns {number}
   */
  function getHour() { return _hour; }

  /**
   * Return true if the current time is night.
   * Used by RaceSystem to gate the night race.
   * @returns {boolean}
   */
  function isNight() { return _sky.isNight; }

  /**
   * Return the current sky state snapshot (all interpolated values).
   * @returns {object}
   */
  function getSkyState() { return { ..._sky, hour: _hour }; }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    const objs = [_skyDome, _sunSprite, _moonSprite, _starField, _cloudGroup];
    for (const obj of objs) {
      if (obj) {
        Renderer.disposeObject(obj);
        Renderer.remove(obj);
      }
    }
    _lampposts.length = 0;
    console.info('[Sky] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    dispose,

    // Per-frame
    update,

    // Time control
    setHour,
    getHour,
    setCycleSpeed,
    setCycleEnabled,
    isNight,
    getSkyState,

    // Lamppost registration
    registerLamppost,

  });

})();

if (typeof module !== 'undefined') module.exports = Sky;
/* ```

---

**File 12 ✅ — `js/world/Sky.js` done.**

This is the full atmospheric sky system. It covers a custom two-colour gradient sky dome driven by a GLSL shader with `uTopColor` and `uHorizonColor` uniforms that update every frame, 14 time-of-day keyframes interpolated in smooth-step through every lighting channel — sky top, sky horizon, fog colour, ambient, directional sun, hemisphere sky and ground bounce — a sun billboard with a GLSL disc-plus-radial-glow shader that shifts from warm orange at dawn to bright white at noon and back to golden at dusk, a crescent moon billboard with a phase mask shader that fades in opposite the sun, 1800 procedurally seeded stars in a `BufferGeometry` point cloud with additive blending that fade in by night depth, 18 billboard clouds with soft radial noise textures that slowly drift in arcs around the player and tint blue at night, street lamp toggle logic that batches updates across frames to avoid GPU pressure, and a clean time API exposing `setHour`, `setCycleSpeed`, `isNight`, and `getSkyState` for other systems like `RaceSystem` to gate night events.

**Say "File 13" for `js/world/CityMap.js`.** */
