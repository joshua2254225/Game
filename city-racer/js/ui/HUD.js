/**
 * ============================================================================
 * CITY RACER — HUD.js
 * ============================================================================
 * Manages every in-game heads-up-display element that updates in real time:
 *   • Speedometer (number + overspeed glow)
 *   • Gear indicator (R / 1–6, colour-coded)
 *   • Damage bar (fill + percentage label, warn/danger states)
 *   • Boost / turbo bar (hidden until turbo upgrade installed)
 *   • Money counter (animated roll-up + floating delta popups)
 *   • Wanted star strip (0–3 stars, fades in/out)
 *   • Objective label, distance, and direction arrow
 *   • Speed-limit sign (auto-hides after 4 s)
 *   • District entry banner (auto-hides after 3.5 s)
 *   • Interaction prompt ("E  Enter Garage")
 *   • Race overlay (timer, position badge, lap counter)
 *   • Taxi mission panel (destination, fare, time bar)
 *   • Race start countdown (3 → 2 → 1 → GO!)
 *   • Pause-screen live stats mirror
 *
 * Architecture:
 *   Pure DOM manipulation — no Three.js dependency.
 *   Follows the same frozen-IIFE module pattern as Minimap.js.
 *   PlayerCar.js calls the four per-frame setters directly.
 *   Game.js calls the rest through lifecycle events.
 * ============================================================================
 */

'use strict';

