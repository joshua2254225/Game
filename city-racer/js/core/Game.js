/* Here is the complete `js/core/Game.js` directly:

```javascript */
/**
 * ============================================================================
 * CITY RACER — Game.js
 * ============================================================================
 * Master state machine and animation loop. Owns every system lifecycle and
 * wires all inter-module callbacks together.
 *
 * States
 *   LOADING      → world being built, loading screen visible
 *   MAIN_MENU    → title screen
 *   FREE_ROAM    → player driving, all systems running
 *   RACING       → active race event
 *   TAXI_MISSION → active passenger mission
 *   GARAGE       → garage overlay open, physics frozen
 *   DEALER       → car-dealer overlay open, physics frozen
 *   PAUSED       → pause menu visible, everything frozen
 *   RESULTS      → post-race results screen
 *   GAME_OVER    → game-over screen
 * ============================================================================
 */

'use strict';

const Game = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // STATES
  // ══════════════════════════════════════════════════════════════════════════

  const STATES = Object.freeze({
    LOADING     : 'loading',
    MAIN_MENU   : 'main_menu',
    FREE_ROAM   : 'free_roam',
    RACING      : 'racing',
    TAXI_MISSION: 'taxi_mission',
    GARAGE      : 'garage',
    DEALER      : 'dealer',
    PAUSED      : 'paused',
    RESULTS     : 'results',
    GAME_OVER   : 'game_over',
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE STATE
  // ══════════════════════════════════════════════════════════════════════════

  let _state     = STATES.LOADING;
  let _prevState = STATES.LOADING;
  let _rafId     = null;
  let _lastTime  = 0;
  let _ready     = false;
  const MAX_DT   = 1 / 20;      // cap at 50 ms to prevent spiral-of-death

  /** Live PlayerCar instance. */
  let _player = null;

  /** Current slot's persisted data. */
  let _saveData = _defaultSave();

  /** Runtime session stats (reset each new game / load). */
  const _session = {
    moneyAtStart : 0,
    moneyEarned  : 0,
    racesWon     : 0,
    passengers   : 0,
    maxWanted    : 0,
    playTime     : 0,   // seconds
  };

  /** Active race context. */
  const _race = {
    cfg      : null,
    elapsed  : 0,
    topSpeed : 0,
    startDmg : 0,
  };

  /** Active taxi mission data. */
  let _activeMission  = null;

  /** Auto-save countdown. */
  let _autoSaveTimer  = CONFIG.SAVE.AUTO_SAVE_INTERVAL;

  // ══════════════════════════════════════════════════════════════════════════
  // LOADING SCREEN HELPER
  // ══════════════════════════════════════════════════════════════════════════

  const _loader = {
    _bar   : null,
    _status: null,
    _screen: null,

    init() {
      this._bar    = document.getElementById('loader-bar');
      this._status = document.getElementById('loader-status');
      this._screen = document.getElementById('loading-screen');
    },

    set(pct, msg) {
      if (this._bar) {
        this._bar.style.width = Math.round(pct) + '%';
        this._bar.setAttribute('aria-valuenow', Math.round(pct));
      }
      if (this._status && msg) this._status.textContent = msg;
    },

    finish() {
      const s = this._screen;
      if (!s) return;
      s.style.transition = 'opacity 0.7s ease-out';
      s.style.opacity    = '0';
      s.setAttribute('aria-hidden', 'true');
      setTimeout(() => { if (s) s.style.display = 'none'; }, 750);
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // DEFAULT SAVE DATA
  // ══════════════════════════════════════════════════════════════════════════

  function _defaultSave() {
    const startCar = CONFIG.PLAYER.START_CAR;
    return {
      slotIndex : 0,
      version   : CONFIG.SAVE.VERSION,
      money     : CONFIG.PLAYER.START_MONEY,
      carId     : startCar,
      upgrades  : { engine:0, tires:0, brakes:0, suspension:0, turbo:0, armor:0 },
      damage    : 0,
      paintHex  : CONFIG.CARS[startCar].colors.body,
      finish    : 'standard',
      ownedCars : [startCar],
      position  : { x: -96, z: -192 },
      heading   : 0,
      district  : 'DOWNTOWN',
      playTime  : 0,
      racesWon  : 0,
      passengers: 0,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ASYNC INIT  (called by main.js)
  // ══════════════════════════════════════════════════════════════════════════

  async function init() {
    _loader.init();
    _loader.set(0, 'Initialising engine…');
    await _tick();

    // ── Core engine ────────────────────────────────────────────────────────
    const canvas = document.getElementById('game-canvas');
    Renderer.init(canvas);
    _loader.set(8, 'Renderer ready…');
    await _tick();

    Camera.init();
    _loader.set(12, 'Camera system ready…');
    await _tick();

    InputManager.init();
    _loader.set(16, 'Input system ready…');
    await _tick();

    // ── World ──────────────────────────────────────────────────────────────
    Sky.init(Renderer.getScene());
    _loader.set(22, 'Building sky…');
    await _tick();

    CityMap.init(Renderer.getScene());
    _loader.set(30, 'Laying out city districts…');
    await _tick();

    RoadBuilder.init(Renderer.getScene());
    _loader.set(40, 'Paving roads…');
    await _tick();

    BuildingGenerator.init(Renderer.getScene());
    _loader.set(55, 'Constructing buildings…');
    await _tick();

    Props.init(Renderer.getScene());
    _loader.set(65, 'Planting trees…');
    await _tick();

    Water.init(Renderer.getScene());
    Bridges.init(Renderer.getScene());
    _loader.set(72, 'Filling the river…');
    await _tick();

    // ── AI & systems ───────────────────────────────────────────────────────
    TrafficSystem.init(Renderer.getScene());
    _loader.set(78, 'Spawning traffic…');
    await _tick();

    PoliceSystem.init(Renderer.getScene());
    _loader.set(82, 'Briefing the police…');
    await _tick();

    EconomySystem.init(CONFIG.PLAYER.START_MONEY);
    PassengerSystem.init(Renderer.getScene());
    RaceSystem.init(Renderer.getScene());
    _loader.set(87, 'Setting up missions…');
    await _tick();

    // ── Locations ──────────────────────────────────────────────────────────
    Markers.init(Renderer.getScene());
    Garage.init(Renderer.getScene());
    CarDealer.init(Renderer.getScene());
    _loader.set(92, 'Opening garages…');
    await _tick();

    // ── UI ─────────────────────────────────────────────────────────────────
    HUD.init();
    Notifications.init();
    MenuManager.init();
    _loader.set(96, 'Polishing the HUD…');
    await _tick();

    // ── Wire everything together ───────────────────────────────────────────
    _wireMenuCallbacks();
    _wireSystemCallbacks();
    _bindPauseButton();
    _bindOrientationGuard();

    _loader.set(100, 'Ready!');
    await _tick();

    _ready = true;

    // Fade loading screen then show main menu
    setTimeout(() => {
      _loader.finish();
      setTimeout(() => {
        _setState(STATES.MAIN_MENU);
        _startLoop();
      }, 350);
    }, 400);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RAF LOOP
  // ══════════════════════════════════════════════════════════════════════════

  function _startLoop() {
    _lastTime = performance.now();
    _rafId    = requestAnimationFrame(_loop);
  }

  function _loop(timestamp) {
    _rafId = requestAnimationFrame(_loop);

    const dt = Math.min((timestamp - _lastTime) / 1000, MAX_DT);
    _lastTime = timestamp;

    if (!_ready || dt <= 0) return;

    _update(dt);
    _render(dt);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE DISPATCH
  // ══════════════════════════════════════════════════════════════════════════

  function _update(dt) {
    InputManager.update(dt);

    switch (_state) {
      case STATES.FREE_ROAM:     _updateFreeRoam(dt);  break;
      case STATES.RACING:        _updateRacing(dt);    break;
      case STATES.TAXI_MISSION:  _updateTaxi(dt);      break;
      default: break;   // PAUSED / GARAGE / DEALER / MENUS — physics frozen
    }

    // HUD and notification ticks always run when the game world is loaded
    if (_state !== STATES.LOADING && _state !== STATES.MAIN_MENU) {
      HUD.update(dt);
      Notifications.update(dt);
    }
  }

  function _render(dt) {
    // Sky animates regardless of game state (visible behind menus)
    if (typeof Sky.update === 'function') Sky.update(dt);

    if (_state !== STATES.LOADING) {
      Renderer.render();
    }

    // Minimap draws in every gameplay state
    if (_player &&
        _state !== STATES.LOADING &&
        _state !== STATES.MAIN_MENU) {
      _updateMinimapFeeds();
      Minimap.draw();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATE-SPECIFIC UPDATES
  // ══════════════════════════════════════════════════════════════════════════

  function _updateFreeRoam(dt) {
    if (_player && !_player.alive) { _onCarDestroyed(); return; }

    _player.update(dt);

    if (!_player.alive) { _onCarDestroyed(); return; }

    TrafficSystem.update(dt, _player.position);
    PoliceSystem.update(dt, _player.position, _player.speedKmh);
    PassengerSystem.update(dt, _player.position);
    Water.update(dt);
    Camera.update(dt);

    _session.playTime += dt;
    _autoSaveTimer    -= dt;
    if (_autoSaveTimer <= 0) {
      _autoSave();
      _autoSaveTimer = CONFIG.SAVE.AUTO_SAVE_INTERVAL;
    }

    if (InputManager.justPressed('pause') || InputManager.justPressed('escape')) {
      _setState(STATES.PAUSED);
    }
  }

  function _updateRacing(dt) {
    if (_player && !_player.alive) { _onCarDestroyed(); return; }

    _player.update(dt);

    if (!_player.alive) { _onCarDestroyed(); return; }

    TrafficSystem.update(dt, _player.position);
    Water.update(dt);
    Camera.update(dt);

    _race.elapsed += dt;
    if (_player.speedKmh > _race.topSpeed) _race.topSpeed = _player.speedKmh;

    RaceSystem.update(dt, _player);

    // Sync race HUD
    const info = (typeof RaceSystem.getRaceInfo === 'function')
      ? RaceSystem.getRaceInfo() : null;
    if (info) {
      const timeDisp = _race.cfg.timeLimit > 0
        ? Math.max(0, _race.cfg.timeLimit - _race.elapsed)
        : _race.elapsed;
      HUD.updateRaceTimer(timeDisp, _race.cfg.timeLimit === 0);
      HUD.updateRacePosition(info.position, _race.cfg.opponents + 1);
      HUD.updateRaceLap(info.currentLap, _race.cfg.laps);
    }

    _session.playTime += dt;

    if (InputManager.justPressed('pause') || InputManager.justPressed('escape')) {
      _setState(STATES.PAUSED);
    }
  }

  function _updateTaxi(dt) {
    if (_player && !_player.alive) { _onCarDestroyed(); return; }

    _player.update(dt);

    if (!_player.alive) { _onCarDestroyed(); return; }

    TrafficSystem.update(dt, _player.position);
    PoliceSystem.update(dt, _player.position, _player.speedKmh);
    PassengerSystem.update(dt, _player.position);
    Water.update(dt);
    Camera.update(dt);

    // Sync taxi HUD
    if (typeof PassengerSystem.getMissionInfo === 'function') {
      const info = PassengerSystem.getMissionInfo();
      if (info) HUD.updateTaxi(info.currentFare, info.timeRatio);
    }

    _session.playTime += dt;
    _autoSaveTimer    -= dt;
    if (_autoSaveTimer <= 0) {
      _autoSave();
      _autoSaveTimer = CONFIG.SAVE.AUTO_SAVE_INTERVAL;
    }

    if (InputManager.justPressed('pause') || InputManager.justPressed('escape')) {
      _setState(STATES.PAUSED);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATE MACHINE
  // ══════════════════════════════════════════════════════════════════════════

  function _setState(newState) {
    if (_state === newState) return;
    _prevState = _state;
    _state     = newState;

    console.info(`[Game] ${_prevState} → ${newState}`);

    switch (newState) {

      case STATES.MAIN_MENU:
        HUD.hide();
        MenuManager.openMain();
        break;

      case STATES.FREE_ROAM:
        MenuManager.hideAll();
        HUD.show();
        HUD.hideRaceHUD();
        HUD.hideTaxiHUD();
        if (_prevState === STATES.RACING)       RaceSystem.stopRace();
        if (_prevState === STATES.TAXI_MISSION) PassengerSystem.cancelMission();
        break;

      case STATES.PAUSED:
        MenuManager.openPause(_getPlayerState());
        break;

      case STATES.RACING:
        _race.elapsed  = 0;
        _race.topSpeed = 0;
        _race.startDmg = _player ? _player.damage : 0;
        HUD.show();
        HUD.showRaceHUD();
        HUD.hideTaxiHUD();
        HUD.updateRacePosition(1, (_race.cfg?.opponents || 3) + 1);
        HUD.updateRaceLap(1, _race.cfg?.laps || 1);
        break;

      case STATES.TAXI_MISSION:
        MenuManager.hideAll();
        HUD.show();
        HUD.hideRaceHUD();
        break;

      case STATES.GARAGE:
      case STATES.DEALER:
        HUD.hide();
        break;

      case STATES.RESULTS:
        HUD.hideRaceHUD();
        HUD.hide();
        break;

      case STATES.GAME_OVER:
        HUD.hideRaceHUD();
        HUD.hideTaxiHUD();
        HUD.hide();
        break;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER SPAWN
  // ══════════════════════════════════════════════════════════════════════════

  function _spawnPlayer(saveData) {
    // Remove old player from scene
    if (_player) {
      Renderer.getScene().remove(_player.group);
      _player.dispose();
      _player = null;
    }

    const carCfg = CONFIG.CARS[saveData.carId] || CONFIG.CARS[CONFIG.PLAYER.START_CAR];

    _player = new PlayerCar(carCfg, {
      upgrades : saveData.upgrades || {},
      damage   : saveData.damage   || 0,
      paintHex : saveData.paintHex || carCfg.colors.body,
      finish   : saveData.finish   || 'standard',
    });

    const spawnPos = saveData.position || { x: -96, z: -192 };
    _player.respawn(spawnPos.x, spawnPos.z, saveData.heading || 0);

    Renderer.getScene().add(_player.group);

    // Wire player callbacks
    _player.onEnterDistrict   = (_key, name) => {
      HUD.showDistrict(name);
      HUD.showSpeedLimit(CONFIG.ROADS.SPEED_LIMIT);
    };
    _player.onInteractNear    = m  => HUD.showInteractionPrompt(m.name || m.type);
    _player.onInteractFar     = () => HUD.hideInteractionPrompt();
    _player.onInteractConfirm = m  => _handleInteraction(m);
    _player.onSpeedingChange  = (isOver, speed) => PoliceSystem.reportSpeeding(isOver, speed);

    // Attach subsystems to new player
    Minimap.init(_player);
    Camera.attachToTarget(_player.group);

    // Sync money
    EconomySystem.setMoney(saveData.money || CONFIG.PLAYER.START_MONEY);
    HUD.updateMoney(EconomySystem.getMoney());
    HUD.updateDamage(saveData.damage || 0);
    HUD.updateWanted(0);

    console.info('[Game] Player spawned —', carCfg.name, 'at', spawnPos);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SAVE / LOAD
  // ══════════════════════════════════════════════════════════════════════════

  function _startNewGame(slotIndex) {
    _saveData             = _defaultSave();
    _saveData.slotIndex   = slotIndex;
    _session.moneyAtStart = _saveData.money;
    _session.moneyEarned  = 0;
    _session.racesWon     = 0;
    _session.passengers   = 0;
    _session.maxWanted    = 0;
    _session.playTime     = 0;
    _autoSaveTimer        = CONFIG.SAVE.AUTO_SAVE_INTERVAL;

    _spawnPlayer(_saveData);
    SaveSystem.save(slotIndex, _buildSavePayload());
    _setState(STATES.FREE_ROAM);
  }

  function _loadSlot(slotIndex) {
    const saved = (typeof SaveSystem !== 'undefined') ? SaveSystem.loadSlot(slotIndex) : null;
    if (!saved) { _startNewGame(slotIndex); return; }

    _saveData            = { ..._defaultSave(), ...saved, slotIndex };
    _session.moneyAtStart = _saveData.money;
    _session.playTime    = _saveData.playTime   || 0;
    _session.racesWon    = _saveData.racesWon   || 0;
    _session.passengers  = _saveData.passengers || 0;
    _session.moneyEarned = 0;
    _session.maxWanted   = 0;
    _autoSaveTimer       = CONFIG.SAVE.AUTO_SAVE_INTERVAL;

    _spawnPlayer(_saveData);
    _setState(STATES.FREE_ROAM);
  }

  function _autoSave() {
    if (_state === STATES.LOADING || _state === STATES.MAIN_MENU) return;
    SaveSystem.save(_saveData.slotIndex, _buildSavePayload());
  }

  function _buildSavePayload() {
    const pos = _player ? _player.position : { x: -96, z: -192 };
    return {
      version   : CONFIG.SAVE.VERSION,
      money     : EconomySystem.getMoney(),
      carId     : _player?.carConfig?.id    || _saveData.carId,
      upgrades  : _player ? { ..._player.upgrades } : { ..._saveData.upgrades },
      damage    : _player?.damage            ?? 0,
      paintHex  : _player?.paintHex          || _saveData.paintHex,
      finish    : _player?.finish            || _saveData.finish,
      ownedCars : [..._saveData.ownedCars],
      position  : { x: pos.x, z: pos.z },
      heading   : _player?.heading           || 0,
      district  : _player?._currentDistrict  || '',
      playTime  : _session.playTime,
      racesWon  : _session.racesWon,
      passengers: _session.passengers,
    };
  }

  function _getPlayerState() {
    return {
      money     : EconomySystem.getMoney(),
      carId     : _player?.carConfig?.id    || _saveData.carId,
      upgrades  : _player ? { ..._player.upgrades } : { ..._saveData.upgrades },
      damage    : _player?.damage            ?? 0,
      paintHex  : _player?.paintHex          || _saveData.paintHex,
      finish    : _player?.finish            || _saveData.finish,
      ownedCars : [..._saveData.ownedCars],
      speedKmh  : _player?.speedKmh          || 0,
      district  : _player?._currentDistrict  || '',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERACTION HANDLER
  // ══════════════════════════════════════════════════════════════════════════

  function _handleInteraction(marker) {
    switch (marker.type) {
      case 'garage': {
        const cfg = CONFIG.GARAGES.find(g => g.id === marker.id) || CONFIG.GARAGES[0];
        _saveData._currentGarage = cfg;
        _setState(STATES.GARAGE);
        MenuManager.openGarage(_getPlayerState(), cfg);
        break;
      }
      case 'dealer': {
        const cfg = CONFIG.DEALERS.find(d => d.id === marker.id) || CONFIG.DEALERS[0];
        _setState(STATES.DEALER);
        MenuManager.openDealer(_getPlayerState(), cfg);
        break;
      }
      case 'race': {
        _setState(STATES.PAUSED);
        MenuManager.openRaces(_getPlayerState());
        break;
      }
      case 'taxi': {
        if (typeof PassengerSystem.triggerPickup === 'function') {
          PassengerSystem.triggerPickup(_player.position);
        }
        break;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE FLOW
  // ══════════════════════════════════════════════════════════════════════════

  function _enterRace(raceCfg) {
    if (!raceCfg) return;
    _race.cfg = raceCfg;

    // Teleport to start line
    _player.respawn(
      raceCfg.startPos.x,
      raceCfg.startPos.z,
      raceCfg.startPos.heading || 0
    );

    // Deduct entry fee
    EconomySystem.deductMoney(raceCfg.entryFee);
    HUD.updateMoney(EconomySystem.getMoney());
    HUD.showMoneyDelta(-raceCfg.entryFee);

    RaceSystem.startRace(raceCfg, _player);
    _setState(STATES.RACING);

    // Countdown → enable movement
    HUD.startCountdown(() => {
      if (typeof RaceSystem.beginMovement === 'function') {
        RaceSystem.beginMovement();
      }
    });
  }

  function _retryRace() {
    if (_race.cfg) {
      _enterRace(_race.cfg);
    } else {
      _setState(STATES.FREE_ROAM);
    }
  }

  function _onRaceComplete(place, prize) {
    if (prize > 0) {
      EconomySystem.addMoney(prize);
      HUD.updateMoney(EconomySystem.getMoney());
      HUD.showMoneyDelta(prize);
      _session.moneyEarned += prize;
    }
    if (place === 1) _session.racesWon++;

    Notifications.raceResult(place, prize, () => {
      MenuManager.openResults({
        place       : place,
        raceName    : _race.cfg?.name || 'Race',
        timeSeconds : _race.elapsed,
        topSpeedKmh : _race.topSpeed,
        damagePct   : Math.max(0, (_player?.damage || 0) - _race.startDmg),
        prize       : prize,
      });
      _setState(STATES.RESULTS);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAXI / PASSENGER FLOW
  // ══════════════════════════════════════════════════════════════════════════

  function _onMissionOffer(mission) {
    _activeMission = mission;
    MenuManager.openMission(mission);
  }

  function _acceptMission() {
    if (!_activeMission) return;
    if (typeof PassengerSystem.acceptMission === 'function') {
      PassengerSystem.acceptMission(_activeMission);
    }
    _setState(STATES.TAXI_MISSION);
    HUD.showTaxiHUD(
      _activeMission.name,
      _activeMission.toName   || '—',
      (_activeMission.basePay || 0) + (_activeMission.timeBonus || 0)
    );
    Notifications.passengerPickedUp(_activeMission.name);
  }

  function _declineMission() {
    _activeMission = null;
    // Returns to FREE_ROAM — mission screen already hid itself via MenuManager
  }

  function _onPassengerDelivered(fare) {
    _session.passengers++;
    _session.moneyEarned += fare;
    EconomySystem.addMoney(fare);
    HUD.updateMoney(EconomySystem.getMoney());
    HUD.showMoneyDelta(fare);
    HUD.hideTaxiHUD();
    Notifications.passengerDelivered(_activeMission?.name || 'Trip', fare);
    _activeMission = null;
    _setState(STATES.FREE_ROAM);
  }

  function _onMissionFailed(reason) {
    HUD.hideTaxiHUD();
    Notifications.missionFailed(reason);
    _activeMission = null;
    _setState(STATES.FREE_ROAM);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POLICE / GAME-OVER FLOW
  // ══════════════════════════════════════════════════════════════════════════

  function _onBusted(fine) {
    EconomySystem.deductMoney(fine);
    HUD.updateMoney(EconomySystem.getMoney());
    HUD.showMoneyDelta(-fine);
    HUD.updateWanted(0);
    Notifications.busted(fine);

    // Respawn at nearest garage with full health
    const garage = CONFIG.GARAGES[0];
    _player.respawn(garage.position.x, garage.position.z, 0);

    if (_state === STATES.RACING) _setState(STATES.FREE_ROAM);
    if (_state === STATES.TAXI_MISSION) {
      HUD.hideTaxiHUD();
      Notifications.missionFailed('Mission interrupted by police.');
      _activeMission = null;
      _setState(STATES.FREE_ROAM);
    }
  }

  function _onCarDestroyed() {
    if (_state === STATES.GAME_OVER) return;

    _setState(STATES.GAME_OVER);
    MenuManager.openGameOver({
      reason      : 'Your car was destroyed.',
      moneyEarned : _session.moneyEarned,
      racesWon    : _session.racesWon,
      passengers  : _session.passengers,
      wantedLevel : _session.maxWanted,
      respawnCost : 200,
    });
  }

  function _doRespawn() {
    const cost = 200;
    if (EconomySystem.getMoney() < cost) {
      Notifications.insufficientFunds();
      return;
    }
    EconomySystem.deductMoney(cost);
    HUD.updateMoney(EconomySystem.getMoney());

    const garage = CONFIG.GARAGES[0];
    _player.respawn(garage.position.x, garage.position.z, 0);

    _setState(STATES.FREE_ROAM);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GARAGE / DEALER TRANSACTIONS
  // ══════════════════════════════════════════════════════════════════════════

  function _doRepair(garageCfg) {
    const damage  = _player?.damage || 0;
    if (damage <= 0) return;

    const cost  = Math.ceil(damage * (garageCfg?.repairCostPerPercent || 10));
    const money = EconomySystem.getMoney();

    if (money < cost) { Notifications.insufficientFunds(); return; }

    EconomySystem.deductMoney(cost);
    _player.repair();

    HUD.updateMoney(EconomySystem.getMoney());
    HUD.showMoneyDelta(-cost);
    HUD.updateDamage(0);

    Notifications.repaired(cost);
    MenuManager.refreshGarage(_getPlayerState());
  }

  function _doUpgrade(upgradeKey) {
    if (!_player) return;

    const curLevel = _player.upgrades[upgradeKey] || 0;
    const upgCfg   = CONFIG.UPGRADES[upgradeKey];
    if (!upgCfg || curLevel >= upgCfg.levels.length) return;

    const ld   = upgCfg.levels[curLevel];
    const cost = ld.price;

    if (EconomySystem.getMoney() < cost) { Notifications.insufficientFunds(); return; }

    EconomySystem.deductMoney(cost);
    HUD.updateMoney(EconomySystem.getMoney());
    HUD.showMoneyDelta(-cost);

    // Bump stored level
    _player.upgrades[upgradeKey] = curLevel + 1;

    // Apply stat delta to live stats
    if (ld.topSpeedBonus)   _player.stats.topSpeed    = (_player.stats.topSpeed    || 0) + ld.topSpeedBonus;
    if (ld.accelBonus)      _player.stats.acceleration = Math.max(0.5, (_player.stats.acceleration || 5) - ld.accelBonus);
    if (ld.gripBonus)       _player.stats.grip         = MathUtils.clamp((_player.stats.grip     || 0.7) + ld.gripBonus, 0, 1);
    if (ld.handlingBonus)   _player.stats.handling     = MathUtils.clamp((_player.stats.handling || 0.7) + ld.handlingBonus, 0, 1);
    if (ld.brakingBonus)    _player.stats.braking      = MathUtils.clamp((_player.stats.braking  || 0.7) + ld.brakingBonus, 0, 1);
    if (ld.stabilityBonus)  _player.stats.handling     = MathUtils.clamp((_player.stats.handling || 0.7) + ld.stabilityBonus * 0.5, 0, 1);
    if (ld.damageReduction) _player.stats.damageReduction = ld.damageReduction;

    // Turbo — enable the boost system on the live car
    if (upgradeKey === 'turbo') {
      _player.turbo.available = true;
      _player.turbo.mult      = ld.boostMult;
      _player.turbo.duration  = ld.boostDuration;
      _player.turbo.charge    = 1.0;
    }

    Notifications.upgradePurchased(`${upgCfg.name} Lv.${curLevel + 1}`, cost);
    MenuManager.refreshGarage(_getPlayerState());
  }

  function _doPaint(colorHex, finish, cost) {
    if (!_player) return;
    if (EconomySystem.getMoney() < cost) { Notifications.insufficientFunds(); return; }

    EconomySystem.deductMoney(cost);
    HUD.updateMoney(EconomySystem.getMoney());
    HUD.showMoneyDelta(-cost);

    // Update player paint properties (Vehicle base class stores these)
    _player.paintHex = colorHex;
    _player.finish   = finish;
    if (typeof _player.repaint === 'function') {
      _player.repaint(colorHex, finish);
    }

    _saveData.paintHex = colorHex;
    _saveData.finish   = finish;

    const colorName = CONFIG.PAINT.COLORS.find(c => c.hex === colorHex)?.name || 'Custom';
    Notifications.paintApplied(colorName, cost);
    MenuManager.refreshGarage(_getPlayerState());
  }

  function _doBuyCar(carId) {
    const car   = CONFIG.CARS[carId];
    if (!car) return;

    const owned = _saveData.ownedCars.includes(carId);

    if (!owned) {
      if (EconomySystem.getMoney() < car.price) { Notifications.insufficientFunds(); return; }
      EconomySystem.deductMoney(car.price);
      HUD.updateMoney(EconomySystem.getMoney());
      HUD.showMoneyDelta(-car.price);
      _saveData.ownedCars.push(carId);
      Notifications.carPurchased(car.name, car.price);
    }

    // Switch to the new car
    _saveData.carId    = carId;
    _saveData.upgrades = { engine:0, tires:0, brakes:0, suspension:0, turbo:0, armor:0 };
    _saveData.damage   = 0;
    _saveData.paintHex = car.colors.body;
    _saveData.finish   = 'standard';
    _saveData.money    = EconomySystem.getMoney();

    _spawnPlayer(_saveData);
    MenuManager.hideAll();
    _setState(STATES.FREE_ROAM);
  }

  function _quitToMenu() {
    _autoSave();
    if (_player) _player.velocity?.set(0, 0, 0);
    _setState(STATES.MAIN_MENU);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════════════════

  function _applySettings(key, value) {
    switch (key) {
      case 'quality':
        if (typeof Renderer.setQuality === 'function') Renderer.setQuality(value);
        break;
      case 'shadows':
        if (typeof Renderer.setShadows === 'function') Renderer.setShadows(value);
        break;
      case 'dayCycle':
        if (typeof Sky.setDayCycleEnabled === 'function') Sky.setDayCycleEnabled(value);
        break;
      case 'cameraMode':
        if (typeof Camera.setMode === 'function') Camera.setMode(value);
        break;
      case 'invertCamY':
        if (typeof Camera.setInvertY === 'function') Camera.setInvertY(value);
        break;
      case 'traffic':
        if (typeof TrafficSystem.setEnabled === 'function') TrafficSystem.setEnabled(value);
        break;
      case 'police':
        if (typeof PoliceSystem.setEnabled === 'function') PoliceSystem.setEnabled(value);
        break;
      case 'touchControls': {
        const tc = document.getElementById('touch-controls');
        if (tc) tc.classList.toggle('hidden', !value);
        break;
      }
      // Audio keys are stubs until AudioManager is implemented
      case 'masterVolume':
      case 'sfxVolume':
      case 'ambientVolume':
      case 'vibration':
        break;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CALLBACK WIRING
  // ══════════════════════════════════════════════════════════════════════════

  function _wireMenuCallbacks() {
    const cb = MenuManager.callbacks;
    cb.onContinue       = slotIdx => _loadSlot(slotIdx);
    cb.onNewGame        = slotIdx => _startNewGame(slotIdx);
    cb.onDeleteSave     = slotIdx => {
      if (typeof SaveSystem !== 'undefined') SaveSystem.deleteSlot(slotIdx);
    };
    cb.onResume         = () => _setState(STATES.FREE_ROAM);
    cb.onQuitToMenu     = () => _quitToMenu();
    cb.onEnterRace      = raceCfg => _enterRace(raceCfg);
    cb.onRepair         = garageCfg => _doRepair(garageCfg);
    cb.onUpgrade        = key => _doUpgrade(key);
    cb.onPaintApply     = (hex, finish, cost) => _doPaint(hex, finish, cost);
    cb.onBuyCar         = carId => _doBuyCar(carId);
    cb.onMissionAccept  = () => _acceptMission();
    cb.onMissionDecline = () => _declineMission();
    cb.onRespawn        = () => _doRespawn();
    cb.onRetryRace      = () => _retryRace();
    cb.onResultsDone    = () => _setState(STATES.FREE_ROAM);
    cb.onSettingsChange = (key, val) => _applySettings(key, val);
  }

  function _wireSystemCallbacks() {

    if (typeof EconomySystem !== 'undefined') {
      EconomySystem.onMoneyChange = (newAmount, delta) => {
        HUD.updateMoney(newAmount);
        if (delta !== 0) HUD.showMoneyDelta(delta);
      };
    }

    if (typeof PoliceSystem !== 'undefined') {
      PoliceSystem.onWantedChange  = stars => {
        HUD.updateWanted(stars);
        if (stars > _session.maxWanted) _session.maxWanted = stars;
      };
      PoliceSystem.onPursuitStart  = stars  => Notifications.pursuitStarted(stars);
      PoliceSystem.onStarEscalate  = stars  => Notifications.wantedEscalated(stars);
      PoliceSystem.onBusted        = fine   => _onBusted(fine);
      PoliceSystem.onEvaded        = ()     => Notifications.evaded();
    }

    if (typeof PassengerSystem !== 'undefined') {
      PassengerSystem.onMissionOffer  = mission => _onMissionOffer(mission);
      PassengerSystem.onDelivered     = fare    => _onPassengerDelivered(fare);
      PassengerSystem.onMissionFailed = reason  => _onMissionFailed(reason);
    }

    if (typeof RaceSystem !== 'undefined') {
      RaceSystem.onCheckpoint = label        => Notifications.checkpoint(label);
      RaceSystem.onNewLap     = (cur, total) => Notifications.lap(cur, total);
      RaceSystem.onComplete   = (place, prize) => _onRaceComplete(place, prize);
      RaceSystem.onAbandoned  = ()           => _setState(STATES.FREE_ROAM);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MINIMAP FEEDS
  // ══════════════════════════════════════════════════════════════════════════

  function _updateMinimapFeeds() {
    Minimap.setFeeds({
      locationMarkers  : typeof Markers          !== 'undefined' ? Markers.getMinimapMarkers()         : [],
      passengerMarkers : typeof PassengerSystem   !== 'undefined' ? PassengerSystem.getMinimapMarkers() : [],
      raceMarkers      : typeof RaceSystem        !== 'undefined' ? RaceSystem.getMinimapMarkers()      : [],
      trafficCars      : typeof TrafficSystem     !== 'undefined' ? TrafficSystem.getCars()             : [],
      policeUnits      : typeof PoliceSystem      !== 'undefined' ? PoliceSystem.getUnits()             : [],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UI HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function _bindPauseButton() {
    const btn = document.getElementById('btn-pause-hud');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (_state === STATES.FREE_ROAM   ||
          _state === STATES.RACING      ||
          _state === STATES.TAXI_MISSION) {
        _setState(STATES.PAUSED);
      }
    });
  }

  function _bindOrientationGuard() {
    const guard = document.getElementById('rotate-guard');
    if (!guard) return;

    function check() {
      const portrait = window.innerHeight > window.innerWidth;
      guard.style.display = portrait ? 'flex' : 'none';
    }

    check();
    window.addEventListener('resize',            check, { passive: true });
    window.addEventListener('orientationchange', check, { passive: true });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITY
  // ══════════════════════════════════════════════════════════════════════════

  /** Yield to the browser for one paint frame. */
  function _tick() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({
    init,
    STATES,
    getState  : () => _state,
    getPlayer : () => _player,
  });

})();

if (typeof module !== 'undefined') module.exports = Game;
/* ```

**File 35 ✅ — `js/core/Game.js` done.** Say **"File 36"** for the final `js/main.js` boot entry point. */
