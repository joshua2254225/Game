/* Here is the complete `MenuManager.js` code assembled from all sections:

```javascript */
/**
 * ============================================================================
 * CITY RACER — MenuManager.js
 * ============================================================================
 * Controls every full-screen overlay in the game:
 *
 *   Main Menu      — DRIVE / NEW GAME / SETTINGS
 *   Save Slots     — slot selection, deletion, new-game flow
 *   Pause Menu     — resume, garage, races, settings, quit
 *   Race Selection — scrollable race list with detail panel + entry
 *   Garage         — repair tab, upgrades tab (pips + costs), paint tab
 *   Car Dealer     — car grid, stat comparison, purchase flow
 *   Race Results   — place banner, stats, prize, retry / done
 *   Game Over      — session summary, respawn / main menu
 *   Taxi Mission   — accept / decline overlay
 *   Settings       — audio sliders, quality, toggles, camera mode
 *
 * All 3-D car preview canvases (#paint-preview-canvas, #dealer-preview-canvas)
 * get lightweight Three.js mini-scenes that auto-rotate and are fully disposed
 * when their parent screen closes.
 *
 * Architecture:
 *   Frozen IIFE module.  Game.js populates the `callbacks` object before
 *   calling any open* method. No game-logic lives here — only DOM wiring.
 * ============================================================================
 */

'use strict';

