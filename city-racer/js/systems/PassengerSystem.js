/* ## `js/systems/PassengerSystem.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — PassengerSystem.js
 * ============================================================================
 * Manages the taxi / passenger mission loop.
 *
 * Responsibilities:
 *   • Spawn passenger pickup markers around the city at road-side positions
 *   • Show mission-accept popup when player drives near a waiting passenger
 *   • Track active trip: timer countdown, destination marker, distance
 *   • Award fare via EconomySystem on successful delivery
 *   • Cancel trip on timeout and penalise slightly
 *   • Limit simultaneous waiting passengers to CONFIG.PASSENGERS.MAX_ACTIVE
 *   • Animate passenger marker billboards (bobbing, glow pulse)
 *   • Taxi HUD panel updates (destination name, time bar, fare display)
 *   • Preset trips from CONFIG.PASSENGERS.PRESET_TRIPS
 *   • Procedurally generated trips from random road nodes
 *   • Passenger "impatience" — waiting passengers despawn after 90 seconds
 *   • Emit CustomEvents for Game.js state machine integration
 * ============================================================================
 */

'use strict';

const PassengerSystem = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const P_CFG          = CONFIG.PASSENGERS;
  const PICKUP_R       = P_CFG.PICKUP_RADIUS;     // 5 units
  const DROPOFF_R      = P_CFG.DROPOFF_RADIUS;    // 5 units
  const MAX_ACTIVE     = P_CFG.MAX_ACTIVE;         // 4
  const SPAWN_INTERVAL = P_CFG.SPAWN_INTERVAL;     // 25 seconds
  const PATIENCE       = 90;                       // seconds before passenger leaves

  // Marker visual sizes
  const MARKER_SIZE    = 1.8;   // world units — billboard diameter
  const MARKER_HEIGHT  = 3.0;   // world units above road surface

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  /** Waiting passengers (not yet picked up). */
  const _waiting  = [];   // PassengerMarker objects

  /** Current active trip (null when no trip in progress). */
  let _activTrip  = null;

  /** Player vehicle reference. */
  let _player     = null;

  /** Spawn timer. */
  let _spawnTimer = 0;

  /** Frame counter. */
  let _frame      = 0;

  /** Whether the passenger system is running. */
  let _running    = false;

  // ══════════════════════════════════════════════════════════════════════════
  // PASSENGER MARKER CLASS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Represents one waiting passenger in the world.
   * Owns its own Three.js billboard group.
   */
  class PassengerMarker {

    constructor(tripData) {
      this.trip        = tripData;   // { name, from:{x,z}, to:{x,z}, basePay, timeLimit, urgent }
      this.life        = PATIENCE;
      this.bobTime     = Math.random() * Math.PI * 2;
      this.id          = `pax_${Date.now()}_${(Math.random()*9999).toFixed(0)}`;

      this.group       = new THREE.Group();
      this.group.name  = `passenger_${this.id}`;

      this._buildMarker();

      this.group.position.set(
        tripData.from.x,
        CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y + MARKER_HEIGHT,
        tripData.from.z
      );
      Renderer.add(this.group);
    }

    _buildMarker() {
      // ── Vertical pole ─────────────────────────────────────────────────
      const poleMat = new THREE.MeshBasicMaterial({ color: 0xFFEE00 });
      const pole    = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, MARKER_HEIGHT, 6),
        poleMat
      );
      pole.position.y = -MARKER_HEIGHT / 2;
      this.group.add(pole);

      // ── Billboard disc ────────────────────────────────────────────────
      const canvas  = this._makeIcon();
      const tex     = new THREE.CanvasTexture(canvas);
      const discMat = new THREE.MeshBasicMaterial({
        map:         tex,
        transparent: true,
        depthWrite:  false,
        side:        THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(MARKER_SIZE / 2, 16),
        discMat
      );
      disc.name = 'disc';
      this.group.add(disc);

      // ── Glow PointLight ────────────────────────────────────────────────
      const glow = new THREE.PointLight(P_CFG.MARKER_COLOR, 1.2, 8);
      glow.position.y = 0.3;
      this.group.add(glow);
      this._glow = glow;

      // ── Urgency ring (urgent trips only) ──────────────────────────────
      if (this.trip.urgent) {
        const ringMat = new THREE.MeshBasicMaterial({
          color:       0xFF2200,
          transparent: true,
          opacity:     0.7,
          side:        THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(MARKER_SIZE * 0.6, MARKER_SIZE * 0.7, 16),
          ringMat
        );
        this.group.add(ring);
        this._ring = ring;
      }
    }

    _makeIcon() {
      const SIZE = 128;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      const ctx = canvas.getContext('2d');

      // Background circle
      ctx.fillStyle = this.trip.urgent ? '#FF3300' : '#FFEE00';
      ctx.beginPath();
      ctx.arc(SIZE/2, SIZE/2, SIZE/2 - 2, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 5;
      ctx.stroke();

      // Person icon (simple silhouette)
      ctx.fillStyle = '#111111';
      // Head
      ctx.beginPath();
      ctx.arc(SIZE/2, SIZE * 0.32, SIZE * 0.13, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.beginPath();
      ctx.moveTo(SIZE * 0.35, SIZE * 0.50);
      ctx.quadraticCurveTo(SIZE/2, SIZE * 0.75, SIZE * 0.65, SIZE * 0.50);
      ctx.quadraticCurveTo(SIZE/2, SIZE * 0.45, SIZE * 0.35, SIZE * 0.50);
      ctx.fill();

      // Fare label
      ctx.fillStyle = '#FFFFFF';
      ctx.font      = `bold ${SIZE * 0.18}px Orbitron, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(`$${this.trip.basePay}`, SIZE/2, SIZE * 0.93);

      return canvas;
    }

    /**
     * Animate the marker — bobbing, glow pulse, billboard facing.
     * @param {number} dt
     * @param {THREE.Camera} camera
     */
    update(dt, camera) {
      this.life    -= dt;
      this.bobTime += dt * 1.4;

      // Bob up and down
      this.group.position.y = CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y +
                               MARKER_HEIGHT + Math.sin(this.bobTime) * 0.25;

      // Billboard — always face the camera
      if (camera) {
        this.group.children.forEach(child => {
          if (child.name === 'disc') child.quaternion.copy(camera.quaternion);
        });
      }

      // Glow pulse
      if (this._glow) {
        this._glow.intensity = 0.9 + Math.sin(this.bobTime * 2) * 0.4;
      }

      // Urgency ring spin
      if (this._ring) {
        this._ring.rotation.z += dt * 2.5;
        this._ring.material.opacity = 0.5 + Math.sin(this.bobTime * 3) * 0.3;
      }

      // Fade out when patience low
      if (this.life < 8) {
        const fade = this.life / 8;
        this.group.traverse(child => {
          if (child.material) child.material.opacity =
            (child.material.opacity || 1) * fade;
        });
      }
    }

    isExpired()  { return this.life <= 0; }

    dispose() {
      Renderer.disposeObject(this.group);
      Renderer.remove(this.group);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DESTINATION MARKER
  // ══════════════════════════════════════════════════════════════════════════

  /** The active trip's destination marker. */
  let _destMarker = null;

  function _buildDestMarker(x, z) {
    _clearDestMarker();

    const grp  = new THREE.Group();
    grp.name   = 'destinationMarker';

    // Glowing green column of rings
    const ringMat = new THREE.MeshBasicMaterial({
      color:       P_CFG.DEST_COLOR,
      transparent: true,
      opacity:     0.75,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });

    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.4, 1.8, 18),
        ringMat.clone()
      );
      ring.rotation.x   = -Math.PI / 2;
      ring.position.y   = i * 1.2 + 0.1;
      ring.userData.idx = i;
      grp.add(ring);
    }

    // Central PointLight
    const light = new THREE.PointLight(P_CFG.DEST_COLOR, 2.0, 14);
    light.position.y = 2;
    grp.add(light);
    grp.userData.light = light;

    // Pillar beam
    const beamMat = new THREE.MeshBasicMaterial({
      color:       P_CFG.DEST_COLOR,
      transparent: true,
      opacity:     0.18,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 18, 8),
      beamMat
    );
    beam.position.y = 9;
    grp.add(beam);

    grp.position.set(x, CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y, z);
    Renderer.add(grp);

    _destMarker = grp;
  }

  function _clearDestMarker() {
    if (_destMarker) {
      Renderer.disposeObject(_destMarker);
      Renderer.remove(_destMarker);
      _destMarker = null;
    }
  }

  function _animateDestMarker(dt) {
    if (!_destMarker) return;

    _destMarker.children.forEach(child => {
      if (child.userData.idx !== undefined) {
        child.rotation.z += dt * (1.2 + child.userData.idx * 0.25);
        child.material.opacity = 0.55 + Math.sin(Date.now() * 0.003 + child.userData.idx) * 0.25;
        child.position.y = child.userData.idx * 1.2 +
                           0.2 + Math.sin(Date.now() * 0.002 + child.userData.idx * 1.5) * 0.3;
      }
    });

    if (_destMarker.userData.light) {
      _destMarker.userData.light.intensity = 1.6 + Math.sin(Date.now() * 0.004) * 0.6;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRIP DATA GENERATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Generate trip data for one passenger.
   * Randomly picks from preset trips or generates a random road-to-road trip.
   */
  function _generateTrip() {
    const usePreset = P_CFG.PRESET_TRIPS.length > 0 && Math.random() < 0.35;

    if (usePreset) {
      const preset = MathUtils.randPick(P_CFG.PRESET_TRIPS);
      const dist   = MathUtils.dist2D(preset.from, preset.to);
      const timeLimit = Math.round(dist / MathUtils.kmhToMs(CONFIG.TRAFFIC.BASE_SPEED) * P_CFG.TIME_LIMIT_MULT);

      return {
        name:      preset.name,
        from:      { ...preset.from },
        to:        { ...preset.to },
        basePay:   P_CFG.BASE_PAY + (preset.bonus || 0),
        timeLimit: Math.max(30, timeLimit),
        urgent:    preset.urgent || false,
        distUnits: dist,
      };
    }

    // Procedural: random road nodes
    const fromNode = CityMap.randomNode();
    const toNode   = fromNode ? CityMap.randomNode(fromNode.id) : null;

    if (!fromNode || !toNode) return null;

    const dist     = MathUtils.dist2D(fromNode, toNode);
    if (dist < 20) return null;   // too short

    const timeLimit = Math.round(
      dist / MathUtils.kmhToMs(CONFIG.TRAFFIC.BASE_SPEED) * P_CFG.TIME_LIMIT_MULT
    );

    const districtFrom = CityMap.getDistrictName(fromNode.x, fromNode.z);
    const districtTo   = CityMap.getDistrictName(toNode.x, toNode.z);

    return {
      name:      `${districtFrom} to ${districtTo}`,
      from:      { x: fromNode.x, z: fromNode.z },
      to:        { x: toNode.x,   z: toNode.z   },
      basePay:   P_CFG.BASE_PAY + Math.round(dist * 0.4),
      timeLimit: Math.max(30, timeLimit),
      urgent:    Math.random() < 0.12,
      distUnits: dist,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPAWN
  // ══════════════════════════════════════════════════════════════════════════

  function _trySpawn() {
    if (_waiting.length >= MAX_ACTIVE) return;

    const trip = _generateTrip();
    if (!trip) return;

    // Don't spawn on top of existing markers
    for (const w of _waiting) {
      if (MathUtils.dist2D(w.trip.from, trip.from) < 15) return;
    }

    const marker = new PassengerMarker(trip);
    _waiting.push(marker);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PICKUP DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  function _checkPickups() {
    if (!_player || _activTrip) return;   // already on a trip

    for (const marker of _waiting) {
      const dx = _player.position.x - marker.trip.from.x;
      const dz = _player.position.z - marker.trip.from.z;
      const d2 = dx * dx + dz * dz;

      if (d2 < PICKUP_R * PICKUP_R) {
        _showMissionPopup(marker);
        return;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MISSION POPUP
  // ══════════════════════════════════════════════════════════════════════════

  function _showMissionPopup(marker) {
    const trip = marker.trip;

    // Populate the mission accept screen
    const nameEl   = document.getElementById('mission-heading');
    const pickupEl = document.getElementById('mission-pickup');
    const destEl   = document.getElementById('mission-dest');
    const payEl    = document.getElementById('mission-base-pay');
    const bonusEl  = document.getElementById('mission-time-bonus');
    const distEl   = document.getElementById('mission-distance');

    if (nameEl)   nameEl.textContent  = trip.name;
    if (pickupEl) pickupEl.textContent = CityMap.getDistrictName(trip.from.x, trip.from.z);
    if (destEl)   destEl.textContent   = CityMap.getDistrictName(trip.to.x,   trip.to.z);
    if (payEl)    payEl.textContent    = `$${trip.basePay}`;
    if (bonusEl)  bonusEl.textContent  = `+$${P_CFG.TIME_BONUS_MAX}`;
    if (distEl)   distEl.textContent   = `${(trip.distUnits / 8).toFixed(1)} km`;

    // Show the screen
    window.dispatchEvent(new CustomEvent('cityracer:show_mission', {
      detail: {
        marker,
        onAccept:  () => _startTrip(marker),
        onDecline: () => {},
      }
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRIP START
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Begin an active trip after the player accepts the mission.
   * @param {PassengerMarker} marker
   */
  function startTrip(marker) {
    _startTrip(marker);
  }

  function _startTrip(marker) {
    // Remove from waiting list
    const idx = _waiting.indexOf(marker);
    if (idx !== -1) _waiting.splice(idx, 1);

    marker.dispose();

    const trip = marker.trip;

    _activTrip = {
      trip,
      timer:     trip.timeLimit,
      timeLimit: trip.timeLimit,
      started:   performance.now(),
    };

    // Build destination marker
    _buildDestMarker(trip.to.x, trip.to.z);

    // Update HUD
    _showTaxiHUD(trip);

    Notifications.toast('🚕', `Pick up: ${trip.name}`, 'money', 2.5);
    console.info(`[PassengerSystem] Trip started: ${trip.name}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTIVE TRIP UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  function _updateActiveTrip(dt) {
    if (!_activTrip) return;

    _activTrip.timer -= dt;

    // Update taxi HUD
    _updateTaxiHUD(_activTrip.timer, _activTrip.timeLimit);

    // Timer expired
    if (_activTrip.timer <= 0) {
      _tripFailed('Time ran out!');
      return;
    }

    // Check dropoff
    if (_player) {
      const dx = _player.position.x - _activTrip.trip.to.x;
      const dz = _player.position.z - _activTrip.trip.to.z;
      const d2 = dx * dx + dz * dz;

      if (d2 < DROPOFF_R * DROPOFF_R) {
        _tripComplete();
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRIP COMPLETE / FAIL
  // ══════════════════════════════════════════════════════════════════════════

  function _tripComplete() {
    const trip     = _activTrip.trip;
    const timeLeft = _activTrip.timer;

    // Award fare
    const result = EconomySystem.awardTaxiFare(
      trip.basePay,
      trip.distUnits,
      timeLeft,
      _activTrip.timeLimit
    );

    Notifications.toast(
      '✅',
      `Delivered! +$${result.total}`,
      'money',
      3.0
    );

    _clearDestMarker();
    _hideTaxiHUD();
    _activTrip = null;

    // Minimap update
    window.dispatchEvent(new CustomEvent('cityracer:trip_complete', {
      detail: result
    }));
  }

  function _tripFailed(reason) {
    Notifications.toast('❌', `Trip failed: ${reason}`, 'danger', 3.0);

    // Small penalty for wasting the passenger's time
    const penalty = Math.round(_activTrip.trip.basePay * 0.15);
    if (penalty > 0 && EconomySystem.getBalance() >= penalty) {
      // Soft penalty — only if player can afford it
      window.dispatchEvent(new CustomEvent('cityracer:trip_failed', {
        detail: { reason, penalty }
      }));
    }

    _clearDestMarker();
    _hideTaxiHUD();
    _activTrip = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAXI HUD
  // ══════════════════════════════════════════════════════════════════════════

  function _showTaxiHUD(trip) {
    const hud      = document.getElementById('taxi-hud');
    const nameEl   = document.getElementById('taxi-mission-name');
    const destEl   = document.getElementById('taxi-dest');
    const fareEl   = document.getElementById('taxi-fare');
    const fillEl   = document.getElementById('taxi-timer-fill');

    if (hud)    hud.classList.add('active');
    if (nameEl) nameEl.textContent = trip.name;
    if (destEl) destEl.textContent = CityMap.getDistrictName(trip.to.x, trip.to.z);
    if (fareEl) fareEl.textContent = String(trip.basePay + P_CFG.TIME_BONUS_MAX);
    if (fillEl) { fillEl.style.width = '100%'; fillEl.className = 'taxi-timer-fill'; }
  }

  function _updateTaxiHUD(timeRemaining, timeLimit) {
    const fillEl = document.getElementById('taxi-timer-fill');
    const fareEl = document.getElementById('taxi-fare');

    if (!fillEl || !_activTrip) return;

    const pct  = MathUtils.clamp(timeRemaining / timeLimit, 0, 1);
    fillEl.style.width = `${pct * 100}%`;

    const cls  = pct < 0.2 ? 'danger' : pct < 0.4 ? 'warn' : '';
    fillEl.className   = `taxi-timer-fill ${cls}`;

    // Update dynamic fare estimate
    if (fareEl) {
      const trip     = _activTrip.trip;
      const timePct  = timeLimit > 0 ? timeRemaining / timeLimit : 0;
      const estimate = trip.basePay +
                       Math.round(trip.distUnits * P_CFG.DISTANCE_BONUS) +
                       Math.round(P_CFG.TIME_BONUS_MAX * timePct);
      fareEl.textContent = String(estimate);
    }
  }

  function _hideTaxiHUD() {
    const hud = document.getElementById('taxi-hud');
    if (hud) hud.classList.remove('active');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MINIMAP MARKERS FEED
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return marker data for Minimap.js to draw on the radar.
   * @returns {Array<{ x:number, z:number, type:string, color:string }>}
   */
  function getMinimapMarkers() {
    const markers = [];

    // Waiting passengers
    for (const w of _waiting) {
      markers.push({
        x:     w.trip.from.x,
        z:     w.trip.from.z,
        type:  'taxi',
        color: MathUtils.hexToCss(P_CFG.MARKER_COLOR),
      });
    }

    // Active destination
    if (_activTrip) {
      markers.push({
        x:     _activTrip.trip.to.x,
        z:     _activTrip.trip.to.z,
        type:  'destination',
        color: MathUtils.hexToCss(P_CFG.DEST_COLOR),
      });
    }

    return markers;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {number} dt  Delta time seconds.
   */
  function update(dt) {
    if (!_running) return;
    _frame++;

    const camera = Camera.getCamera();

    // ── Spawn timer ───────────────────────────────────────────────────────
    _spawnTimer -= dt;
    if (_spawnTimer <= 0) {
      _spawnTimer = SPAWN_INTERVAL;
      _trySpawn();
    }

    // ── Update waiting markers ─────────────────────────────────────────────
    for (let i = _waiting.length - 1; i >= 0; i--) {
      const m = _waiting[i];
      m.update(dt, camera);

      if (m.isExpired()) {
        m.dispose();
        _waiting.splice(i, 1);
      }
    }

    // ── Pickup detection (every 6 frames) ──────────────────────────────────
    if (_frame % 6 === 0) _checkPickups();

    // ── Active trip ────────────────────────────────────────────────────────
    _updateActiveTrip(dt);

    // ── Destination marker animation ───────────────────────────────────────
    _animateDestMarker(dt);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise and begin spawning passengers.
   * @param {PlayerCar} playerCar
   */
  function init(playerCar) {
    _player     = playerCar;
    _running    = true;
    _spawnTimer = 5;   // first passenger appears after 5 seconds

    // Seed with a few waiting passengers immediately
    for (let i = 0; i < 2; i++) _trySpawn();

    console.info('[PassengerSystem] Initialised.');
  }

  /**
   * Pause / resume the passenger system.
   * @param {boolean} paused
   */
  function setPaused(paused) {
    _running = !paused;
  }

  function dispose() {
    for (const m of _waiting) m.dispose();
    _waiting.length = 0;

    _clearDestMarker();
    _hideTaxiHUD();
    _activTrip  = null;
    _player     = null;
    _running    = false;

    console.info('[PassengerSystem] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC GETTERS
  // ══════════════════════════════════════════════════════════════════════════

  function hasActiveTrip()      { return _activTrip !== null; }
  function getActiveTripTimer() { return _activTrip ? _activTrip.timer : 0; }
  function getWaitingCount()    { return _waiting.length; }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    dispose,
    setPaused,

    // Per-frame
    update,

    // Mission accept (called by MenuManager when player taps ACCEPT)
    startTrip,

    // Minimap
    getMinimapMarkers,

    // Getters
    hasActiveTrip,
    getActiveTripTimer,
    getWaitingCount,

  });

})();

if (typeof module !== 'undefined') module.exports = PassengerSystem;
/* ```

---

**File 26 ✅ — `js/systems/PassengerSystem.js` done.**

This handles the complete taxi mission loop. The `PassengerMarker` class builds its own Three.js group with a canvas-drawn icon showing the fare amount, a yellow PointLight that pulses, a bobbing animation that uses a randomised phase offset so markers don't all bob in sync, and a red urgency ring that spins for urgent trips. The destination marker builds four stacked ring meshes that rotate at slightly different speeds and bob at different phases, plus a vertical semi-transparent beam cylinder so the target is visible from a distance. Trip generation mixes 35% preset trips from `CONFIG.PASSENGERS.PRESET_TRIPS` with 65% procedurally generated trips using random road nodes from `CityMap`, filters out trips shorter than 20 world units, and computes a time limit from the distance divided by average traffic speed multiplied by `TIME_LIMIT_MULT`. Pickup and dropoff use squared-distance comparisons checked every 6 frames. The taxi HUD dynamically updates the fare estimate every frame based on remaining time so the player can see the bonus draining in real time. Mission accept fires a `CustomEvent` that `MenuManager` intercepts to show the popup, and `startTrip` is exposed publicly so `MenuManager` can call it when the player taps the accept button.

**Say "File 27" for `js/systems/RaceSystem.js`.** */
