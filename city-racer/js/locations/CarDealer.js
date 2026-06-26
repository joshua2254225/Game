/* ## `js/locations/CarDealer.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — CarDealer.js
 * ============================================================================
 * Manages the car dealership UI and purchase flow.
 *
 * Responsibilities:
 *   • Open / close the dealer screen when player enters a dealer marker
 *   • Populate the car grid with all five purchasable vehicles
 *   • Show owned / locked / affordable status per car card
 *   • Render a rotating 3D car preview in the dealer canvas
 *   • Display stat bars for top speed, handling, braking, grip, weight
 *   • Handle car purchase via EconomySystem
 *   • Switch the player's active car (owned cars only)
 *   • Sync wallet display after every transaction
 *   • Emit CustomEvent so Game.js can rebuild the PlayerCar instance
 * ============================================================================
 */

'use strict';

const CarDealer = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  /** Currently open dealer config (CONFIG.DEALERS entry). */
  let _dealerCfg   = null;

  /** Live player state reference. */
  let _playerState = null;

  /** Currently selected car ID in the UI. */
  let _selectedCar = null;

  // ── 3D preview scene ──────────────────────────────────────────────────────
  let _prevRenderer = null;
  let _prevScene    = null;
  let _prevCamera   = null;
  let _prevCar      = null;     // THREE.Group
  let _prevAnimId   = null;
  let _prevRotY     = 0;

  // DOM element cache
  const _el = {};

  // ── Stat bar config ────────────────────────────────────────────────────────
  const STAT_BARS = [
    { key: 'topSpeed',     label: 'Top Speed',  max: 300 },
    { key: 'acceleration', label: 'Accel',      max: 7,   invert: true },
    { key: 'handling',     label: 'Handling',   max: 1    },
    { key: 'braking',      label: 'Braking',    max: 1    },
    { key: 'grip',         label: 'Grip',       max: 1    },
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Cache DOM references and wire static listeners.
   * Call once during game boot.
   */
  function init() {
    _el.screen       = document.getElementById('screen-dealer');
    _el.dealerName   = document.getElementById('dealer-name');
    _el.wallet       = document.getElementById('dealer-wallet');
    _el.carGrid      = document.getElementById('car-grid');
    _el.detailPanel  = document.getElementById('car-detail-panel');
    _el.previewCanvas = document.getElementById('dealer-preview-canvas');
    _el.btnBack      = document.getElementById('btn-dealer-back');

    _el.btnBack?.addEventListener('click', close);

    // Listen for dealer entry event from PlayerCar
    window.addEventListener('cityracer:enter_dealer', e => {
      const { id } = e.detail;
      const cfg    = CONFIG.DEALERS.find(d => d.id === id);
      if (cfg) open(cfg);
    });

    console.info('[CarDealer] Initialised.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OPEN / CLOSE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Open the dealer screen.
   *
   * @param {object} dealerCfg   CONFIG.DEALERS entry.
   * @param {object} playerState Live SaveSystem state.
   */
  function open(dealerCfg, playerState) {
    _dealerCfg   = dealerCfg;
    _playerState = playerState || _playerState;

    if (!_playerState || !_dealerCfg) {
      console.warn('[CarDealer] open() called without context.');
      return;
    }

    if (_el.dealerName) _el.dealerName.textContent = _dealerCfg.name;

    _el.screen?.classList.remove('hidden');

    // Default selection = active car
    _selectedCar = _playerState.activeCar;

    _populateCarGrid();
    _showCarDetail(_selectedCar);
    _initPreview(_selectedCar);
    _syncWallet();
  }

  /**
   * Close the dealer screen.
   */
  function close() {
    _el.screen?.classList.add('hidden');
    _stopPreview();
    _dealerCfg = null;
  }

  /**
   * Provide live player state reference.
   * @param {object} playerState
   */
  function setContext(playerState) {
    _playerState = playerState;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAR GRID
  // ══════════════════════════════════════════════════════════════════════════

  function _populateCarGrid() {
    if (!_el.carGrid || !_playerState) return;
    _el.carGrid.innerHTML = '';

    for (const [carId, carCfg] of Object.entries(CONFIG.CARS)) {
      const owned      = _playerState.ownedCars.includes(carId);
      const isActive   = _playerState.activeCar === carId;
      const isSelected = _selectedCar === carId;
      const canAfford  = _playerState.money >= carCfg.price;

      const card       = document.createElement('div');
      card.className   = [
        'car-card',
        owned      ? 'owned'    : '',
        isSelected ? 'selected' : '',
      ].filter(Boolean).join(' ');
      card.dataset.carId = carId;
      card.setAttribute('role',     'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-selected', String(isSelected));

      // ── Icon ─────────────────────────────────────────────────────────
      const icon       = document.createElement('div');
      icon.className   = 'car-card-icon';
      icon.textContent = _carEmoji(carId);
      card.appendChild(icon);

      // ── Info ──────────────────────────────────────────────────────────
      const info       = document.createElement('div');
      info.className   = 'car-card-info';

      const name       = document.createElement('div');
      name.className   = 'car-card-name';
      name.textContent = carCfg.name;

      const tag        = document.createElement('div');
      tag.className    = 'car-card-tagline';
      tag.textContent  = carCfg.description.split('.')[0] + '.';

      info.append(name, tag);
      card.appendChild(info);

      // ── Price / status ────────────────────────────────────────────────
      const priceEl    = document.createElement('div');
      priceEl.className = 'car-card-price';

      if (owned && isActive) {
        priceEl.textContent = '✓ ACTIVE';
        priceEl.className  += ' free';
        priceEl.style.color = 'var(--clr-green)';
      } else if (owned) {
        priceEl.textContent = '✓ OWNED';
        priceEl.className  += ' free';
      } else if (carCfg.price === 0) {
        priceEl.textContent = 'FREE';
        priceEl.className  += ' free';
      } else {
        priceEl.textContent = String(carCfg.price.toLocaleString('en-US'));
        if (!canAfford) priceEl.style.color = 'var(--clr-red)';
      }
      card.appendChild(priceEl);

      // ── Click handler ─────────────────────────────────────────────────
      card.addEventListener('click', () => _selectCar(carId));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') _selectCar(carId);
      });

      _el.carGrid.appendChild(card);
    }
  }

  function _carEmoji(carId) {
    const map = {
      city_hatch:   '🚗',
      sport_sedan:  '🚙',
      muscle_coupe: '🏎',
      street_racer: '🏎',
      hypercar:     '🚀',
    };
    return map[carId] || '🚗';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAR SELECTION
  // ══════════════════════════════════════════════════════════════════════════

  function _selectCar(carId) {
    _selectedCar = carId;

    // Update card selection states
    _el.carGrid?.querySelectorAll('.car-card').forEach(card => {
      const isSelected = card.dataset.carId === carId;
      card.classList.toggle('selected', isSelected);
      card.setAttribute('aria-selected', String(isSelected));
    });

    _showCarDetail(carId);
    _updatePreviewCar(carId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAR DETAIL PANEL
  // ══════════════════════════════════════════════════════════════════════════

  function _showCarDetail(carId) {
    if (!_el.detailPanel || !_playerState) return;

    const carCfg  = CONFIG.CARS[carId];
    if (!carCfg) return;

    const owned   = _playerState.ownedCars.includes(carId);
    const isActive = _playerState.activeCar === carId;
    const canAfford = _playerState.money >= carCfg.price;

    // Clear existing detail content (below preview canvas)
    // We rebuild everything below the canvas each selection
    const existing = _el.detailPanel.querySelectorAll('.car-detail-name, .car-detail-desc, .car-stats-table, .dealer-buy-row');
    existing.forEach(el => el.remove());

    // ── Car name ──────────────────────────────────────────────────────────
    const nameEl = document.createElement('div');
    nameEl.className   = 'car-detail-name';
    nameEl.textContent = carCfg.name;
    _el.detailPanel.appendChild(nameEl);

    // ── Description ───────────────────────────────────────────────────────
    const descEl = document.createElement('p');
    descEl.className   = 'car-detail-desc';
    descEl.textContent = carCfg.description;
    _el.detailPanel.appendChild(descEl);

    // ── Stat bars ─────────────────────────────────────────────────────────
    const statsTable = document.createElement('div');
    statsTable.className = 'car-stats-table';

    for (const stat of STAT_BARS) {
      const raw   = carCfg.stats[stat.key] ?? 0;
      const pct   = stat.invert
        ? MathUtils.clamp(1 - (raw / stat.max), 0, 1)
        : MathUtils.clamp(raw / stat.max, 0, 1);

      const row   = document.createElement('div');
      row.className = 'car-stat-row';

      const label = document.createElement('span');
      label.className   = 'car-stat-label';
      label.textContent = stat.label;

      const track = document.createElement('div');
      track.className = 'car-stat-bar-track';

      const fill  = document.createElement('div');
      fill.className   = 'car-stat-bar-fill';
      fill.style.width = '0%';
      track.appendChild(fill);

      const num   = document.createElement('span');
      num.className   = 'car-stat-num';
      num.textContent = stat.key === 'topSpeed'
        ? `${Math.round(raw)}`
        : stat.invert
          ? `${raw.toFixed(1)}s`
          : `${Math.round(pct * 10)}/10`;

      row.append(label, track, num);
      statsTable.appendChild(row);

      // Animate bar fill after a brief delay
      requestAnimationFrame(() => {
        fill.style.transition = 'width 0.5s ease-out';
        fill.style.width      = `${pct * 100}%`;
      });
    }

    _el.detailPanel.appendChild(statsTable);

    // ── Buy / switch row ──────────────────────────────────────────────────
    const buyRow       = document.createElement('div');
    buyRow.className   = 'dealer-buy-row';

    const priceDisplay = document.createElement('div');
    priceDisplay.className = 'dealer-price-big' + (carCfg.price === 0 ? ' free' : '');

    if (owned && isActive) {
      priceDisplay.textContent = 'YOUR CAR';
      priceDisplay.className   = 'dealer-price-big free';
    } else if (owned) {
      priceDisplay.textContent = 'OWNED';
      priceDisplay.className   = 'dealer-price-big free';
    } else {
      priceDisplay.textContent = carCfg.price > 0
        ? String(carCfg.price.toLocaleString('en-US'))
        : 'FREE';
    }

    buyRow.appendChild(priceDisplay);

    // Balance row
    const balRow = document.createElement('div');
    balRow.className = 'dealer-balance-row';
    balRow.innerHTML = `
      <span>Your balance</span>
      <span class="val">${MathUtils.formatMoney(_playerState.money)}</span>
    `;
    buyRow.appendChild(balRow);

    // Action button
    const actionBtn = document.createElement('button');

    if (owned && isActive) {
      actionBtn.className   = 'btn btn-ghost btn-full';
      actionBtn.textContent = '✓ Currently Driving';
      actionBtn.disabled    = true;

    } else if (owned) {
      actionBtn.className   = 'btn btn-success btn-full';
      actionBtn.textContent = '🔄 Switch to This Car';
      actionBtn.addEventListener('click', () => _onSwitchCar(carId));

    } else if (!canAfford) {
      actionBtn.className   = 'btn btn-ghost btn-full';
      actionBtn.textContent = `Need ${MathUtils.formatMoney(carCfg.price - _playerState.money)} more`;
      actionBtn.disabled    = true;

    } else {
      actionBtn.className   = 'btn btn-primary btn-full';
      actionBtn.textContent = `🏎 BUY — ${MathUtils.formatMoney(carCfg.price)}`;
      actionBtn.addEventListener('click', () => _onBuyCar(carId));
    }

    buyRow.appendChild(actionBtn);
    _el.detailPanel.appendChild(buyRow);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PURCHASE / SWITCH HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  function _onBuyCar(carId) {
    if (!_playerState) return;

    const result = EconomySystem.purchaseCar(carId);

    if (result.success) {
      // Auto-switch to newly purchased car
      SaveSystem.setActiveCar(_playerState, carId);

      // Notify Game.js to rebuild PlayerCar
      window.dispatchEvent(new CustomEvent('cityracer:car_purchased', {
        detail: { carId, playerState: _playerState }
      }));

      // Refresh UI
      _populateCarGrid();
      _showCarDetail(carId);
      _syncWallet();

      Notifications.toast('🏎', `${CONFIG.CARS[carId].name} is yours!`, 'success', 3.5);
    }
  }

  function _onSwitchCar(carId) {
    if (!_playerState) return;

    const result = SaveSystem.setActiveCar(_playerState, carId);
    if (!result.success) {
      Notifications.toast('⚠️', result.message, 'warn', 2.0);
      return;
    }

    // Notify Game.js to rebuild PlayerCar with the new car
    window.dispatchEvent(new CustomEvent('cityracer:car_switched', {
      detail: { carId, playerState: _playerState }
    }));

    // Refresh the grid and detail panel
    _populateCarGrid();
    _showCarDetail(carId);

    Notifications.toast(
      _carEmoji(carId),
      `Switched to ${CONFIG.CARS[carId].name}`,
      'info',
      2.0
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3D PREVIEW
  // ══════════════════════════════════════════════════════════════════════════

  function _initPreview(carId) {
    if (!_el.previewCanvas) return;
    _stopPreview();

    const W = _el.previewCanvas.clientWidth  || 300;
    const H = _el.previewCanvas.clientHeight || 160;

    // Renderer
    _prevRenderer = new THREE.WebGLRenderer({
      canvas:    _el.previewCanvas,
      antialias: true,
      alpha:     true,
    });
    _prevRenderer.setSize(W, H);
    _prevRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _prevRenderer.toneMapping        = THREE.ACESFilmicToneMapping;
    _prevRenderer.toneMappingExposure = 1.1;

    // Scene
    _prevScene = new THREE.Scene();
    _prevScene.background = new THREE.Color(0x111418);

    // Camera
    _prevCamera = new THREE.PerspectiveCamera(42, W / H, 0.1, 60);
    _prevCamera.position.set(5.5, 2.8, 6);
    _prevCamera.lookAt(0, 0.6, 0);

    // Lighting
    _prevScene.add(new THREE.AmbientLight(0xFFEEDD, 0.55));

    const key = new THREE.DirectionalLight(0xFFEECC, 1.4);
    key.position.set(6, 9, 5);
    _prevScene.add(key);

    const fill = new THREE.DirectionalLight(0x8899CC, 0.5);
    fill.position.set(-5, 3, -4);
    _prevScene.add(fill);

    const rim  = new THREE.DirectionalLight(0xCCDDFF, 0.3);
    rim.position.set(0, -2, -8);
    _prevScene.add(rim);

    // Floor reflection plane
    const floorMat = new THREE.MeshStandardMaterial({
      color:     0x1A1E24,
      roughness: 0.35,
      metalness: 0.55,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    _prevScene.add(floor);

    // Build initial car
    _buildPreviewCar(carId);
    _prevRotY = 0;

    // Start loop
    _runPreviewLoop();
  }

  function _buildPreviewCar(carId) {
    if (_prevCar) {
      _prevScene?.remove(_prevCar);
      _prevCar = null;
    }
    if (!_prevScene) return;

    const carCfg = CONFIG.CARS[carId];
    if (!carCfg) return;

    const carState = _playerState?.carStates[carId];
    const paintHex = carState?.paintHex ?? carCfg.colors.body;
    const finish   = carState?.finish   ?? 'standard';

    const L  = carCfg.body.length;
    const W  = carCfg.body.width;
    const H  = carCfg.body.height;
    const WB = carCfg.body.wheelbase;

    const grp = new THREE.Group();

    // ── Paint material ────────────────────────────────────────────────────
    const bodyMat = new THREE.MeshStandardMaterial({
      color:     new THREE.Color(paintHex),
      roughness: finish === 'matte'    ? 0.95 :
                 finish === 'metallic' ? 0.30 :
                 finish === 'chrome'   ? 0.04 : 0.55,
      metalness: finish === 'chrome'   ? 0.95 :
                 finish === 'metallic' ? 0.70 : 0.15,
    });

    // ── Body ──────────────────────────────────────────────────────────────
    const body = new THREE.Mesh(new THREE.BoxGeometry(L, H * 0.56, W), bodyMat);
    body.position.y = H * 0.30;
    body.castShadow = true;
    grp.add(body);

    // ── Cabin ─────────────────────────────────────────────────────────────
    const cabW   = W * 0.82;
    const cabH   = H * 0.41;
    const cabin  = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.50, cabH, cabW),
      bodyMat
    );
    cabin.position.set(-L * 0.04, H * 0.56 + cabH / 2, 0);
    cabin.castShadow = true;
    grp.add(cabin);

    // ── Glass ─────────────────────────────────────────────────────────────
    const glassMat = new THREE.MeshStandardMaterial({
      color:       0x88BBCC,
      roughness:   0.05,
      metalness:   0.15,
      transparent: true,
      opacity:     0.70,
    });

    // Windscreen
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(cabW * 0.88, cabH * 0.72), glassMat);
    ws.position.set(-L * 0.04 + L * 0.25 + 0.01, H * 0.56 + cabH / 2, 0);
    ws.rotation.y = Math.PI / 2;
    ws.rotation.z = -0.14;
    grp.add(ws);

    // ── Bumpers ───────────────────────────────────────────────────────────
    const bumpMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85 });
    for (const side of [-1, 1]) {
      const bump = new THREE.Mesh(new THREE.BoxGeometry(0.18, H * 0.20, W * 0.86), bumpMat);
      bump.position.set(side * (L / 2 + 0.09), H * 0.17, 0);
      grp.add(bump);
    }

    // ── Headlights ────────────────────────────────────────────────────────
    const litMat = new THREE.MeshBasicMaterial({ color: 0xFFFFCC });
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.06, H * 0.13, 0.45), litMat);
      lens.position.set(L / 2 + 0.03, H * 0.27, side * W * 0.30);
      grp.add(lens);
    }

    // ── Taillights ────────────────────────────────────────────────────────
    const redMat = new THREE.MeshBasicMaterial({ color: 0xFF1111 });
    for (const side of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, H * 0.11, 0.42), redMat);
      tail.position.set(-L / 2 - 0.03, H * 0.25, side * W * 0.28);
      grp.add(tail);
    }

    // ── Wheels ────────────────────────────────────────────────────────────
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
    const rimMat  = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.30, metalness: 0.80 });
    const WR      = H * 0.31;
    const WW      = W * 0.14;

    const tyreGeo = new THREE.CylinderGeometry(WR, WR, WW, 14);
    tyreGeo.rotateZ(Math.PI / 2);
    const rimGeo  = new THREE.CylinderGeometry(WR * 0.55, WR * 0.55, WW + 0.02, 10);
    rimGeo.rotateZ(Math.PI / 2);

    // Tyre tread rings
    const treadGeo = new THREE.TorusGeometry(WR, WR * 0.08, 6, 16);

    for (const axZ of [WB / 2, -WB / 2]) {
      for (const side of [-1, 1]) {
        const wg = new THREE.Group();
        wg.add(new THREE.Mesh(tyreGeo, tyreMat));
        wg.add(new THREE.Mesh(rimGeo,  rimMat));

        const tread = new THREE.Mesh(treadGeo, tyreMat);
        tread.rotation.y = Math.PI / 2;
        wg.add(tread);

        wg.position.set(axZ, WR, side * (W / 2 + WW * 0.45));
        grp.add(wg);
      }
    }

    // ── Shadow blob ───────────────────────────────────────────────────────
    const shadowMat = new THREE.MeshBasicMaterial({
      color:       0x000000,
      transparent: true,
      opacity:     0.30,
      depthWrite:  false,
    });
    const shadow = new THREE.Mesh(new THREE.EllipseCurve
      ? new THREE.CircleGeometry(L * 0.5, 24)
      : new THREE.PlaneGeometry(L, W * 0.6),
      shadowMat
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y  = 0.01;
    shadow.scale.set(1, 0.55, 1);
    grp.add(shadow);

    // ── Sit on floor ──────────────────────────────────────────────────────
    grp.position.y = WR;

    _prevScene.add(grp);
    _prevCar = grp;
  }

  function _updatePreviewCar(carId) {
    _buildPreviewCar(carId);
  }

  function _runPreviewLoop() {
    _prevAnimId = requestAnimationFrame(_runPreviewLoop);
    if (!_prevRenderer || !_prevScene || !_prevCamera || !_prevCar) return;

    _prevRotY      += 0.007;
    _prevCar.rotation.y = _prevRotY;

    _prevRenderer.render(_prevScene, _prevCamera);
  }

  function _stopPreview() {
    if (_prevAnimId) { cancelAnimationFrame(_prevAnimId); _prevAnimId = null; }
    if (_prevRenderer) { _prevRenderer.dispose(); _prevRenderer = null; }
    _prevScene  = null;
    _prevCamera = null;
    _prevCar    = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WALLET SYNC
  // ══════════════════════════════════════════════════════════════════════════

  function _syncWallet() {
    if (!_playerState || !_el.wallet) return;
    _el.wallet.textContent = MathUtils.formatMoney(_playerState.money);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    close();
    console.info('[CarDealer] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    dispose,

    // Open / close
    open,
    close,

    // Context
    setContext,

  });

})();

if (typeof module !== 'undefined') module.exports = CarDealer;
/* ```

---

**File 30 ✅ — `js/locations/CarDealer.js` done.**

This is the complete car dealership UI. The car grid generates one card per `CONFIG.CARS` entry, showing owned/active/affordable status with colour-coded pricing — red when the player can't afford a car, green when owned. The detail panel rebuilds itself on every car selection, animating stat bars from 0% to their target width via a `requestAnimationFrame` deferred style transition so the bars slide in smoothly. The 3D preview renders a fully-detailed car model — body, cabin, windscreen, bumpers, headlight and taillight lenses, four wheels with tyre tread rings, and a floor shadow blob — all rotating slowly in its own isolated `WebGLRenderer` instance with a dark showroom background, three-point lighting, and a reflective floor plane. `_onBuyCar` calls `EconomySystem.purchaseCar` which handles money deduction via `SaveSystem`, then auto-switches the active car and fires a `cityracer:car_purchased` `CustomEvent` so `Game.js` can rebuild the `PlayerCar` instance with the new vehicle. `_onSwitchCar` fires `cityracer:car_switched` for the same reason without any money change.

**Say "File 31" for `js/ui/Minimap.js`.** */
