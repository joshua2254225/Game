// js/core/Renderer.js
/**
 * ============================================================================
 * CITY RACER — Renderer.js
 * ============================================================================
 * Owns the Three.js WebGLRenderer, the master Scene, all global lighting,
 * fog, post-processing, and quality-tier management.
 *
 * Other systems never create their own renderer or scene — they receive
 * references via Renderer.getScene() / Renderer.getRenderer().
 *
 * Responsibilities:
 *   • WebGLRenderer creation and configuration
 *   • Master THREE.Scene with fog
 *   • Global lighting rig (ambient, hemisphere, sun directional)
 *   • Quality tiers: low / med / high (shadow res, pixel ratio, draw dist)
 *   • Resize handling (window + orientation change)
 *   • Performance stats (FPS, draw calls, triangles)
 *   • Screenshot capture
 *   • Render target helpers for off-screen passes
 *   • Safe dispose / cleanup
 * ============================================================================
 */

'use strict';

const Renderer = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  let _renderer   = null;   // THREE.WebGLRenderer
  let _scene      = null;   // THREE.Scene  (master)
  let _clock      = null;   // THREE.Clock

  // Lighting references (updated by Sky.js for day/night)
  let _sunLight   = null;   // THREE.DirectionalLight
  let _ambLight   = null;   // THREE.AmbientLight
  let _hemiLight  = null;   // THREE.HemisphereLight

  // Active quality tier
  let _quality    = 'med';  // 'low' | 'med' | 'high'

  // Resize callback (set by Game.js)
  let _onResizeCb = null;

  // Performance tracking
  const _perf = {
    fps:          0,
    frameTime:    0,
    drawCalls:    0,
    triangles:    0,
    _lastTime:    0,
    _frameCount:  0,
    _accumTime:   0,
  };

  // ── Quality tier definitions ───────────────────────────────────────────

  const QUALITY_TIERS = {
    low: {
      pixelRatioMax:      1,
      shadowMapSize:      512,
      shadowsEnabled:     false,
      antialias:          false,
      fogNear:            50,
      fogFar:             160,
      maxLights:          2,
      toneMapping:        THREE.NoToneMapping,
      toneMappingExposure: 1.0,
    },
    med: {
      pixelRatioMax:      1.5,
      shadowMapSize:      1024,
      shadowsEnabled:     true,
      antialias:          true,
      fogNear:            CONFIG.RENDERER.FOG_NEAR,
      fogFar:             CONFIG.RENDERER.FOG_FAR,
      maxLights:          4,
      toneMapping:        THREE.ACESFilmicToneMapping,
      toneMappingExposure: CONFIG.RENDERER.TONE_MAPPING_EXP,
    },
    high: {
      pixelRatioMax:      CONFIG.RENDERER.PIXEL_RATIO_CAP,
      shadowMapSize:      CONFIG.RENDERER.SHADOW_MAP_SIZE,
      shadowsEnabled:     true,
      antialias:          true,
      fogNear:            CONFIG.RENDERER.FOG_NEAR,
      fogFar:             CONFIG.RENDERER.FOG_FAR,
      maxLights:          8,
      toneMapping:        THREE.ACESFilmicToneMapping,
      toneMappingExposure: CONFIG.RENDERER.TONE_MAPPING_EXP,
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise the renderer and scene.
   * Must be called once before anything else.
   *
   * @param {HTMLCanvasElement} canvas    The #game-canvas element.
   * @param {string}            [quality] 'low' | 'med' | 'high'
   */
  function init(canvas, quality = 'med') {
    if (_renderer) {
      console.warn('[Renderer] init() called twice — skipping.');
      return;
    }

    _quality      = quality;
    const tier    = QUALITY_TIERS[_quality] || QUALITY_TIERS.med;

    // ── WebGLRenderer ─────────────────────────────────────────────────────
    _renderer = new THREE.WebGLRenderer({
      canvas,
      antialias:        tier.antialias,
      powerPreference:  'high-performance',
      logarithmicDepthBuffer: false,   // faster, sufficient for our scale
      stencil:          false,         // not needed — saves VRAM
    });

    _renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, tier.pixelRatioMax)
    );
    _renderer.setSize(window.innerWidth, window.innerHeight);

    // Shadows
    _renderer.shadowMap.enabled = tier.shadowsEnabled;
    _renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

    // Tone mapping
    _renderer.toneMapping        = tier.toneMapping;
    _renderer.toneMappingExposure = tier.toneMappingExposure;

    // Output colour space (Three.js r128 uses .outputEncoding)
    _renderer.outputEncoding = THREE.sRGBEncoding;

    // Sort objects to minimise over-draw (transparent objects sorted last)
    _renderer.sortObjects = true;

    // ── Master Scene ──────────────────────────────────────────────────────
    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(CONFIG.RENDERER.FOG_COLOR);
    _scene.fog         = new THREE.Fog(
      CONFIG.RENDERER.FOG_COLOR,
      tier.fogNear,
      tier.fogFar
    );

    // ── Global lighting rig ───────────────────────────────────────────────
    _buildLightingRig();

    // ── Clock ─────────────────────────────────────────────────────────────
    _clock = new THREE.Clock();

    // ── Resize listener ───────────────────────────────────────────────────
    window.addEventListener('resize',            _onWindowResize);
    window.addEventListener('orientationchange', _onWindowResize);

    console.info(
      `[Renderer] Initialised. Quality: ${_quality} | ` +
      `Shadow: ${tier.shadowsEnabled ? tier.shadowMapSize + 'px' : 'off'} | ` +
      `DPR: ${_renderer.getPixelRatio().toFixed(2)}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIGHTING RIG
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build the three-light rig that illuminates the whole city.
   * Sky.js updates the colours each frame to simulate day/night.
   */
  function _buildLightingRig() {
    // ── 1. Ambient — fills shadows, prevents pure-black undersides ────────
    _ambLight = new THREE.AmbientLight(0xFFEEDD, 0.40);
    _ambLight.name = 'ambientLight';
    _scene.add(_ambLight);

    // ── 2. Hemisphere — sky colour above, ground-bounce below ─────────────
    // Sky colour starts at midday blue; ground is warm asphalt bounce.
    _hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x444422, 0.55);
    _hemiLight.name = 'hemisphereLight';
    _scene.add(_hemiLight);

    // ── 3. Directional "sun" — casts shadows, defines main shading ────────
    _sunLight = new THREE.DirectionalLight(0xFFDDCC, 1.20);
    _sunLight.name = 'sunLight';

    // Initial position: late-afternoon sun angle
    _sunLight.position.set(80, 120, 60);
    _sunLight.position.normalize().multiplyScalar(200);

    // Shadow camera frustum sized to cover the visible city around the player.
    // Game.js calls Renderer.updateShadowCamera(playerPos) each frame to
    // re-centre it, so we only cover a ~120-unit radius at any time.
    const tier = QUALITY_TIERS[_quality];
    if (tier.shadowsEnabled) {
      _sunLight.castShadow = true;

      _sunLight.shadow.mapSize.width  = tier.shadowMapSize;
      _sunLight.shadow.mapSize.height = tier.shadowMapSize;

      const sc = _sunLight.shadow.camera;
      sc.near   =   2;
      sc.far    = 350;
      sc.left   = -70;
      sc.right  =  70;
      sc.top    =  70;
      sc.bottom = -70;

      // Reduce shadow acne
      _sunLight.shadow.bias          = -0.0004;
      _sunLight.shadow.normalBias    =  0.02;
      _sunLight.shadow.radius        =  _quality === 'high' ? 2 : 1;
    }

    _scene.add(_sunLight);

    // Shadow target — moves with the player (see updateShadowCamera)
    _sunLight.target = new THREE.Object3D();
    _scene.add(_sunLight.target);

    console.info('[Renderer] Lighting rig built.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME RENDER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Render one frame.
   * Called by Game.js inside the requestAnimationFrame loop.
   *
   * @param {THREE.Camera} camera
   * @returns {number}  Delta time in seconds since last call.
   */
  function render(camera) {
    const dt = _clock.getDelta();
    _updatePerf(dt);
    _renderer.render(_scene, camera);
    return dt;
  }

  /**
   * Return the elapsed time (seconds) without advancing the clock.
   * Useful for animation systems that need absolute time.
   */
  function getElapsed() {
    return _clock.getElapsedTime();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHADOW CAMERA TRACKING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Move the shadow camera frustum to follow the player.
   * Called once per frame from Game.js so shadows always cover the
   * area around the player rather than a fixed world origin.
   *
   * @param {THREE.Vector3} playerPos
   */
  function updateShadowCamera(playerPos) {
    if (!_sunLight || !_sunLight.castShadow) return;

    // Offset sun position relative to player
    const sunOffset = new THREE.Vector3(80, 120, 60).normalize().multiplyScalar(180);
    _sunLight.position.copy(playerPos).add(sunOffset);
    _sunLight.target.position.copy(playerPos);
    _sunLight.target.updateMatrixWorld();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIGHTING STATE (called by Sky.js each frame)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update global light colours and intensities for the current time of day.
   * Sky.js computes these values and calls this once per frame.
   *
   * @param {object} params
   * @param {number} params.ambientColor       Hex integer
   * @param {number} params.ambientIntensity   0–1
   * @param {number} params.sunColor           Hex integer
   * @param {number} params.sunIntensity       0–1+
   * @param {number} params.skyColor           Hex integer (hemisphere sky)
   * @param {number} params.groundColor        Hex integer (hemisphere ground)
   * @param {number} params.hemiIntensity      0–1
   * @param {number} params.fogColor           Hex integer
   * @param {number} params.fogNear
   * @param {number} params.fogFar
   */
  function setLighting(params) {
    if (_ambLight) {
      _ambLight.color.setHex(params.ambientColor);
      _ambLight.intensity = params.ambientIntensity;
    }

    if (_sunLight) {
      _sunLight.color.setHex(params.sunColor);
      _sunLight.intensity = params.sunIntensity;
    }

    if (_hemiLight) {
      _hemiLight.color.setHex(params.skyColor);
      _hemiLight.groundColor.setHex(params.groundColor);
      _hemiLight.intensity = params.hemiIntensity;
    }

    if (_scene.fog) {
      _scene.fog.color.setHex(params.fogColor);
      _scene.background.setHex(params.fogColor);

      // Only update fog distances if quality tier has not locked them
      if (_quality !== 'low') {
        _scene.fog.near = params.fogNear;
        _scene.fog.far  = params.fogFar;
      }
    }
  }

  /**
   * Directly set fog density for weather effects (rain, smog).
   * @param {number} near
   * @param {number} far
   */
  function setFog(near, far) {
    if (_scene.fog) {
      _scene.fog.near = near;
      _scene.fog.far  = far;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // QUALITY MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Switch the renderer to a different quality tier at runtime.
   * Does NOT require a page reload.
   *
   * @param {'low'|'med'|'high'} newQuality
   */
  function setQuality(newQuality) {
    if (newQuality === _quality) return;
    if (!QUALITY_TIERS[newQuality]) {
      console.warn(`[Renderer] Unknown quality tier: ${newQuality}`);
      return;
    }

    _quality     = newQuality;
    const tier   = QUALITY_TIERS[_quality];

    // Pixel ratio
    _renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, tier.pixelRatioMax)
    );

    // Shadows
    _renderer.shadowMap.enabled = tier.shadowsEnabled;
    if (_sunLight) {
      _sunLight.castShadow = tier.shadowsEnabled;
      if (tier.shadowsEnabled) {
        _sunLight.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
        _sunLight.shadow.map?.dispose();
        _sunLight.shadow.map = null;   // force Three.js to re-allocate
      }
    }

    // Fog
    if (_scene.fog) {
      _scene.fog.near = tier.fogNear;
      _scene.fog.far  = tier.fogFar;
    }

    // Tone mapping
    _renderer.toneMapping        = tier.toneMapping;
    _renderer.toneMappingExposure = tier.toneMappingExposure;

    // Force size update
    _renderer.setSize(window.innerWidth, window.innerHeight);

    console.info(`[Renderer] Quality switched to: ${_quality}`);
  }

  /**
   * Return the current quality tier string.
   * @returns {'low'|'med'|'high'}
   */
  function getQuality() { return _quality; }

  // ══════════════════════════════════════════════════════════════════════════
  // RESIZE HANDLING
  // ══════════════════════════════════════════════════════════════════════════

  function _onWindowResize() {
    if (!_renderer) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    _renderer.setSize(w, h);

    if (_onResizeCb) _onResizeCb(w, h);
  }

  /**
   * Register a callback that fires whenever the window is resized.
   * Game.js uses this to update camera aspect ratio.
   *
   * @param {Function} cb  (width: number, height: number) => void
   */
  function onResize(cb) {
    _onResizeCb = cb;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE STATS
  // ══════════════════════════════════════════════════════════════════════════

  function _updatePerf(dt) {
    _perf._frameCount++;
    _perf._accumTime  += dt;
    _perf.frameTime    = dt * 1000;   // ms

    if (_perf._accumTime >= 1.0) {
      _perf.fps         = Math.round(_perf._frameCount / _perf._accumTime);
      _perf._frameCount = 0;
      _perf._accumTime  = 0;
    }

    const info = _renderer.info;
    _perf.drawCalls = info.render.calls;
    _perf.triangles = info.render.triangles;
  }

  /**
   * Return a snapshot of the current performance counters.
   * @returns {{ fps, frameTime, drawCalls, triangles }}
   */
  function getPerf() {
    return {
      fps:       _perf.fps,
      frameTime: _perf.frameTime,
      drawCalls: _perf.drawCalls,
      triangles: _perf.triangles,
    };
  }

  /**
   * Log a one-line performance summary to the console.
   */
  function logPerf() {
    const p = getPerf();
    console.info(
      `[Renderer] FPS: ${p.fps} | ` +
      `Frame: ${p.frameTime.toFixed(1)}ms | ` +
      `Draw calls: ${p.drawCalls} | ` +
      `Triangles: ${p.triangles.toLocaleString()}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER TARGET HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create a WebGLRenderTarget sized to the current viewport.
   * Used for off-screen passes (e.g. car-dealer preview, paint preview).
   *
   * @param {number} [widthOverride]   Default: window.innerWidth
   * @param {number} [heightOverride]  Default: window.innerHeight
   * @returns {THREE.WebGLRenderTarget}
   */
  function createRenderTarget(widthOverride, heightOverride) {
    const w = widthOverride  || window.innerWidth;
    const h = heightOverride || window.innerHeight;

    return new THREE.WebGLRenderTarget(w, h, {
      minFilter:    THREE.LinearFilter,
      magFilter:    THREE.LinearFilter,
      format:       THREE.RGBAFormat,
      encoding:     THREE.sRGBEncoding,
      depthBuffer:  true,
      stencilBuffer: false,
    });
  }

  /**
   * Render a scene to an off-screen target and return it.
   * Restores the main render target afterwards.
   *
   * @param {THREE.Scene}              offScene
   * @param {THREE.Camera}             offCamera
   * @param {THREE.WebGLRenderTarget}  target
   */
  function renderToTarget(offScene, offCamera, target) {
    _renderer.setRenderTarget(target);
    _renderer.clear();
    _renderer.render(offScene, offCamera);
    _renderer.setRenderTarget(null);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREENSHOT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Capture the current frame as a PNG data-URL.
   * Note: must be called immediately after render() for the buffer to be valid
   * (Three.js clears the buffer by default).
   *
   * @param {THREE.Camera} camera   Used to render one extra frame into the
   *                                preserved buffer.
   * @returns {string}  PNG data-URL.
   */
  function screenshot(camera) {
    // Re-render with preserveDrawingBuffer temporarily.
    // Because we cannot change preserveDrawingBuffer after creation,
    // we instead render into a fresh canvas.

    const w = _renderer.domElement.width;
    const h = _renderer.domElement.height;

    const offCanvas = document.createElement('canvas');
    offCanvas.width  = w;
    offCanvas.height = h;

    const offRenderer = new THREE.WebGLRenderer({
      canvas:                  offCanvas,
      antialias:               true,
      preserveDrawingBuffer:   true,
    });
    offRenderer.setSize(w, h);
    offRenderer.toneMapping        = _renderer.toneMapping;
    offRenderer.toneMappingExposure = _renderer.toneMappingExposure;
    offRenderer.outputEncoding      = THREE.sRGBEncoding;
    offRenderer.shadowMap.enabled   = false;  // skip shadows for speed

    offRenderer.render(_scene, camera);

    const dataURL = offCanvas.toDataURL('image/png');
    offRenderer.dispose();

    return dataURL;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCENE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Add one or more objects to the master scene.
   * Accepts a single Object3D or an array.
   * @param {THREE.Object3D|THREE.Object3D[]} objects
   */
  function add(objects) {
    const arr = Array.isArray(objects) ? objects : [objects];
    for (const obj of arr) _scene.add(obj);
  }

  /**
   * Remove one or more objects from the master scene.
   * @param {THREE.Object3D|THREE.Object3D[]} objects
   */
  function remove(objects) {
    const arr = Array.isArray(objects) ? objects : [objects];
    for (const obj of arr) _scene.remove(obj);
  }

  /**
   * Recursively dispose of a Three.js object and all its children:
   * geometries, materials, textures, and render targets.
   * Call this before removing an object from the scene to free GPU memory.
   *
   * @param {THREE.Object3D} obj
   */
  function disposeObject(obj) {
    obj.traverse(child => {
      if (child.geometry) {
        child.geometry.dispose();
      }

      if (child.material) {
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];

        for (const mat of mats) {
          // Dispose all texture maps on the material
          const texKeys = [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap',
            'emissiveMap', 'aoMap', 'lightMap', 'bumpMap',
            'displacementMap', 'alphaMap', 'envMap',
          ];
          for (const key of texKeys) {
            if (mat[key]) { mat[key].dispose(); }
          }
          mat.dispose();
        }
      }
    });
  }

  /**
   * Clear the entire scene of all non-light objects.
   * Useful when loading a new level. Lights are rebuilt by _buildLightingRig.
   * @param {boolean} [keepLights=true]
   */
  function clearScene(keepLights = true) {
    const toRemove = [];
    _scene.traverse(obj => {
      if (obj === _scene) return;
      if (keepLights && (
        obj === _ambLight  ||
        obj === _hemiLight ||
        obj === _sunLight  ||
        obj === _sunLight?.target
      )) return;
      if (!obj.parent) return;
      toRemove.push(obj);
    });

    for (const obj of toRemove) {
      if (obj.parent) obj.parent.remove(obj);
      disposeObject(obj);
    }

    console.info(`[Renderer] Scene cleared (${toRemove.length} objects removed).`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT MAP  (simple procedural sky sphere for reflections)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build a simple CubeCamera that captures the scene at world origin for
   * use as an environment map on metallic car surfaces.
   * Only created at 'high' quality to save performance.
   *
   * @returns {THREE.CubeCamera|null}
   */
  function createEnvCubeCamera() {
    if (_quality !== 'high') return null;

    const cubeRT = new THREE.WebGLCubeRenderTarget(128, {
      format:       THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter:    THREE.LinearMipmapLinearFilter,
    });

    const cubeCamera = new THREE.CubeCamera(0.5, 500, cubeRT);
    cubeCamera.name  = 'envCubeCamera';
    _scene.add(cubeCamera);

    return cubeCamera;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOADING PROGRESS INTEGRATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Smoothly update the loading screen bar and status text.
   * Called by each world-building system as it completes its init pass.
   *
   * @param {number} pct      0–100
   * @param {string} message  Status string.
   */
  function setLoadProgress(pct, message) {
    const bar    = document.getElementById('loader-bar');
    const status = document.getElementById('loader-status');

    if (bar) {
      bar.style.width         = `${MathUtils.clamp(pct, 0, 100)}%`;
      bar.setAttribute('aria-valuenow', Math.round(pct));
    }
    if (status && message) {
      status.textContent = message;
    }
  }

  /**
   * Fade out and remove the loading screen.
   * @param {Function} [onDone]  Called after the CSS transition finishes.
   */
  function hideLoadingScreen(onDone) {
    const el = document.getElementById('loading-screen');
    if (!el) { if (onDone) onDone(); return; }

    el.classList.add('fade-out');
    el.addEventListener('transitionend', () => {
      el.classList.add('hidden');
      if (onDone) onDone();
    }, { once: true });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEVICE CAPABILITY DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Heuristically detect the best starting quality tier for this device.
   * Checks GPU tier via renderer info, memory hints, and devicePixelRatio.
   *
   * @returns {'low'|'med'|'high'}
   */
  function detectQualityTier() {
    // Mobile devices: start lower
    const isMobile    = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const dpr         = window.devicePixelRatio || 1;
    const memoryHint  = navigator.deviceMemory  || 4;   // GB (Chrome only)
    const cores       = navigator.hardwareConcurrency || 4;

    if (isMobile && memoryHint <= 2) return 'low';
    if (isMobile && dpr <= 2)        return 'med';
    if (!isMobile && memoryHint >= 8 && cores >= 8) return 'high';
    return 'med';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SAFE DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Full teardown — dispose renderer, clear scene, remove event listeners.
   * Call when the game is completely shut down (e.g. navigating away).
   */
  function dispose() {
    stopAutoResize();
    if (_scene) clearScene(false);
    if (_renderer) {
      _renderer.dispose();
      _renderer.forceContextLoss();
      _renderer = null;
    }
    _scene     = null;
    _clock     = null;
    _sunLight  = null;
    _ambLight  = null;
    _hemiLight = null;
    console.info('[Renderer] Disposed.');
  }

  function stopAutoResize() {
    window.removeEventListener('resize',            _onWindowResize);
    window.removeEventListener('orientationchange', _onWindowResize);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    dispose,

    // Per-frame
    render,
    getElapsed,

    // Accessors (used by Camera, Sky, Game, etc.)
    getRenderer:  () => _renderer,
    getScene:     () => _scene,
    getClock:     () => _clock,
    getSunLight:  () => _sunLight,
    getAmbLight:  () => _ambLight,
    getHemiLight: () => _hemiLight,

    // Shadow
    updateShadowCamera,

    // Lighting (called by Sky.js)
    setLighting,
    setFog,

    // Quality
    setQuality,
    getQuality,
    detectQualityTier,
    QUALITY_TIERS,

    // Resize
    onResize,

    // Scene management
    add,
    remove,
    disposeObject,
    clearScene,

    // Render targets & screenshot
    createRenderTarget,
    renderToTarget,
    screenshot,

    // Environment
    createEnvCubeCamera,

    // Loading screen
    setLoadProgress,
    hideLoadingScreen,

    // Performance
    getPerf,
    logPerf,

  });

})();

if (typeof module !== 'undefined') module.exports = Renderer;
