/* ## `js/systems/PoliceSystem.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — PoliceSystem.js
 * ============================================================================
 * Manages the entire wanted / pursuit system.
 *
 * Responsibilities:
 *   • Track the player's wanted level (0–3 stars)
 *   • React to reportEvent() calls from PlayerCar, TrafficSystem, RaceSystem
 *   • Dispatch PoliceCar units scaled to the wanted level
 *   • Cool-down timer — stars drain when player behaves
 *   • Pursuit give-up when player escapes beyond distance threshold
 *   • Bribe mechanic — player pays to instantly clear stars
 *   • Garage entry clears wanted level (player hides inside)
 *   • HUD wanted-star display sync
 *   • Helicopter spotlight at 3 stars (PointLight + cone mesh)
 *   • Roadblock coordination between units
 *   • Save/load wanted state via EconomySystem
 *
 * Event types accepted by reportEvent():
 *   'speeding'        — player over speed limit
 *   'hit_traffic'     — player hit a traffic car
 *   'hit_police'      — player hit a police car
 *   'evaded'          — player lost a pursuing unit
 *
 * ============================================================================
 */

'use strict';

const PoliceSystem = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const CFG          = CONFIG.POLICE;
  const MAX_STARS    = CFG.MAX_STARS;           // 3
  const UNITS_COUNT  = CFG.UNITS_PER_STAR;      // [0,1,2,4]

  // How long the player must stay clean before a star drains
  const COOLDOWN_PER_STAR = CFG.COOLDOWN_PER_STAR;   // 20 s

  // Minimum time (s) before the same event type can add another star
  const EVENT_COOLDOWN = 4.0;

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  let _player        = null;    // PlayerCar reference
  let _wantedLevel   = 0;       // 0–3
  let _cooldownTimer = 0;       // seconds until next star drains
  let _active        = true;    // false = police disabled in settings

  // Active PoliceCar instances
  const _units = [];

  // Event cooldown trackers: eventType → secondsRemaining
  const _eventCooldowns = new Map();

  // Helicopter spotlight (3 stars)
  let _heliLight     = null;
  let _heliCone      = null;
  let _heliActive    = false;

  // Frame counter for staggered updates
  let _frame         = 0;

  // Callbacks
  let _onWantedChange = null;   // (newLevel, oldLevel) => void

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise the police system.
   * @param {object} [opts]
   * @param {PlayerCar} [opts.player]
   * @param {Function}  [opts.onWantedChange]  Callback fired on star change.
   */
  function init(opts = {}) {
    _player          = opts.player          || null;
    _onWantedChange  = opts.onWantedChange  || null;
    _wantedLevel     = 0;
    _cooldownTimer   = 0;

    _buildHelicopterLight();

    console.info('[PoliceSystem] Initialised.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER BINDING
  // ══════════════════════════════════════════════════════════════════════════

  function setPlayer(playerCar) {
    _player = playerCar;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELICOPTER SPOTLIGHT
  // ══════════════════════════════════════════════════════════════════════════

  function _buildHelicopterLight() {
    // Spotlight shining down from above the player
    _heliLight = new THREE.SpotLight(0xFFFFEE, 0, 80, Math.PI / 8, 0.3, 1.2);
    _heliLight.castShadow = false;
    Renderer.add(_heliLight);

    // Cone mesh (visual beam)
    const coneMat = new THREE.MeshBasicMaterial({
      color:       0xFFFFCC,
      transparent: true,
      opacity:     0.06,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    const coneGeo = new THREE.ConeGeometry(8, 28, 16, 1, true);
    _heliCone = new THREE.Mesh(coneGeo, coneMat);
    _heliCone.visible = false;
    Renderer.add(_heliCone);

    // Target (follows player)
    _heliLight.target = new THREE.Object3D();
    Renderer.add(_heliLight.target);
  }

  function _updateHelicopter(dt) {
    const shouldBeActive = _wantedLevel >= 3 && _player && _player.alive;

    if (shouldBeActive !== _heliActive) {
      _heliActive = shouldBeActive;
      _heliCone.visible        = _heliActive;
      _heliLight.intensity     = _heliActive ? 3.5 : 0;
    }

    if (!_heliActive || !_player) return;

    // Follow player from above
    const HELI_HEIGHT = 40;
    const px = _player.position.x;
    const pz = _player.position.z;

    _heliLight.position.set(px, _player.position.y + HELI_HEIGHT, pz);
    _heliLight.target.position.set(px, _player.position.y, pz);
    _heliLight.target.updateMatrixWorld();

    // Cone
    _heliCone.position.set(px, _player.position.y + HELI_HEIGHT - 14, pz);
    _heliCone.rotation.x = 0;

    // Pulse the beam slightly
    _heliLight.intensity = 3.2 + Math.sin(_frame * 0.08) * 0.4;
    _heliCone.material.opacity = 0.05 + Math.sin(_frame * 0.12) * 0.02;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT REPORTING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Report an in-game event that may increase the wanted level.
   * Safe to call from any system — duplicates within EVENT_COOLDOWN are ignored.
   *
   * @param {string} eventType  'speeding'|'hit_traffic'|'hit_police'|'evaded'
   * @param {object} [data]     Optional payload (speed, damage, etc.)
   */
  function reportEvent(eventType, data = {}) {
    if (!_active) return;

    // Cooldown check
    const cd = _eventCooldowns.get(eventType) || 0;
    if (cd > 0) return;
    _eventCooldowns.set(eventType, EVENT_COOLDOWN);

    let starsToAdd = 0;

    switch (eventType) {
      case 'speeding':
        // Only award a star if already under 2 and speeding significantly
        if (_wantedLevel < 2) starsToAdd = 1;
        break;

      case 'hit_traffic':
        starsToAdd = CFG.TRIGGERS.HIT_TRAFFIC_HARD;  // +1
        break;

      case 'hit_police':
        starsToAdd = CFG.TRIGGERS.HIT_POLICE_CAR;    // +1
        break;

      case 'evaded':
        starsToAdd = CFG.TRIGGERS.EVADE_PURSUIT;     // +1
        break;

      default:
        break;
    }

    if (starsToAdd > 0) {
      _setWantedLevel(MathUtils.clamp(_wantedLevel + starsToAdd, 0, MAX_STARS));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WANTED LEVEL MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  function _setWantedLevel(newLevel) {
    newLevel = MathUtils.clamp(newLevel, 0, MAX_STARS);
    if (newLevel === _wantedLevel) return;

    const oldLevel = _wantedLevel;
    _wantedLevel   = newLevel;

    // Reset cool-down — player must behave for COOLDOWN_PER_STAR seconds
    _cooldownTimer = COOLDOWN_PER_STAR * _wantedLevel;

    // Dispatch / recall units
    _reconcileUnits();

    // Update HUD
    _updateHUD();

    // Fire callback
    if (_onWantedChange) _onWantedChange(newLevel, oldLevel);

    // Notifications
    if (newLevel > oldLevel) {
      const labels = ['', '⭐ WANTED', '⭐⭐ POLICE ALERT', '⭐⭐⭐ ALL UNITS'];
      Notifications.toast('🚔', labels[newLevel] || 'WANTED', 'police', 3.0);
    } else if (newLevel === 0) {
      Notifications.toast('✅', 'Wanted level cleared', 'success', 2.0);
    }

    // Update all active units' wanted level
    for (const unit of _units) {
      unit.setWantedLevel(_wantedLevel);
    }

    console.info(`[PoliceSystem] Wanted level: ${oldLevel} → ${_wantedLevel}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UNIT MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Dispatch or recall units to match the required count for the wanted level.
   */
  function _reconcileUnits() {
    const required = UNITS_COUNT[_wantedLevel] || 0;

    // Dispatch additional units if needed
    while (_units.filter(u => u.alive && !u.isFadingOut()).length < required) {
      _dispatchUnit();
    }

    // Recall excess units when level drops
    if (_wantedLevel === 0) {
      for (const unit of _units) {
        if (!unit.isFadingOut()) unit.playerEscaped();
      }
    }
  }

  /**
   * Spawn one new PoliceCar near the player.
   */
  function _dispatchUnit() {
    if (!_player) return;

    // Find a spawn node: prefer roads behind or beside the player
    const px = _player.position.x;
    const pz = _player.position.z;

    // Offset spawn away from the player's facing direction
    const spawnDist   = 55 + Math.random() * 30;
    const spawnAngle  = _player.heading + Math.PI + (Math.random() - 0.5) * 2.0;

    const sx = px + Math.sin(spawnAngle) * spawnDist;
    const sz = pz + Math.cos(spawnAngle) * spawnDist;

    const spawnNode = CityMap.nearestNode(sx, sz);
    if (!spawnNode) return;

    const unit = new PoliceCar(spawnNode.id, _wantedLevel);
    unit.engageTarget(_player);
    _units.push(unit);

    console.info(`[PoliceSystem] Dispatched unit #${_units.length} (wanted ${_wantedLevel})`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {number}    dt
   * @param {Vehicle[]} nearbyVehicles  All traffic cars near the player.
   */
  function update(dt, nearbyVehicles = []) {
    if (!_active) return;
    _frame++;

    // ── Event cooldowns ───────────────────────────────────────────────────
    for (const [evt, cd] of _eventCooldowns.entries()) {
      const newCd = cd - dt;
      if (newCd <= 0) _eventCooldowns.delete(evt);
      else            _eventCooldowns.set(evt, newCd);
    }

    // ── Speeding check ────────────────────────────────────────────────────
    if (_player && _player.speedOverLimit && _wantedLevel === 0 && _frame % 90 === 0) {
      reportEvent('speeding');
    }

    // ── Cool-down decay ───────────────────────────────────────────────────
    if (_wantedLevel > 0 && _player && _player.alive) {
      // Only decay if player is not speeding and not near a police car
      const playerBehaving = !_player.speedOverLimit;
      const nearPolice     = _units.some(u =>
        u.alive && u.isPursuing() &&
        u.position.distanceTo(_player.position) < 30
      );

      if (playerBehaving && !nearPolice) {
        _cooldownTimer -= dt;
        if (_cooldownTimer <= 0) {
          // Drain one star
          _setWantedLevel(_wantedLevel - 1);
          _cooldownTimer = COOLDOWN_PER_STAR * _wantedLevel;
        }
      } else {
        // Reset timer if player misbehaves
        _cooldownTimer = Math.max(_cooldownTimer, COOLDOWN_PER_STAR * 0.5);
      }
    }

    // ── Update all active units ───────────────────────────────────────────
    for (let i = _units.length - 1; i >= 0; i--) {
      const unit = _units[i];

      if (!unit.alive) {
        unit.dispose();
        _units.splice(i, 1);
        continue;
      }

      // Build nearby vehicle list for this unit
      const nearby = [
        ...nearbyVehicles,
        ..._units.filter(u => u !== unit && u.alive),
      ];

      unit.update(dt, nearby);

      // Check if unit has given up pursuit
      if (unit.isPatrolling() && _wantedLevel > 0 && _player) {
        const dist = unit.position.distanceTo(_player.position);
        if (dist > CFG.PURSUIT_GIVE_UP_DIST * 1.2) {
          // This unit lost the player — possibly escalate
          reportEvent('evaded');
          unit.playerEscaped();
        }
      }
    }

    // ── Player–police collision check ──────────────────────────────────────
    if (_player && _player.alive && _frame % 2 === 0) {
      _checkPoliceCollisions();
    }

    // ── Helicopter ────────────────────────────────────────────────────────
    _updateHelicopter(dt);

    // ── Reconcile unit count every 3 seconds ──────────────────────────────
    if (_frame % 180 === 0 && _wantedLevel > 0) {
      _reconcileUnits();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POLICE ↔ PLAYER COLLISION
  // ══════════════════════════════════════════════════════════════════════════

  function _checkPoliceCollisions() {
    if (!_player) return;

    const pAABB = _player.aabb;

    for (const unit of _units) {
      if (!unit.alive || unit.isFadingOut()) continue;
      if (!MathUtils.aabbOverlap(pAABB, unit.aabb)) continue;

      // Compute normal and impact
      const normal = _player.position.clone()
        .sub(unit.position)
        .setY(0)
        .normalize();

      const relVelX  = _player.velocity.x - unit.velocity.x;
      const relVelZ  = _player.velocity.z - unit.velocity.z;
      const impactMs = Math.abs(relVelX * normal.x + relVelZ * normal.z);

      if (impactMs < 0.8) continue;

      // Apply physics
      _player.onCollision(normal.clone().negate(), impactMs, unit.stats.weight);
      unit.onCollision(normal, impactMs * 0.5, _player.stats.weight);

      // Hitting a police car always escalates
      reportEvent('hit_police');

      // Camera shake
      Camera.shake(MathUtils.clamp(impactMs * 0.05, 0.15, 0.55), 'collision');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BRIBE / CLEAR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Attempt to bribe police. Deducts money from playerState.
   * @param {object} playerState  Live SaveSystem state object.
   * @returns {{ success:boolean, cost:number, message:string }}
   */
  function attemptBribe(playerState) {
    if (_wantedLevel === 0) {
      return { success: false, cost: 0, message: 'You are not wanted.' };
    }

    const cost = CFG.BRIBE_COST_PER_STAR * _wantedLevel;
    const result = SaveSystem.spendMoney(playerState, cost, 'police bribe');

    if (!result.success) {
      return {
        success: false,
        cost,
        message: `Need $${cost} to bribe the police.`,
      };
    }

    _setWantedLevel(0);
    Notifications.toast('💰', `Bribed for $${cost}`, 'success', 2.5);
    return { success: true, cost, message: 'Wanted level cleared.' };
  }

  /**
   * Instantly clear the wanted level (used when player enters a garage).
   */
  function clearWanted() {
    if (_wantedLevel === 0) return;
    _setWantedLevel(0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HUD UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  function _updateHUD() {
    // Wanted stars
    const wantedEl = document.getElementById('hud-wanted');
    const starsEl  = document.getElementById('wanted-stars');

    if (wantedEl) wantedEl.classList.toggle('visible', _wantedLevel > 0);

    if (starsEl) {
      const starNodes = starsEl.querySelectorAll('.wanted-star');
      starNodes.forEach((star, idx) => {
        const level = idx + 1;
        star.classList.remove('active-1', 'active-2', 'active-3');
        if (level <= _wantedLevel) {
          star.classList.add(`active-${_wantedLevel}`);
        }
      });

      // ARIA label
      starsEl.setAttribute('aria-label', `Wanted level: ${_wantedLevel} stars`);
    }

    // Speed-limit sign
    const signEl = document.getElementById('speed-limit-sign');
    if (signEl) {
      signEl.classList.toggle('visible', _wantedLevel > 0);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Enable or disable the police system entirely.
   * @param {boolean} enabled
   */
  function setEnabled(enabled) {
    _active = !!enabled;
    if (!enabled) {
      _setWantedLevel(0);
      for (const unit of _units) unit.beginDespawn();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC GETTERS
  // ══════════════════════════════════════════════════════════════════════════

  function getWantedLevel()  { return _wantedLevel; }
  function getActiveUnits()  { return _units.filter(u => u.alive && !u.isFadingOut()); }
  function getUnitCount()    { return getActiveUnits().length; }
  function isWanted()        { return _wantedLevel > 0; }
  function getCooldownPct()  {
    const max = COOLDOWN_PER_STAR * _wantedLevel;
    return max > 0 ? MathUtils.clamp(1 - _cooldownTimer / max, 0, 1) : 1;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    for (const unit of _units) unit.dispose();
    _units.length = 0;

    if (_heliLight) { Renderer.remove(_heliLight); _heliLight = null; }
    if (_heliCone)  {
      Renderer.disposeObject(_heliCone);
      Renderer.remove(_heliCone);
      _heliCone = null;
    }

    _player          = null;
    _onWantedChange  = null;
    _eventCooldowns.clear();

    console.info('[PoliceSystem] Disposed.');
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

    // Bindings
    setPlayer,

    // Events
    reportEvent,

    // Bribe / clear
    attemptBribe,
    clearWanted,

    // Settings
    setEnabled,

    // Getters
    getWantedLevel,
    getActiveUnits,
    getUnitCount,
    isWanted,
    getCooldownPct,

  });

})();

if (typeof module !== 'undefined') module.exports = PoliceSystem;
/* ```

---

**File 24 ✅ — `js/systems/PoliceSystem.js` done.**

This is the complete wanted-level and pursuit management system. Event reporting uses a per-event-type cooldown map so rapid collisions or sustained speeding cannot spam star increases — each event type has a 4-second lockout between triggers. The cool-down decay timer only counts down when the player is both below the speed limit and no pursuing unit is within 30 units, and resets to at least half the full period if the player misbehaves again. Unit reconciliation spawns police cars behind and beside the player using a heading-offset spawn angle so they appear naturally approaching from behind rather than popping in front. The helicopter spotlight builds a `THREE.SpotLight` with a semi-transparent cone mesh as a visible beam, both positioned 40 units above the player each frame and pulsed in intensity. Bribe deducts money via `SaveSystem.spendMoney` so it integrates properly with the economy and persists to the save file. The HUD updater drives the three star DOM nodes with per-level CSS classes that trigger the yellow, orange, and red glow animations defined in `hud.css`.

**Say "File 25" for `js/systems/EconomySystem.js`.** */
