// js/utils/SaveSystem.js
/**
 * ============================================================================
 * CITY RACER — SaveSystem.js
 * ============================================================================
 * Manages all game persistence via localStorage.
 *
 * Features:
 *   • 3 independent save slots
 *   • Full game-state serialisation / deserialisation
 *   • Auto-save on a configurable interval
 *   • Save version checking + forward-migration stubs
 *   • Slot metadata (name, timestamp, money, car, playtime)
 *   • Corrupt-save detection and graceful recovery
 *   • Export save as JSON string / import from string
 *   • Settings persistence (separate from save slots)
 *   • Event emitter so UI reacts to save/load events
 *
 * Storage layout in localStorage:
 *   cityRacer_slot_0        → serialised SaveSlot JSON
 *   cityRacer_slot_1        → serialised SaveSlot JSON
 *   cityRacer_slot_2        → serialised SaveSlot JSON
 *   cityRacer_settings      → serialised Settings JSON
 *   cityRacer_active_slot   → number  (last-used slot index)
 * ============================================================================
 */

'use strict';

const SaveSystem = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const VERSION       = CONFIG.SAVE.VERSION;        // '1.0.0'
  const PREFIX        = CONFIG.SAVE.KEY_PREFIX;     // 'cityRacer_'
  const SLOT_COUNT    = CONFIG.SAVE.SLOT_COUNT;     // 3
  const AUTO_INTERVAL = CONFIG.SAVE.AUTO_SAVE_INTERVAL; // 30 s

  const KEYS = {
    slot:        (i) => `${PREFIX}slot_${i}`,
    settings:    `${PREFIX}settings`,
    activeSlot:  `${PREFIX}active_slot`,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  /** Index of the slot currently in use (set on load/new-game). */
  let _activeSlot = 0;

  /** Auto-save timer handle. */
  let _autoSaveTimer = null;

  /** Whether auto-save is currently enabled. */
  let _autoSaveEnabled = false;

  /** Simple event listeners: eventName → [callback, …] */
  const _listeners = {
    save:   [],
    load:   [],
    delete: [],
    error:  [],
  };

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT EMITTER (minimal internal pub/sub)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to a SaveSystem event.
   * @param {'save'|'load'|'delete'|'error'} event
   * @param {Function} callback  Called with an event-specific payload object.
   * @returns {Function}  Unsubscribe function.
   */
  function on(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
    return () => {
      _listeners[event] = _listeners[event].filter(cb => cb !== callback);
    };
  }

  function _emit(event, payload) {
    (_listeners[event] || []).forEach(cb => {
      try { cb(payload); } catch (e) { console.warn('[SaveSystem] listener error:', e); }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEFAULT STATE FACTORIES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return a fresh, default player-progress object.
   * This is the canonical shape of saved game data.
   * Every field that gets serialised must appear here.
   */
  function _defaultPlayerState() {
    return {
      // ── Economy ──────────────────────────────────────────────────────────
      money:            CONFIG.PLAYER.START_MONEY,   // $2500
      totalEarned:      0,
      totalSpent:       0,

      // ── Fleet ────────────────────────────────────────────────────────────
      ownedCars:        [CONFIG.PLAYER.START_CAR],   // ['city_hatch']
      activeCar:        CONFIG.PLAYER.START_CAR,

      // Per-car state: upgrades, damage, paint
      carStates: {
        city_hatch: _defaultCarState('city_hatch'),
      },

      // ── World position ───────────────────────────────────────────────────
      lastPosition: { x: 0, y: 1, z: 0 },
      lastHeading:  0,                               // radians

      // ── Mission / race progress ──────────────────────────────────────────
      racesCompleted:   {},    // { raceId: bestPositionInt }
      racesWon:         0,
      totalPassengers:  0,
      totalFaresEarned: 0,

      // ── Police ───────────────────────────────────────────────────────────
      wantedLevel:      0,
      totalBribes:      0,
      totalEvades:      0,

      // ── Stats ─────────────────────────────────────────────────────────────
      distanceDriven:   0,   // metres
      topSpeedReached:  0,   // km/h
      totalCollisions:  0,
      sessionTime:      0,   // seconds of total play time

      // ── Flags ─────────────────────────────────────────────────────────────
      tutorialDone:     false,
      firstRaceDone:    false,
    };
  }

  /**
   * Return a default per-car state object.
   * @param {string} carId
   */
  function _defaultCarState(carId) {
    const baseUpgrades = { engine:0, tires:0, brakes:0, suspension:0, turbo:0, armor:0 };
    const baseCfg      = CONFIG.CARS[carId];
    return {
      damage:    0,                                   // 0–100 %
      paintHex:  baseCfg ? baseCfg.colors.body : 0xCC3333,
      finish:    'standard',
      upgrades:  { ...baseUpgrades },
      odometer:  0,                                   // km driven in this car
    };
  }

  /**
   * Return a default settings object.
   */
  function _defaultSettings() {
    return {
      masterVolume:   80,
      sfxVolume:      70,
      ambientVolume:  30,
      quality:        'med',
      shadows:        true,
      dayCycle:       true,
      cameraMode:     'follow',
      invertCameraY:  false,
      showTraffic:    true,
      policeEnabled:  true,
      touchControls:  true,
      vibration:      true,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SERIALISATION HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Wrap player state in a save-slot envelope with metadata.
   * @param {object}  playerState
   * @param {string}  slotName     Display name chosen by the player.
   * @returns {object}  Full slot envelope.
   */
  function _wrapSlot(playerState, slotName) {
    return {
      version:    VERSION,
      slotName:   slotName || `Save ${_activeSlot + 1}`,
      savedAt:    Date.now(),               // Unix ms timestamp
      playTime:   playerState.sessionTime,  // seconds (for display)
      money:      playerState.money,
      activeCar:  playerState.activeCar,
      state:      playerState,
    };
  }

  /**
   * Attempt to parse a raw JSON string.
   * Returns the parsed object or null on failure.
   */
  function _safeParse(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[SaveSystem] JSON parse error:', e);
      return null;
    }
  }

  /**
   * Deep-merge `source` into `target` so that fields absent in `source`
   * fall back to `target` (the default). This makes forward-compatibility
   * safe: old saves missing new fields will receive the defaults.
   *
   * @param {object} target  The baseline (defaults).
   * @param {object} source  The saved data.
   * @returns {object}  Merged object.
   */
  function _deepMerge(target, source) {
    if (typeof target !== 'object' || target === null) return source ?? target;
    if (typeof source !== 'object' || source === null) return target;

    const result = Array.isArray(target) ? [...target] : { ...target };

    for (const key of Object.keys(source)) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        key in result &&
        typeof result[key] === 'object'
      ) {
        result[key] = _deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MIGRATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Apply any necessary migrations to bring an old save up to the current
   * VERSION. Add a new `case` block for each future breaking change.
   *
   * @param {object} envelope  Raw parsed save envelope.
   * @returns {object}  Migrated envelope.
   */
  function _migrate(envelope) {
    const v = envelope.version || '0.0.0';

    // Example future migration:
    // if (_versionLessThan(v, '1.1.0')) {
    //   envelope.state.newField = defaultValue;
    //   envelope.version = '1.1.0';
    // }

    if (v !== VERSION) {
      console.info(`[SaveSystem] Migrated save from v${v} → v${VERSION}`);
      envelope.version = VERSION;
    }

    return envelope;
  }

  /**
   * Compare two semver strings.
   * Returns true if a is strictly less than b.
   */
  function _versionLessThan(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) < (pb[i] || 0)) return true;
      if ((pa[i] || 0) > (pb[i] || 0)) return false;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SLOT CRUD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Check whether localStorage is available and writable.
   * @returns {boolean}
   */
  function isAvailable() {
    try {
      const testKey = `${PREFIX}_test`;
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Return metadata for all slots (without the full state payload).
   * Slots with no data have `empty: true`.
   *
   * @returns {Array<SlotMeta>}
   * SlotMeta: { index, empty, slotName, savedAt, playTime, money, activeCar, version }
   */
  function getAllSlotMeta() {
    const result = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const raw = localStorage.getItem(KEYS.slot(i));
      const env = _safeParse(raw);
      if (!env || !env.state) {
        result.push({ index: i, empty: true });
      } else {
        result.push({
          index:     i,
          empty:     false,
          slotName:  env.slotName  || `Slot ${i + 1}`,
          savedAt:   env.savedAt   || 0,
          playTime:  env.playTime  || 0,
          money:     env.money     || 0,
          activeCar: env.activeCar || 'city_hatch',
          version:   env.version   || '?',
        });
      }
    }
    return result;
  }

  /**
   * Read and return the full player-state for a given slot.
   * Returns null if the slot is empty or corrupt.
   *
   * @param {number} slotIndex  0, 1, or 2
   * @returns {object|null}  playerState merged over defaults.
   */
  function loadSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
      _emit('error', { msg: `Invalid slot index: ${slotIndex}` });
      return null;
    }

    const raw = localStorage.getItem(KEYS.slot(slotIndex));
    const env = _safeParse(raw);

    if (!env || typeof env !== 'object' || !env.state) {
      console.info(`[SaveSystem] Slot ${slotIndex} is empty or corrupt.`);
      return null;
    }

    // Migrate if needed
    const migrated = _migrate(env);

    // Deep-merge with defaults so new fields are always present
    const defaults = _defaultPlayerState();
    const merged   = _deepMerge(defaults, migrated.state);

    // Ensure car states exist for all owned cars
    for (const carId of merged.ownedCars) {
      if (!merged.carStates[carId]) {
        merged.carStates[carId] = _defaultCarState(carId);
      }
    }

    _activeSlot = slotIndex;
    _persistActiveSlot();

    _emit('load', { slotIndex, state: merged });
    console.info(`[SaveSystem] Loaded slot ${slotIndex} (v${migrated.version}).`);
    return merged;
  }

  /**
   * Write a player-state object to the given slot.
   *
   * @param {number} slotIndex
   * @param {object} playerState   Live game-state object.
   * @param {string} [slotName]    Optional display name override.
   * @returns {boolean}  true on success.
   */
  function saveSlot(slotIndex, playerState, slotName) {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
      _emit('error', { msg: `Invalid slot index: ${slotIndex}` });
      return false;
    }
    if (!playerState || typeof playerState !== 'object') {
      _emit('error', { msg: 'saveSlot: playerState must be a plain object.' });
      return false;
    }

    // Resolve display name: keep existing if not supplied
    if (!slotName) {
      const existing = _safeParse(localStorage.getItem(KEYS.slot(slotIndex)));
      slotName = (existing && existing.slotName) || `Save ${slotIndex + 1}`;
    }

    const envelope = _wrapSlot(playerState, slotName);
    let raw;
    try {
      raw = JSON.stringify(envelope);
    } catch (e) {
      _emit('error', { msg: 'saveSlot: JSON serialisation failed.', detail: e });
      return false;
    }

    try {
      localStorage.setItem(KEYS.slot(slotIndex), raw);
    } catch (e) {
      // Storage quota exceeded or private-browsing restriction
      _emit('error', { msg: 'saveSlot: localStorage write failed.', detail: e });
      console.error('[SaveSystem] Write failed:', e);
      return false;
    }

    _activeSlot = slotIndex;
    _persistActiveSlot();

    _emit('save', { slotIndex, meta: { slotName, savedAt: envelope.savedAt, money: envelope.money } });
    console.info(`[SaveSystem] Saved to slot ${slotIndex}.`);
    return true;
  }

  /**
   * Rename the display label of a save slot without touching its state.
   * @param {number} slotIndex
   * @param {string} newName
   * @returns {boolean}
   */
  function renameSlot(slotIndex, newName) {
    const raw = localStorage.getItem(KEYS.slot(slotIndex));
    const env = _safeParse(raw);
    if (!env) return false;
    env.slotName = String(newName).trim().slice(0, 24) || `Save ${slotIndex + 1}`;
    try {
      localStorage.setItem(KEYS.slot(slotIndex), JSON.stringify(env));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a save slot entirely.
   * @param {number} slotIndex
   * @returns {boolean}
   */
  function deleteSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return false;
    try {
      localStorage.removeItem(KEYS.slot(slotIndex));
      _emit('delete', { slotIndex });
      console.info(`[SaveSystem] Deleted slot ${slotIndex}.`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check whether a slot has any save data.
   * @param {number} slotIndex
   * @returns {boolean}
   */
  function slotExists(slotIndex) {
    return !!localStorage.getItem(KEYS.slot(slotIndex));
  }

  /**
   * Return the index of the most-recently-used slot, or 0 if none.
   * @returns {number}
   */
  function getActiveSlot() {
    const stored = parseInt(localStorage.getItem(KEYS.activeSlot), 10);
    return isNaN(stored) ? 0 : MathUtils.clamp(stored, 0, SLOT_COUNT - 1);
  }

  function _persistActiveSlot() {
    try {
      localStorage.setItem(KEYS.activeSlot, String(_activeSlot));
    } catch { /* ignore */ }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // QUICK SAVE / QUICK LOAD  (always use the active slot)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Save current player state to the active slot.
   * @param {object} playerState
   * @returns {boolean}
   */
  function quickSave(playerState) {
    return saveSlot(_activeSlot, playerState);
  }

  /**
   * Load state from the active slot.
   * @returns {object|null}
   */
  function quickLoad() {
    return loadSlot(_activeSlot);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTO-SAVE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Start the auto-save timer.
   * `getState` is a function that returns the current player-state object
   * when called — the system calls it on each interval tick.
   *
   * @param {Function} getState   () → playerState
   * @param {number}   [interval] Override seconds (uses CONFIG default).
   */
  function startAutoSave(getState, interval = AUTO_INTERVAL) {
    stopAutoSave();
    _autoSaveEnabled = true;

    _autoSaveTimer = setInterval(() => {
      if (!_autoSaveEnabled) return;
      const state = getState();
      if (state) {
        const ok = quickSave(state);
        if (ok) {
          console.info('[SaveSystem] Auto-saved.');
          _emit('save', { slotIndex: _activeSlot, auto: true });
        }
      }
    }, interval * 1000);

    console.info(`[SaveSystem] Auto-save started (every ${interval}s, slot ${_activeSlot}).`);
  }

  /**
   * Stop the auto-save timer.
   */
  function stopAutoSave() {
    if (_autoSaveTimer !== null) {
      clearInterval(_autoSaveTimer);
      _autoSaveTimer    = null;
      _autoSaveEnabled  = false;
      console.info('[SaveSystem] Auto-save stopped.');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Load settings from localStorage.
   * Missing keys are filled from defaults so new settings are always present.
   * @returns {object}  Settings object.
   */
  function loadSettings() {
    const raw      = localStorage.getItem(KEYS.settings);
    const saved    = _safeParse(raw);
    const defaults = _defaultSettings();
    if (!saved) return { ...defaults };
    return _deepMerge(defaults, saved);
  }

  /**
   * Persist settings to localStorage.
   * @param {object} settings
   * @returns {boolean}
   */
  function saveSettings(settings) {
    if (!settings || typeof settings !== 'object') return false;
    try {
      localStorage.setItem(KEYS.settings, JSON.stringify(settings));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update a single settings key.
   * @param {string} key
   * @param {*}      value
   * @returns {object}  The full updated settings object.
   */
  function setSetting(key, value) {
    const settings    = loadSettings();
    settings[key]     = value;
    saveSettings(settings);
    return settings;
  }

  /**
   * Read a single settings key.
   * @param {string} key
   * @param {*}      fallback  Returned if key not found.
   * @returns {*}
   */
  function getSetting(key, fallback) {
    const settings = loadSettings();
    return key in settings ? settings[key] : fallback;
  }

  /**
   * Reset settings to factory defaults.
   * @returns {object}  The default settings object.
   */
  function resetSettings() {
    const defaults = _defaultSettings();
    saveSettings(defaults);
    return defaults;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAR STATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Apply an upgrade to a car in the player state.
   * Validates the upgrade exists and the player has enough money.
   *
   * @param {object} playerState  Live state object (mutated in place).
   * @param {string} carId
   * @param {string} upgradeKey   e.g. 'engine', 'tires'
   * @returns {{ success:boolean, cost:number, newLevel:number, message:string }}
   */
  function applyUpgrade(playerState, carId, upgradeKey) {
    const upgradeCfg = CONFIG.UPGRADES[upgradeKey];
    if (!upgradeCfg) {
      return { success: false, cost: 0, newLevel: 0, message: 'Unknown upgrade type.' };
    }

    // Ensure car state exists
    if (!playerState.carStates[carId]) {
      playerState.carStates[carId] = _defaultCarState(carId);
    }

    const carState    = playerState.carStates[carId];
    const currentLvl  = carState.upgrades[upgradeKey] || 0;
    const maxLevel    = upgradeCfg.levels.length;

    if (currentLvl >= maxLevel) {
      return { success: false, cost: 0, newLevel: currentLvl, message: 'Already at max level.' };
    }

    const levelData = upgradeCfg.levels[currentLvl]; // 0-indexed = next level to buy
    const cost      = levelData.price;

    if (playerState.money < cost) {
      return { success: false, cost, newLevel: currentLvl, message: `Need $${cost} — you have $${playerState.money}.` };
    }

    // Apply
    playerState.money            -= cost;
    playerState.totalSpent       += cost;
    carState.upgrades[upgradeKey] = currentLvl + 1;

    return { success: true, cost, newLevel: currentLvl + 1, message: `${upgradeCfg.name} upgraded to level ${currentLvl + 1}.` };
  }

  /**
   * Apply a paint job to a car.
   * Validates colour exists in CONFIG and deducts cost.
   *
   * @param {object} playerState
   * @param {string} carId
   * @param {number} colorHex    Hex integer for the new colour.
   * @param {string} finish      'standard' | 'metallic' | 'matte' | 'chrome'
   * @returns {{ success:boolean, cost:number, message:string }}
   */
  function applyPaint(playerState, carId, colorHex, finish) {
    const baseCost    = CONFIG.PAINT.COST;
    const finishCost  = CONFIG.PAINT.FINISH_COST[finish] || 0;
    const total       = baseCost + finishCost;

    if (!playerState.carStates[carId]) {
      playerState.carStates[carId] = _defaultCarState(carId);
    }

    if (playerState.money < total) {
      return { success: false, cost: total, message: `Need $${total}.` };
    }

    playerState.money                    -= total;
    playerState.totalSpent               += total;
    playerState.carStates[carId].paintHex = colorHex;
    playerState.carStates[carId].finish   = finish;

    return { success: true, cost: total, message: `Paint applied — $${total} charged.` };
  }

  /**
   * Repair a car to 100% condition.
   * Cost = damagePercent × repairCostPerPercent (from garage config).
   *
   * @param {object} playerState
   * @param {string} carId
   * @param {number} repairCostPerPct  From CONFIG.GARAGES[n].repairCostPerPercent
   * @returns {{ success:boolean, cost:number, message:string }}
   */
  function repairCar(playerState, carId, repairCostPerPct) {
    if (!playerState.carStates[carId]) {
      playerState.carStates[carId] = _defaultCarState(carId);
    }

    const damage = playerState.carStates[carId].damage;
    if (damage === 0) {
      return { success: true, cost: 0, message: 'Vehicle is already in perfect condition.' };
    }

    const cost = Math.ceil(damage * repairCostPerPct);
    if (playerState.money < cost) {
      return { success: false, cost, message: `Need $${cost} for repairs.` };
    }

    playerState.money                  -= cost;
    playerState.totalSpent             += cost;
    playerState.carStates[carId].damage = 0;

    return { success: true, cost, message: `Repaired for $${cost}.` };
  }

  /**
   * Purchase a new car.
   *
   * @param {object} playerState
   * @param {string} carId
   * @returns {{ success:boolean, cost:number, message:string }}
   */
  function purchaseCar(playerState, carId) {
    const carCfg = CONFIG.CARS[carId];
    if (!carCfg) {
      return { success: false, cost: 0, message: `Unknown car: ${carId}.` };
    }
    if (playerState.ownedCars.includes(carId)) {
      return { success: false, cost: 0, message: 'You already own this car.' };
    }

    const cost = carCfg.price;
    if (playerState.money < cost) {
      return { success: false, cost, message: `Need $${cost}.` };
    }

    playerState.money       -= cost;
    playerState.totalSpent  += cost;
    playerState.ownedCars.push(carId);
    playerState.carStates[carId] = _defaultCarState(carId);

    return { success: true, cost, message: `${carCfg.name} purchased!` };
  }

  /**
   * Switch the active car (must already be owned).
   * @param {object} playerState
   * @param {string} carId
   * @returns {{ success:boolean, message:string }}
   */
  function setActiveCar(playerState, carId) {
    if (!playerState.ownedCars.includes(carId)) {
      return { success: false, message: `You do not own ${carId}.` };
    }
    playerState.activeCar = carId;
    return { success: true, message: `Switched to ${CONFIG.CARS[carId]?.name || carId}.` };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ECONOMY TRANSACTIONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Add money to the player's wallet.
   * @param {object} playerState
   * @param {number} amount  Must be positive.
   * @param {string} [reason]  For logging.
   * @returns {number}  New balance.
   */
  function addMoney(playerState, amount, reason = '') {
    if (amount <= 0) return playerState.money;
    playerState.money       += amount;
    playerState.totalEarned += amount;
    console.info(`[SaveSystem] +$${amount}${reason ? ' (' + reason + ')' : ''}. Balance: $${playerState.money}`);
    return playerState.money;
  }

  /**
   * Deduct money from the player's wallet.
   * Returns false if insufficient funds.
   *
   * @param {object} playerState
   * @param {number} amount
   * @param {string} [reason]
   * @returns {{ success:boolean, balance:number }}
   */
  function spendMoney(playerState, amount, reason = '') {
    if (amount <= 0) return { success: true, balance: playerState.money };
    if (playerState.money < amount) {
      return { success: false, balance: playerState.money };
    }
    playerState.money      -= amount;
    playerState.totalSpent += amount;
    console.info(`[SaveSystem] -$${amount}${reason ? ' (' + reason + ')' : ''}. Balance: $${playerState.money}`);
    return { success: true, balance: playerState.money };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMPUTED STATS HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Compute the effective stats for the player's active car,
   * including all applied upgrades.
   *
   * @param {object} playerState
   * @returns {object}  Effective stats { topSpeed, acceleration, handling, … }
   */
  function getEffectiveCarStats(playerState) {
    const carId   = playerState.activeCar;
    const carCfg  = CONFIG.CARS[carId];
    if (!carCfg) return null;

    const carState  = playerState.carStates[carId] || _defaultCarState(carId);
    const upgrades  = carState.upgrades;

    // Start with base stats
    const stats = { ...carCfg.stats };

    // Apply each upgrade level's bonuses
    for (const [key, level] of Object.entries(upgrades)) {
      if (level === 0) continue;
      const upgCfg = CONFIG.UPGRADES[key];
      if (!upgCfg) continue;

      for (let i = 0; i < level; i++) {
        const levelData = upgCfg.levels[i];
        if (!levelData) continue;

        if (levelData.topSpeedBonus)    stats.topSpeed    += levelData.topSpeedBonus;
        if (levelData.accelBonus)       stats.acceleration = Math.max(0.1, stats.acceleration - levelData.accelBonus);
        if (levelData.gripBonus)        stats.grip        = MathUtils.clamp(stats.grip        + levelData.gripBonus,    0, 1);
        if (levelData.handlingBonus)    stats.handling    = MathUtils.clamp(stats.handling    + levelData.handlingBonus, 0, 1);
        if (levelData.brakingBonus)     stats.braking     = MathUtils.clamp(stats.braking     + levelData.brakingBonus,  0, 1);
        if (levelData.stabilityBonus)   stats.handling    = MathUtils.clamp(stats.handling    + levelData.stabilityBonus * 0.5, 0, 1);
      }
    }

    // Damage penalty: at 100% damage, stats are halved
    const damagePenalty = 1 - (carState.damage / 100) * 0.5;
    stats.topSpeed    *= damagePenalty;
    stats.handling    *= damagePenalty;
    stats.braking     *= damagePenalty;
    stats.grip        *= damagePenalty;

    // Turbo upgrade
    const turboLevel  = upgrades.turbo || 0;
    if (turboLevel > 0) {
      const turboCfg  = CONFIG.UPGRADES.turbo.levels[turboLevel - 1];
      stats.boostMult = turboCfg.boostMult;
      stats.boostDuration = turboCfg.boostDuration;
    } else {
      stats.boostMult = 1;
      stats.boostDuration = 0;
    }

    // Armour upgrade
    const armorLevel  = upgrades.armor || 0;
    stats.damageReduction = armorLevel > 0
      ? CONFIG.UPGRADES.armor.levels[armorLevel - 1].damageReduction
      : 0;

    // Paint / finish metadata
    stats.paintHex = carState.paintHex;
    stats.finish   = carState.finish;

    return stats;
  }

  /**
   * Return a formatted summary string for the session stats screen.
   * @param {object} playerState
   * @returns {object}  { playTimeStr, distanceStr, moneyStr, racesWon, passengers }
   */
  function getSessionSummary(playerState) {
    return {
      playTimeStr:  MathUtils.formatTime(playerState.sessionTime),
      distanceStr:  `${(playerState.distanceDriven / 1000).toFixed(1)} km`,
      moneyStr:     MathUtils.formatMoney(playerState.totalEarned),
      racesWon:     playerState.racesWon,
      passengers:   playerState.totalPassengers,
      topSpeedStr:  `${Math.round(playerState.topSpeedReached)} km/h`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT / IMPORT (cloud backup / clipboard sharing)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Export a slot as a Base64-encoded JSON string (clipboard / file share).
   * @param {number} slotIndex
   * @returns {string|null}  The export string, or null if slot is empty.
   */
  function exportSlot(slotIndex) {
    const raw = localStorage.getItem(KEYS.slot(slotIndex));
    if (!raw) return null;
    try {
      return btoa(unescape(encodeURIComponent(raw)));
    } catch (e) {
      console.error('[SaveSystem] Export failed:', e);
      return null;
    }
  }

  /**
   * Import a Base64 export string into a slot.
   * Validates the data before writing.
   *
   * @param {number} slotIndex
   * @param {string} exportStr   String from exportSlot().
   * @returns {{ success:boolean, message:string }}
   */
  function importSlot(slotIndex, exportStr) {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
      return { success: false, message: 'Invalid slot index.' };
    }
    if (!exportStr || typeof exportStr !== 'string') {
      return { success: false, message: 'No data provided.' };
    }

    let raw;
    try {
      raw = decodeURIComponent(escape(atob(exportStr.trim())));
    } catch {
      return { success: false, message: 'Could not decode import data. Is it a valid export string?' };
    }

    const env = _safeParse(raw);
    if (!env || !env.state) {
      return { success: false, message: 'Import data is corrupt or unrecognised.' };
    }

    try {
      localStorage.setItem(KEYS.slot(slotIndex), raw);
    } catch (e) {
      return { success: false, message: 'Could not write to storage.' };
    }

    return { success: true, message: `Save imported to slot ${slotIndex + 1}.` };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITY
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Completely wipe all City Racer data from localStorage.
   * Used for a full factory reset / "delete all saves" option.
   * @returns {boolean}
   */
  function nukeAll() {
    try {
      for (let i = 0; i < SLOT_COUNT; i++) {
        localStorage.removeItem(KEYS.slot(i));
      }
      localStorage.removeItem(KEYS.settings);
      localStorage.removeItem(KEYS.activeSlot);
      console.info('[SaveSystem] All data wiped.');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Return total localStorage bytes used by City Racer.
   * Useful for debugging storage quota issues.
   * @returns {number}  Approximate byte count.
   */
  function storageUsedBytes() {
    let bytes = 0;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const v = localStorage.getItem(KEYS.slot(i));
      if (v) bytes += v.length * 2; // UTF-16
    }
    const settings = localStorage.getItem(KEYS.settings);
    if (settings) bytes += settings.length * 2;
    return bytes;
  }

  /**
   * Pretty-print a slot's raw JSON to the console (debugging aid).
   * @param {number} slotIndex
   */
  function debugSlot(slotIndex) {
    const raw = localStorage.getItem(KEYS.slot(slotIndex));
    if (!raw) { console.log(`[SaveSystem] Slot ${slotIndex} is empty.`); return; }
    try { console.log(`[SaveSystem] Slot ${slotIndex}:`, JSON.parse(raw)); }
    catch { console.log(`[SaveSystem] Slot ${slotIndex} raw:`, raw); }
  }

  /**
   * Validate a player-state object against expected schema.
   * Returns an array of warning strings (empty = valid).
   * @param {object} state
   * @returns {string[]}
   */
  function validate(state) {
    const warnings = [];
    if (typeof state.money !== 'number' || state.money < 0)
      warnings.push('money is invalid');
    if (!Array.isArray(state.ownedCars) || state.ownedCars.length === 0)
      warnings.push('ownedCars is empty or missing');
    if (!state.activeCar || !CONFIG.CARS[state.activeCar])
      warnings.push(`activeCar "${state.activeCar}" is not a recognised car id`);
    if (typeof state.sessionTime !== 'number')
      warnings.push('sessionTime is missing');
    return warnings;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Availability
    isAvailable,

    // Slot management
    getAllSlotMeta,
    loadSlot,
    saveSlot,
    renameSlot,
    deleteSlot,
    slotExists,
    getActiveSlot,

    // Quick access
    quickSave,
    quickLoad,

    // Auto-save
    startAutoSave,
    stopAutoSave,

    // Settings
    loadSettings,
    saveSettings,
    setSetting,
    getSetting,
    resetSettings,

    // Car / economy helpers
    applyUpgrade,
    applyPaint,
    repairCar,
    purchaseCar,
    setActiveCar,
    addMoney,
    spendMoney,

    // Computed accessors
    getEffectiveCarStats,
    getSessionSummary,

    // Default factories (useful for Game.js to create a new game)
    defaultPlayerState: _defaultPlayerState,
    defaultCarState:    _defaultCarState,
    defaultSettings:    _defaultSettings,

    // Import / export
    exportSlot,
    importSlot,

    // Utilities
    nukeAll,
    storageUsedBytes,
    debugSlot,
    validate,

    // Events
    on,

  });

})();

if (typeof module !== 'undefined') module.exports = SaveSystem;
