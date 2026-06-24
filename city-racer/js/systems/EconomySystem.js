/* ## `js/systems/EconomySystem.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — EconomySystem.js
 * ============================================================================
 * Central hub for all money flow, progression, and session statistics.
 * Wraps SaveSystem's raw transaction functions with game-logic rules,
 * animated HUD feedback, and event notifications.
 *
 * Responsibilities:
 *   • Award race prizes with placement multipliers
 *   • Award taxi fares with time-bonus calculation
 *   • Deduct repair, upgrade, paint, and purchase costs
 *   • Animated money counter on the HUD (+/- delta popups)
 *   • Session statistics tracking (races won, passengers, distance)
 *   • XP / prestige level system (cosmetic — unlocks paint colours)
 *   • Stunt bonus system (air-time, near-miss, drift distance)
 *   • Leaderboard snapshot for the pause-screen stats panel
 *   • Auto-save trigger after every significant transaction
 * ============================================================================
 */

'use strict';

const EconomySystem = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  // XP per activity
  const XP_PER_RACE_WIN     = 150;
  const XP_PER_RACE_FINISH  = 40;
  const XP_PER_PASSENGER    = 25;
  const XP_PER_STUNT        = 10;
  const XP_PER_KM           = 2;

  // XP required to reach each prestige level (index = level)
  const XP_THRESHOLDS = [
    0,      // level 0 — starting
    300,    // level 1
    750,    // level 2
    1500,   // level 3
    2800,   // level 4
    4500,   // level 5
    7000,   // level 6
    10000,  // level 7
    14000,  // level 8
    20000,  // level 9
    30000,  // level 10 — max
  ];

  // Stunt bonus thresholds
  const STUNT_NEAR_MISS_DIST = 2.0;   // world units — gap to traffic car
  const STUNT_MIN_DRIFT_DIST = 12;    // metres of drift before counting
  const STUNT_MIN_AIR_TIME   = 0.8;   // seconds of air for a bonus

  // Money HUD animation
  const MONEY_ROLL_SPEED = 800;   // $ per second for counter roll
  const DELTA_POPUP_LIFE = 2.2;   // seconds before delta fades

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  // Live reference to the player state (loaded from SaveSystem each session)
  let _playerState   = null;

  // Displayed money (animated toward _playerState.money)
  let _displayMoney  = 0;

  // Active delta popups: [{ amount, element, life }]
  const _deltas      = [];

  // Session stats (reset each play session — not persisted mid-session)
  const _session = {
    racesWon:        0,
    racesEntered:    0,
    passengersDelivered: 0,
    faresEarned:     0,
    distanceKm:      0,
    stuntsPerformed: 0,
    stuntBonusTotal: 0,
    topSpeedKmh:     0,
    collisions:      0,
    wantedEvents:    0,
    xpEarned:        0,
  };

  // XP state (loaded from playerState on init)
  let _xp            = 0;
  let _level         = 0;

  // Stunt tracking
  const _stunt = {
    driftDist:    0,
    driftActive:  false,
    airTime:      0,
    nearMissCd:   0,   // cooldown so one pass = one bonus
  };

  // Auto-save timer
  let _autoSaveTimer = 0;

  // Callback: fires after any money change
  let _onMoneyChange = null;
  let _onLevelUp     = null;

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise the economy system with the current player state.
   * Call after loading a save slot.
   *
   * @param {object}   playerState    Live state from SaveSystem.loadSlot().
   * @param {object}   [opts]
   * @param {Function} [opts.onMoneyChange]  (newBalance, delta) => void
   * @param {Function} [opts.onLevelUp]      (newLevel) => void
   */
  function init(playerState, opts = {}) {
    _playerState   = playerState;
    _displayMoney  = playerState.money;
    _xp            = playerState.xpTotal   || 0;
    _level         = _calcLevel(_xp);
    _onMoneyChange = opts.onMoneyChange    || null;
    _onLevelUp     = opts.onLevelUp        || null;

    // Restore session totals from playerState where available
    _session.racesWon             = playerState.racesWon            || 0;
    _session.passengersDelivered  = playerState.totalPassengers      || 0;
    _session.faresEarned          = playerState.totalFaresEarned     || 0;
    _session.distanceKm           = (playerState.distanceDriven || 0) / 1000;
    _session.topSpeedKmh          = playerState.topSpeedReached      || 0;

    // Sync HUD immediately
    _syncMoneyHUD(true);

    console.info(
      `[EconomySystem] Init. Balance: $${playerState.money} | ` +
      `XP: ${_xp} | Level: ${_level}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Animate money counter, tick stunt trackers, update delta popups.
   * Call every frame from Game.js.
   *
   * @param {number} dt          Delta time seconds.
   * @param {object} drivingData Optional live driving stats this frame:
   *                             { speedKmh, isDrifting, driftDeltaM,
   *                               isAirborne, airTime, nearbyTrafficDist }
   */
  function update(dt, drivingData = {}) {
    if (!_playerState) return;

    // ── Animate displayed money ───────────────────────────────────────────
    if (_displayMoney !== _playerState.money) {
      const diff    = _playerState.money - _displayMoney;
      const step    = Math.sign(diff) * Math.min(Math.abs(diff), MONEY_ROLL_SPEED * dt);
      _displayMoney += step;
      if (Math.abs(_playerState.money - _displayMoney) < 1) {
        _displayMoney = _playerState.money;
      }
      _syncMoneyHUD(false);
    }

    // ── Delta popups lifetime ─────────────────────────────────────────────
    for (let i = _deltas.length - 1; i >= 0; i--) {
      const d = _deltas[i];
      d.life -= dt;
      if (d.life <= 0) {
        if (d.element && d.element.parentNode) {
          d.element.parentNode.removeChild(d.element);
        }
        _deltas.splice(i, 1);
      } else {
        // Drift upward
        const progress = 1 - d.life / DELTA_POPUP_LIFE;
        const opacity  = MathUtils.clamp(d.life / DELTA_POPUP_LIFE * 2, 0, 1);
        if (d.element) {
          d.element.style.opacity   = opacity;
          d.element.style.transform = `translateY(${-progress * 48}px)`;
        }
      }
    }

    // ── Stunt tracking ────────────────────────────────────────────────────
    _updateStunts(dt, drivingData);

    // ── Session distance ──────────────────────────────────────────────────
    if (drivingData.speedKmh !== undefined) {
      const dKm = MathUtils.kmhToMs(Math.abs(drivingData.speedKmh)) * dt / 1000;
      _session.distanceKm += dKm;

      if (drivingData.speedKmh > _session.topSpeedKmh) {
        _session.topSpeedKmh = drivingData.speedKmh;
      }
    }

    // ── Auto-save ─────────────────────────────────────────────────────────
    _autoSaveTimer += dt;
    if (_autoSaveTimer >= CONFIG.SAVE.AUTO_SAVE_INTERVAL) {
      _autoSaveTimer = 0;
      _flushToPlayerState();
      SaveSystem.quickSave(_playerState);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STUNT SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  function _updateStunts(dt, data) {
    if (!_playerState) return;

    // ── Near-miss ─────────────────────────────────────────────────────────
    if (_stunt.nearMissCd > 0) {
      _stunt.nearMissCd -= dt;
    } else if (
      data.nearbyTrafficDist !== undefined &&
      data.nearbyTrafficDist > 0 &&
      data.nearbyTrafficDist < STUNT_NEAR_MISS_DIST &&
      Math.abs(data.speedKmh || 0) > 40
    ) {
      _stunt.nearMissCd = 3.0;   // 3-second cooldown
      _awardStuntBonus('Near Miss!', 80);
    }

    // ── Air time ──────────────────────────────────────────────────────────
    if (data.isAirborne) {
      _stunt.airTime += dt;
    } else if (_stunt.airTime > 0) {
      if (_stunt.airTime >= STUNT_MIN_AIR_TIME) {
        const bonus = Math.round(_stunt.airTime * 60);
        _awardStuntBonus(`Air Time ${_stunt.airTime.toFixed(1)}s!`, bonus);
      }
      _stunt.airTime = 0;
    }

    // ── Drift distance ────────────────────────────────────────────────────
    if (data.isDrifting) {
      _stunt.driftActive = true;
      _stunt.driftDist  += MathUtils.kmhToMs(Math.abs(data.speedKmh || 0)) * dt;
    } else if (_stunt.driftActive) {
      _stunt.driftActive = false;
      if (_stunt.driftDist >= STUNT_MIN_DRIFT_DIST) {
        const bonus = Math.round(_stunt.driftDist * 8);
        _awardStuntBonus(`Drift ${_stunt.driftDist.toFixed(0)}m!`, bonus);
      }
      _stunt.driftDist = 0;
    }
  }

  function _awardStuntBonus(label, amount) {
    if (!_playerState || amount <= 0) return;

    _session.stuntsPerformed++;
    _session.stuntBonusTotal += amount;

    SaveSystem.addMoney(_playerState, amount, `stunt: ${label}`);
    _addDelta(amount, 'gain');
    _addXP(XP_PER_STUNT);

    Notifications.toast('🎯', `${label} +$${amount}`, 'success', 1.8);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE PRIZES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Award a race prize to the player.
   * Handles placement multiplier, entry fee, and XP.
   *
   * @param {string} raceId    CONFIG.RACES entry id.
   * @param {number} placement 1, 2, or 3 (DNF = 0).
   * @returns {{ prize:number, net:number, message:string }}
   */
  function awardRacePrize(raceId, placement) {
    if (!_playerState) return { prize: 0, net: 0, message: 'No player state.' };

    const raceCfg = CONFIG.RACES.find(r => r.id === raceId);
    if (!raceCfg) return { prize: 0, net: 0, message: 'Race not found.' };

    _session.racesEntered++;

    // Entry fee was already deducted at race start — this is the prize
    let prize = 0;
    switch (placement) {
      case 1: prize = raceCfg.prize['1st']; _session.racesWon++; break;
      case 2: prize = raceCfg.prize['2nd']; break;
      case 3: prize = raceCfg.prize['3rd']; break;
      default: prize = 0; break;  // DNF
    }

    if (prize > 0) {
      SaveSystem.addMoney(_playerState, prize, `race ${raceId} #${placement}`);
      _addDelta(prize, 'gain');

      const xpGain = placement === 1 ? XP_PER_RACE_WIN : XP_PER_RACE_FINISH;
      _addXP(xpGain);

      // Update best placement
      const prev = _playerState.racesCompleted[raceId];
      if (!prev || placement < prev) {
        _playerState.racesCompleted[raceId] = placement;
      }
    }

    // Persist to playerState
    _playerState.racesWon = _session.racesWon;

    const message = placement > 0
      ? `${['', '1st', '2nd', '3rd'][placement]} place — $${prize}`
      : 'DNF — no prize';

    return { prize, net: prize, message };
  }

  /**
   * Deduct the race entry fee.
   * Call when the player confirms race entry.
   *
   * @param {string} raceId
   * @returns {{ success:boolean, cost:number, message:string }}
   */
  function payEntryFee(raceId) {
    if (!_playerState) return { success: false, cost: 0, message: 'No state.' };

    const raceCfg = CONFIG.RACES.find(r => r.id === raceId);
    if (!raceCfg) return { success: false, cost: 0, message: 'Race not found.' };

    const cost   = raceCfg.entryFee || 0;
    if (cost === 0) return { success: true, cost: 0, message: 'Free entry.' };

    const result = SaveSystem.spendMoney(_playerState, cost, `entry fee: ${raceId}`);
    if (result.success) {
      _addDelta(-cost, 'loss');
    }
    return result.success
      ? { success: true,  cost, message: `Entry fee $${cost} paid.` }
      : { success: false, cost, message: `Need $${cost} to enter.`  };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAXI / PASSENGER FARES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Award a completed taxi fare.
   *
   * @param {number} basePay        Base pay for the trip.
   * @param {number} distanceUnits  Trip distance in world units.
   * @param {number} timeRemaining  Seconds remaining on the timer (0 = no bonus).
   * @param {number} timeLimit      Total time allowed for the trip.
   * @returns {{ total:number, base:number, timeBonus:number, distBonus:number }}
   */
  function awardTaxiFare(basePay, distanceUnits, timeRemaining, timeLimit) {
    if (!_playerState) return { total: 0, base: 0, timeBonus: 0, distBonus: 0 };

    const distBonus  = Math.round(distanceUnits * CONFIG.PASSENGERS.DISTANCE_BONUS);
    const timePct    = timeLimit > 0 ? timeRemaining / timeLimit : 0;
    const timeBonus  = Math.round(CONFIG.PASSENGERS.TIME_BONUS_MAX * timePct);
    const total      = basePay + distBonus + timeBonus;

    SaveSystem.addMoney(_playerState, total, 'taxi fare');
    _addDelta(total, 'gain');
    _addXP(XP_PER_PASSENGER);

    _session.passengersDelivered++;
    _session.faresEarned += total;
    _playerState.totalPassengers  = _session.passengersDelivered;
    _playerState.totalFaresEarned = _session.faresEarned;

    Notifications.toast('🚕', `Fare complete! +$${total}`, 'money', 2.5);

    return { total, base: basePay, timeBonus, distBonus };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GARAGE TRANSACTIONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Repair the player's active car at a garage.
   *
   * @param {string} garageId  CONFIG.GARAGES entry id.
   * @returns {{ success:boolean, cost:number, message:string }}
   */
  function repairCar(garageId) {
    if (!_playerState) return { success: false, cost: 0, message: 'No state.' };

    const garageCfg = CONFIG.GARAGES.find(g => g.id === garageId);
    if (!garageCfg) return { success: false, cost: 0, message: 'Garage not found.' };

    const result = SaveSystem.repairCar(
      _playerState,
      _playerState.activeCar,
      garageCfg.repairCostPerPercent
    );

    if (result.success && result.cost > 0) {
      _addDelta(-result.cost, 'loss');
      Notifications.toast('🔧', `Repaired! -$${result.cost}`, 'info', 2.0);
    }

    return result;
  }

  /**
   * Purchase an upgrade for the active car.
   *
   * @param {string} upgradeKey  e.g. 'engine', 'tires'
   * @returns {{ success:boolean, cost:number, newLevel:number, message:string }}
   */
  function purchaseUpgrade(upgradeKey) {
    if (!_playerState) return { success: false, cost: 0, newLevel: 0, message: 'No state.' };

    const result = SaveSystem.applyUpgrade(
      _playerState,
      _playerState.activeCar,
      upgradeKey
    );

    if (result.success) {
      _addDelta(-result.cost, 'loss');
      Notifications.toast('⚙️', result.message, 'success', 2.0);
    } else {
      Notifications.toast('⚙️', result.message, 'warn', 2.0);
    }

    return result;
  }

  /**
   * Apply a paint job.
   *
   * @param {number} colorHex
   * @param {string} finish
   * @returns {{ success:boolean, cost:number, message:string }}
   */
  function purchasePaint(colorHex, finish) {
    if (!_playerState) return { success: false, cost: 0, message: 'No state.' };

    const result = SaveSystem.applyPaint(
      _playerState,
      _playerState.activeCar,
      colorHex,
      finish
    );

    if (result.success) {
      _addDelta(-result.cost, 'loss');
      Notifications.toast('🎨', `Paint applied! -$${result.cost}`, 'info', 2.0);
    } else {
      Notifications.toast('🎨', result.message, 'warn', 2.0);
    }

    return result;
  }

  /**
   * Purchase a new car from the dealer.
   *
   * @param {string} carId
   * @returns {{ success:boolean, cost:number, message:string }}
   */
  function purchaseCar(carId) {
    if (!_playerState) return { success: false, cost: 0, message: 'No state.' };

    const result = SaveSystem.purchaseCar(_playerState, carId);

    if (result.success) {
      _addDelta(-result.cost, 'loss');
      Notifications.toast('🏎', `${CONFIG.CARS[carId]?.name} purchased!`, 'success', 3.0);
    } else {
      Notifications.toast('🏎', result.message, 'warn', 2.0);
    }

    return result;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // XP & LEVEL
  // ══════════════════════════════════════════════════════════════════════════

  function _addXP(amount) {
    if (!_playerState || amount <= 0) return;

    _xp               += amount;
    _session.xpEarned += amount;
    _playerState.xpTotal = _xp;

    const newLevel = _calcLevel(_xp);
    if (newLevel > _level) {
      const oldLevel = _level;
      _level = newLevel;
      _playerState.prestige = _level;

      Notifications.toast('🏆', `Level ${_level}! New colours unlocked.`, 'money', 4.0);
      if (_onLevelUp) _onLevelUp(_level, oldLevel);
    }
  }

  function _calcLevel(xp) {
    let lvl = 0;
    for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= XP_THRESHOLDS[i]) { lvl = i; break; }
    }
    return lvl;
  }

  /**
   * Return XP progress toward the next level as a 0–1 fraction.
   */
  function getLevelProgress() {
    if (_level >= XP_THRESHOLDS.length - 1) return 1;
    const current = XP_THRESHOLDS[_level];
    const next    = XP_THRESHOLDS[_level + 1];
    return MathUtils.clamp((_xp - current) / (next - current), 0, 1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MONEY HUD HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function _syncMoneyHUD(instant) {
    const el = document.getElementById('hud-money');
    if (!el) return;

    const shown = instant ? _playerState.money : Math.round(_displayMoney);
    el.textContent = MathUtils.formatMoney(shown, false).slice(1); // strip '$' — CSS adds it

    if (_onMoneyChange) _onMoneyChange(_playerState.money, 0);
  }

  /**
   * Spawn a floating +/- delta label near the HUD money display.
   *
   * @param {number}          amount   Positive = gain, negative = loss.
   * @param {'gain'|'loss'}   type
   */
  function _addDelta(amount, type) {
    const wrap = document.getElementById('hud-money-wrap');
    if (!wrap) return;

    const el        = document.createElement('div');
    el.className    = `money-delta ${type}`;
    el.textContent  = `${type === 'gain' ? '+' : ''}${MathUtils.formatMoney(amount)}`;
    el.style.position = 'absolute';
    el.style.top    = '0';
    el.style.left   = '50%';
    el.style.transform = 'translateX(-50%)';
    wrap.appendChild(el);

    _deltas.push({ amount, element: el, life: DELTA_POPUP_LIFE });

    if (_onMoneyChange) _onMoneyChange(_playerState.money, amount);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATE FLUSH (write session data back to playerState before saving)
  // ══════════════════════════════════════════════════════════════════════════

  function _flushToPlayerState() {
    if (!_playerState) return;

    _playerState.sessionTime      = (_playerState.sessionTime || 0) +
                                     _session.distanceKm / Math.max(MathUtils.kmhToMs(40), 0.001);
    _playerState.distanceDriven   = _session.distanceKm * 1000;
    _playerState.topSpeedReached  = Math.max(_playerState.topSpeedReached || 0, _session.topSpeedKmh);
    _playerState.xpTotal          = _xp;
    _playerState.prestige         = _level;
    _playerState.totalPassengers  = _session.passengersDelivered;
    _playerState.totalFaresEarned = _session.faresEarned;
    _playerState.racesWon         = _session.racesWon;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEADERBOARD SNAPSHOT  (for pause-screen stats panel)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return a flat object of all session stats for display.
   * @returns {object}
   */
  function getSessionStats() {
    return {
      money:            _playerState?.money ?? 0,
      racesWon:         _session.racesWon,
      racesEntered:     _session.racesEntered,
      passengersDelivered: _session.passengersDelivered,
      faresEarned:      _session.faresEarned,
      distanceKm:       MathUtils.roundTo(_session.distanceKm, 1),
      stuntsPerformed:  _session.stuntsPerformed,
      stuntBonusTotal:  _session.stuntBonusTotal,
      topSpeedKmh:      Math.round(_session.topSpeedKmh),
      collisions:       _session.collisions,
      xpEarned:         _session.xpEarned,
      level:            _level,
      levelProgress:    getLevelProgress(),
    };
  }

  /**
   * Increment session collision counter (called by Game.js on each impact).
   */
  function recordCollision() {
    _session.collisions++;
    if (_playerState) _playerState.totalCollisions = (_playerState.totalCollisions || 0) + 1;
  }

  /**
   * Increment wanted-event counter.
   */
  function recordWantedEvent() {
    _session.wantedEvents++;
    if (_playerState) _playerState.totalEvades = (_playerState.totalEvades || 0) + 1;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BALANCE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return the current wallet balance.
   */
  function getBalance() {
    return _playerState?.money ?? 0;
  }

  /**
   * Return true if the player can afford a given cost.
   * @param {number} cost
   */
  function canAfford(cost) {
    return (_playerState?.money ?? 0) >= cost;
  }

  /**
   * Return the current prestige level.
   */
  function getLevel() { return _level; }

  /**
   * Return total XP.
   */
  function getXP() { return _xp; }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    // Remove any lingering delta elements
    for (const d of _deltas) {
      if (d.element?.parentNode) d.element.parentNode.removeChild(d.element);
    }
    _deltas.length = 0;

    _flushToPlayerState();

    _playerState   = null;
    _onMoneyChange = null;
    _onLevelUp     = null;

    console.info('[EconomySystem] Disposed.');
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

    // Race
    awardRacePrize,
    payEntryFee,

    // Taxi
    awardTaxiFare,

    // Garage / dealer
    repairCar,
    purchaseUpgrade,
    purchasePaint,
    purchaseCar,

    // Balance queries
    getBalance,
    canAfford,

    // XP / level
    getLevel,
    getXP,
    getLevelProgress,

    // Stats
    getSessionStats,
    recordCollision,
    recordWantedEvent,

  });

})();

if (typeof module !== 'undefined') module.exports = EconomySystem;
/* ```

---

**File 25 ✅ — `js/systems/EconomySystem.js` done.**

This is the complete economy hub. The animated money counter rolls toward the real balance at 800 $/s — fast enough to feel snappy but slow enough to be readable — and spawns floating delta labels above the HUD money display that drift upward over 2.2 seconds before being removed from the DOM. The stunt system runs three independent trackers each frame: a near-miss detector with a 3-second cooldown so one traffic pass awards one bonus, an air-time accumulator that pays out on landing if the car was airborne at least 0.8 seconds, and a drift-distance tracker that pays per metre above 12 m. Race prizes use the placement lookup from `CONFIG.RACES` prize tables and deduct the entry fee separately so the race UI can show both values. Taxi fares combine base pay, distance bonus, and a time-bonus proportional to how much time was left. The XP system has 11 thresholds up to level 10 and fires a level-up notification with an `_onLevelUp` callback that `MenuManager` can use to unlock paint colours. The auto-save flushes all session data back into `_playerState` every 30 seconds via `SaveSystem.quickSave`.

**Say "File 26" for `js/systems/PassengerSystem.js`.** */
