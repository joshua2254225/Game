// js/utils/ProceduralTextures.js
/**
 * ============================================================================
 * CITY RACER — ProceduralTextures.js
 * ============================================================================
 * Generates every game texture at runtime using the Canvas 2D API.
 * No external image files are required — everything is drawn in code.
 *
 * All public methods return a THREE.CanvasTexture ready to assign to a
 * material's .map, .emissiveMap, etc.
 *
 * Texture cache: every texture is cached by a string key so the same
 * texture object is reused rather than re-drawn each call.
 *
 * Sections:
 *   1.  Cache & canvas helpers
 *   2.  Noise primitives          (value noise, fbm)
 *   3.  Road textures             (asphalt, markings, kerb)
 *   4.  Pavement / ground         (sidewalk, grass, dirt)
 *   5.  Building textures         (facades, windows, roof, brick)
 *   6.  Vehicle textures          (car body, tyre, glass)
 *   7.  Nature textures           (tree bark, foliage, water)
 *   8.  Bridge & structure        (concrete, steel, railing)
 *   9.  UI / world markers        (garage G, dealer D, race flag, taxi)
 *  10.  Utility overlays          (damage crack, skid mark, shadow)
 *  11.  Public API
 * ============================================================================
 */

'use strict';

const ProceduralTextures = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // 1. CACHE & CANVAS HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /** Internal texture cache: key → THREE.CanvasTexture */
  const _cache = new Map();

  /**
   * Create a fresh offscreen <canvas> of the given size.
   * @param {number} w  width  in pixels
   * @param {number} h  height in pixels (defaults to w for square textures)
   * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }}
   */
  function _makeCanvas(w, h = w) {
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    return { canvas, ctx };
  }

  /**
   * Wrap a canvas in a THREE.CanvasTexture with sensible defaults,
   * store it in the cache under `key`, and return it.
   *
   * @param {string}            key
   * @param {HTMLCanvasElement} canvas
   * @param {object}            [opts]
   * @param {number}  [opts.wrapS=THREE.RepeatWrapping]
   * @param {number}  [opts.wrapT=THREE.RepeatWrapping]
   * @param {boolean} [opts.nearest=false]  use NearestFilter instead of Linear
   * @returns {THREE.CanvasTexture}
   */
  function _finish(key, canvas, opts = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = opts.wrapS ?? THREE.RepeatWrapping;
    tex.wrapT = opts.wrapT ?? THREE.RepeatWrapping;
    if (opts.nearest) {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
    } else {
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
    }
    tex.needsUpdate = true;
    _cache.set(key, tex);
    return tex;
  }

  /**
   * Return a cached texture if it exists, otherwise call factory() to
   * create it, cache it, and return it.
   */
  function _cached(key, factory) {
    if (_cache.has(key)) return _cache.get(key);
    return factory();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. NOISE PRIMITIVES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Simple deterministic hash for a 2-D integer grid position.
   * Returns a value in [0,1).
   */
  function _hash2(x, y) {
    let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  /**
   * Bilinear value noise at position (x,y) using _hash2.
   * Returns a value in [0,1].
   */
  function _valueNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix,        fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);   // smoothstep
    const uy = fy * fy * (3 - 2 * fy);
    const a = _hash2(ix,   iy);
    const b = _hash2(ix+1, iy);
    const c = _hash2(ix,   iy+1);
    const d = _hash2(ix+1, iy+1);
    return a + (b-a)*ux + (c-a)*uy + (d-a)*ux*uy - (b-a)*ux*uy
           + (a + (b-a)*ux) * (1-uy) + (c + (d-c)*ux) * uy - (a + (b-a)*ux);
    // Simplified:
  }

  /**
   * Fractional Brownian Motion — layered octaves of value noise.
   * @param {number} x
   * @param {number} y
   * @param {number} [octaves=4]
   * @param {number} [persistence=0.5]
   * @param {number} [lacunarity=2.0]
   * @returns {number} 0–1
   */
  function _fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let value = 0, amplitude = 1, frequency = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      value     += _valueNoise2(x * frequency, y * frequency) * amplitude;
      max       += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return value / max;
  }

  /** Clean value noise (rewritten for clarity). */
  function _valueNoise2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = MathUtils.smoothstep3(x - ix);
    const fy = MathUtils.smoothstep3(y - iy);
    return MathUtils.lerp(
      MathUtils.lerp(_hash2(ix,   iy),   _hash2(ix+1, iy),   fx),
      MathUtils.lerp(_hash2(ix,   iy+1), _hash2(ix+1, iy+1), fx),
      fy
    );
  }

  /**
   * Fill a canvas context with fBm noise in greyscale.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   * @param {number} scale     Noise feature scale (higher = larger features)
   * @param {number} octaves
   * @param {string} darkCol   CSS colour for noise low end
   * @param {string} lightCol  CSS colour for noise high end
   */
  function _fillNoise(ctx, w, h, scale, octaves, darkCol, lightCol) {
    const imgData = ctx.createImageData(w, h);
    const data    = imgData.data;
    const dA = MathUtils.hexToRgb(MathUtils.cssToHex(darkCol));
    const lA = MathUtils.hexToRgb(MathUtils.cssToHex(lightCol));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = _fbm(x / scale, y / scale, octaves);
        const i = (y * w + x) * 4;
        data[i]   = Math.round(MathUtils.lerp(dA.r, lA.r, n));
        data[i+1] = Math.round(MathUtils.lerp(dA.g, lA.g, n));
        data[i+2] = Math.round(MathUtils.lerp(dA.b, lA.b, n));
        data[i+3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. ROAD TEXTURES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Asphalt surface texture.
   * Dark grey base with subtle noise grain and small aggregate flecks.
   * @param {number} [size=512]
   * @returns {THREE.CanvasTexture}
   */
  function makeAsphalt(size = 512) {
    return _cached(`asphalt_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);

      // Base — dark asphalt grey
      ctx.fillStyle = '#2A2A2A';
      ctx.fillRect(0, 0, size, size);

      // Noise grain layer
      _fillNoise(ctx, size, size, size * 0.06, 3, '#222222', '#383838');
      ctx.globalAlpha = 0.55;
      ctx.drawImage(canvas, 0, 0); // blend over base
      ctx.globalAlpha = 1;

      // Macro noise for tarmac variation
      const imgData = ctx.createImageData(size, size);
      const data    = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n  = _fbm(x / (size * 0.15), y / (size * 0.15), 5, 0.6);
          const v  = Math.round(30 + n * 28);   // 30–58 grey
          const i  = (y * size + x) * 4;
          data[i]   = v;
          data[i+1] = v;
          data[i+2] = v;
          data[i+3] = 255;
        }
      }
      ctx.globalAlpha = 0.4;
      ctx.putImageData(imgData, 0, 0);
      ctx.globalAlpha = 1;

      // Tiny aggregate specks (light gravel)
      ctx.fillStyle = 'rgba(180,175,165,0.18)';
      const rng = MathUtils.createRNG(42);
      for (let i = 0; i < 900; i++) {
        const sx = rng() * size;
        const sy = rng() * size;
        const sr = 0.5 + rng() * 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle tyre-track darkening along the centre
      const grad = ctx.createLinearGradient(0, 0, size, 0);
      grad.addColorStop(0,   'rgba(0,0,0,0)');
      grad.addColorStop(0.3, 'rgba(0,0,0,0.08)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.12)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.08)');
      grad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      return _finish(`asphalt_${size}`, canvas);
    });
  }

  /**
   * Road centre-line / lane-marking texture.
   * White dashes on transparent background — overlay on asphalt.
   * @param {number} [size=256]
   * @returns {THREE.CanvasTexture}
   */
  function makeRoadMarkings(size = 256) {
    return _cached(`road_markings_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size / 4, size);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // White centre dash — occupies the middle 40% of height, 60% of width
      const dashH   = size * 0.60;
      const dashY   = size * 0.20;
      const dashW   = (size / 4) * 0.55;
      const dashX   = ((size / 4) - dashW) / 2;

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.roundRect(dashX, dashY, dashW, dashH, 3);
      ctx.fill();

      return _finish(`road_markings_${size}`, canvas, {
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
      });
    });
  }

  /**
   * Stop-line texture (solid white bar across road).
   * @param {number} [size=128]
   * @returns {THREE.CanvasTexture}
   */
  function makeStopLine(size = 128) {
    return _cached(`stop_line_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size, size / 8);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size / 8);
      return _finish(`stop_line_${size}`, canvas, { wrapT: THREE.ClampToEdgeWrapping });
    });
  }

  /**
   * Kerb / curb texture — alternating red and white stripes.
   * @param {number} [size=128]
   * @returns {THREE.CanvasTexture}
   */
  function makeKerb(size = 128) {
    return _cached(`kerb_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);
      const stripeW = size / 8;

      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#CCCCCC' : '#CC2222';
        ctx.fillRect(i * stripeW, 0, stripeW, size);
      }

      // Concrete noise overlay
      ctx.globalAlpha = 0.12;
      _fillNoise(ctx, size, size, size * 0.08, 3, '#000000', '#FFFFFF');
      ctx.globalAlpha = 1;

      return _finish(`kerb_${size}`, canvas);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. PAVEMENT / GROUND
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Concrete pavement / sidewalk texture — grey tiles with joint lines.
   * @param {number} [size=256]
   * @returns {THREE.CanvasTexture}
   */
  function makeSidewalk(size = 256) {
    return _cached(`sidewalk_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);
      const tiles  = 4;          // number of tiles per axis
      const tileW  = size / tiles;
      const tileH  = size / tiles;
      const joint  = 2;          // joint gap in pixels
      const rng    = MathUtils.createRNG(7);

      for (let ty = 0; ty < tiles; ty++) {
        for (let tx = 0; tx < tiles; tx++) {
          // Each tile gets a slightly different shade
          const v  = 185 + Math.floor(rng() * 30);
          ctx.fillStyle = `rgb(${v},${v-2},${v-5})`;
          ctx.fillRect(
            tx * tileW + joint / 2,
            ty * tileH + joint / 2,
            tileW - joint,
            tileH - joint
          );
        }
      }

      // Noise grain on top
      const imgData = ctx.createImageData(size, size);
      const d       = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n  = _fbm(x / (size * 0.1), y / (size * 0.1), 3, 0.55);
          const dv = Math.round((n - 0.5) * 18);
          const i  = (y * size + x) * 4;
          d[i]   = MathUtils.clamp(190 + dv, 140, 230);
          d[i+1] = MathUtils.clamp(188 + dv, 138, 228);
          d[i+2] = MathUtils.clamp(183 + dv, 133, 223);
          d[i+3] = 80;   // semi-transparent — blends over tile colours
        }
      }
      ctx.putImageData(imgData, 0, 0);

      return _finish(`sidewalk_${size}`, canvas);
    });
  }

  /**
   * Grass ground texture — layered greens with subtle noise variation.
   * @param {number} [size=512]
   * @returns {THREE.CanvasTexture}
   */
  function makeGrass(size = 512) {
    return _cached(`grass_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);

      // Base solid grass colour
      ctx.fillStyle = '#3A6E2A';
      ctx.fillRect(0, 0, size, size);

      // fBm colour variation
      const imgData = ctx.createImageData(size, size);
      const data    = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n  = _fbm(x / (size * 0.12), y / (size * 0.12), 5, 0.5);
          const i  = (y * size + x) * 4;
          data[i]   = Math.round(35  + n * 45);   // R  35–80
          data[i+1] = Math.round(88  + n * 50);   // G  88–138
          data[i+2] = Math.round(20  + n * 25);   // B  20–45
          data[i+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Individual blade strokes
      const rng = MathUtils.createRNG(99);
      ctx.strokeStyle = 'rgba(80,160,40,0.25)';
      ctx.lineWidth   = 0.8;
      for (let i = 0; i < 600; i++) {
        const bx = rng() * size;
        const by = rng() * size;
        const bl = 3 + rng() * 6;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + (rng()-0.5)*3, by - bl);
        ctx.stroke();
      }

      return _finish(`grass_${size}`, canvas);
    });
  }

  /**
   * Dirt / bare ground texture — warm brown with gravel noise.
   * @param {number} [size=256]
   * @returns {THREE.CanvasTexture}
   */
  function makeDirt(size = 256) {
    return _cached(`dirt_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);

      const imgData = ctx.createImageData(size, size);
      const data    = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n  = _fbm(x / (size * 0.09), y / (size * 0.09), 4, 0.55);
          const i  = (y * size + x) * 4;
          data[i]   = Math.round(110 + n * 55);
          data[i+1] = Math.round( 75 + n * 35);
          data[i+2] = Math.round( 35 + n * 20);
          data[i+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      return _finish(`dirt_${size}`, canvas);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. BUILDING TEXTURES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Generic building facade — coloured base with a grid of windows.
   *
   * @param {number} baseColorHex   Hex integer for wall colour.
   * @param {number} [floors=8]     Number of floor rows.
   * @param {number} [cols=4]       Number of window columns.
   * @param {boolean} [night=false] Night mode — windows emit warm glow.
   * @param {number}  [size=256]
   * @returns {THREE.CanvasTexture}
   */
  function makeBuildingFacade(baseColorHex, floors = 8, cols = 4, night = false, size = 256) {
    const key = `facade_${baseColorHex}_${floors}_${cols}_${night ? 'n' : 'd'}_${size}`;
    return _cached(key, () => {
      const { canvas, ctx } = _makeCanvas(size, size * 2);  // taller than wide
      const W = canvas.width, H = canvas.height;

      // Wall base with slight noise
      const { r, g, b } = MathUtils.hexToRgb(baseColorHex);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, W, H);

      // Subtle concrete texture
      const imgData = ctx.createImageData(W, H);
      const data    = imgData.data;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const n  = _fbm(x/(W*0.15), y/(H*0.08), 3, 0.6) * 0.18 - 0.09;
          const i  = (y * W + x) * 4;
          data[i]   = MathUtils.clamp(r + Math.round(n*80), 0, 255);
          data[i+1] = MathUtils.clamp(g + Math.round(n*80), 0, 255);
          data[i+2] = MathUtils.clamp(b + Math.round(n*80), 0, 255);
          data[i+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Horizontal floor lines
      const floorH = H / floors;
      ctx.strokeStyle = `rgba(0,0,0,0.12)`;
      ctx.lineWidth   = 1;
      for (let f = 1; f < floors; f++) {
        ctx.beginPath();
        ctx.moveTo(0,  f * floorH);
        ctx.lineTo(W,  f * floorH);
        ctx.stroke();
      }

      // Windows
      const rng     = MathUtils.createRNG(baseColorHex % 9999);
      const winPadX = W / cols * 0.18;
      const winPadY = floorH  * 0.22;
      const winW    = W / cols - winPadX * 2;
      const winH    = floorH  - winPadY * 2;

      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          const wx  = c * (W / cols) + winPadX;
          const wy  = f * floorH     + winPadY;
          const lit = rng() < (night ? 0.72 : 0.15);

          if (night) {
            // Window glow
            if (lit) {
              const warmness = rng();
              const wr  = Math.round(240 + warmness * 15);
              const wg  = Math.round(200 + warmness * 30);
              const wb  = Math.round(120 + warmness * 40);
              ctx.fillStyle   = `rgb(${wr},${wg},${wb})`;
              // Inner glow blur effect
              const grd = ctx.createRadialGradient(
                wx + winW/2, wy + winH/2, 0,
                wx + winW/2, wy + winH/2, Math.max(winW, winH) * 0.8
              );
              grd.addColorStop(0,   `rgba(${wr},${wg},${wb},0.9)`);
              grd.addColorStop(0.6, `rgba(${wr},${wg},${wb},0.6)`);
              grd.addColorStop(1,   `rgba(${wr},${wg},${wb},0.0)`);
              ctx.fillStyle = grd;
              ctx.fillRect(wx - 2, wy - 2, winW + 4, winH + 4);
              ctx.fillStyle = `rgb(${wr},${wg},${wb})`;
            } else {
              ctx.fillStyle = '#0A0C10';
            }
          } else {
            ctx.fillStyle = lit
              ? 'rgba(200,220,255,0.55)'
              : 'rgba(140,160,180,0.65)';
          }

          ctx.fillRect(wx, wy, winW, winH);

          // Window frame / sill
          ctx.strokeStyle = `rgba(0,0,0,${night ? 0.5 : 0.25})`;
          ctx.lineWidth   = 0.8;
          ctx.strokeRect(wx, wy, winW, winH);

          // Horizontal blind/divider line (day only)
          if (!night) {
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.moveTo(wx,         wy + winH * 0.5);
            ctx.lineTo(wx + winW,  wy + winH * 0.5);
            ctx.stroke();
          }
        }
      }

      return _finish(key, canvas, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    });
  }

  /**
   * Glass curtain-wall facade — for downtown skyscrapers.
   * @param {number} tintHex   Tint colour (e.g. 0x88BBCC for blue glass).
   * @param {number} [size=256]
   * @returns {THREE.CanvasTexture}
   */
  function makeGlassFacade(tintHex, size = 256) {
    const key = `glass_${tintHex}_${size}`;
    return _cached(key, () => {
      const { canvas, ctx } = _makeCanvas(size, size * 2);
      const W = canvas.width, H = canvas.height;

      const { r, g, b } = MathUtils.hexToRgb(tintHex);

      // Reflective gradient base
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0,    `rgba(${r+30},${g+30},${b+30},1)`);
      grad.addColorStop(0.45, `rgba(${r},${g},${b},1)`);
      grad.addColorStop(0.55, `rgba(${r+20},${g+20},${b+20},1)`);
      grad.addColorStop(1,    `rgba(${r-20},${g-20},${b-20},1)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Panel grid lines
      const panelW = W / 3;
      const panelH = H / 10;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth   = 1;

      for (let col = 1; col < 3; col++) {
        ctx.beginPath();
        ctx.moveTo(col * panelW, 0);
        ctx.lineTo(col * panelW, H);
        ctx.stroke();
      }
      for (let row = 0; row < 10; row++) {
        ctx.beginPath();
        ctx.moveTo(0,  row * panelH);
        ctx.lineTo(W,  row * panelH);
        ctx.stroke();
      }

      // Diagonal highlight streak
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle   = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(W * 0.6, 0);
      ctx.lineTo(W * 0.85, 0);
      ctx.lineTo(W * 0.45, H);
      ctx.lineTo(W * 0.2, H);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      return _finish(key, canvas, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    });
  }

  /**
   * Flat roof texture — gravel-covered with HVAC outlines.
   * @param {number} [size=128]
   * @returns {THREE.CanvasTexture}
   */
  function makeRoof(size = 128) {
    return _cached(`roof_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);

      // Dark gravel base
      const imgData = ctx.createImageData(size, size);
      const data    = imgData.data;
      const rng     = MathUtils.createRNG(17);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n  = _fbm(x / (size*0.06), y / (size*0.06), 3, 0.5);
          const v  = Math.round(48 + n * 36);
          const i  = (y * size + x) * 4;
          data[i]   = v;
          data[i+1] = v;
          data[i+2] = v;
          data[i+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // HVAC / AC unit hints
      ctx.fillStyle   = '#505050';
      ctx.strokeStyle = '#333333';
      ctx.lineWidth   = 1;
      const units = [[0.15,0.2,0.2,0.15],[0.55,0.6,0.18,0.12],[0.3,0.7,0.25,0.18]];
      for (const [ux,uy,uw,uh] of units) {
        ctx.fillRect(ux*size, uy*size, uw*size, uh*size);
        ctx.strokeRect(ux*size, uy*size, uw*size, uh*size);
      }

      return _finish(`roof_${size}`, canvas);
    });
  }

  /**
   * Brick wall texture — rows of offset bricks.
   * @param {number} [brickColorHex=0xCC7744]
   * @param {number} [size=256]
   * @returns {THREE.CanvasTexture}
   */
  function makeBrick(brickColorHex = 0xCC7744, size = 256) {
    const key = `brick_${brickColorHex}_${size}`;
    return _cached(key, () => {
      const { canvas, ctx } = _makeCanvas(size);
      const W = size, H = size;

      const { r, g, b } = MathUtils.hexToRgb(brickColorHex);
      const mortarColor = `rgb(${r-40},${g-35},${b-25})`;
      ctx.fillStyle = mortarColor;
      ctx.fillRect(0, 0, W, H);

      const brickW = W / 6;
      const brickH = H / 12;
      const mortarT = 2;
      const rng     = MathUtils.createRNG(brickColorHex % 777);

      for (let row = 0; row < 12; row++) {
        const offset = row % 2 === 0 ? 0 : brickW * 0.5;
        for (let col = -1; col < 7; col++) {
          const bx  = col * brickW + offset;
          const by  = row * brickH;
          const bw  = brickW - mortarT;
          const bh  = brickH - mortarT;
          const var_ = (rng() - 0.5) * 28;
          ctx.fillStyle = `rgb(${MathUtils.clamp(r+var_,60,255)},${MathUtils.clamp(g+var_,40,220)},${MathUtils.clamp(b+var_/2,20,180)})`;
          ctx.fillRect(bx + mortarT/2, by + mortarT/2, bw, bh);
        }
      }

      return _finish(key, canvas);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. VEHICLE TEXTURES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Car body paint texture — solid colour with a specular highlight stripe.
   * @param {number} colorHex
   * @param {'standard'|'metallic'|'matte'|'chrome'} [finish='standard']
   * @param {number} [size=128]
   * @returns {THREE.CanvasTexture}
   */
  function makeCarPaint(colorHex, finish = 'standard', size = 128) {
    const key = `carpaint_${colorHex}_${finish}_${size}`;
    return _cached(key, () => {
      const { canvas, ctx } = _makeCanvas(size);
      const { r, g, b }     = MathUtils.hexToRgb(colorHex);

      // Base colour
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, size, size);

      if (finish === 'metallic' || finish === 'chrome') {
        // Metallic flake noise
        const imgData = ctx.createImageData(size, size);
        const data    = imgData.data;
        const rng     = MathUtils.createRNG(colorHex % 1234);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const n  = _fbm(x/(size*0.05), y/(size*0.05), 4, 0.45);
            const i  = (y * size + x) * 4;
            const v  = finish === 'chrome' ? n * 200 : n * 60;
            data[i]   = MathUtils.clamp(r + v - 30, 0, 255);
            data[i+1] = MathUtils.clamp(g + v - 30, 0, 255);
            data[i+2] = MathUtils.clamp(b + v - 30, 0, 255);
            data[i+3] = 255;
          }
        }
        ctx.putImageData(imgData, 0, 0);

        // Specular highlight band
        if (finish !== 'matte') {
          const grad = ctx.createLinearGradient(0, 0, size, size * 0.6);
          grad.addColorStop(0,    'rgba(255,255,255,0)');
          grad.addColorStop(0.35, `rgba(255,255,255,${finish === 'chrome' ? 0.55 : 0.22})`);
          grad.addColorStop(0.5,  `rgba(255,255,255,${finish === 'chrome' ? 0.80 : 0.35})`);
          grad.addColorStop(0.65, `rgba(255,255,255,${finish === 'chrome' ? 0.55 : 0.22})`);
          grad.addColorStop(1,    'rgba(255,255,255,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, size, size);
        }
      } else if (finish === 'standard') {
        // Subtle gloss gradient
        const grad = ctx.createLinearGradient(0, 0, 0, size);
        grad.addColorStop(0,   'rgba(255,255,255,0.18)');
        grad.addColorStop(0.4, 'rgba(255,255,255,0.06)');
        grad.addColorStop(1,   'rgba(0,0,0,0.12)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
      }
      // Matte: no highlight — plain diffuse only

      return _finish(key, canvas, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    });
  }

  /**
   * Tyre sidewall texture — dark rubber with raised lettering hint.
   * @param {number} [size=64]
   * @returns {THREE.CanvasTexture}
   */
  function makeTyre(size = 64) {
    return _cached(`tyre_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);
      const cx = size / 2, cy = size / 2, r = size * 0.46;

      // Rubber base
      const imgData = ctx.createImageData(size, size);
      const data    = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n  = _fbm(x/(size*0.1), y/(size*0.1), 3, 0.55);
          const v  = Math.round(18 + n * 14);
          const i  = (y * size + x) * 4;
          data[i] = data[i+1] = data[i+2] = v;
          data[i+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Tyre tread pattern around the rim
      ctx.strokeStyle = '#333333';
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#2A2A2A';
      ctx.lineWidth   = 1;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r * 0.70, cy + Math.sin(ang) * r * 0.70);
        ctx.lineTo(cx + Math.cos(ang) * r * 0.95, cy + Math.sin(ang) * r * 0.95);
        ctx.stroke();
      }

      return _finish(`tyre_${size}`, canvas);
    });
  }

  /**
   * Windscreen / car window glass — frosted translucent tint.
   * @param {number} [size=64]
   * @returns {THREE.CanvasTexture}
   */
  function makeWindowGlass(size = 64) {
    return _cached(`window_glass_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);

      ctx.fillStyle = 'rgba(160,190,220,0.55)';
      ctx.fillRect(0, 0, size, size);

      // Reflection streak
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0,   'rgba(255,255,255,0)');
      grad.addColorStop(0.42,'rgba(255,255,255,0.22)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.30)');
      grad.addColorStop(0.58,'rgba(255,255,255,0.22)');
      grad.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      return _finish(`window_glass_${size}`, canvas, {
        wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. NATURE TEXTURES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Tree bark texture — vertical dark streaks on brown base.
   * @param {number} [size=128]
   * @returns {THREE.CanvasTexture}
   */
  function makeTreeBark(size = 128) {
    return _cached(`treebark_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);

      // Base brown
      ctx.fillStyle = '#5C3D1E';
      ctx.fillRect(0, 0, size, size);

      // Vertical stripe noise
      const imgData = ctx.createImageData(size, size);
      const data    = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          // Elongated vertically
          const n  = _fbm(x / (size*0.08), y / (size*0.4), 5, 0.55);
          const v  = n * 70 - 20;
          const i  = (y * size + x) * 4;
          data[i]   = MathUtils.clamp(92  + v, 30, 160);
          data[i+1] = MathUtils.clamp(61  + v, 20, 110);
          data[i+2] = MathUtils.clamp(30  + v, 10,  70);
          data[i+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      return _finish(`treebark_${size}`, canvas);
    });
  }

  /**
   * Tree canopy / foliage texture — blotchy green.
   * @param {number} baseGreenHex
   * @param {number} [size=128]
   * @returns {THREE.CanvasTexture}
   */
  function makeTreeCanopy(baseGreenHex, size = 128) {
    const key = `canopy_${baseGreenHex}_${size}`;
    return _cached(key, () => {
      const { canvas, ctx } = _makeCanvas(size);
      const { r, g, b }     = MathUtils.hexToRgb(baseGreenHex);

      const imgData = ctx.createImageData(size, size);
      const data    = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n  = _fbm(x/(size*0.12), y/(size*0.12), 5, 0.5);
          const v  = (n - 0.5) * 50;
          const i  = (y * size + x) * 4;
          data[i]   = MathUtils.clamp(r + v, 10, 200);
          data[i+1] = MathUtils.clamp(g + v, 30, 230);
          data[i+2] = MathUtils.clamp(b + v,  5, 100);
          data[i+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      return _finish(key, canvas);
    });
  }

  /**
   * Animated water surface texture — overlapping sine-distorted rings.
   * Call makeWater(time) each frame and reassign to material.map for animation,
   * OR use it as a static base and animate via UV offset in the shader.
   *
   * @param {number} [time=0]   Animation time in seconds.
   * @param {number} [size=256]
   * @returns {THREE.CanvasTexture}
   */
  function makeWater(time = 0, size = 256) {
    // Water is NOT cached — it changes every frame.
    const { canvas, ctx } = _makeCanvas(size);

    // Deep water base
    ctx.fillStyle = '#1A6B9A';
    ctx.fillRect(0, 0, size, size);

    // Moving wave pattern
    const imgData = ctx.createImageData(size, size);
    const data    = imgData.data;
    const speed   = time * 1.4;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size, ny = y / size;
        const wave =
          Math.sin((nx * 8 + speed)        * Math.PI * 2) * 0.3 +
          Math.sin((ny * 6 + speed * 0.7)  * Math.PI * 2) * 0.25 +
          Math.sin((nx * 4 + ny * 4 + speed * 1.2) * Math.PI * 2) * 0.2 +
          _fbm(nx * 3 + speed * 0.2, ny * 3, 2) * 0.25;

        const n  = MathUtils.clamp((wave + 1) / 2, 0, 1);
        const i  = (y * size + x) * 4;
        data[i]   = Math.round(MathUtils.lerp(18,  90,  n));
        data[i+1] = Math.round(MathUtils.lerp(85,  160, n));
        data[i+2] = Math.round(MathUtils.lerp(130, 210, n));
        data[i+3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Highlight shimmer streaks
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 8; i++) {
      const sx  = (((i * 43 + time * 30) % size + size) % size);
      const sy  = (i / 8) * size;
      const len = 20 + Math.sin(time * 1.8 + i) * 12;
      const grad = ctx.createLinearGradient(sx, sy, sx + len, sy + len * 0.3);
      grad.addColorStop(0,   'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + len, sy + len * 0.3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. BRIDGE & STRUCTURE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Concrete bridge deck / surface — grey with expansion joint lines.
   * @param {number} [size=256]
   * @returns {THREE.CanvasTexture}
   */
  function makeConcrete(size = 256) {
    return _cached(`concrete_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);

      // Base
      const imgData = ctx.createImageData(size, size);
      const data    = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n  = _fbm(x/(size*0.12), y/(size*0.12), 4, 0.55);
          const v  = Math.round(145 + n * 45);
          const i  = (y * size + x) * 4;
          data[i]   = v;
          data[i+1] = v;
          data[i+2] = v - 5;
          data[i+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Expansion joints
      ctx.strokeStyle = 'rgba(80,80,80,0.55)';
      ctx.lineWidth   = 2;
      const joints = [0.25, 0.5, 0.75];
      for (const t of joints) {
        ctx.beginPath();
        ctx.moveTo(0, t * size);
        ctx.lineTo(size, t * size);
        ctx.stroke();
      }

      return _finish(`concrete_${size}`, canvas);
    });
  }

  /**
   * Steel texture — dark grey with vertical brush marks.
   * Used for suspension bridge towers and railings.
   * @param {number} [size=128]
   * @returns {THREE.CanvasTexture}
   */
  function makeSteel(size = 128) {
    return _cached(`steel_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);

      const imgData = ctx.createImageData(size, size);
      const data    = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          // Brushed-metal vertical streaks
          const n  = _fbm(x/(size*0.04), y/(size*0.8), 3, 0.6);
          const v  = Math.round(70 + n * 55);
          const i  = (y * size + x) * 4;
          data[i] = data[i+1] = data[i+2] = v;
          data[i+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Specular band
      const grad = ctx.createLinearGradient(0, 0, size, 0);
      grad.addColorStop(0,   'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
      grad.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      return _finish(`steel_${size}`, canvas);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9. UI / WORLD MARKER ICONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Draw a circular world-space icon (garage, dealer, race, taxi).
   *
   * @param {string} letter      Single character to render (G, D, R, T)
   * @param {string} bgColor     CSS fill for the circle
   * @param {string} [textColor='#FFFFFF']
   * @param {number} [size=128]
   * @returns {THREE.CanvasTexture}
   */
  function makeMarkerIcon(letter, bgColor, textColor = '#FFFFFF', size = 128) {
    const key = `marker_${letter}_${bgColor}_${size}`;
    return _cached(key, () => {
      const { canvas, ctx } = _makeCanvas(size);
      const cx = size / 2, cy = size / 2, r = size * 0.44;

      // Shadow
      ctx.shadowColor   = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur    = size * 0.08;
      ctx.shadowOffsetY = size * 0.04;

      // Outer ring
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = 'transparent';

      // Background circle
      const grad = ctx.createRadialGradient(cx - r*0.2, cy - r*0.25, 0, cx, cy, r);
      grad.addColorStop(0, MathUtils.hexToCss(MathUtils.lightenColor(MathUtils.cssToHex(bgColor), 0.25)));
      grad.addColorStop(1, bgColor);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Inner highlight ring
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
      ctx.stroke();

      // Letter
      ctx.fillStyle    = textColor;
      ctx.font         = `900 ${Math.round(size * 0.48)}px Orbitron, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, cx, cy + size * 0.02);

      return _finish(key, canvas, {
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
      });
    });
  }

  /** Garage marker — orange G. */
  function makeGarageIcon(size = 128) {
    return makeMarkerIcon('G', '#FF6600', '#FFFFFF', size);
  }

  /** Dealer marker — gold D. */
  function makeDealerIcon(size = 128) {
    return makeMarkerIcon('D', '#CCAA00', '#FFFFFF', size);
  }

  /** Race marker — red chequered-flag style. */
  function makeRaceIcon(size = 128) {
    const key = `race_icon_${size}`;
    return _cached(key, () => {
      const { canvas, ctx } = _makeCanvas(size);
      const cx = size/2, cy = size/2, r = size*0.44;

      // Red circle
      ctx.fillStyle = '#CC1111';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();

      // Mini chequered pattern
      const sq = size * 0.11;
      const ox = cx - sq * 1.5, oy = cy - sq * 1.5;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          ctx.fillStyle = (row + col) % 2 === 0 ? '#FFFFFF' : '#111111';
          ctx.fillRect(ox + col*sq, oy + row*sq, sq, sq);
        }
      }

      return _finish(key, canvas, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    });
  }

  /** Taxi marker — yellow T. */
  function makeTaxiIcon(size = 128) {
    return makeMarkerIcon('T', '#FFDD00', '#111111', size);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 10. UTILITY OVERLAYS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Skid mark texture — dark black tyre streak on transparent background.
   * Placed as a decal on the road surface.
   * @param {number} [size=256]
   * @returns {THREE.CanvasTexture}
   */
  function makeSkidMark(size = 256) {
    return _cached(`skidmark_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size / 6, size);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Two tyre tracks (left and right of tyre width)
      const laneW  = canvas.width;
      const trackW = laneW * 0.38;
      const trackX = [laneW * 0.08, laneW * 0.54];

      for (const tx of trackX) {
        const grad = ctx.createLinearGradient(0, 0, 0, size);
        grad.addColorStop(0,   'rgba(10,10,10,0)');
        grad.addColorStop(0.05,'rgba(10,10,10,0.7)');
        grad.addColorStop(0.8, 'rgba(10,10,10,0.5)');
        grad.addColorStop(1,   'rgba(10,10,10,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(tx, 0, trackW, size);
      }

      return _finish(`skidmark_${size}`, canvas, {
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.RepeatWrapping,
      });
    });
  }

  /**
   * Circular blob shadow for vehicles and objects.
   * @param {number} [size=128]
   * @returns {THREE.CanvasTexture}
   */
  function makeBlobShadow(size = 128) {
    return _cached(`blobshadow_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);

      ctx.clearRect(0, 0, size, size);

      const cx = size/2, cy = size/2;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size*0.48);
      grad.addColorStop(0,    'rgba(0,0,0,0.55)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.30)');
      grad.addColorStop(0.85, 'rgba(0,0,0,0.08)');
      grad.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, size*0.48, size*0.28, 0, 0, Math.PI*2);
      ctx.fill();

      return _finish(`blobshadow_${size}`, canvas, {
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
      });
    });
  }

  /**
   * Damage crack overlay — white jagged lines on transparent.
   * Placed on car geometry when damage > 70%.
   * @param {number} [size=128]
   * @returns {THREE.CanvasTexture}
   */
  function makeDamageCrack(size = 128) {
    return _cached(`crack_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);

      ctx.clearRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth   = 1;

      // Generate random crack branches from centre
      const rng = MathUtils.createRNG(55);
      function crack(x, y, angle, length, depth) {
        if (depth === 0 || length < 2) return;
        const ex = x + Math.cos(angle) * length;
        const ey = y + Math.sin(angle) * length;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const branches = depth > 1 ? 2 : 1;
        for (let i = 0; i < branches; i++) {
          const newAngle = angle + (rng() - 0.5) * 1.4;
          crack(ex, ey, newAngle, length * (0.5 + rng()*0.3), depth - 1);
        }
      }

      for (let i = 0; i < 4; i++) {
        const sx = size * (0.2 + rng() * 0.6);
        const sy = size * (0.2 + rng() * 0.6);
        crack(sx, sy, rng() * Math.PI * 2, size * 0.18, 4);
      }

      return _finish(`crack_${size}`, canvas, {
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
      });
    });
  }

  /**
   * Police siren light texture — alternating red/blue flash cells.
   * Mapped onto the light bar mesh.
   * @param {number} [size=64]
   * @returns {THREE.CanvasTexture}
   */
  function makeSirenLight(size = 64) {
    return _cached(`siren_${size}`, () => {
      const { canvas, ctx } = _makeCanvas(size);
      // Left half red, right half blue
      ctx.fillStyle = '#FF1111';
      ctx.fillRect(0, 0, size/2, size);
      ctx.fillStyle = '#1111FF';
      ctx.fillRect(size/2, 0, size/2, size);
      // Glow overlay
      const grad = ctx.createRadialGradient(size/4, size/2, 0, size/4, size/2, size/3);
      grad.addColorStop(0, 'rgba(255,255,255,0.6)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size/2, size);
      const grad2 = ctx.createRadialGradient(3*size/4, size/2, 0, 3*size/4, size/2, size/3);
      grad2.addColorStop(0, 'rgba(255,255,255,0.6)');
      grad2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(size/2, 0, size/2, size);

      return _finish(`siren_${size}`, canvas, {
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        nearest: true,
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 11. PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Dispose all cached textures and free GPU memory.
   * Call when switching scenes or on game exit.
   */
  function disposeAll() {
    _cache.forEach(tex => tex.dispose());
    _cache.clear();
  }

  /**
   * Returns current cache size (number of textures in memory).
   */
  function cacheSize() { return _cache.size; }

  return Object.freeze({
    // Road
    makeAsphalt,
    makeRoadMarkings,
    makeStopLine,
    makeKerb,

    // Ground / pavement
    makeSidewalk,
    makeGrass,
    makeDirt,

    // Buildings
    makeBuildingFacade,
    makeGlassFacade,
    makeRoof,
    makeBrick,

    // Vehicles
    makeCarPaint,
    makeTyre,
    makeWindowGlass,

    // Nature
    makeTreeBark,
    makeTreeCanopy,
    makeWater,         // not cached — call each frame for animation

    // Bridge / structure
    makeConcrete,
    makeSteel,

    // Markers
    makeMarkerIcon,
    makeGarageIcon,
    makeDealerIcon,
    makeRaceIcon,
    makeTaxiIcon,

    // Overlays
    makeSkidMark,
    makeBlobShadow,
    makeDamageCrack,
    makeSirenLight,

    // Cache management
    disposeAll,
    cacheSize,
  });

})();

if (typeof module !== 'undefined') module.exports = ProceduralTextures;