const MenuManager = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE STATE
  // ══════════════════════════════════════════════════════════════════════════

  let _ready         = false;
  let _dom           = {};
  let _playerState   = null;
  let _activeGarage  = null;
  let _activeDealer  = null;
  let _settingsOrigin = 'main';

  let _selectedRaceId  = null;
  let _selectedCarId   = null;
  let _paintColorHex   = null;
  let _paintFinish     = 'standard';

  let _paintPreview  = null;
  let _dealerPreview = null;

  // ══════════════════════════════════════════════════════════════════════════
  // CALLBACKS
  // ══════════════════════════════════════════════════════════════════════════

  const callbacks = {
    onContinue       : null,
    onNewGame        : null,
    onDeleteSave     : null,
    onResume         : null,
    onQuitToMenu     : null,
    onEnterRace      : null,
    onRepair         : null,
    onUpgrade        : null,
    onPaintApply     : null,
    onBuyCar         : null,
    onMissionAccept  : null,
    onMissionDecline : null,
    onRespawn        : null,
    onRetryRace      : null,
    onResultsDone    : null,
    onSettingsChange : null,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INIT / DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function init() {
    _dom = {
      screens: {
        main      : document.getElementById('screen-main'),
        saves     : document.getElementById('screen-saves'),
        pause     : document.getElementById('screen-pause'),
        races     : document.getElementById('screen-races'),
        garage    : document.getElementById('screen-garage'),
        dealer    : document.getElementById('screen-dealer'),
        results   : document.getElementById('screen-results'),
        gameover  : document.getElementById('screen-gameover'),
        mission   : document.getElementById('screen-mission'),
        settings  : document.getElementById('screen-settings'),
      },
      btnPlay         : document.getElementById('btn-main-play'),
      btnNewGame      : document.getElementById('btn-main-newgame'),
      btnMainSettings : document.getElementById('btn-main-settings'),
      saveSlotsList   : document.getElementById('save-slots-list'),
      btnSavesBack    : document.getElementById('btn-saves-back'),
      btnResume       : document.getElementById('btn-pause-resume'),
      btnPauseGarage  : document.getElementById('btn-pause-garage'),
      btnPauseRaces   : document.getElementById('btn-pause-races'),
      btnPauseSettings: document.getElementById('btn-pause-settings'),
      btnQuit         : document.getElementById('btn-pause-quit'),
      raceList        : document.getElementById('race-list'),
      raceDetail      : document.getElementById('race-detail'),
      racesWallet     : document.getElementById('races-wallet'),
      btnRacesBack    : document.getElementById('btn-races-back'),
      garageWallet    : document.getElementById('garage-wallet'),
      garageName      : document.getElementById('garage-name'),
      garageTabs      : document.querySelectorAll('.garage-tab[data-tab]'),
      paneRepair      : document.getElementById('garage-pane-repair'),
      paneUpgrades    : document.getElementById('garage-pane-upgrades'),
      panePaint       : document.getElementById('garage-pane-paint'),
      repairCarName   : document.getElementById('repair-car-name'),
      repairDmgPct    : document.getElementById('repair-damage-pct'),
      repairBar       : document.getElementById('repair-bar'),
      repairCost      : document.getElementById('repair-cost'),
      btnRepairNow    : document.getElementById('btn-repair-now'),
      upgradeList     : document.getElementById('upgrade-list'),
      paintCanvas     : document.getElementById('paint-preview-canvas'),
      paintColorGrid  : document.getElementById('paint-color-grid'),
      paintFinishRow  : document.getElementById('paint-finish-row'),
      paintTotal      : document.getElementById('paint-total'),
      btnPaintApply   : document.getElementById('btn-paint-apply'),
      btnGarageBack   : document.getElementById('btn-garage-back'),
      dealerWallet    : document.getElementById('dealer-wallet'),
      dealerName      : document.getElementById('dealer-name'),
      carGrid         : document.getElementById('car-grid'),
      carDetailPanel  : document.getElementById('car-detail-panel'),
      dealerCanvas    : document.getElementById('dealer-preview-canvas'),
      btnDealerBack   : document.getElementById('btn-dealer-back'),
      resultsPlace    : document.getElementById('results-place'),
      resultsRaceName : document.getElementById('results-race-name'),
      resultsTime     : document.getElementById('results-time'),
      resultsTopSpeed : document.getElementById('results-top-speed'),
      resultsDamage   : document.getElementById('results-damage'),
      resultsPrize    : document.getElementById('results-prize'),
      btnResultsRetry : document.getElementById('btn-results-retry'),
      btnResultsDone  : document.getElementById('btn-results-done'),
      gameoverReason  : document.getElementById('gameover-reason'),
      goMoneyEarned   : document.getElementById('go-money-earned'),
      goRacesWon      : document.getElementById('go-races-won'),
      goPassengers    : document.getElementById('go-passengers'),
      goWanted        : document.getElementById('go-wanted'),
      btnRespawn      : document.getElementById('btn-go-respawn'),
      btnGoMenu       : document.getElementById('btn-go-menu'),
      missionHeading  : document.getElementById('mission-heading'),
      missionPickup   : document.getElementById('mission-pickup'),
      missionDest     : document.getElementById('mission-dest'),
      missionBasePay  : document.getElementById('mission-base-pay'),
      missionTimeBonus: document.getElementById('mission-time-bonus'),
      missionDistance : document.getElementById('mission-distance'),
      btnMissionAccept: document.getElementById('btn-mission-accept'),
      btnMissionDecline:document.getElementById('btn-mission-decline'),
      sliderMasterVol : document.getElementById('setting-master-vol'),
      valMasterVol    : document.getElementById('val-master-vol'),
      sliderSfxVol    : document.getElementById('setting-sfx-vol'),
      valSfxVol       : document.getElementById('val-sfx-vol'),
      sliderAmbVol    : document.getElementById('setting-amb-vol'),
      valAmbVol       : document.getElementById('val-amb-vol'),
      qualitySelect   : document.getElementById('quality-select'),
      toggleShadows   : document.getElementById('setting-shadows'),
      toggleDayCycle  : document.getElementById('setting-daycycle'),
      camModeSelect   : document.getElementById('cam-mode-select'),
      toggleInvertY   : document.getElementById('setting-invert-y'),
      toggleTraffic   : document.getElementById('setting-traffic'),
      togglePolice    : document.getElementById('setting-police'),
      toggleTouch     : document.getElementById('setting-touch'),
      toggleVibration : document.getElementById('setting-vibration'),
      btnSettingsBack : document.getElementById('btn-settings-back'),
    };

    _bindStaticEvents();
    _ready = true;
    console.info('[MenuManager] Initialised.');
    return true;
  }

  function dispose() {
    _disposePreview('paint');
    _disposePreview('dealer');
    _ready       = false;
    _playerState = null;
    console.info('[MenuManager] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  function _showScreen(id) {
    const el = _dom.screens[id];
    if (el) el.classList.remove('hidden');
  }

  function _hideScreen(id) {
    const el = _dom.screens[id];
    if (el) el.classList.add('hidden');
  }

  function hideAll() {
    Object.keys(_dom.screens || {}).forEach(_hideScreen);
    _disposePreview('paint');
    _disposePreview('dealer');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATIC EVENT BINDING
  // ══════════════════════════════════════════════════════════════════════════

  function _bindStaticEvents() {
    _on(_dom.btnPlay,         'click', () => openSaves(false));
    _on(_dom.btnNewGame,      'click', () => openSaves(true));
    _on(_dom.btnMainSettings, 'click', () => { _settingsOrigin = 'main'; openSettings(); });
    _on(_dom.btnSavesBack, 'click', () => { _hideScreen('saves'); _showScreen('main'); });
    _on(_dom.btnResume,        'click', () => { _hideScreen('pause'); if (callbacks.onResume) callbacks.onResume(); });
    _on(_dom.btnPauseGarage,   'click', () => { _hideScreen('pause'); if (callbacks.onResume) callbacks.onResume(); });
    _on(_dom.btnPauseRaces,    'click', () => { _hideScreen('pause'); openRaces(_playerState); });
    _on(_dom.btnPauseSettings, 'click', () => { _settingsOrigin = 'pause'; openSettings(); });
    _on(_dom.btnQuit,          'click', () => { hideAll(); if (callbacks.onQuitToMenu) callbacks.onQuitToMenu(); });
    _on(_dom.btnRacesBack, 'click', () => { _hideScreen('races'); _showScreen('pause'); });
    _on(_dom.btnGarageBack, 'click', () => { _hideScreen('garage'); _disposePreview('paint'); });

    _dom.garageTabs.forEach(tab => {
      tab.addEventListener('click', () => _switchGarageTab(tab.dataset.tab));
    });

    _on(_dom.btnRepairNow, 'click', () => {
      if (callbacks.onRepair && _activeGarage) callbacks.onRepair(_activeGarage);
    });

    _on(_dom.btnPaintApply, 'click', () => {
      if (!_paintColorHex) return;
      const cost = _calcPaintCost();
      if (callbacks.onPaintApply) callbacks.onPaintApply(_paintColorHex, _paintFinish, cost);
    });

    _on(_dom.paintFinishRow, 'click', e => {
      const btn = e.target.closest('[data-finish]');
      if (!btn) return;
      _selectFinish(btn.dataset.finish);
    });

    _on(_dom.btnDealerBack, 'click', () => { _hideScreen('dealer'); _disposePreview('dealer'); });
    _on(_dom.btnResultsRetry, 'click', () => { _hideScreen('results'); if (callbacks.onRetryRace) callbacks.onRetryRace(); });
    _on(_dom.btnResultsDone,  'click', () => { _hideScreen('results'); if (callbacks.onResultsDone) callbacks.onResultsDone(); });
    _on(_dom.btnRespawn, 'click', () => { _hideScreen('gameover'); if (callbacks.onRespawn) callbacks.onRespawn(); });
    _on(_dom.btnGoMenu,  'click', () => { hideAll(); if (callbacks.onQuitToMenu) callbacks.onQuitToMenu(); });
    _on(_dom.btnMissionAccept,  'click', () => { _hideScreen('mission'); if (callbacks.onMissionAccept)  callbacks.onMissionAccept(); });
    _on(_dom.btnMissionDecline, 'click', () => { _hideScreen('mission'); if (callbacks.onMissionDecline) callbacks.onMissionDecline(); });

    _on(_dom.btnSettingsBack, 'click', () => {
      _hideScreen('settings');
      _showScreen(_settingsOrigin === 'pause' ? 'pause' : 'main');
    });

    _bindSettings();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN MENU
  // ══════════════════════════════════════════════════════════════════════════

  function openMain() {
    hideAll();
    _showScreen('main');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SAVE SLOTS
  // ══════════════════════════════════════════════════════════════════════════

  function openSaves(isNewGame) {
    _hideScreen('main');
    _buildSaveSlots(isNewGame);
    _showScreen('saves');
  }

  function _buildSaveSlots(isNewGame) {
    const list = _dom.saveSlotsList;
    if (!list) return;
    list.innerHTML = '';

    const slotCount = CONFIG.SAVE.SLOT_COUNT;

    for (let i = 0; i < slotCount; i++) {
      const save = (typeof SaveSystem !== 'undefined')
        ? SaveSystem.loadSlot(i)
        : null;

      const el = document.createElement('div');
      el.className  = 'save-slot';
      el.dataset.slot = i;
      el.tabIndex   = 0;
      el.setAttribute('role', 'button');

      if (save) {
        const played  = _formatPlaytime(save.playTime || 0);
        const car     = CONFIG.CARS[save.carId];
        const carName = car ? car.name : 'Unknown Car';
        el.innerHTML = `
          <div class="save-slot-num">${i + 1}</div>
          <div class="save-slot-info">
            <div class="save-slot-name">${carName}</div>
            <div class="save-slot-meta">${save.district || 'Downtown'} · ${played} played</div>
          </div>
          <div class="save-slot-money">$${_fmt(save.money || 0)}</div>
          <div class="save-slot-actions">
            <button class="btn btn-danger btn-sm btn-icon" data-delete="${i}" title="Delete save">✕</button>
          </div>`;

        el.querySelector('[data-delete]').addEventListener('click', e => {
          e.stopPropagation();
          if (callbacks.onDeleteSave) callbacks.onDeleteSave(i);
          _buildSaveSlots(isNewGame);
        });
      } else {
        el.innerHTML = `
          <div class="save-slot-num">${i + 1}</div>
          <div class="save-slot-info">
            <div class="save-slot-name">Empty Slot</div>
            <div class="save-slot-meta">Start a new adventure</div>
          </div>
          <div class="save-slot-money" style="color:var(--clr-light-1);">—</div>`;
      }

      el.addEventListener('click', () => {
        _hideScreen('saves');
        if (isNewGame || !save) {
          if (callbacks.onNewGame) callbacks.onNewGame(i);
        } else {
          if (callbacks.onContinue) callbacks.onContinue(i);
        }
      });

      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') el.click();
      });

      list.appendChild(el);
    }
  }

  function _formatPlaytime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAUSE MENU
  // ══════════════════════════════════════════════════════════════════════════

  function openPause(playerState) {
    _playerState = playerState || _playerState;
    if (typeof HUD !== 'undefined' && _playerState) {
      HUD.updatePauseStats(
        _playerState.money    || 0,
        _playerState.speedKmh || 0,
        _playerState.damage   || 0
      );
    }
    hideAll();
    _showScreen('pause');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE SELECTION
  // ══════════════════════════════════════════════════════════════════════════

  function openRaces(playerState) {
    _playerState   = playerState || _playerState;
    _selectedRaceId = null;

    if (_dom.racesWallet && _playerState) {
      _dom.racesWallet.textContent = '$' + _fmt(_playerState.money || 0);
    }

    _buildRaceList();
    _clearRaceDetail();
    hideAll();
    _showScreen('races');
  }

  function _buildRaceList() {
    const list = _dom.raceList;
    if (!list) return;
    list.innerHTML = '<div class="panel-title">Events</div>';

    const money = _playerState ? (_playerState.money || 0) : 0;

    for (const race of CONFIG.RACES) {
      const canAfford  = money >= race.entryFee;
      const meetsReq   = !race.requiredCar ||
                         (_playerState && _playerState.ownedCars &&
                          _playerState.ownedCars.includes(race.requiredCar));

      const card = document.createElement('div');
      card.className   = 'race-card' + (!canAfford || !meetsReq ? ' locked' : '');
      card.dataset.race = race.id;
      card.setAttribute('role', 'button');
      card.tabIndex    = 0;

      card.innerHTML = `
        <div class="race-card-header">
          <span class="race-card-name">${race.name}</span>
          <span class="race-card-district">${race.district}</span>
        </div>
        <div class="race-card-footer">
          <span class="race-card-prize">🏆 $${_fmt(race.prize['1st'])}</span>
          <span class="race-card-fee ${canAfford ? '' : 'unaffordable'}">
            Entry: $${_fmt(race.entryFee)}
          </span>
        </div>`;

      card.addEventListener('click',   () => _selectRace(race.id));
      card.addEventListener('keydown', e  => { if (e.key === 'Enter' || e.key === ' ') _selectRace(race.id); });
      list.appendChild(card);
    }
  }

  function _selectRace(raceId) {
    _selectedRaceId = raceId;
    _dom.raceList.querySelectorAll('.race-card').forEach(c => {
      c.classList.toggle('active', c.dataset.race === raceId);
    });
    _showRaceDetail(CONFIG.RACES.find(r => r.id === raceId));
  }

  function _showRaceDetail(race) {
    const panel = _dom.raceDetail;
    if (!panel || !race) return;

    const money      = _playerState ? (_playerState.money || 0) : 0;
    const canAfford  = money >= race.entryFee;
    const meetsReq   = !race.requiredCar ||
                       (_playerState && _playerState.ownedCars &&
                        _playerState.ownedCars.includes(race.requiredCar));
    const timeStr    = race.timeLimit > 0 ? HUD.formatTime(race.timeLimit) : 'None';
    const lapsStr    = race.laps + (race.laps === 1 ? ' Lap' : ' Laps');

    panel.innerHTML = `
      <div class="race-detail-name">${race.name}</div>
      <p class="race-detail-desc">${race.description}</p>

      <div class="race-detail-stats">
        <div class="detail-stat">
          <span class="detail-stat-val">${lapsStr}</span>
          <span class="detail-stat-label">Format</span>
        </div>
        <div class="detail-stat">
          <span class="detail-stat-val">${race.opponents}</span>
          <span class="detail-stat-label">Opponents</span>
        </div>
        <div class="detail-stat">
          <span class="detail-stat-val">${timeStr}</span>
          <span class="detail-stat-label">Time Limit</span>
        </div>
      </div>

      <div class="prize-breakdown">
        <div class="prize-row"><span>🥇 1st Place</span><span>$${_fmt(race.prize['1st'])}</span></div>
        <div class="prize-row"><span>🥈 2nd Place</span><span>$${_fmt(race.prize['2nd'])}</span></div>
        <div class="prize-row"><span>🥉 3rd Place</span><span>$${_fmt(race.prize['3rd'])}</span></div>
      </div>

      ${race.requiredCar && !meetsReq ? `
        <div class="race-req-warn">
          ⚠ Requires: ${CONFIG.CARS[race.requiredCar]?.name || race.requiredCar}
        </div>` : ''}

      <div class="race-entry-fee-row">
        <span>Entry Fee</span><span>$${_fmt(race.entryFee)}</span>
      </div>

      <button class="btn btn-primary btn-full" id="btn-race-enter"
              ${!canAfford || !meetsReq ? 'disabled' : ''}>
        ${!meetsReq ? '🔒 CAR REQUIRED' : !canAfford ? '💸 INSUFFICIENT FUNDS' : `🏁 ENTER RACE — $${_fmt(race.entryFee)}`}
      </button>`;

    const enterBtn = panel.querySelector('#btn-race-enter');
    if (enterBtn && canAfford && meetsReq) {
      enterBtn.addEventListener('click', () => {
        _hideScreen('races');
        if (callbacks.onEnterRace) callbacks.onEnterRace(race);
      });
    }
  }

  function _clearRaceDetail() {
    if (_dom.raceDetail) {
      _dom.raceDetail.innerHTML =
        '<p class="race-detail-desc" style="color:var(--clr-light-1);text-align:center;margin:auto;">' +
        'Select a race on the left to see details.</p>';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GARAGE
  // ══════════════════════════════════════════════════════════════════════════

  function openGarage(playerState, garageCfg) {
    _playerState  = playerState || _playerState;
    _activeGarage = garageCfg  || _activeGarage;

    if (_dom.garageWallet && _playerState) {
      _dom.garageWallet.textContent = '$' + _fmt(_playerState.money || 0);
    }
    if (_dom.garageName && _activeGarage) {
      _dom.garageName.textContent = _activeGarage.name;
    }

    _paintColorHex = _playerState?.paintHex || null;
    _paintFinish   = _playerState?.finish   || 'standard';

    _switchGarageTab('repair');
    hideAll();
    _showScreen('garage');
  }

  function refreshGarage(updatedState) {
    _playerState = updatedState || _playerState;
    if (_dom.garageWallet && _playerState) {
      _dom.garageWallet.textContent = '$' + _fmt(_playerState.money || 0);
    }
    _populateRepair();
    _refreshUpgradeButtons();
  }

  function _switchGarageTab(tabKey) {
    const paneMap = {
      repair  : _dom.paneRepair,
      upgrades: _dom.paneUpgrades,
      paint   : _dom.panePaint,
    };

    _dom.garageTabs.forEach(t => {
      const isActive = t.dataset.tab === tabKey;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
    });

    Object.entries(paneMap).forEach(([key, pane]) => {
      if (pane) pane.classList.toggle('hidden', key !== tabKey);
    });

    if (tabKey === 'repair')   _populateRepair();
    if (tabKey === 'upgrades') _populateUpgrades();
    if (tabKey === 'paint')    _populatePaint();
    if (tabKey !== 'paint')    _disposePreview('paint');
  }

  function _populateRepair() {
    if (!_playerState) return;

    const car     = CONFIG.CARS[_playerState.carId];
    const damage  = _playerState.damage || 0;
    const health  = 100 - damage;
    const costPer = _activeGarage?.repairCostPerPercent || 10;
    const cost    = Math.ceil(damage * costPer);

    if (_dom.repairCarName) _dom.repairCarName.textContent = car?.name || 'Vehicle';

    if (_dom.repairDmgPct) {
      _dom.repairDmgPct.textContent = health + '%';
      _dom.repairDmgPct.className   = 'repair-damage-pct' +
        (damage >= CONFIG.PLAYER.REPAIR_WARN_PCT  ? ' danger' :
         damage >= CONFIG.PLAYER.DAMAGE_WARN_PCT  ? ' warn'   : ' ok');
    }

    if (_dom.repairBar) {
      _dom.repairBar.style.width = health + '%';
      _dom.repairBar.className   = 'progress-fill' +
        (damage >= CONFIG.PLAYER.REPAIR_WARN_PCT  ? ' danger'  :
         damage >= CONFIG.PLAYER.DAMAGE_WARN_PCT  ? ' warning' : ' success');
    }

    if (_dom.repairCost) _dom.repairCost.textContent = '$' + _fmt(cost);

    if (_dom.btnRepairNow) {
      const canRepair = damage > 0 && (_playerState.money || 0) >= cost;
      _dom.btnRepairNow.disabled = !canRepair;
      _dom.btnRepairNow.textContent = damage === 0 ? '✓ Vehicle is fine' : '🛠 REPAIR NOW';
    }
  }

  function _populateUpgrades() {
    const list = _dom.upgradeList;
    if (!list || !_playerState) return;
    list.innerHTML = '';

    for (const [key, upgCfg] of Object.entries(CONFIG.UPGRADES)) {
      const currentLevel = _playerState.upgrades?.[key] || 0;
      const maxLevel     = upgCfg.levels.length;
      const isMaxed      = currentLevel >= maxLevel;
      const nextLevel    = isMaxed ? null : upgCfg.levels[currentLevel];
      const canAfford    = nextLevel && (_playerState.money || 0) >= nextLevel.price;

      let pipsHtml = '';
      for (let i = 0; i < maxLevel; i++) {
        pipsHtml += `<div class="upgrade-pip${i < currentLevel ? ' filled' : ''}"></div>`;
      }

      const row = document.createElement('div');
      row.className   = `upgrade-row${isMaxed ? ' maxed' : ''}`;
      row.dataset.upgrade = key;
      row.innerHTML = `
        <span class="upgrade-icon">${upgCfg.icon}</span>
        <div class="upgrade-info">
          <span class="upgrade-name">${upgCfg.name}</span>
          <span class="upgrade-desc">${upgCfg.description}</span>
          <div class="upgrade-pips">${pipsHtml}</div>
        </div>
        <div class="upgrade-buy-col">
          <span class="upgrade-next-cost">
            ${isMaxed ? 'MAX' : '$' + _fmt(nextLevel.price)}
          </span>
          <button class="btn btn-primary btn-sm"
                  data-upgradekey="${key}"
                  ${isMaxed || !canAfford ? 'disabled' : ''}>
            ${isMaxed ? 'MAXED' : 'UPGRADE'}
          </button>
        </div>`;

      row.querySelector('button')?.addEventListener('click', () => {
        if (callbacks.onUpgrade) callbacks.onUpgrade(key);
      });

      list.appendChild(row);
    }
  }

  function _refreshUpgradeButtons() {
    if (!_dom.upgradeList) return;
    _dom.upgradeList.querySelectorAll('[data-upgradekey]').forEach(btn => {
      const key          = btn.dataset.upgradekey;
      const currentLevel = _playerState?.upgrades?.[key] || 0;
      const upgCfg       = CONFIG.UPGRADES[key];
      if (!upgCfg) return;

      const isMaxed   = currentLevel >= upgCfg.levels.length;
      const nextLevel = isMaxed ? null : upgCfg.levels[currentLevel];
      const canAfford = nextLevel && (_playerState?.money || 0) >= nextLevel.price;

      btn.disabled = isMaxed || !canAfford;
      btn.textContent = isMaxed ? 'MAXED' : 'UPGRADE';
    });
  }

  function _populatePaint() {
    _buildPaintSwatches();
    _buildPaintPreviewScene();
    _updatePaintTotal();
  }

  function _buildPaintSwatches() {
    const grid = _dom.paintColorGrid;
    if (!grid) return;
    grid.innerHTML = '';

    if (!_paintColorHex && _playerState?.paintHex) {
      _paintColorHex = _playerState.paintHex;
    }
    if (!_paintColorHex) {
      _paintColorHex = CONFIG.PAINT.COLORS[0].hex;
    }

    for (const color of CONFIG.PAINT.COLORS) {
      const swatch = document.createElement('div');
      swatch.className   = 'color-swatch' + (color.hex === _paintColorHex ? ' active' : '');
      swatch.title       = color.name;
      swatch.setAttribute('role',        'radio');
      swatch.setAttribute('aria-label',  color.name);
      swatch.setAttribute('aria-checked', String(color.hex === _paintColorHex));
      swatch.style.background = _hexToCSS(color.hex);

      swatch.addEventListener('click', () => {
        _paintColorHex = color.hex;
        grid.querySelectorAll('.color-swatch').forEach(s => {
          const isActive = parseInt(s.dataset.hex, 16) === color.hex;
          s.classList.toggle('active', isActive);
          s.setAttribute('aria-checked', String(isActive));
        });
        swatch.dataset.hex = color.hex;
        _updatePaintTotal();
        if (_paintPreview) _paintPreview.updateColor(_paintColorHex, _paintFinish);
      });

      swatch.dataset.hex = color.hex;
      grid.appendChild(swatch);
    }

    _dom.paintFinishRow?.querySelectorAll('[data-finish]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.finish === _paintFinish);
    });
  }

  function _selectFinish(finish) {
    _paintFinish = finish;
    _dom.paintFinishRow?.querySelectorAll('[data-finish]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.finish === finish);
    });
    _updatePaintTotal();
    if (_paintPreview) _paintPreview.updateColor(_paintColorHex, _paintFinish);
  }

  function _calcPaintCost() {
    return CONFIG.PAINT.COST + (CONFIG.PAINT.FINISH_COST[_paintFinish] || 0);
  }

  function _updatePaintTotal() {
    const cost = _calcPaintCost();
    if (_dom.paintTotal) _dom.paintTotal.textContent = '$' + _fmt(cost);

    if (_dom.btnPaintApply) {
      const canAfford = (_playerState?.money || 0) >= cost && !!_paintColorHex;
      _dom.btnPaintApply.disabled = !canAfford;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAR DEALER
  // ══════════════════════════════════════════════════════════════════════════

  function openDealer(playerState, dealerCfg) {
    _playerState   = playerState  || _playerState;
    _activeDealer  = dealerCfg    || _activeDealer;
    _selectedCarId = null;

    if (_dom.dealerWallet && _playerState) {
      _dom.dealerWallet.textContent = '$' + _fmt(_playerState.money || 0);
    }
    if (_dom.dealerName && _activeDealer) {
      _dom.dealerName.textContent = _activeDealer.name;
    }

    _buildCarGrid();
    _clearCarDetail();
    hideAll();
    _showScreen('dealer');
  }

  function _buildCarGrid() {
    const grid = _dom.carGrid;
    if (!grid) return;
    grid.innerHTML = '';

    const ownedCars  = _playerState?.ownedCars  || [_playerState?.carId];
    const currentCar = _playerState?.carId;
    const money      = _playerState?.money || 0;

    for (const [carId, car] of Object.entries(CONFIG.CARS)) {
      const isOwned   = ownedCars.includes(carId);
      const isCurrent = carId === currentCar;
      const canAfford = money >= car.price;

      const card = document.createElement('div');
      card.className   = 'car-card' +
        (isCurrent ? ' current' : isOwned ? ' owned' : !canAfford ? ' locked' : '');
      card.dataset.car = carId;
      card.setAttribute('role', 'button');
      card.tabIndex = 0;

      card.innerHTML = `
        <div class="car-card-name">${car.name}</div>
        <div class="car-card-price">${car.price === 0 ? 'STARTER' : '$' + _fmt(car.price)}</div>
        <div class="car-card-tag">
          ${isCurrent ? '✓ Current' : isOwned ? 'Owned' : !canAfford ? '🔒 Locked' : 'Available'}
        </div>`;

      card.addEventListener('click',   () => _selectCar(carId));
      card.addEventListener('keydown', e  => { if (e.key === 'Enter' || e.key === ' ') _selectCar(carId); });
      grid.appendChild(card);
    }
  }

  function _selectCar(carId) {
    _selectedCarId = carId;
    _dom.carGrid?.querySelectorAll('.car-card').forEach(c => {
      c.classList.toggle('active', c.dataset.car === carId);
    });
    _showCarDetail(carId);
  }

  function _showCarDetail(carId) {
    const panel = _dom.carDetailPanel;
    if (!panel) return;

    const car = CONFIG.CARS[carId];
    if (!car) return;

    const owned     = (_playerState?.ownedCars || [_playerState?.carId]).includes(carId);
    const isCur     = carId === _playerState?.carId;
    const canAfford = (_playerState?.money || 0) >= car.price;
    const s         = car.stats;

    const statRows = [
      { label: 'Top Speed',    pct: Math.round(s.topSpeed    / 290 * 100) },
      { label: 'Acceleration', pct: Math.round((1 - (s.acceleration - 2) / 5) * 100) },
      { label: 'Handling',     pct: Math.round(s.handling    * 100)  },
      { label: 'Braking',      pct: Math.round(s.braking     * 100)  },
      { label: 'Grip',         pct: Math.round(s.grip        * 100)  },
    ];

    let statsHtml = '<div class="car-stats-grid">';
    for (const row of statRows) {
      const pct = MathUtils.clamp(row.pct, 0, 100);
      statsHtml += `
        <div class="car-stat-row">
          <span class="car-stat-label">${row.label}</span>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="car-stat-val">${pct}</span>
        </div>`;
    }
    statsHtml += '</div>';

    let btnLabel, btnDisabled;
    if (isCur)           { btnLabel = '✓ CURRENT CAR';            btnDisabled = true;  }
    else if (owned)      { btnLabel = '✓ SWITCH TO THIS CAR';     btnDisabled = false; }
    else if (!canAfford) { btnLabel = '💸 INSUFFICIENT FUNDS';    btnDisabled = true;  }
    else                 { btnLabel = `🚗 BUY — $${_fmt(car.price)}`; btnDisabled = false; }

    panel.innerHTML = `
      <div id="dealer-preview-wrap">
        <canvas id="dealer-preview-canvas" aria-label="3D car preview"></canvas>
      </div>
      <div class="car-detail-info">
        <div class="car-detail-name">${car.name}</div>
        <p class="car-detail-desc">${car.description}</p>
        ${statsHtml}
        <div class="car-price-row">
          ${car.price === 0 ? 'Free starter car' : '$' + _fmt(car.price)}
        </div>
        <button class="btn btn-primary btn-full" id="btn-buy-car" ${btnDisabled ? 'disabled' : ''}>
          ${btnLabel}
        </button>
      </div>`;

    const buyBtn = panel.querySelector('#btn-buy-car');
    if (buyBtn && !btnDisabled) {
      buyBtn.addEventListener('click', () => {
        if (callbacks.onBuyCar) callbacks.onBuyCar(carId);
      });
    }

    _disposePreview('dealer');
    const canvas = panel.querySelector('#dealer-preview-canvas');
    if (canvas) {
      _dealerPreview = _createPreviewScene(canvas, car, car.colors.body, 'standard');
    }
  }

  function _clearCarDetail() {
    if (_dom.carDetailPanel) {
      _dom.carDetailPanel.innerHTML =
        '<p style="color:var(--clr-light-1);font-size:var(--fs-sm);text-align:center;">' +
        'Select a car to see details.</p>';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE RESULTS
  // ══════════════════════════════════════════════════════════════════════════

  function openResults(data) {
    const place = data.place || 'DNF';

    if (_dom.resultsPlace) {
      const placeMap = { 1: '1ST', 2: '2ND', 3: '3RD', DNF: 'DNF' };
      const classMap = { 1: 'place-1st', 2: 'place-2nd', 3: 'place-3rd', DNF: 'place-dnf' };
      _dom.resultsPlace.textContent = placeMap[place] || String(place);
      _dom.resultsPlace.className   =
        'results-place-display ' + (classMap[place] || 'place-dnf');
    }

    if (_dom.resultsRaceName) _dom.resultsRaceName.textContent = data.raceName || '';
    if (_dom.resultsTime)     _dom.resultsTime.textContent     = HUD.formatTime(data.timeSeconds || 0);
    if (_dom.resultsTopSpeed) _dom.resultsTopSpeed.textContent = Math.round(data.topSpeedKmh || 0);
    if (_dom.resultsDamage)   _dom.resultsDamage.textContent   = Math.round(data.damagePct || 0) + '%';
    if (_dom.resultsPrize)    _dom.resultsPrize.textContent    = '$' + _fmt(data.prize || 0);

    hideAll();
    _showScreen('results');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GAME OVER
  // ══════════════════════════════════════════════════════════════════════════

  function openGameOver(data) {
    if (_dom.gameoverReason) _dom.gameoverReason.textContent = data.reason || 'Your car was destroyed.';
    if (_dom.goMoneyEarned)  _dom.goMoneyEarned.textContent  = '$' + _fmt(data.moneyEarned  || 0);
    if (_dom.goRacesWon)     _dom.goRacesWon.textContent     = data.racesWon    || 0;
    if (_dom.goPassengers)   _dom.goPassengers.textContent   = data.passengers  || 0;
    if (_dom.goWanted)       _dom.goWanted.textContent       = '★' + (data.wantedLevel || 0);

    const cost = data.respawnCost || 200;
    if (_dom.btnRespawn) {
      _dom.btnRespawn.textContent = `🏥 RESPAWN ($${_fmt(cost)})`;
      _dom.btnRespawn.disabled    = (_playerState?.money || 0) < cost;
    }

    hideAll();
    _showScreen('gameover');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAXI MISSION ACCEPT
  // ══════════════════════════════════════════════════════════════════════════

  function openMission(mission) {
    if (_dom.missionHeading)   _dom.missionHeading.textContent   = mission.name        || 'Taxi Request';
    if (_dom.missionPickup)    _dom.missionPickup.textContent    = mission.fromName    || '—';
    if (_dom.missionDest)      _dom.missionDest.textContent      = mission.toName      || '—';
    if (_dom.missionBasePay)   _dom.missionBasePay.textContent   = '$' + _fmt(mission.basePay    || CONFIG.PASSENGERS.BASE_PAY);
    if (_dom.missionTimeBonus) _dom.missionTimeBonus.textContent = '+$' + _fmt(mission.timeBonus || CONFIG.PASSENGERS.TIME_BONUS_MAX);
    if (_dom.missionDistance)  {
      const km = ((mission.distanceM || 0) / 10).toFixed(1);
      _dom.missionDistance.textContent = km + ' km';
    }
    _showScreen('mission');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════════════════

  function openSettings() {
    _showScreen('settings');
  }

  function _bindSettings() {
    const sliderPairs = [
      [_dom.sliderMasterVol, _dom.valMasterVol, 'masterVolume'],
      [_dom.sliderSfxVol,    _dom.valSfxVol,    'sfxVolume'],
      [_dom.sliderAmbVol,    _dom.valAmbVol,    'ambientVolume'],
    ];

    sliderPairs.forEach(([slider, label, key]) => {
      if (!slider) return;
      slider.addEventListener('input', () => {
        const v = parseInt(slider.value, 10);
        if (label) label.textContent = v;
        if (callbacks.onSettingsChange) callbacks.onSettingsChange(key, v / 100);
      });
    });

    _dom.qualitySelect?.addEventListener('click', e => {
      const btn = e.target.closest('[data-quality]');
      if (!btn) return;
      _dom.qualitySelect.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (callbacks.onSettingsChange) callbacks.onSettingsChange('quality', btn.dataset.quality);
    });

    _dom.camModeSelect?.addEventListener('click', e => {
      const btn = e.target.closest('[data-cam]');
      if (!btn) return;
      _dom.camModeSelect.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (callbacks.onSettingsChange) callbacks.onSettingsChange('cameraMode', btn.dataset.cam);
    });

    const toggleMap = [
      [_dom.toggleShadows,   'shadows'],
      [_dom.toggleDayCycle,  'dayCycle'],
      [_dom.toggleInvertY,   'invertCamY'],
      [_dom.toggleTraffic,   'traffic'],
      [_dom.togglePolice,    'police'],
      [_dom.toggleTouch,     'touchControls'],
      [_dom.toggleVibration, 'vibration'],
    ];

    toggleMap.forEach(([el, key]) => {
      if (!el) return;
      el.addEventListener('change', () => {
        if (callbacks.onSettingsChange) callbacks.onSettingsChange(key, el.checked);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3-D PREVIEW SCENES
  // ══════════════════════════════════════════════════════════════════════════

  function _createPreviewScene(canvas, carCfg, colorHex, finish) {
    if (!canvas || typeof THREE === 'undefined') return null;

    const parent = canvas.parentElement;
    const w = parent ? Math.max(parent.clientWidth,  200) : 240;
    const h = parent ? Math.max(parent.clientHeight, 160) : 180;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x14181f);

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 80);
    camera.position.set(4.5, 2.8, 5.5);
    camera.lookAt(0, 0.6, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff5e8, 1.3);
    key.position.set(6, 9, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8899cc, 0.45);
    fill.position.set(-5, 3, -4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(0, -2, -6);
    scene.add(rim);

    const groundGeo = new THREE.PlaneGeometry(14, 14);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x111419, metalness: 0.0, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    const carGroup = _buildPreviewCarMesh(carCfg, colorHex, finish);
    scene.add(carGroup);

    const handle = { animId: null };

    function render() {
      handle.animId = requestAnimationFrame(render);
      carGroup.rotation.y += 0.007;
      renderer.render(scene, camera);
    }
    render();

    handle.updateColor = (newHex, newFinish) => {
      carGroup.traverse(child => {
        if (child.isMesh && child.userData.isBody) {
          child.material.color.setHex(newHex);
          _applyFinishToMaterial(child.material, newFinish);
        }
      });
    };

    handle.dispose = () => {
      cancelAnimationFrame(handle.animId);
      scene.traverse(child => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      renderer.dispose();
    };

    return handle;
  }

  function _buildPreviewCarMesh(carCfg, colorHex, finish) {
    const b = carCfg.body;
    const g = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex });
    _applyFinishToMaterial(bodyMat, finish);

    const glassMat = new THREE.MeshStandardMaterial({ color: 0x334466, transparent: true, opacity: 0.72, roughness: 0.15 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const rimMat   = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.85, roughness: 0.12 });

    const lowerGeo  = new THREE.BoxGeometry(b.width, b.height * 0.52, b.length);
    const lowerMesh = new THREE.Mesh(lowerGeo, bodyMat);
    lowerMesh.position.y = b.height * 0.26;
    lowerMesh.userData.isBody = true;
    g.add(lowerMesh);

    const cabinW    = b.width  * 0.86;
    const cabinH    = b.height * 0.42;
    const cabinL    = b.length * 0.54;
    const cabinGeo  = new THREE.BoxGeometry(cabinW, cabinH, cabinL);
    const cabinMesh = new THREE.Mesh(cabinGeo, bodyMat);
    cabinMesh.position.set(0, b.height * 0.26 + b.height * 0.52 * 0.5 + cabinH * 0.5 - 0.04, b.length * 0.03);
    cabinMesh.userData.isBody = true;
    g.add(cabinMesh);

    const wsGeo  = new THREE.BoxGeometry(cabinW * 0.92, cabinH * 0.70, 0.06);
    const wsMesh = new THREE.Mesh(wsGeo, glassMat);
    wsMesh.position.copy(cabinMesh.position);
    wsMesh.position.z += cabinL * 0.5 + 0.02;
    wsMesh.rotation.x  = 0.30;
    g.add(wsMesh);

    const rwMesh = wsMesh.clone();
    rwMesh.position.copy(cabinMesh.position);
    rwMesh.position.z -= cabinL * 0.5 + 0.02;
    rwMesh.rotation.x  = -0.30;
    g.add(rwMesh);

    const headGeo = new THREE.BoxGeometry(b.width * 0.28, b.height * 0.10, 0.08);
    [-1, 1].forEach(side => {
      const hl = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 0.6 }));
      hl.position.set(side * b.width * 0.3, b.height * 0.26, b.length * 0.5 - 0.04);
      g.add(hl);
    });

    const wR   = b.height * 0.285;
    const wTh  = b.width  * 0.115;
    const wbH  = b.wheelbase * 0.5;
    const offX = b.width * 0.5 + wTh * 0.5 + 0.01;
    const wheelPositions = [
      [ offX, 0,  wbH], [-offX, 0,  wbH],
      [ offX, 0, -wbH], [-offX, 0, -wbH],
    ];

    for (const [wx, wy, wz] of wheelPositions) {
      const tireGeo  = new THREE.CylinderGeometry(wR, wR, wTh, 18);
      const tireMesh = new THREE.Mesh(tireGeo, wheelMat);
      tireMesh.rotation.z = Math.PI / 2;
      tireMesh.position.set(wx, wR, wz);
      g.add(tireMesh);

      const rimGeo  = new THREE.CylinderGeometry(wR * 0.58, wR * 0.58, wTh + 0.015, 8);
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.rotation.z = Math.PI / 2;
      rimMesh.position.set(wx, wR, wz);
      g.add(rimMesh);
    }

    return g;
  }

  function _applyFinishToMaterial(mat, finish) {
    switch (finish) {
      case 'metallic': mat.metalness = 0.82;  mat.roughness = 0.18;  break;
      case 'matte':    mat.metalness = 0.00;  mat.roughness = 0.96;  break;
      case 'chrome':   mat.metalness = 1.00;  mat.roughness = 0.04;  break;
      default:         mat.metalness = 0.08;  mat.roughness = 0.54;
    }
    mat.needsUpdate = true;
  }

  function _buildPaintPreviewScene() {
    _disposePreview('paint');
    const canvas = _dom.paintCanvas;
    if (!canvas || !_playerState) return;
    const carCfg = CONFIG.CARS[_playerState.carId];
    if (!carCfg) return;
    _paintPreview = _createPreviewScene(
      canvas,
      carCfg,
      _paintColorHex || carCfg.colors.body,
      _paintFinish
    );
  }

  function _disposePreview(which) {
    if (which === 'paint' && _paintPreview) {
      _paintPreview.dispose();
      _paintPreview = null;
    }
    if (which === 'dealer' && _dealerPreview) {
      _dealerPreview.dispose();
      _dealerPreview = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITY HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function _fmt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function _hexToCSS(hex) {
    return '#' + ('000000' + Math.round(hex).toString(16)).slice(-6);
  }

  function _on(el, event, handler) {
    if (el) el.addEventListener(event, handler);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({
    init,
    dispose,
    hideAll,
    openMain,
    openSaves,
    openPause,
    openGarage,
    openDealer,
    openRaces,
    openResults,
    openGameOver,
    openMission,
    openSettings,
    refreshGarage,
    callbacks,
  });

})();

if (typeof module !== 'undefined') module.exports = MenuManager;
/* ```

There's the complete file — ready to copy directly. Say **"File 35"** for `js/core/Game.js`. */
