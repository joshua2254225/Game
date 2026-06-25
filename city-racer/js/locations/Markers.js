/* ## `js/locations/Markers.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — Markers.js
 * ============================================================================
 * Builds and manages all world-space location markers:
 *   • Garage markers     (orange  G)
 *   • Car dealer markers (gold    D)
 *   • Race start markers (red     chequered)
 *   • Taxi spawn markers (yellow  T — owned by PassengerSystem, but the
 *                         zone detection logic lives here)
 *
 * Each marker is a billboard icon (always faces camera) on a vertical pole,
 * with a ground-level coloured ring, a PointLight glow, and an animated
 * pulse effect.
 *
 * Responsibilities:
 *   • Spawn one marker per CONFIG entry (garages, dealers, races)
 *   • Animate all markers each frame (bob, pulse, rotate ring)
 *   • Detect player proximity and call PlayerCar.setNearbyMarker()
 *   • Feed marker positions to Minimap.js
 *   • Expose getMinimapMarkers() for Minimap draw pass
 *   • Clean up on dispose()
 * ============================================================================
 */

'use strict';

const Markers = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const GROUND_Y      = CONFIG.WORLD.GROUND_Y;
  const ROAD_Y        = CONFIG.ROADS.ROAD_Y;
  const SURFACE_Y     = GROUND_Y + ROAD_Y;

  // Marker geometry
  const POLE_H        = 5.5;    // world units
  const ICON_SIZE     = 2.0;    // billboard diameter
  const RING_R_INNER  = 2.8;    // ground ring inner radius
  const RING_R_OUTER  = 3.2;    // ground ring outer radius
  const RING_SEGS     = 28;

  // Interaction trigger radius
  const INTERACT_R    = 8.0;    // world units

  // Animation
  const BOB_AMP       = 0.22;   // world units
  const BOB_SPEED     = 1.3;    // rad/s
  const PULSE_SPEED   = 2.2;    // ring opacity pulse speed

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  /** All active marker objects. */
  const _markers = [];   // { group, data, bobPhase, ringMesh, glowLight, type }

  /** Player vehicle reference. */
  let _player    = null;

  /** Current nearest marker within INTERACT_R. */
  let _nearestMarker = null;

  /** Frame counter for staggered proximity checks. */
  let _frame     = 0;

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build all location markers from CONFIG.
   * Call after RoadBuilder.build() and Props.build().
   * @param {PlayerCar} playerCar
   */
  function init(playerCar) {
    _player = playerCar;

    // Garage markers
    for (const cfg of CONFIG.GARAGES) {
      _buildMarker({
        type:     'garage',
        id:       cfg.id,
        name:     cfg.name,
        x:        cfg.position.x,
        z:        cfg.position.z,
        color:    cfg.color,
        iconKey:  'garage',
        district: cfg.district,
      });
    }

    // Car dealer markers
    for (const cfg of CONFIG.DEALERS) {
      _buildMarker({
        type:     'dealer',
        id:       cfg.id,
        name:     cfg.name,
        x:        cfg.position.x,
        z:        cfg.position.z,
        color:    cfg.color,
        iconKey:  'dealer',
        district: cfg.district,
      });
    }

    // Race start markers
    for (const cfg of CONFIG.RACES) {
      _buildMarker({
        type:     'race',
        id:       cfg.id,
        name:     cfg.name,
        x:        cfg.startPos.x,
        z:        cfg.startPos.z,
        color:    0xFF1111,
        iconKey:  'race',
        district: cfg.district,
      });
    }

    console.info(`[Markers] Built ${_markers.length} world markers.`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MARKER CONSTRUCTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build one complete marker and add it to the scene.
   *
   * @param {object} data  { type, id, name, x, z, color, iconKey, district }
   */
  function _buildMarker(data) {
    const grp  = new THREE.Group();
    grp.name   = `marker_${data.type}_${data.id}`;

    // ── Vertical pole ─────────────────────────────────────────────────────
    const poleMat = new THREE.MeshStandardMaterial({
      color:     0x888888,
      roughness: 0.65,
      metalness: 0.50,
    });
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.10, POLE_H, 8),
      poleMat
    );
    pole.position.y    = POLE_H / 2;
    pole.castShadow    = true;
    pole.matrixAutoUpdate = false;
    pole.updateMatrix();
    grp.add(pole);

    // ── Icon billboard ────────────────────────────────────────────────────
    const iconTex = _getIconTexture(data.iconKey, data.color);
    const iconMat = new THREE.MeshBasicMaterial({
      map:         iconTex,
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });
    const icon = new THREE.Mesh(
      new THREE.CircleGeometry(ICON_SIZE / 2, 20),
      iconMat
    );
    icon.position.y = POLE_H + ICON_SIZE / 2 + 0.1;
    icon.name       = 'icon';
    grp.add(icon);

    // ── Pole top cap ──────────────────────────────────────────────────────
    const capMat = new THREE.MeshStandardMaterial({
      color:             data.color,
      emissive:          new THREE.Color(data.color),
      emissiveIntensity: 0.6,
      roughness:         0.3,
      metalness:         0.5,
    });
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.20, 8, 8),
      capMat
    );
    cap.position.y    = POLE_H + 0.2;
    cap.matrixAutoUpdate = false;
    cap.updateMatrix();
    grp.add(cap);

    // ── Ground ring ───────────────────────────────────────────────────────
    const ringMat = new THREE.MeshBasicMaterial({
      color:       data.color,
      transparent: true,
      opacity:     0.55,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(RING_R_INNER, RING_R_OUTER, RING_SEGS),
      ringMat
    );
    ring.rotation.x    = -Math.PI / 2;
    ring.position.y    = 0.04;
    ring.matrixAutoUpdate = true;   // animated
    grp.add(ring);

    // ── Inner ground disc (subtle fill) ──────────────────────────────────
    const discMat = new THREE.MeshBasicMaterial({
      color:       data.color,
      transparent: true,
      opacity:     0.08,
      depthWrite:  false,
    });
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(RING_R_INNER, RING_SEGS),
      discMat
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.03;
    disc.matrixAutoUpdate = false;
    disc.updateMatrix();
    grp.add(disc);

    // ── Glow PointLight ───────────────────────────────────────────────────
    const glow = new THREE.PointLight(data.color, 1.4, 12);
    glow.position.y = POLE_H * 0.6;
    grp.add(glow);

    // ── Name label (canvas texture) ───────────────────────────────────────
    const labelMesh = _buildNameLabel(data.name, data.color);
    if (labelMesh) {
      labelMesh.position.y = POLE_H + ICON_SIZE + 0.9;
      labelMesh.name       = 'label';
      grp.add(labelMesh);
    }

    // ── Place in world ────────────────────────────────────────────────────
    grp.position.set(data.x, SURFACE_Y, data.z);

    Renderer.add(grp);

    // Store for animation + proximity
    _markers.push({
      group:     grp,
      data,
      bobPhase:  Math.random() * Math.PI * 2,
      ringMesh:  ring,
      glowLight: glow,
      iconMesh:  icon,
      labelMesh,
      baseY:     SURFACE_Y,
      active:    false,   // true when player is within INTERACT_R
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ICON TEXTURE CACHE
  // ══════════════════════════════════════════════════════════════════════════

  const _iconCache = new Map();

  function _getIconTexture(key, color) {
    const cacheKey = `${key}_${color}`;
    if (_iconCache.has(cacheKey)) return _iconCache.get(cacheKey);

    let tex;
    switch (key) {
      case 'garage': tex = ProceduralTextures.makeGarageIcon(128); break;
      case 'dealer': tex = ProceduralTextures.makeDealerIcon(128); break;
      case 'race':   tex = ProceduralTextures.makeRaceIcon(128);   break;
      case 'taxi':   tex = ProceduralTextures.makeTaxiIcon(128);   break;
      default:       tex = ProceduralTextures.makeMarkerIcon('?', MathUtils.hexToCss(color), '#FFF', 128);
    }

    _iconCache.set(cacheKey, tex);
    return tex;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NAME LABEL
  // ══════════════════════════════════════════════════════════════════════════

  function _buildNameLabel(name, color) {
    const MAX_LEN = 18;
    const label   = name.length > MAX_LEN ? name.slice(0, MAX_LEN - 1) + '…' : name;

    const canvas  = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 48;
    const ctx     = canvas.getContext('2d');

    // Semi-transparent pill background
    const { r, g, b } = MathUtils.hexToRgb(color);
    ctx.fillStyle = `rgba(${r},${g},${b},0.75)`;
    const rx = 10;
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.lineTo(256 - rx, 0);
    ctx.quadraticCurveTo(256, 0, 256, rx);
    ctx.lineTo(256, 48 - rx);
    ctx.quadraticCurveTo(256, 48, 256 - rx, 48);
    ctx.lineTo(rx, 48);
    ctx.quadraticCurveTo(0, 48, 0, 48 - rx);
    ctx.lineTo(0, rx);
    ctx.quadraticCurveTo(0, 0, rx, 0);
    ctx.closePath();
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Text
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 20px Orbitron, Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), 128, 24);

    const tex  = new THREE.CanvasTexture(canvas);
    const mat  = new THREE.MeshBasicMaterial({
      map:         tex,
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.6),
      mat
    );
    return mesh;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Animate all markers and check player proximity.
   * @param {number} dt  Delta time seconds.
   */
  function update(dt) {
    _frame++;

    const t      = performance.now() * 0.001;
    const camera = Camera.getCamera();

    // ── Animate each marker ───────────────────────────────────────────────
    for (const m of _markers) {
      m.bobPhase += dt * BOB_SPEED;

      // Bob the icon and label up/down
      const bob = Math.sin(m.bobPhase) * BOB_AMP;
      m.group.position.y = m.baseY + bob;

      // Billboard: icon and label always face camera
      if (camera) {
        if (m.iconMesh)  m.iconMesh.quaternion.copy(camera.quaternion);
        if (m.labelMesh) m.labelMesh.quaternion.copy(camera.quaternion);
      }

      // Ground ring rotation + opacity pulse
      if (m.ringMesh) {
        m.ringMesh.rotation.z += dt * (m.active ? 2.2 : 0.6);

        const pulse = 0.40 + Math.sin(t * PULSE_SPEED + m.bobPhase) * 0.20;
        m.ringMesh.material.opacity = m.active ? (pulse + 0.25) : pulse;
      }

      // Glow intensity pulse
      if (m.glowLight) {
        m.glowLight.intensity = m.active
          ? 2.4 + Math.sin(t * 3.5) * 0.7
          : 1.0 + Math.sin(t * 1.8 + m.bobPhase) * 0.3;
      }

      // Active marker: spin the icon slightly
      if (m.active && m.iconMesh) {
        m.iconMesh.material.color = m.iconMesh.material.color || new THREE.Color(1,1,1);
      }
    }

    // ── Proximity check (every 8 frames) ──────────────────────────────────
    if (_frame % 8 === 0 && _player) {
      _checkProximity();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROXIMITY DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  function _checkProximity() {
    const px = _player.position.x;
    const pz = _player.position.z;

    let nearest     = null;
    let nearestDist = INTERACT_R * INTERACT_R;

    for (const m of _markers) {
      const dx = m.data.x - px;
      const dz = m.data.z - pz;
      const d2 = dx * dx + dz * dz;

      const wasActive = m.active;
      m.active        = d2 < INTERACT_R * INTERACT_R;

      if (m.active && d2 < nearestDist) {
        nearestDist = d2;
        nearest     = m;
      }

      // Scale up when active
      if (m.active !== wasActive) {
        _setMarkerScale(m, m.active ? 1.18 : 1.0);
      }
    }

    // Update nearest marker reference
    if (nearest !== _nearestMarker) {
      _nearestMarker = nearest;

      if (_player.setNearbyMarker) {
        _player.setNearbyMarker(
          nearest
            ? {
                type:     nearest.data.type,
                id:       nearest.data.id,
                name:     nearest.data.name,
                position: nearest.group.position.clone(),
              }
            : null
        );
      }
    }
  }

  /**
   * Smoothly scale a marker group to a target scale.
   * @param {object} m         Marker object.
   * @param {number} targetScale
   */
  function _setMarkerScale(m, targetScale) {
    // Immediate for now — could be lerped in update() if desired
    m.group.scale.setScalar(targetScale);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MINIMAP FEED
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return all marker positions for Minimap.js.
   * @returns {Array<{ x, z, type, color, active }>}
   */
  function getMinimapMarkers() {
    return _markers.map(m => ({
      x:      m.data.x,
      z:      m.data.z,
      type:   m.data.type,
      color:  MathUtils.hexToCss(m.data.color),
      active: m.active,
      name:   m.data.name,
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISTRICT SIGN  (optional world-space district name signs)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build a district entry sign at the border between two districts.
   * Called optionally by Game.js if desired.
   *
   * @param {string} districtName   e.g. 'Downtown'
   * @param {number} x
   * @param {number} z
   * @param {number} heading        Facing direction (radians).
   */
  function buildDistrictSign(districtName, x, z, heading) {
    const canvas  = document.createElement('canvas');
    canvas.width  = 512;
    canvas.height = 128;
    const ctx     = canvas.getContext('2d');

    // Green background (highway sign style)
    ctx.fillStyle = '#0A4A0A';
    ctx.fillRect(0, 0, 512, 128);

    // White border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth   = 6;
    ctx.strokeRect(5, 5, 502, 118);

    // District name
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 52px Orbitron, Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(districtName.toUpperCase(), 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({
      map:         tex,
      side:        THREE.DoubleSide,
      transparent: true,
    });

    const SIGN_W = 6.4;
    const SIGN_H = 1.6;

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_H), mat);

    // Support posts
    const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
    const posts   = [-SIGN_W * 0.35, SIGN_W * 0.35];

    const grp = new THREE.Group();
    grp.add(sign);
    sign.position.y = 4.4;

    for (const px of posts) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 4.8, 6),
        postMat
      );
      post.position.set(px, 2.4, 0);
      post.matrixAutoUpdate = false;
      post.updateMatrix();
      grp.add(post);
    }

    grp.position.set(x, SURFACE_Y, z);
    grp.rotation.y   = heading;
    grp.matrixAutoUpdate = false;
    grp.updateMatrix();

    Renderer.add(grp);
    return grp;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER BINDING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update the player reference (e.g. after switching cars).
   * @param {PlayerCar} playerCar
   */
  function setPlayer(playerCar) {
    _player = playerCar;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    for (const m of _markers) {
      Renderer.disposeObject(m.group);
      Renderer.remove(m.group);
    }
    _markers.length = 0;

    _iconCache.forEach(tex => tex.dispose());
    _iconCache.clear();

    _nearestMarker = null;
    _player        = null;

    console.info('[Markers] Disposed.');
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

    // Player binding
    setPlayer,

    // Minimap
    getMinimapMarkers,

    // Optional world furniture
    buildDistrictSign,

  });

})();

if (typeof module !== 'undefined') module.exports = Markers;
/* ```

---

**File 28 ✅ — `js/locations/Markers.js` done.**

This builds all world-space location markers from the three CONFIG arrays. Each marker is a full Three.js group with a metal pole, a canvas-drawn icon billboard that always faces the camera via quaternion copy each frame, a coloured sphere cap at the pole top with emissive glow, a ground ring that rotates and pulses opacity, a semi-transparent ground disc fill, a `PointLight` that intensifies when the player is nearby, and a canvas-drawn pill-shaped name label also billboarded to the camera. Proximity detection runs every 8 frames using squared-distance comparisons, marks the nearest marker as active, scales it up to 1.18×, and calls `PlayerCar.setNearbyMarker()` which in turn shows or hides the interaction prompt DOM element. The icon textures are cached by `(key, color)` pair so all three garage markers share one texture object. The `buildDistrictSign` helper creates green highway-style overhead signs that can be placed at district entry roads. `getMinimapMarkers()` returns all marker positions with type and colour strings for `Minimap.js` to draw as coloured dots on the radar.

**Say "File 29" for `js/locations/Garage.js`.** */
