/**
 * ============================================================================
 * CITY RACER — Notifications.js
 * ============================================================================
 * Manages every mid-screen and edge-of-screen notification that fires during
 * gameplay:
 *
 *   Toast queue   — stacked pop-ups in #toast-container (money earned, fines,
 *                   police stars, mission events, system messages)
 *   Checkpoint    — full-width flash banner when crossing a race gate
 *   Race result   — animated 1ST / 2ND / 3RD / DNF mid-screen reveal
 *   Wrong Way     — persistent pulsing banner when driving against traffic
 *   Police event  — "PURSUIT STARTED", "BUSTED!", star-gain flash
 *   Mission event — "PASSENGER PICKED UP", "DELIVERED!", "MISSION FAILED"
 *   Lap banner    — "LAP 2 / 3", "FINAL LAP!" flash
 *
 * All banners are created as short-lived DOM nodes appended to <body> and
 * removed on animationend or after a fixed timer — no permanent DOM pollution.
 *
 * Architecture:
 *   Pure DOM / CSS animation approach. No Three.js dependency.
 *   Follows the frozen-IIFE module pattern from Minimap.js and HUD.js.
 * ============================================================================
 */

'use strict';

const Notifications = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const MAX_TOASTS      = 4;       // max simultaneously visible toasts
  const DEFAULT_TOAST_S = CONFIG.HUD.NOTIFICATION_DURATION;   // 4 s
  const SLIDE_MS        = CONFIG.HUD.NOTIFICATION_SLIDE_MS;   // 350 ms

  // Toast type → accent colour (matches hud.css .toast.<type> border-left)
  const TOAST_ICONS = {
    info    : 'ℹ️',
    success : '✅',
    warn    : '⚠️',
    danger  : '🚨',
    money   : '💰',
    police  : '🚔',
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE STATE
  // ══════════════════════════════════════════════════════════════════════════

  let _container        = null;   // #toast-container
  let _ready            = false;

  /** Active toast objects: { el, timer } */
  const _activeToasts   = [];

  /** Overflow queue when MAX_TOASTS is reached. */
  const _toastQueue     = [];

  /** Persistent wrong-way banner element (null when hidden). */
  let _wrongWayEl       = null;
  let _wrongWayActive   = false;

  /** Persistent "FINAL LAP" banner (auto-removes). */
  let _lapBannerEl      = null;

  // ══════════════════════════════════════════════════════════════════════════
  // INIT / DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function init() {
    _container = document.getElementById('toast-container');
    if (!_container) {
      console.warn('[Notifications] #toast-container not found.');
      return false;
    }
    _ready = true;
    console.info('[Notifications] Initialised.');
    return true;
  }

  function dispose() {
    // Clear all live toasts
    _activeToasts.forEach(t => _removeToastEl(t.el));
    _activeToasts.length = 0;
    _toastQueue.length   = 0;

    // Clear persistent banners
    _hideWrongWay();
    if (_lapBannerEl && _lapBannerEl.parentNode) {
      _lapBannerEl.parentNode.removeChild(_lapBannerEl);
    }
    _lapBannerEl = null;
    _ready       = false;
    console.info('[Notifications] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME TICK
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Called by Game.js every frame.
   * Drains the overflow queue and expires timed toasts.
   * @param {number} dt  Delta time in seconds.
   */
  function update(dt) {
    if (!_ready) return;

    // Expire timed toasts
    for (let i = _activeToasts.length - 1; i >= 0; i--) {
      const t = _activeToasts[i];
      t.timer -= dt;
      if (t.timer <= 0) {
        _dismissToast(i);
      }
    }

    // Drain queue
    if (_toastQueue.length > 0 && _activeToasts.length < MAX_TOASTS) {
      const next = _toastQueue.shift();
      _createToastEl(next.text, next.type, next.icon, next.duration);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOAST API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Show a notification toast.
   *
   * @param {string}  text          Message body.
   * @param {string}  [type]        'info' | 'success' | 'warn' | 'danger' | 'money' | 'police'
   * @param {string}  [icon]        Override emoji icon. Defaults to type icon.
   * @param {number}  [duration]    Seconds on screen. Default: CONFIG.HUD.NOTIFICATION_DURATION.
   */
  function toast(text, type, icon, duration) {
    if (!_ready) return;

    const t    = type     || 'info';
    const ico  = icon     || TOAST_ICONS[t] || TOAST_ICONS.info;
    const dur  = duration !== undefined ? duration : DEFAULT_TOAST_S;

    if (_activeToasts.length < MAX_TOASTS) {
      _createToastEl(text, t, ico, dur);
    } else {
      _toastQueue.push({ text, type: t, icon: ico, duration: dur });
    }
  }

  // ── Convenience wrappers ─────────────────────────────────────────────────

  /** Green success toast. */
  function success(text, icon)  { toast(text, 'success', icon); }

  /** Amber warning toast. */
  function warn(text, icon)     { toast(text, 'warn',    icon); }

  /** Red danger toast. */
  function danger(text, icon)   { toast(text, 'danger',  icon); }

  /** Gold money toast (e.g. "+$500 Race Prize"). */
  function money(text)          { toast(text, 'money'); }

  /** Blue police toast. */
  function police(text)         { toast(text, 'police'); }

  // ══════════════════════════════════════════════════════════════════════════
  // TOAST DOM HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function _createToastEl(text, type, icon, duration) {
    const el = document.createElement('div');
    el.className  = `toast ${type}`;
    el.innerHTML  =
      `<span class="toast-icon" aria-hidden="true">${icon}</span>` +
      `<span class="toast-text">${text}</span>`;

    _container.appendChild(el);
    _activeToasts.push({ el, timer: duration });
  }

  function _dismissToast(index) {
    const t = _activeToasts[index];
    if (!t) return;

    t.el.classList.add('removing');
    _activeToasts.splice(index, 1);

    // Remove the DOM node after the CSS exit animation (SLIDE_MS)
    const el = t.el;
    setTimeout(() => _removeToastEl(el), SLIDE_MS + 50);
  }

  function _removeToastEl(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT FLASH
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Flash a large centred "CHECKPOINT" (or custom label) banner.
   * Uses the .race-checkpoint-banner CSS animation (1.2 s, auto-fades).
   *
   * @param {string} [label]  Override text. Default: 'CHECKPOINT'.
   */
  function checkpoint(label) {
    const el = document.createElement('div');
    el.className   = 'race-checkpoint-banner';
    el.textContent = label || 'CHECKPOINT';
    document.body.appendChild(el);

    el.addEventListener('animationend', () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE RESULT BANNER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Show the mid-screen race-result reveal banner.
   * Animates in, holds briefly, then fades out — then calls onDone.
   *
   * @param {number|string} place       1, 2, 3, or 'DNF'.
   * @param {number}        [prize]     Prize money. Omit / 0 to skip prize line.
   * @param {Function}      [onDone]    Called after the banner fully fades out.
   */
  function raceResult(place, prize, onDone) {
    // Build place label + CSS class
    let placeText  = '';
    let placeClass = '';
    if (place === 1 || place === '1st') { placeText = '1ST';  placeClass = 'result-1st'; }
    else if (place === 2)               { placeText = '2ND';  placeClass = 'result-2nd'; }
    else if (place === 3)               { placeText = '3RD';  placeClass = 'result-3rd'; }
    else                                { placeText = 'DNF';  placeClass = 'result-dnf'; }

    const wrap = document.createElement('div');
    wrap.className = 'race-result-banner';

    const placeEl = document.createElement('div');
    placeEl.className   = `race-result-place ${placeClass}`;
    placeEl.textContent = placeText;
    wrap.appendChild(placeEl);

    if (prize && prize > 0) {
      const prizeEl = document.createElement('div');
      prizeEl.className   = 'race-result-prize';
      prizeEl.textContent = '+$' + Math.round(prize).toLocaleString('en-US');
      wrap.appendChild(prizeEl);
    }

    document.body.appendChild(wrap);

    // Hold for 2.4 s then fade out
    setTimeout(() => {
      wrap.style.transition = 'opacity 0.5s ease-out';
      wrap.style.opacity    = '0';
      setTimeout(() => {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        if (onDone) onDone();
      }, 550);
    }, 2400);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LAP BANNER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Flash a "LAP 2 / 3" or "FINAL LAP!" banner below the race timer.
   * @param {number} currentLap
   * @param {number} totalLaps
   */
  function lap(currentLap, totalLaps) {
    // Remove previous if still visible
    if (_lapBannerEl && _lapBannerEl.parentNode) {
      _lapBannerEl.parentNode.removeChild(_lapBannerEl);
    }

    const isFinal = currentLap === totalLaps;
    const label   = isFinal
      ? 'FINAL LAP!'
      : `LAP ${currentLap} / ${totalLaps}`;

    const el = document.createElement('div');
    el.className   = 'race-checkpoint-banner';   // reuses same style
    el.textContent = label;
    el.style.color = isFinal
      ? 'var(--clr-red)'
      : 'var(--clr-white)';

    document.body.appendChild(el);
    _lapBannerEl = el;

    el.addEventListener('animationend', () => {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (_lapBannerEl === el) _lapBannerEl = null;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRONG WAY
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Show or hide the persistent "WRONG WAY" banner.
   * The banner pulsates until cleared by calling showWrongWay(false).
   *
   * @param {boolean} active
   */
  function showWrongWay(active) {
    if (active === _wrongWayActive) return;
    _wrongWayActive = active;

    if (active) {
      _createWrongWayBanner();
    } else {
      _hideWrongWay();
    }
  }

  function _createWrongWayBanner() {
    if (_wrongWayEl) return;   // already visible

    const el = document.createElement('div');
    el.id          = 'wrong-way-banner';
    el.textContent = 'WRONG WAY';
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('role',      'alert');

    // Inline styles — banner lives above HUD (z: overlay + 1)
    Object.assign(el.style, {
      position:       'fixed',
      top:            '50%',
      left:           '50%',
      transform:      'translate(-50%, -50%)',
      fontFamily:     'var(--font-display, "Orbitron", sans-serif)',
      fontSize:       'clamp(2.8rem, 6vw, 4.5rem)',
      fontWeight:     '900',
      letterSpacing:  '0.14em',
      color:          'var(--clr-red, #FF2222)',
      textShadow:     '0 0 30px rgba(255,34,34,0.9), 0 4px 20px rgba(0,0,0,0.9)',
      pointerEvents:  'none',
      zIndex:         'calc(var(--z-overlay, 400) + 1)',
      animation:      'wrongWayBanner 0.7s ease-in-out infinite alternate',
    });

    // Inject the keyframe if it doesn't already exist
    _ensureKeyframe('wrongWayBanner', `
      0%   { opacity: 0.55; transform: translate(-50%, -50%) scale(0.96); }
      100% { opacity: 1.00; transform: translate(-50%, -50%) scale(1.04); }
    `);

    document.body.appendChild(el);
    _wrongWayEl = el;
  }

  function _hideWrongWay() {
    if (_wrongWayEl && _wrongWayEl.parentNode) {
      _wrongWayEl.parentNode.removeChild(_wrongWayEl);
    }
    _wrongWayEl    = null;
    _wrongWayActive = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POLICE EVENTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Flash a police-themed notification when pursuit begins or stars escalate.
   * @param {number} stars  New wanted level (1–3).
   */
  function pursuitStarted(stars) {
    const starStr = '★'.repeat(stars);
    police(`PURSUIT STARTED   ${starStr}`);
  }

  /**
   * Show "WANTED ★★" star-gain notification.
   * @param {number} stars
   */
  function wantedEscalated(stars) {
    const starStr = '★'.repeat(stars);
    police(`WANTED  ${starStr}`);
  }

  /**
   * Show a prominent "BUSTED!" mid-screen banner plus a toast.
   * @param {number} fine  Fine amount deducted.
   */
  function busted(fine) {
    // Mid-screen flash
    _flashMidScreen('BUSTED!', 'var(--clr-red, #FF2222)', 2000);
    // Toast
    danger(`Busted! $${Math.round(fine).toLocaleString('en-US')} fine deducted.`, '🚔');
  }

  /**
   * Show an "EVADED!" mid-screen flash when the player shakes the police.
   */
  function evaded() {
    _flashMidScreen('EVADED!', 'var(--clr-green, #22CC55)', 1600);
    success('Police evaded!', '💨');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MISSION / TAXI EVENTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * "PASSENGER PICKED UP" banner + toast.
   * @param {string} missionName
   */
  function passengerPickedUp(missionName) {
    _flashMidScreen('PASSENGER ON BOARD', 'var(--clr-gold, #FFD700)', 1500);
    success(missionName + ' — passenger picked up!', '🚕');
  }

  /**
   * "DELIVERED!" banner + money toast.
   * @param {string} missionName
   * @param {number} fare
   */
  function passengerDelivered(missionName, fare) {
    _flashMidScreen('DELIVERED!', 'var(--clr-cash, #33FF88)', 1800);
    money(`${missionName} complete  +$${Math.round(fare).toLocaleString('en-US')}`);
  }

  /**
   * "MISSION FAILED" banner.
   * @param {string} [reason]  e.g. 'Time expired'.
   */
  function missionFailed(reason) {
    _flashMidScreen('MISSION FAILED', 'var(--clr-red, #FF2222)', 2000);
    if (reason) danger(reason, '✕');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GARAGE / DEALER EVENTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Confirm a repair was applied.
   * @param {number} cost
   */
  function repaired(cost) {
    success(`Vehicle repaired  -$${Math.round(cost).toLocaleString('en-US')}`, '🛠');
  }

  /**
   * Confirm an upgrade was purchased.
   * @param {string} upgradeName  e.g. 'Engine Lv.3'
   * @param {number} cost
   */
  function upgradePurchased(upgradeName, cost) {
    success(`${upgradeName} installed  -$${Math.round(cost).toLocaleString('en-US')}`, '⚙️');
  }

  /**
   * Confirm a paint job was applied.
   * @param {string} colorName
   * @param {number} cost
   */
  function paintApplied(colorName, cost) {
    success(`${colorName} paint applied  -$${Math.round(cost).toLocaleString('en-US')}`, '🎨');
  }

  /**
   * Confirm a car purchase.
   * @param {string} carName
   * @param {number} cost
   */
  function carPurchased(carName, cost) {
    _flashMidScreen('CAR PURCHASED!', 'var(--clr-gold, #FFD700)', 2000);
    money(`${carName} purchased  -$${Math.round(cost).toLocaleString('en-US')}`);
  }

  /**
   * Show a "Not enough money" warning.
   */
  function insufficientFunds() {
    warn('Not enough money!', '💸');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GENERIC MID-SCREEN FLASH
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Display a temporary centred label in a given colour.
   * Fades in quickly, holds, then fades out.
   *
   * @param {string} text       Label text.
   * @param {string} color      CSS colour string.
   * @param {number} holdMs     Total visible duration in milliseconds.
   */
  function _flashMidScreen(text, color, holdMs) {
    const el = document.createElement('div');
    el.textContent = text;
    el.setAttribute('aria-live', 'polite');

    Object.assign(el.style, {
      position:       'fixed',
      top:            '42%',
      left:           '50%',
      transform:      'translate(-50%, -50%)',
      fontFamily:     'var(--font-display, "Orbitron", sans-serif)',
      fontSize:       'clamp(2rem, 5vw, 3.5rem)',
      fontWeight:     '900',
      letterSpacing:  '0.12em',
      color:          color,
      textShadow:     '0 0 24px currentColor, 0 4px 16px rgba(0,0,0,0.9)',
      pointerEvents:  'none',
      zIndex:         'var(--z-overlay, 400)',
      opacity:        '0',
      transition:     'opacity 0.25s ease-out',
      whiteSpace:     'nowrap',
    });

    document.body.appendChild(el);

    // Fade in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { el.style.opacity = '1'; });
    });

    // Hold then fade out
    const fadeDelay = Math.max(holdMs - 400, holdMs * 0.6);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, fadeDelay);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITY — INJECT CSS KEYFRAMES ON DEMAND
  // ══════════════════════════════════════════════════════════════════════════

  /** Inject a @keyframes rule into a shared <style> tag if not already present. */
  function _ensureKeyframe(name, body) {
    if (document.getElementById('notif-keyframes-' + name)) return;

    const style = document.createElement('style');
    style.id    = 'notif-keyframes-' + name;
    style.textContent = `@keyframes ${name} { ${body} }`;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    dispose,

    // Per-frame tick
    update,

    // ── Generic toasts ──
    toast,
    success,
    warn,
    danger,
    money,
    police,

    // ── Race events ──
    checkpoint,
    raceResult,
    lap,

    // ── Directional warning ──
    showWrongWay,

    // ── Police events ──
    pursuitStarted,
    wantedEscalated,
    busted,
    evaded,

    // ── Taxi / mission events ──
    passengerPickedUp,
    passengerDelivered,
    missionFailed,

    // ── Economy events ──
    repaired,
    upgradePurchased,
    paintApplied,
    carPurchased,
    insufficientFunds,

  });

})();

if (typeof module !== 'undefined') module.exports = Notifications;