const HUD = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE STATE
  // ══════════════════════════════════════════════════════════════════════════

  /** Whether init() has completed successfully. */
  let _ready = false;

  // ── Cached DOM references ──────────────────────────────────────────────
  let _root;              // #hud
  let _elMoney;           // #hud-money
  let _elMoneyWrap;       // #hud-money-wrap
  let _elWanted;          // #hud-wanted
  let _wantedStars;       // NodeList of .wanted-star divs
  let _elObjText;         // #obj-text
  let _elObjDist;         // #obj-dist
  let _elObjArrow;        // #obj-arrow
  let _elSpeedo;          // #speedo-value
  let _elGear;            // #gear-indicator
  let _elBoostWrap;       // #boost-bar-wrap
  let _elBoostFill;       // #boost-fill
  let _elDamagePct;       // #damage-pct
  let _elDamageFill;      // #damage-fill
  let _elSpeedSign;       // #speed-limit-sign
  let _elSpeedNum;        // #speed-limit-num
  let _elDistrictBanner;  // #district-banner
  let _elDistrictName;    // #district-name
  let _elPrompt;          // #interaction-prompt
  let _elPromptPlace;     // #prompt-place-name

  // Race HUD
  let _elRaceHud;         // #race-hud
  let _elRaceTimer;       // #race-timer
  let _elRacePos;         // #race-pos
  let _elRacePosTotal;    // #race-pos-total
  let _elRaceLapCur;      // #race-lap-cur
  let _elRaceLapTotal;    // #race-lap-total
  let _elRacePosBadge;    // #race-pos-badge
  let _elCountdown;       // #race-countdown

  // Taxi HUD
  let _elTaxiHud;         // #taxi-hud
  let _elTaxiMissionName; // #taxi-mission-name
  let _elTaxiDest;        // #taxi-dest
  let _elTaxiTimerFill;   // #taxi-timer-fill
  let _elTaxiFare;        // #taxi-fare

  // Pause stats
  let _elPauseMoney;      // #pause-stat-money
  let _elPauseSpeed;      // #pause-stat-speed
  let _elPauseDamage;     // #pause-stat-damage

  // ── Animated money counter state ──────────────────────────────────────
  let _displayedMoney = 0;      // what is currently shown on screen
  let _targetMoney    = 0;      // what we are animating toward
  let _moneyRollTimer = 0;      // elapsed animation time in seconds
  const MONEY_ROLL_DURATION = CONFIG.HUD.MONEY_ANIM_SPEED;   // seconds

  // ── Speed-limit sign auto-hide ────────────────────────────────────────
  let _speedSignTimer    = 0;   // seconds until the sign hides itself
  const SPEED_SIGN_DURATION = 4.0;

  // ── District banner auto-hide ─────────────────────────────────────────
  let _districtTimer     = 0;
  const DISTRICT_DURATION = 3.5;

  // ── Countdown state ───────────────────────────────────────────────────
  let _countdownTimer    = 0;
  let _countdownSeq      = [];  // e.g. ['3','2','1','GO!']
  let _countdownIdx      = 0;
  let _countdownCb       = null;

  // ── Cached last values (skip DOM writes when unchanged) ───────────────
  let _lastSpeed     = -1;
  let _lastGear      = '';
  let _lastDamage    = -1;
  let _lastBoost     = -1;
  let _lastBoostAct  = false;
  let _lastWanted    = -1;

  // ══════════════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Cache all DOM references. Must be called after DOMContentLoaded.
   * Returns false and logs a warning if any critical element is missing.
   */
  function init() {
    _root             = document.getElementById('hud');
    _elMoney          = document.getElementById('hud-money');
    _elMoneyWrap      = document.getElementById('hud-money-wrap');
    _elWanted         = document.getElementById('hud-wanted');
    _wantedStars      = document.querySelectorAll('.wanted-star');
    _elObjText        = document.getElementById('obj-text');
    _elObjDist        = document.getElementById('obj-dist');
    _elObjArrow       = document.getElementById('obj-arrow');
    _elSpeedo         = document.getElementById('speedo-value');
    _elGear           = document.getElementById('gear-indicator');
    _elBoostWrap      = document.getElementById('boost-bar-wrap');
    _elBoostFill      = document.getElementById('boost-fill');
    _elDamagePct      = document.getElementById('damage-pct');
    _elDamageFill     = document.getElementById('damage-fill');
    _elSpeedSign      = document.getElementById('speed-limit-sign');
    _elSpeedNum       = document.getElementById('speed-limit-num');
    _elDistrictBanner = document.getElementById('district-banner');
    _elDistrictName   = document.getElementById('district-name');
    _elPrompt         = document.getElementById('interaction-prompt');
    _elPromptPlace    = document.getElementById('prompt-place-name');

    _elRaceHud        = document.getElementById('race-hud');
    _elRaceTimer      = document.getElementById('race-timer');
    _elRacePos        = document.getElementById('race-pos');
    _elRacePosTotal   = document.getElementById('race-pos-total');
    _elRaceLapCur     = document.getElementById('race-lap-cur');
    _elRaceLapTotal   = document.getElementById('race-lap-total');
    _elRacePosBadge   = document.getElementById('race-pos-badge');
    _elCountdown      = document.getElementById('race-countdown');

    _elTaxiHud        = document.getElementById('taxi-hud');
    _elTaxiMissionName = document.getElementById('taxi-mission-name');
    _elTaxiDest       = document.getElementById('taxi-dest');
    _elTaxiTimerFill  = document.getElementById('taxi-timer-fill');
    _elTaxiFare       = document.getElementById('taxi-fare');

    _elPauseMoney     = document.getElementById('pause-stat-money');
    _elPauseSpeed     = document.getElementById('pause-stat-speed');
    _elPauseDamage    = document.getElementById('pause-stat-damage');

    // Verify the elements we absolutely need
    if (!_root || !_elSpeedo || !_elMoney) {
      console.warn('[HUD] One or more critical DOM elements not found. '
                 + 'Ensure index.html is intact before calling HUD.init().');
      return false;
    }

    // Initialise speed-limit sign display
    _setSpeedLimitValue(CONFIG.ROADS.SPEED_LIMIT);

    _ready = true;
    console.info('[HUD] Initialised.');
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VISIBILITY
  // ══════════════════════════════════════════════════════════════════════════

  /** Make the entire in-game HUD visible. */
  function show() {
    if (_root) {
      _root.classList.remove('hidden');
      _root.removeAttribute('aria-hidden');
    }
  }

  /** Hide the entire in-game HUD (e.g. during menus). */
  function hide() {
    if (_root) {
      _root.classList.add('hidden');
      _root.setAttribute('aria-hidden', 'true');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE TICK
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Master per-frame tick called by Game.js.
   * Handles anything that needs incremental animation (money roll, timers).
   * @param {number} dt  Delta time in seconds.
   */
  function update(dt) {
    if (!_ready) return;
    _tickMoneyRoll(dt);
    _tickSpeedSign(dt);
    _tickDistrictBanner(dt);
    _tickCountdown(dt);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPEEDOMETER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update the speed readout. Called by PlayerCar.js every frame.
   * @param {number} kmh  Current speed in km/h (always positive).
   */
  function updateSpeed(kmh) {
    if (!_elSpeedo) return;
    const rounded = Math.round(kmh);
    if (rounded === _lastSpeed) return;
    _lastSpeed = rounded;

    _elSpeedo.textContent = rounded;

    // Overspeed glow
    const isOver = rounded > CONFIG.ROADS.SPEED_LIMIT + CONFIG.POLICE.TRIGGERS.SPEED_OVER_LIMIT;
    _elSpeedo.classList.toggle('overspeed', isOver);

    // Keep pause-screen speed in sync
    if (_elPauseSpeed) _elPauseSpeed.textContent = rounded;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GEAR INDICATOR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update the gear badge. Called by PlayerCar.js every frame.
   * @param {string} gear  'R', '1'–'6', or 'N'.
   */
  function updateGear(gear) {
    if (!_elGear) return;
    if (gear === _lastGear) return;
    _lastGear = gear;

    _elGear.textContent = gear;
    _elGear.classList.toggle('reverse', gear === 'R');
    _elGear.classList.toggle('neutral', gear === 'N');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DAMAGE BAR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update the vehicle-condition bar. Called by PlayerCar.js every frame.
   * @param {number} damagePct  0 = pristine, 100 = destroyed.
   */
  function updateDamage(damagePct) {
    if (!_elDamagePct || !_elDamageFill) return;

    const pct = MathUtils.clamp(damagePct, 0, 100);
    if (pct === _lastDamage) return;
    _lastDamage = pct;

    const health   = 100 - pct;
    const healthPx = health + '%';

    _elDamageFill.style.width = healthPx;

    // Text colour & bar colour classes
    const isWarn   = pct >= CONFIG.PLAYER.DAMAGE_WARN_PCT;
    const isDanger = pct >= CONFIG.PLAYER.REPAIR_WARN_PCT;

    _elDamagePct.textContent = health + '%';
    _elDamagePct.classList.toggle('warn',   isWarn   && !isDanger);
    _elDamagePct.classList.toggle('danger', isDanger);

    _elDamageFill.classList.toggle('warn',   isWarn   && !isDanger);
    _elDamageFill.classList.toggle('danger', isDanger);

    // Mirror to pause screen
    if (_elPauseDamage) _elPauseDamage.textContent = pct + '%';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BOOST BAR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update the turbo/boost bar. Called by PlayerCar.js every frame.
   * The bar is hidden until the car has a turbo upgrade installed.
   *
   * @param {number}  charge   0–1 (0 = empty, 1 = full).
   * @param {boolean} active   Whether boost is currently firing.
   * @param {boolean} cooling  Whether in post-boost cooldown.
   */
  function updateBoost(charge, active, cooling) {
    if (!_elBoostWrap || !_elBoostFill) return;

    // Show the bar as soon as a turbo has been installed
    // (charge > 0 even at initial rest means turbo exists)
    const hasTurbo = charge > 0 || active;
    _elBoostWrap.classList.toggle('visible', hasTurbo);

    if (!hasTurbo) return;

    const clampedCharge = MathUtils.clamp(charge, 0, 1);

    // Throttle DOM writes
    const boostDiff = Math.abs(clampedCharge - _lastBoost);
    if (boostDiff < 0.005 && active === _lastBoostAct) return;
    _lastBoost    = clampedCharge;
    _lastBoostAct = active;

    _elBoostFill.style.width = (clampedCharge * 100) + '%';

    const isEmpty = clampedCharge < 0.02;
    const isFull  = clampedCharge >= 0.99 && !active && !cooling;

    _elBoostFill.classList.toggle('depleted', isEmpty || cooling);
    _elBoostFill.classList.toggle('ready',    isFull);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MONEY DISPLAY
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Set the target money value.
   * The display will animate (roll) toward this value over MONEY_ROLL_DURATION.
   * Also mirrors the value to the pause screen.
   *
   * @param {number} amount  New wallet balance.
   */
  function updateMoney(amount) {
    if (!_elMoney) return;
    _targetMoney    = Math.max(0, amount);
    _moneyRollTimer = 0;

    // Mirror immediately to pause / race wallet displays
    _syncWalletDisplays(_targetMoney);

    if (_elPauseMoney) _elPauseMoney.textContent = '$' + _fmt(_targetMoney);
  }

  /**
   * Show a floating +/- money delta popup anchored to the money display.
   * @param {number} delta   Positive = earned, negative = spent.
   */
  function showMoneyDelta(delta) {
    if (!_elMoneyWrap || delta === 0) return;

    const el = document.createElement('div');
    el.className = 'money-delta ' + (delta > 0 ? 'gain' : 'loss');
    el.textContent = (delta > 0 ? '+$' : '-$') + _fmt(Math.abs(delta));

    // Position just above the money display
    el.style.position = 'absolute';
    el.style.left     = '0';
    el.style.top      = '-4px';

    _elMoneyWrap.appendChild(el);

    // Remove after animation completes (1.6 s)
    el.addEventListener('animationend', () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  /** Animated money roll tick — called from update(). */
  function _tickMoneyRoll(dt) {
    if (!_elMoney) return;
    if (_displayedMoney === _targetMoney) return;

    _moneyRollTimer += dt;
    const t = MathUtils.clamp(_moneyRollTimer / MONEY_ROLL_DURATION, 0, 1);
    // Ease-out curve
    const eased = 1 - (1 - t) * (1 - t);

    _displayedMoney = Math.round(
      MathUtils.lerp(_displayedMoney, _targetMoney, eased * 0.12 + dt * 3)
    );

    // Snap at very close range to avoid forever-loop
    if (Math.abs(_displayedMoney - _targetMoney) < 2) {
      _displayedMoney = _targetMoney;
    }

    _elMoney.textContent = _fmt(_displayedMoney);
  }

  /** Format an integer as a comma-separated string, e.g. 12345 → '12,345'. */
  function _fmt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  /** Keep all money readouts across menus in sync (e.g. garage, dealer). */
  function _syncWalletDisplays(amount) {
    const formatted = '$' + _fmt(amount);
    [
      document.getElementById('garage-wallet'),
      document.getElementById('dealer-wallet'),
      document.getElementById('races-wallet'),
    ].forEach(el => { if (el) el.textContent = formatted; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WANTED STARS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update the wanted-star strip.
   * @param {number} stars  0–3 (0 clears the strip entirely).
   */
  function updateWanted(stars) {
    if (!_elWanted || !_wantedStars) return;
    const clamped = MathUtils.clamp(Math.round(stars), 0, CONFIG.POLICE.MAX_STARS);
    if (clamped === _lastWanted) return;
    _lastWanted = clamped;

    _elWanted.classList.toggle('visible', clamped > 0);

    _wantedStars.forEach(el => {
      const starNum = parseInt(el.dataset.star, 10);
      el.classList.toggle('active', starNum <= clamped);

      // Apply per-star colour from config
      const colorHex = CONFIG.POLICE.STAR_COLOR[clamped - 1];
      if (colorHex && starNum <= clamped) {
        el.style.background = _hexToCSS(colorHex);
        el.style.boxShadow  = `0 0 8px ${_hexToCSS(colorHex)}`;
      } else {
        el.style.background = '';
        el.style.boxShadow  = '';
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OBJECTIVE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update the top-centre objective label.
   * @param {string}  text   Objective description, e.g. 'Reach the garage'.
   * @param {string}  [dist] Formatted distance string, e.g. '320 m'. Pass '' to hide.
   * @param {number}  [angleDeg] Arrow direction in degrees from player heading.
   *                            Pass null to hide the arrow.
   */
  function setObjective(text, dist, angleDeg) {
    if (_elObjText) _elObjText.textContent = text || '';
    if (_elObjDist) _elObjDist.textContent = dist || '';

    if (_elObjArrow) {
      if (angleDeg !== null && angleDeg !== undefined) {
        _elObjArrow.style.transform  = `rotate(${angleDeg}deg)`;
        _elObjArrow.style.display    = '';
      } else {
        _elObjArrow.style.display    = 'none';
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPEED-LIMIT SIGN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Flash the roadside speed-limit sign and auto-hide after 4 seconds.
   * Call this whenever the player enters a new zone.
   * @param {number} limit  Speed limit in km/h.
   */
  function showSpeedLimit(limit) {
    _setSpeedLimitValue(limit);
    if (_elSpeedSign) {
      _elSpeedSign.classList.add('visible');
      _speedSignTimer = SPEED_SIGN_DURATION;
    }
  }

  function hideSpeedLimit() {
    if (_elSpeedSign) _elSpeedSign.classList.remove('visible');
    _speedSignTimer = 0;
  }

  function _setSpeedLimitValue(limit) {
    if (_elSpeedNum) _elSpeedNum.textContent = limit;
  }

  function _tickSpeedSign(dt) {
    if (_speedSignTimer <= 0) return;
    _speedSignTimer -= dt;
    if (_speedSignTimer <= 0) hideSpeedLimit();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISTRICT BANNER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Display the "Entering <DistrictName>" banner and auto-hide it.
   * @param {string} name  District name, e.g. 'Downtown'.
   */
  function showDistrict(name) {
    if (!_elDistrictBanner || !_elDistrictName) return;
    _elDistrictName.textContent = name;
    _elDistrictBanner.classList.add('show');
    _districtTimer = DISTRICT_DURATION;
  }

  function _tickDistrictBanner(dt) {
    if (_districtTimer <= 0) return;
    _districtTimer -= dt;
    if (_districtTimer <= 0) {
      if (_elDistrictBanner) _elDistrictBanner.classList.remove('show');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERACTION PROMPT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Show the "E  Enter <PlaceName>" prompt at the bottom of the screen.
   * @param {string} placeName  e.g. 'Downtown Auto', 'Race Start'.
   */
  function showInteractionPrompt(placeName) {
    if (!_elPrompt) return;
    if (_elPromptPlace) _elPromptPlace.textContent = placeName;
    _elPrompt.classList.add('visible');
  }

  /** Hide the interaction prompt. */
  function hideInteractionPrompt() {
    if (_elPrompt) _elPrompt.classList.remove('visible');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE HUD
  // ══════════════════════════════════════════════════════════════════════════

  /** Reveal the race overlay. */
  function showRaceHUD() {
    if (_elRaceHud) _elRaceHud.classList.add('active');
  }

  /** Collapse the race overlay. */
  function hideRaceHUD() {
    if (_elRaceHud)    _elRaceHud.classList.remove('active');
    if (_elCountdown)  {
      _elCountdown.classList.remove('show', 'num', 'go');
      _elCountdown.textContent = '';
    }
  }

  /**
   * Update the race timer display.
   * @param {number}  seconds   Seconds remaining (or elapsed, depending on mode).
   * @param {boolean} [elapsed] If true, format as elapsed rather than countdown.
   */
  function updateRaceTimer(seconds, elapsed) {
    if (!_elRaceTimer) return;
    _elRaceTimer.textContent = _formatTime(seconds);

    const isWarn   = !elapsed && seconds < 30;
    const isDanger = !elapsed && seconds < 10;
    _elRaceTimer.classList.toggle('warn',   isWarn   && !isDanger);
    _elRaceTimer.classList.toggle('danger', isDanger);
  }

  /**
   * Update the race position badge (e.g. 2 / 4).
   * @param {number} pos    Player's current position (1-based).
   * @param {number} total  Total number of racers.
   */
  function updateRacePosition(pos, total) {
    if (_elRacePos)      _elRacePos.textContent      = pos;
    if (_elRacePosTotal) _elRacePosTotal.textContent = '/' + total;

    if (_elRacePosBadge) {
      _elRacePosBadge.classList.toggle('p1', pos === 1);
    }
  }

  /**
   * Update the lap counter.
   * @param {number} current  Current lap (1-based).
   * @param {number} total    Total laps in the race.
   */
  function updateRaceLap(current, total) {
    if (_elRaceLapCur)   _elRaceLapCur.textContent   = current;
    if (_elRaceLapTotal) _elRaceLapTotal.textContent  = total;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE COUNTDOWN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Run the 3–2–1–GO countdown sequence.
   * Each step is shown for 1 second; the callback fires when 'GO!' finishes.
   *
   * @param {Function} [onComplete]  Called when the sequence ends.
   */
  function startCountdown(onComplete) {
    if (!_elCountdown) { if (onComplete) onComplete(); return; }

    _countdownSeq = ['3', '2', '1', 'GO!'];
    _countdownIdx = 0;
    _countdownCb  = onComplete || null;
    _countdownTimer = 0;

    _elCountdown.classList.add('show');
    _showCountdownStep();
  }

  /**
   * Manually display a single countdown label (used by Notifications.js
   * for wrong-way and other one-shot banners).
   * @param {string}  label    Text to display.
   * @param {boolean} [isGo]  Use the 'go' colour variant.
   */
  function flashCountdownLabel(label, isGo) {
    if (!_elCountdown) return;
    _elCountdown.textContent = label;
    _elCountdown.classList.add('show');
    _elCountdown.classList.toggle('go',  !!isGo);
    _elCountdown.classList.toggle('num', !isGo);
  }

  function _showCountdownStep() {
    if (!_elCountdown || _countdownIdx >= _countdownSeq.length) {
      _finishCountdown();
      return;
    }

    const label = _countdownSeq[_countdownIdx];
    const isGo  = label === 'GO!';

    _elCountdown.textContent = label;
    _elCountdown.classList.remove('num', 'go');
    // Force reflow so the animation re-triggers
    void _elCountdown.offsetWidth;
    _elCountdown.classList.add(isGo ? 'go' : 'num');

    _countdownTimer = isGo ? 1.2 : 1.0;
  }

  function _tickCountdown(dt) {
    if (_countdownIdx >= _countdownSeq.length) return;
    if (_countdownTimer <= 0) return;

    _countdownTimer -= dt;
    if (_countdownTimer <= 0) {
      _countdownIdx++;
      if (_countdownIdx < _countdownSeq.length) {
        _showCountdownStep();
      } else {
        _finishCountdown();
      }
    }
  }

  function _finishCountdown() {
    if (_elCountdown) {
      _elCountdown.classList.remove('show', 'num', 'go');
      _elCountdown.textContent = '';
    }
    _countdownSeq  = [];
    _countdownIdx  = 0;
    const cb = _countdownCb;
    _countdownCb   = null;
    if (cb) cb();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAXI HUD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Reveal and configure the taxi mission panel.
   * @param {string} missionName  Short name, e.g. 'Late for Work'.
   * @param {string} destination  Drop-off name, e.g. 'Downtown Office'.
   * @param {number} fare         Starting / maximum fare in $.
   */
  function showTaxiHUD(missionName, destination, fare) {
    if (!_elTaxiHud) return;
    if (_elTaxiMissionName) _elTaxiMissionName.textContent = missionName;
    if (_elTaxiDest)        _elTaxiDest.textContent        = destination;
    if (_elTaxiFare)        _elTaxiFare.textContent        = _fmt(fare);
    if (_elTaxiTimerFill)   {
      _elTaxiTimerFill.style.width = '100%';
      _elTaxiTimerFill.classList.remove('warn', 'danger');
    }
    _elTaxiHud.classList.add('active');
  }

  /** Hide the taxi mission panel. */
  function hideTaxiHUD() {
    if (_elTaxiHud) _elTaxiHud.classList.remove('active');
  }

  /**
   * Update the taxi panel each frame.
   * @param {number} currentFare    Current earned fare in $.
   * @param {number} timeRatio      0–1: remaining time as a fraction (1 = full, 0 = expired).
   */
  function updateTaxi(currentFare, timeRatio) {
    if (_elTaxiFare) _elTaxiFare.textContent = _fmt(Math.round(currentFare));

    if (_elTaxiTimerFill) {
      const pct = MathUtils.clamp(timeRatio, 0, 1);
      _elTaxiTimerFill.style.width = (pct * 100) + '%';

      const isWarn   = pct < 0.4;
      const isDanger = pct < 0.15;
      _elTaxiTimerFill.classList.toggle('warn',   isWarn   && !isDanger);
      _elTaxiTimerFill.classList.toggle('danger', isDanger);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAUSE-SCREEN STAT MIRROR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Snapshot live session stats onto the pause screen.
   * Call this just before the pause screen becomes visible.
   *
   * @param {number} money   Current wallet balance.
   * @param {number} speedKmh Current speed.
   * @param {number} damagePct Current damage percentage.
   */
  function updatePauseStats(money, speedKmh, damagePct) {
    if (_elPauseMoney)  _elPauseMoney.textContent  = '$' + _fmt(money);
    if (_elPauseSpeed)  _elPauseSpeed.textContent  = Math.round(speedKmh);
    if (_elPauseDamage) _elPauseDamage.textContent = Math.round(damagePct) + '%';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPER — TIME FORMATTER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Format a seconds value as M:SS, e.g. 127 → '2:07'.
   * @param {number} totalSeconds
   * @returns {string}
   */
  function _formatTime(totalSeconds) {
    const s  = Math.max(0, Math.round(totalSeconds));
    const m  = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${m}:${ss}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPER — HEX TO CSS COLOUR STRING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Convert a Three.js-style hex integer to a CSS '#RRGGBB' string.
   * @param {number} hex  e.g. 0xFF8800
   * @returns {string}
   */
  function _hexToCSS(hex) {
    return '#' + ('000000' + hex.toString(16)).slice(-6);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    hide();
    _ready        = false;
    _lastSpeed    = -1;
    _lastGear     = '';
    _lastDamage   = -1;
    _lastBoost    = -1;
    _lastWanted   = -1;
    _countdownSeq = [];
    _countdownCb  = null;
    console.info('[HUD] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    dispose,

    // Visibility
    show,
    hide,

    // Per-frame master tick
    update,

    // ── Per-frame setters (called by PlayerCar.js) ──
    updateSpeed,
    updateGear,
    updateDamage,
    updateBoost,

    // ── Money ──
    updateMoney,
    showMoneyDelta,

    // ── Wanted level ──
    updateWanted,

    // ── Objective compass ──
    setObjective,

    // ── Speed-limit sign ──
    showSpeedLimit,
    hideSpeedLimit,

    // ── District banner ──
    showDistrict,

    // ── Interaction prompt ──
    showInteractionPrompt,
    hideInteractionPrompt,

    // ── Race overlay ──
    showRaceHUD,
    hideRaceHUD,
    updateRaceTimer,
    updateRacePosition,
    updateRaceLap,

    // ── Countdown / banners ──
    startCountdown,
    flashCountdownLabel,

    // ── Taxi panel ──
    showTaxiHUD,
    hideTaxiHUD,
    updateTaxi,

    // ── Pause stats mirror ──
    updatePauseStats,

    // ── Utility exposed for other modules ──
    formatTime: _formatTime,

  });

})();

if (typeof module !== 'undefined') module.exports = HUD;
