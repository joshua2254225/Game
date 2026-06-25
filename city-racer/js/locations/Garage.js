/* ## `js/locations/Garage.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — Garage.js
 * ============================================================================
 * Manages all garage location logic and UI.
 *
 * Responsibilities:
 *   • Open / close the garage screen when player enters a garage marker
 *   • Populate repair tab with current damage state and cost
 *   • Populate upgrades tab with all six upgrade types and their levels
 *   • Populate paint tab with colour swatches and finish buttons
 *   • Handle all purchase confirmations via EconomySystem
 *   • Apply purchased upgrades / paint to the live PlayerCar mesh
 *   • Render a mini Three.js car preview in the paint-preview canvas
 *   • Clear police wanted level on garage entry (player hides inside)
 *   • Auto-repair prompt when damage > CONFIG.PLAYER.REPAIR_WARN_PCT
 *   • Sync HUD wallet display after every transaction
 * ============================================================================
 */

'use strict';

const Garage = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  /** Currently open garage config (CONFIG.GARAGES entry). */
  let _garageCfg    = null;

  /** Live player state reference. */
  let _playerState  = null;

  /** Live PlayerCar reference. */
  let _playerCar    = null;

  /** Active tab: 'repair' | 'upgrades' | 'paint' */
  let _activeTab    = 'repair';

  // ── Paint preview mini-scene ──────────────────────────────────────────────
  let _previewRenderer  = null;
  let _previewScene     = null;
  let _previewCamera    = null;
  let _previewCarMesh   = null;
  let _previewAnimId    = null;

  // Currently selected paint options
  let _selectedColor    = null;   // hex integer
  let _selectedFinish   = 'standard';

  // DOM element cache
  const _el = {};

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Cache DOM references and wire up static button listeners.
   * Call once during game boot (before any garage is opened).
   */
  function init() {
    _el.screen        = document.getElementById('screen-garage');
    _el.garageName    = document.getElementById('garage-name');
    _el.wallet        = document.getElementById('garage-wallet');

    // Tab buttons
    _el.tabRepair     = document.getElementById('tab-repair');
    _el.tabUpgrades   = document.getElementById('tab-upgrades');
    _el.tabPaint      = document.getElementById('tab-paint');

    // Tab panes
    _el.paneRepair    = document.getElementById('garage-pane-repair');
    _el.paneUpgrades  = document.getElementById('garage-pane-upgrades');
    _el.panePaint     = document.getElementById('garage-pane-paint');

    // Repair tab
    _el.carName       = document.getElementById('repair-car-name');
    _el.damagePct     = document.getElementById('repair-damage-pct');
    _el.repairBar     = document.getElementById('repair-bar');
    _el.repairCost    = document.getElementById('repair-cost');
    _el.btnRepair     = document.getElementById('btn-repair-now');

    // Upgrades tab
    _el.upgradeList   = document.getElementById('upgrade-list');

    // Paint tab
    _el.colorGrid     = document.getElementById('paint-color-grid');
    _el.finishRow     = document.getElementById('paint-finish-row');
    _el.paintTotal    = document.getElementById('paint-total');
    _el.btnPaint      = document.getElementById('btn-paint-apply');
    _el.previewCanvas = document.getElementById('paint-preview-canvas');

    // Back button
    _el.btnBack       = document.getElementById('btn-garage-back');

    _attachListeners();

    console.info('[Garage] Initialised.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ══════════════════════════════════════════════════════════════════════════

  function _attachListeners() {
    // Tab switching
    _el.tabRepair?.addEventListener('click',   () => _switchTab('repair'));
    _el.tabUpgrades?.addEventListener('click', () => _switchTab('upgrades'));
    _el.tabPaint?.addEventListener('click',    () => _switchTab('paint'));

    // Repair button
    _el.btnRepair?.addEventListener('click', _onRepair);

    // Paint apply button
    _el.btnPaint?.addEventListener('click', _onApplyPaint);

    // Back / leave
    _el.btnBack?.addEventListener('click', close);

    // Listen for garage entry events from PlayerCar
    window.addEventListener('cityracer:enter_garage', e => {
      const { id } = e.detail;
      const cfg    = CONFIG.GARAGES.find(g => g.id === id);
      if (cfg) open(cfg);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OPEN / CLOSE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Open the garage screen for a given garage config.
   *
   * @param {object}      garageCfg    CONFIG.GARAGES entry.
   * @param {object}      playerState  Live SaveSystem state.
   * @param {PlayerCar}   playerCar    Live vehicle instance.
   * @param {object}      [systems]    Optional references: { policeSystem }
   */
  function open(garageCfg, playerState, playerCar, systems = {}) {
    _garageCfg   = garageCfg;
    _playerState = playerState  || _playerState;
    _playerCar   = playerCar    || _playerCar;

    if (!_playerState || !_garageCfg) {
      console.warn('[Garage] open() called without playerState or garageCfg.');
      return;
    }

    // Clear wanted level — player is hiding inside
    if (systems.policeSystem) {
      systems.policeSystem.clearWanted();
    }

    // Initialise selected paint from current car state
    const carState      = _playerState.carStates[_playerState.activeCar];
    _selectedColor      = carState?.paintHex  ?? CONFIG.CARS[_playerState.activeCar]?.colors.body ?? 0xCC3333;
    _selectedFinish     = carState?.finish    ?? 'standard';

    // Show screen
    _el.screen?.classList.remove('hidden');
    _switchTab('repair');
    _populateRepair();
    _buildColorGrid();
    _initPaintPreview();

    // Auto-repair prompt
    if (carState && carState.damage >= CONFIG.PLAYER.REPAIR_WARN_PCT) {
      Notifications.toast('🔧', `Vehicle damage at ${Math.round(carState.damage)}%! Consider repairing.`, 'warn', 3.5);
    }
  }

  /**
   * Close the garage screen.
   */
  function close() {
    _el.screen?.classList.add('hidden');
    _stopPaintPreview();
    _garageCfg = null;
  }

  /**
   * Provide references to live objects.
   * Called by Game.js once player and state are ready.
   */
  function setContext(playerState, playerCar) {
    _playerState = playerState;
    _playerCar   = playerCar;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  function _switchTab(tab) {
    _activeTab = tab;

    // Update tab button styles
    const tabs = { repair: _el.tabRepair, upgrades: _el.tabUpgrades, paint: _el.tabPaint };
    for (const [key, btn] of Object.entries(tabs)) {
      btn?.classList.toggle('active', key === tab);
      btn?.setAttribute('aria-selected', String(key === tab));
    }

    // Show/hide panes
    _el.paneRepair?.classList.toggle('hidden',   tab !== 'repair');
    _el.paneUpgrades?.classList.toggle('hidden', tab !== 'upgrades');
    _el.panePaint?.classList.toggle('hidden',    tab !== 'paint');

    // Populate on demand
    if (tab === 'upgrades') _populateUpgrades();
    if (tab === 'paint')    _populatePaintTab();

    _syncWallet();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REPAIR TAB
  // ══════════════════════════════════════════════════════════════════════════

  function _populateRepair() {
    if (!_playerState) return;

    const carId    = _playerState.activeCar;
    const carCfg   = CONFIG.CARS[carId];
    const carState = _playerState.carStates[carId];

    if (!carCfg || !carState) return;

    const damage    = carState.damage || 0;
    const healthPct = 100 - damage;
    const cost      = Math.ceil(damage * _garageCfg.repairCostPerPercent);

    // Car name
    if (_el.carName) _el.carName.textContent = carCfg.name;

    // Damage percentage label
    if (_el.damagePct) {
      _el.damagePct.textContent = `${Math.round(healthPct)}%`;
      _el.damagePct.className   = `repair-damage-pct ${
        healthPct < 30 ? 'danger' : healthPct < 60 ? 'warn' : 'ok'
      }`;
    }

    // Repair bar
    if (_el.repairBar) {
      _el.repairBar.style.width  = `${healthPct}%`;
      _el.repairBar.className    = `progress-fill ${
        healthPct < 30 ? 'danger' : healthPct < 60 ? 'warn' : 'success'
      }`;
    }

    // Cost label
    if (_el.repairCost) {
      _el.repairCost.textContent = damage > 0 ? MathUtils.formatMoney(cost) : '$0';
    }

    // Repair button state
    if (_el.btnRepair) {
      const canAfford     = _playerState.money >= cost;
      const needsRepair   = damage > 0;
      _el.btnRepair.disabled    = !needsRepair || !canAfford;
      _el.btnRepair.textContent = !needsRepair
        ? '✅ Perfect Condition'
        : !canAfford
          ? `Need ${MathUtils.formatMoney(cost)}`
          : `🛠 Repair for ${MathUtils.formatMoney(cost)}`;
    }

    _syncWallet();
  }

  function _onRepair() {
    if (!_garageCfg || !_playerState) return;

    const result = EconomySystem.repairCar(_garageCfg.id);
    if (result.success) {
      // Apply to live car mesh
      if (_playerCar) _playerCar.repair();
    }

    _populateRepair();
    _syncWallet();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UPGRADES TAB
  // ══════════════════════════════════════════════════════════════════════════

  function _populateUpgrades() {
    if (!_el.upgradeList || !_playerState) return;

    const carId    = _playerState.activeCar;
    const carState = _playerState.carStates[carId];
    if (!carState) return;

    _el.upgradeList.innerHTML = '';

    for (const [key, upgCfg] of Object.entries(CONFIG.UPGRADES)) {
      const currentLevel = carState.upgrades[key] || 0;
      const maxLevel     = upgCfg.levels.length;
      const isMaxed      = currentLevel >= maxLevel;
      const nextLevel    = isMaxed ? null : upgCfg.levels[currentLevel];
      const cost         = nextLevel ? nextLevel.price : 0;
      const canAfford    = !isMaxed && _playerState.money >= cost;

      // ── Row container ──────────────────────────────────────────────────
      const row      = document.createElement('div');
      row.className  = 'upgrade-row';
      row.dataset.upgrade = key;

      // Icon
      const icon     = document.createElement('span');
      icon.className = 'upgrade-icon';
      icon.textContent = upgCfg.icon;
      row.appendChild(icon);

      // Info block
      const info     = document.createElement('div');
      info.className = 'upgrade-info';

      const nameEl   = document.createElement('span');
      nameEl.className   = 'upgrade-name';
      nameEl.textContent = upgCfg.name;

      const descEl   = document.createElement('span');
      descEl.className   = 'upgrade-desc';
      descEl.textContent = upgCfg.description;

      // Level pips
      const pips     = document.createElement('div');
      pips.className = 'upgrade-pips';
      for (let i = 0; i < maxLevel; i++) {
        const pip      = document.createElement('div');
        pip.className  = 'upgrade-pip' +
          (i < currentLevel
            ? (currentLevel === maxLevel ? ' maxed' : ' filled')
            : '');
        pips.appendChild(pip);
      }

      info.append(nameEl, descEl, pips);
      row.appendChild(info);

      // Buy column
      const buyCol     = document.createElement('div');
      buyCol.className = 'upgrade-buy-col';

      if (isMaxed) {
        const maxLabel     = document.createElement('span');
        maxLabel.className = 'upgrade-maxed-label';
        maxLabel.textContent = '★ MAX';
        buyCol.appendChild(maxLabel);
      } else {
        const costLabel     = document.createElement('span');
        costLabel.className = 'upgrade-next-cost';
        costLabel.textContent = MathUtils.formatMoney(cost);
        buyCol.appendChild(costLabel);

        const btn     = document.createElement('button');
        btn.className = `btn btn-primary btn-sm ${canAfford ? '' : ''}`;
        btn.textContent = 'UPGRADE';
        btn.disabled  = !canAfford;
        btn.addEventListener('click', () => _onBuyUpgrade(key));
        buyCol.appendChild(btn);
      }

      row.appendChild(buyCol);
      _el.upgradeList.appendChild(row);
    }

    _syncWallet();
  }

  function _onBuyUpgrade(upgradeKey) {
    if (!_playerState) return;

    const result = EconomySystem.purchaseUpgrade(upgradeKey);
    if (result.success) {
      // If the player is currently in their car, the stats update happens
      // via Game.js re-creating the PlayerCar with fresh effective stats.
      // For immediate feel, also update velocity cap on the live car.
      if (_playerCar) {
        const newStats = SaveSystem.getEffectiveCarStats(_playerState);
        _playerCar.stats = { ..._playerCar.stats, ...newStats };
      }

      Notifications.toast(
        CONFIG.UPGRADES[upgradeKey]?.icon || '⚙️',
        `${CONFIG.UPGRADES[upgradeKey]?.name} Level ${result.newLevel}!`,
        'success',
        2.5
      );
    }

    // Refresh the whole upgrades tab
    _populateUpgrades();
    _syncWallet();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAINT TAB
  // ══════════════════════════════════════════════════════════════════════════

  function _buildColorGrid() {
    if (!_el.colorGrid) return;

    _el.colorGrid.innerHTML = '';

    for (const colorDef of CONFIG.PAINT.COLORS) {
      const swatch          = document.createElement('div');
      swatch.className      = 'color-swatch';
      swatch.style.background = MathUtils.hexToCss(colorDef.hex);
      swatch.title          = colorDef.name;
      swatch.dataset.hex    = colorDef.hex;
      swatch.setAttribute('role', 'radio');
      swatch.setAttribute('aria-label', colorDef.name);

      if (colorDef.hex === _selectedColor) {
        swatch.classList.add('selected');
        swatch.setAttribute('aria-checked', 'true');
      }

      swatch.addEventListener('click', () => _onSelectColor(colorDef.hex, swatch));
      _el.colorGrid.appendChild(swatch);
    }
  }

  function _populatePaintTab() {
    _buildColorGrid();
    _updateFinishButtons();
    _updatePaintTotal();
  }

  function _onSelectColor(hex, swatchEl) {
    _selectedColor = hex;

    // Update swatch selection
    _el.colorGrid?.querySelectorAll('.color-swatch').forEach(s => {
      const isSelected = parseInt(s.dataset.hex) === hex;
      s.classList.toggle('selected', isSelected);
      s.setAttribute('aria-checked', String(isSelected));
    });

    // Update preview
    _updatePaintPreview();
    _updatePaintTotal();
  }

  function _updateFinishButtons() {
    if (!_el.finishRow) return;

    _el.finishRow.querySelectorAll('.finish-btn').forEach(btn => {
      const isActive = btn.dataset.finish === _selectedFinish;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', String(isActive));

      // Wire click only once
      if (!btn.dataset.wired) {
        btn.dataset.wired = '1';
        btn.addEventListener('click', () => {
          _selectedFinish = btn.dataset.finish;
          _updateFinishButtons();
          _updatePaintPreview();
          _updatePaintTotal();
        });
      }
    });
  }

  function _updatePaintTotal() {
    if (!_el.paintTotal) return;
    const base    = CONFIG.PAINT.COST;
    const finish  = CONFIG.PAINT.FINISH_COST[_selectedFinish] || 0;
    _el.paintTotal.textContent = MathUtils.formatMoney(base + finish);

    if (_el.btnPaint) {
      _el.btnPaint.disabled = _playerState
        ? _playerState.money < (base + finish)
        : true;
    }
  }

  function _onApplyPaint() {
    if (!_playerState || _selectedColor === null) return;

    const result = EconomySystem.purchasePaint(_selectedColor, _selectedFinish);
    if (result.success && _playerCar) {
      _playerCar.applyPaint(_selectedColor, _selectedFinish);
    }

    _updatePaintTotal();
    _syncWallet();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAINT PREVIEW  (mini Three.js scene)
  // ══════════════════════════════════════════════════════════════════════════

  function _initPaintPreview() {
    if (!_el.previewCanvas) return;

    // Stop any existing preview loop
    _stopPaintPreview();

    const W = _el.previewCanvas.clientWidth  || 280;
    const H = _el.previewCanvas.clientHeight || 120;

    // Renderer
    _previewRenderer = new THREE.WebGLRenderer({
      canvas:    _el.previewCanvas,
      antialias: true,
      alpha:     true,
    });
    _previewRenderer.setSize(W, H);
    _previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Scene
    _previewScene = new THREE.Scene();

    // Camera
    _previewCamera = new THREE.PerspectiveCamera(45, W / H, 0.1, 50);
    _previewCamera.position.set(4, 2.5, 5);
    _previewCamera.lookAt(0, 0.5, 0);

    // Lighting
    _previewScene.add(new THREE.AmbientLight(0xFFFFFF, 0.7));
    const dirLight = new THREE.DirectionalLight(0xFFEEDD, 1.2);
    dirLight.position.set(5, 8, 4);
    _previewScene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8899CC, 0.4);
    fillLight.position.set(-4, 2, -3);
    _previewScene.add(fillLight);

    // Build preview car mesh
    _buildPreviewCar();

    // Start loop
    _animatePaintPreview();
  }

  function _buildPreviewCar() {
    if (_previewCarMesh) {
      _previewScene.remove(_previewCarMesh);
      _previewCarMesh = null;
    }

    const carId  = _playerState?.activeCar || 'city_hatch';
    const carCfg = CONFIG.CARS[carId];
    if (!carCfg) return;

    const L = carCfg.body.length;
    const W = carCfg.body.width;
    const H = carCfg.body.height;

    const grp = new THREE.Group();

    // Body
    const bodyMat = new THREE.MeshStandardMaterial({
      color:     new THREE.Color(_selectedColor ?? carCfg.colors.body),
      roughness: _selectedFinish === 'matte'    ? 0.95 :
                 _selectedFinish === 'metallic' ? 0.35 :
                 _selectedFinish === 'chrome'   ? 0.05 : 0.60,
      metalness: _selectedFinish === 'chrome'   ? 0.95 :
                 _selectedFinish === 'metallic' ? 0.65 : 0.12,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(L, H * 0.55, W), bodyMat);
    body.position.y = H * 0.28;
    grp.add(body);

    // Cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.50, H * 0.40, W * 0.82),
      bodyMat
    );
    cabin.position.set(-L * 0.04, H * 0.55 + H * 0.20, 0);
    grp.add(cabin);

    // Wheels
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
    const rimMat  = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.35, metalness: 0.75 });
    const WB      = carCfg.body.wheelbase;
    const WR      = H * 0.30;
    const WW      = W * 0.14;

    const tyreGeo = new THREE.CylinderGeometry(WR, WR, WW, 12);
    tyreGeo.rotateZ(Math.PI / 2);
    const rimGeo  = new THREE.CylinderGeometry(WR * 0.55, WR * 0.55, WW + 0.01, 10);
    rimGeo.rotateZ(Math.PI / 2);

    for (const ax of [WB / 2, -WB / 2]) {
      for (const side of [-1, 1]) {
        const wg = new THREE.Group();
        wg.add(new THREE.Mesh(tyreGeo, tyreMat));
        wg.add(new THREE.Mesh(rimGeo,  rimMat));
        wg.position.set(ax, 0, side * (W / 2 + WW * 0.4));
        grp.add(wg);
      }
    }

    grp.position.y = WR;   // sit on the floor
    _previewScene.add(grp);
    _previewCarMesh = grp;
  }

  function _animatePaintPreview() {
    _previewAnimId = requestAnimationFrame(_animatePaintPreview);
    if (!_previewRenderer || !_previewScene || !_previewCamera) return;

    // Slowly rotate the car
    if (_previewCarMesh) {
      _previewCarMesh.rotation.y += 0.008;
    }

    _previewRenderer.render(_previewScene, _previewCamera);
  }

  function _updatePaintPreview() {
    if (!_previewCarMesh) return;

    // Update body and cabin material colour + finish
    _previewCarMesh.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material;
      if (!mat || mat.roughness === 0.95) return;   // skip tyres

      if (mat.metalness !== 0.75) {   // skip rims
        mat.color.setHex(_selectedColor ?? 0xCC3333);
        mat.roughness = _selectedFinish === 'matte'    ? 0.95 :
                        _selectedFinish === 'metallic' ? 0.35 :
                        _selectedFinish === 'chrome'   ? 0.05 : 0.60;
        mat.metalness = _selectedFinish === 'chrome'   ? 0.95 :
                        _selectedFinish === 'metallic' ? 0.65 : 0.12;
        mat.needsUpdate = true;
      }
    });
  }

  function _stopPaintPreview() {
    if (_previewAnimId) {
      cancelAnimationFrame(_previewAnimId);
      _previewAnimId = null;
    }
    if (_previewRenderer) {
      _previewRenderer.dispose();
      _previewRenderer = null;
    }
    _previewScene  = null;
    _previewCamera = null;
    _previewCarMesh = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WALLET SYNC
  // ══════════════════════════════════════════════════════════════════════════

  function _syncWallet() {
    if (!_playerState) return;
    const balance = _playerState.money;
    if (_el.wallet) {
      _el.wallet.textContent = MathUtils.formatMoney(balance);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    dispose: close,

    // Open / close
    open,
    close,

    // Context update
    setContext,

  });

})();

if (typeof module !== 'undefined') module.exports = Garage;
/* ```

---

**File 29 ✅ — `js/locations/Garage.js` done.**

This is the complete garage UI system. The repair tab reads the live car state's damage percentage, computes the cost from `garageCfg.repairCostPerPercent × damagePercent`, and enables/disables the repair button based on both the damage amount and wallet balance. The upgrades tab dynamically generates all six upgrade rows from `CONFIG.UPGRADES`, rendering the correct number of pip divs per upgrade with `filled` and `maxed` CSS classes, and wiring each buy button to `EconomySystem.purchaseUpgrade` which handles all money deduction and stat bonus application. The paint tab builds a 20-swatch colour grid with radio-style selection, four finish buttons, a live total-cost display that updates on every selection change, and an apply button that calls `EconomySystem.purchasePaint` then immediately calls `PlayerCar.applyPaint` to update the live car mesh without requiring a restart. The mini Three.js preview scene runs its own renderer, camera, and animation loop entirely separate from the main game renderer — it builds a simplified three-part car mesh and rotates it slowly, updating the body material colour and roughness/metalness values in real time as the player clicks swatches and finish buttons.

**Say "File 30" for `js/locations/CarDealer.js`.** */
