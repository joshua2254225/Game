/* ## `js/core/InputManager.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — InputManager.js
 * ============================================================================
 * Unified input layer for all control surfaces:
 *   • Keyboard       (WASD / Arrow keys / Space / modifier keys)
 *   • Virtual touch  (joystick, nitro/handbrake button, horn, camera toggle)
 *   • Gamepad        (Web Gamepad API — Xbox / PS / generic controllers)
 *   • Mouse          (orbit camera when in ORBIT mode)
 *
 * Design principles:
 *   • Single source of truth — all systems query InputManager, never raw DOM
 *   • Remappable bindings stored in a flat action map
 *   • Analogue axes normalised to [-1, +1] with configurable dead-zone
 *   • Edge-triggered events (justPressed / justReleased) reset each frame
 *   • Touch joystick is fully self-contained; thumb position is
 *     computed and rendered here
 *   • Gamepad rumble (haptic) supported where the API permits
 *
 * Actions (strings used throughout the codebase):
 *   'throttle'    forward / accelerate
 *   'brake'       brake / reverse
 *   'steerLeft'   turn left
 *   'steerRight'  turn right
 *   'handbrake'   handbrake / drift
 *   'nitro'       turbo boost
 *   'horn'        beep the horn
 *   'camCycle'    cycle camera mode
 *   'pause'       open pause menu
 *   'interact'    enter garage / dealer etc.
 *   'map'         toggle full-screen map
 *   'rearView'    hold for rear-view mirror
 * ============================================================================
 */

'use strict';

const InputManager = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // DEFAULT KEY BINDINGS
  // Map: action → array of KeyboardEvent.code strings
  // ══════════════════════════════════════════════════════════════════════════

  const DEFAULT_BINDINGS = {
    throttle:   ['KeyW', 'ArrowUp'],
    brake:      ['KeyS', 'ArrowDown'],
    steerLeft:  ['KeyA', 'ArrowLeft'],
    steerRight: ['KeyD', 'ArrowRight'],
    handbrake:  ['Space', 'ShiftLeft', 'ShiftRight'],
    nitro:      ['ShiftLeft', 'ShiftRight'],
    horn:       ['KeyH', 'KeyF'],
    camCycle:   ['KeyC', 'KeyV'],
    pause:      ['Escape', 'KeyP'],
    interact:   ['KeyE', 'Enter'],
    map:        ['KeyM', 'Tab'],
    rearView:   ['KeyR'],
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  // Keyboard key states: code → boolean (held)
  const _keys = new Map();

  // Action states this frame
  const _state = {
    // Analogue axes  -1 … +1
    steer:          0,     // combined steerLeft + steerRight + joystick.x
    throttle:       0,     // 0 … 1
    brake:          0,     // 0 … 1

    // Digital buttons
    handbrake:      false,
    nitro:          false,
    horn:           false,
    camCycle:       false,
    pause:          false,
    interact:       false,
    map:            false,
    rearView:       false,

    // Edge triggers (true for one frame only)
    justPressed:    new Set(),   // action strings
    justReleased:   new Set(),
  };

  // Previous frame's digital states (for edge detection)
  const _prevDigital = new Map();

  // ── Active bindings (may be overridden by player via settings) ──────────
  let _bindings = _cloneBindings(DEFAULT_BINDINGS);

  // ── Touch / virtual joystick ─────────────────────────────────────────────
  const _touch = {
    joystick: {
      active:    false,
      touchId:   null,
      centerX:   0,
      centerY:   0,
      x:         0,     // normalised  -1 … +1
      y:         0,     // normalised  -1 … +1 (positive = up / forward)
      radius:    52,    // px — maximum thumb displacement
    },
    buttons: {
      // buttonId → { active, touchId }
      nitro:     { active: false, touchId: null },
      horn:      { active: false, touchId: null },
      camCycle:  { active: false, touchId: null },
    },
  };

  // ── Gamepad ──────────────────────────────────────────────────────────────
  const _gamepad = {
    connected:    false,
    index:        -1,
    deadzone:     0.12,    // analogue stick dead zone radius

    // Axis indices (standard mapping)
    AXIS_LX:      0,   // left stick horizontal
    AXIS_LY:      1,   // left stick vertical
    AXIS_RX:      2,   // right stick horizontal
    AXIS_RY:      3,   // right stick vertical
    AXIS_LT:      6,   // left trigger  (may vary)
    AXIS_RT:      7,   // right trigger

    // Button indices (standard mapping)
    BTN_A:        0,   // cross / A
    BTN_B:        1,   // circle / B
    BTN_X:        2,   // square / X
    BTN_Y:        3,   // triangle / Y
    BTN_LB:       4,
    BTN_RB:       5,
    BTN_LT:       6,
    BTN_RT:       7,
    BTN_SELECT:   8,
    BTN_START:    9,
    BTN_L3:       10,
    BTN_R3:       11,
    BTN_UP:       12,
    BTN_DOWN:     13,
    BTN_LEFT:     14,
    BTN_RIGHT:    15,
    BTN_HOME:     16,
  };

  // ── Settings ─────────────────────────────────────────────────────────────
  let _invertSteer     = false;
  let _steerSensitivity = 1.0;   // multiplier (1 = default)
  let _touchEnabled    = true;
  let _gamepadEnabled  = true;

  // DOM refs for virtual controls (populated in init)
  let _joystickBase  = null;
  let _joystickThumb = null;
  let _actionButtons = {};       // buttonId → HTMLElement

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Attach all event listeners.
   * Must be called once after the DOM is ready.
   */
  function init() {
    // Keyboard
    window.addEventListener('keydown', _onKeyDown, { passive: false });
    window.addEventListener('keyup',   _onKeyUp);

    // Touch controls (virtual joystick + buttons)
    _joystickBase  = document.getElementById('joystick-base');
    _joystickThumb = document.getElementById('joystick-thumb');
    _actionButtons = {
      nitro:    document.getElementById('btn-action-primary'),
      horn:     document.getElementById('btn-action-secondary'),
      camCycle: document.getElementById('btn-cam-toggle'),
    };

    if (_joystickBase) {
      _joystickBase.addEventListener('touchstart', _onJoyStart,  { passive: false });
      document.addEventListener('touchmove',       _onTouchMove, { passive: false });
      document.addEventListener('touchend',        _onTouchEnd,  { passive: true });
      document.addEventListener('touchcancel',     _onTouchEnd,  { passive: true });
    }

    // Virtual action buttons
    for (const [id, el] of Object.entries(_actionButtons)) {
      if (!el) continue;
      el.addEventListener('touchstart', (e) => _onBtnStart(e, id), { passive: false });
      el.addEventListener('touchend',   (e) => _onBtnEnd(e, id),   { passive: true });
      el.addEventListener('touchcancel',(e) => _onBtnEnd(e, id),   { passive: true });
      // Mouse fallback for desktop testing
      el.addEventListener('mousedown',  () => _onBtnStart(null, id));
      el.addEventListener('mouseup',    () => _onBtnEnd(null, id));
      el.addEventListener('mouseleave', () => _onBtnEnd(null, id));
    }

    // Pause button
    const pauseBtn = document.getElementById('btn-pause-hud');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => _triggerAction('pause'));
    }

    // Camera cycle button
    const camBtn = document.getElementById('btn-cam-toggle');
    if (camBtn) {
      camBtn.addEventListener('click', () => _triggerAction('camCycle'));
    }

    // Gamepad
    window.addEventListener('gamepadconnected',    _onGamepadConnected);
    window.addEventListener('gamepaddisconnected', _onGamepadDisconnected);

    // Load saved bindings / settings
    _loadSettings();

    console.info('[InputManager] Initialised.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // KEYBOARD
  // ══════════════════════════════════════════════════════════════════════════

  function _onKeyDown(e) {
    if (e.repeat) return;

    // Block browser shortcuts only for game keys
    const gameKeys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
    if (gameKeys.includes(e.code)) e.preventDefault();

    _keys.set(e.code, true);
  }

  function _onKeyUp(e) {
    _keys.set(e.code, false);
  }

  /**
   * Returns true if the given KeyboardEvent.code is currently held.
   */
  function isKeyHeld(code) {
    return _keys.get(code) === true;
  }

  /**
   * Returns true if any key bound to `action` is currently held.
   */
  function _isActionHeld(action) {
    const codes = _bindings[action];
    if (!codes) return false;
    return codes.some(c => _keys.get(c) === true);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIRTUAL JOYSTICK
  // ══════════════════════════════════════════════════════════════════════════

  function _onJoyStart(e) {
    e.preventDefault();
    if (!_touchEnabled) return;

    const touch = e.changedTouches[0];
    _touch.joystick.touchId = touch.identifier;
    _touch.joystick.active  = true;

    const rect = _joystickBase.getBoundingClientRect();
    _touch.joystick.centerX = rect.left + rect.width  / 2;
    _touch.joystick.centerY = rect.top  + rect.height / 2;

    if (_joystickBase) _joystickBase.classList.add('active');

    _updateJoystick(touch.clientX, touch.clientY);
  }

  function _onTouchMove(e) {
    if (!_touchEnabled) return;

    for (const touch of e.changedTouches) {
      // Joystick drag
      if (touch.identifier === _touch.joystick.touchId) {
        e.preventDefault();
        _updateJoystick(touch.clientX, touch.clientY);
      }
    }
  }

  function _onTouchEnd(e) {
    for (const touch of e.changedTouches) {
      // Release joystick
      if (touch.identifier === _touch.joystick.touchId) {
        _releaseJoystick();
      }

      // Release any action button that captured this touch
      for (const [id, btn] of Object.entries(_touch.buttons)) {
        if (btn.touchId === touch.identifier) {
          btn.active  = false;
          btn.touchId = null;
          if (_actionButtons[id]) _actionButtons[id].classList.remove('active');
        }
      }
    }
  }

  function _updateJoystick(clientX, clientY) {
    const joy = _touch.joystick;
    const dx  = clientX - joy.centerX;
    const dy  = clientY - joy.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r    = joy.radius;
    const clampedDist = Math.min(dist, r);
    const angle       = Math.atan2(dy, dx);

    const thumbX = Math.cos(angle) * clampedDist;
    const thumbY = Math.sin(angle) * clampedDist;

    // Move thumb visual
    if (_joystickThumb) {
      _joystickThumb.style.transform =
        `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;
    }

    // Normalise with dead-zone
    const raw      = dist / r;
    const deadzone = 0.08;
    const magnitude = raw < deadzone ? 0 : (raw - deadzone) / (1 - deadzone);

    joy.x = dist > 1 ? (Math.cos(angle) * magnitude) : 0;
    joy.y = dist > 1 ? -(Math.sin(angle) * magnitude) : 0;   // invert Y: up = +1
  }

  function _releaseJoystick() {
    _touch.joystick.active  = false;
    _touch.joystick.touchId = null;
    _touch.joystick.x       = 0;
    _touch.joystick.y       = 0;

    if (_joystickThumb) {
      _joystickThumb.style.transform = 'translate(-50%, -50%)';
    }
    if (_joystickBase) _joystickBase.classList.remove('active');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIRTUAL ACTION BUTTONS
  // ══════════════════════════════════════════════════════════════════════════

  function _onBtnStart(e, id) {
    if (!_touchEnabled) return;
    if (e) e.preventDefault();

    const btn = _touch.buttons[id];
    if (!btn) return;

    btn.active  = true;
    btn.touchId = e ? e.changedTouches?.[0]?.identifier ?? null : null;

    if (_actionButtons[id]) _actionButtons[id].classList.add('active');
  }

  function _onBtnEnd(e, id) {
    const btn = _touch.buttons[id];
    if (!btn) return;
    btn.active  = false;
    btn.touchId = null;
    if (_actionButtons[id]) _actionButtons[id].classList.remove('active');
  }

  /** Programmatically fire a single-frame action (e.g. from button click). */
  function _triggerAction(action) {
    _state.justPressed.add(action);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GAMEPAD
  // ══════════════════════════════════════════════════════════════════════════

  function _onGamepadConnected(e) {
    if (!_gamepadEnabled) return;
    _gamepad.connected = true;
    _gamepad.index     = e.gamepad.index;
    console.info(`[InputManager] Gamepad connected: "${e.gamepad.id}" (index ${e.gamepad.index})`);
  }

  function _onGamepadDisconnected(e) {
    if (e.gamepad.index === _gamepad.index) {
      _gamepad.connected = false;
      _gamepad.index     = -1;
      console.info('[InputManager] Gamepad disconnected.');
    }
  }

  /**
   * Poll the connected gamepad and return a raw snapshot.
   * Returns null if no gamepad is available.
   */
  function _pollGamepad() {
    if (!_gamepad.connected || !_gamepadEnabled) return null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return pads[_gamepad.index] || null;
  }

  /**
   * Apply dead-zone to a raw axis value.
   * Values within ±deadzone are clamped to 0;
   * beyond that, they are rescaled to fill the full -1…+1 range.
   */
  function _applyDeadzone(value, deadzone) {
    const abs = Math.abs(value);
    if (abs < deadzone) return 0;
    return MathUtils.sign(value) * (abs - deadzone) / (1 - deadzone);
  }

  /**
   * Trigger haptic (rumble) feedback on the connected gamepad.
   *
   * @param {number} [weak=0.3]      Weak motor intensity 0–1.
   * @param {number} [strong=0.6]    Strong motor intensity 0–1.
   * @param {number} [duration=150]  Duration in milliseconds.
   */
  function rumble(weak = 0.3, strong = 0.6, duration = 150) {
    if (!_gamepad.connected) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad  = pads[_gamepad.index];
    if (!pad?.vibrationActuator) return;

    pad.vibrationActuator.playEffect('dual-rumble', {
      startDelay:      0,
      duration,
      weakMagnitude:   MathUtils.clamp(weak,   0, 1),
      strongMagnitude: MathUtils.clamp(strong, 0, 1),
    }).catch(() => { /* ignore unsupported */ });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE  (call at the TOP of Game.js each tick)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Aggregate all input sources into _state.
   * Must be called once per frame before anything reads from InputManager.
   */
  function update() {
    // ── Save previous digital states for edge detection ───────────────────
    const DIGITAL_ACTIONS = [
      'handbrake', 'nitro', 'horn', 'camCycle', 'pause', 'interact', 'map', 'rearView'
    ];

    for (const a of DIGITAL_ACTIONS) {
      _prevDigital.set(a, _state[a]);
    }

    // Clear edge-trigger sets from the previous frame
    _state.justPressed.clear();
    _state.justReleased.clear();

    // ── 1. Keyboard ───────────────────────────────────────────────────────
    const kbThrottle  =  _isActionHeld('throttle')   ? 1 : 0;
    const kbBrake     =  _isActionHeld('brake')      ? 1 : 0;
    const kbLeft      =  _isActionHeld('steerLeft')  ? 1 : 0;
    const kbRight     =  _isActionHeld('steerRight') ? 1 : 0;
    const kbHandbrake  = _isActionHeld('handbrake');
    const kbNitro      = _isActionHeld('nitro');
    const kbHorn       = _isActionHeld('horn');
    const kbCamCycle   = _isActionHeld('camCycle');
    const kbPause      = _isActionHeld('pause');
    const kbInteract   = _isActionHeld('interact');
    const kbMap        = _isActionHeld('map');
    const kbRearView   = _isActionHeld('rearView');

    // ── 2. Touch joystick ─────────────────────────────────────────────────
    const joyX  = _touch.joystick.active ? _touch.joystick.x : 0;
    const joyY  = _touch.joystick.active ? _touch.joystick.y : 0;

    // Joystick forward half = throttle, backward half = brake
    const joyThrottle = Math.max(0,  joyY);   // 0 … +1
    const joyBrake    = Math.max(0, -joyY);   // 0 … +1

    const touchNitro    = _touch.buttons.nitro?.active   ?? false;
    const touchHorn     = _touch.buttons.horn?.active    ?? false;
    const touchCamCycle = _touch.buttons.camCycle?.active ?? false;

    // ── 3. Gamepad ────────────────────────────────────────────────────────
    let gpThrottle = 0, gpBrake = 0, gpSteer = 0;
    let gpHandbrake = false, gpNitro = false, gpHorn = false;
    let gpCamCycle  = false, gpPause = false, gpInteract = false;
    let gpMap = false, gpRearView = false;

    const pad = _pollGamepad();
    if (pad) {
      const gp = _gamepad;
      const dz = gp.deadzone;

      // Left trigger = brake, right trigger = throttle
      // Triggers may be axes or buttons depending on driver mapping
      const lt = _applyDeadzone(pad.buttons[gp.BTN_LT]?.value ?? 0, 0.05);
      const rt = _applyDeadzone(pad.buttons[gp.BTN_RT]?.value ?? 0, 0.05);

      gpThrottle = rt;
      gpBrake    = lt;

      // Left stick horizontal = steer
      gpSteer = _applyDeadzone(pad.axes[gp.AXIS_LX] ?? 0, dz);

      // If no trigger response, fall back to face buttons / D-pad
      if (gpThrottle === 0 && gpBrake === 0) {
        gpThrottle = pad.buttons[gp.BTN_A]?.pressed ? 1 : 0;
        gpBrake    = pad.buttons[gp.BTN_B]?.pressed ? 1 : 0;
      }
      if (gpSteer === 0) {
        gpSteer += pad.buttons[gp.BTN_RIGHT]?.pressed ?  1 : 0;
        gpSteer += pad.buttons[gp.BTN_LEFT]?.pressed  ? -1 : 0;
      }

      gpHandbrake = pad.buttons[gp.BTN_X]?.pressed  ?? false;
      gpNitro     = pad.buttons[gp.BTN_RB]?.pressed ?? false;
      gpHorn      = pad.buttons[gp.BTN_Y]?.pressed  ?? false;
      gpCamCycle  = pad.buttons[gp.BTN_L3]?.pressed ?? false;
      gpPause     = pad.buttons[gp.BTN_START]?.pressed ?? false;
      gpInteract  = pad.buttons[gp.BTN_SELECT]?.pressed ?? false;
      gpMap       = pad.buttons[gp.BTN_R3]?.pressed    ?? false;
      gpRearView  = pad.buttons[gp.BTN_LB]?.pressed    ?? false;
    }

    // ── 4. Combine all sources into final state ───────────────────────────

    // Throttle: max of all sources
    _state.throttle = MathUtils.clamp(
      Math.max(kbThrottle, joyThrottle, gpThrottle), 0, 1
    );

    // Brake: max of all sources
    _state.brake = MathUtils.clamp(
      Math.max(kbBrake, joyBrake, gpBrake), 0, 1
    );

    // Steer: combine keyboard digital ± joystick analogue ± gamepad analogue
    let rawSteer = (kbRight - kbLeft);              // -1, 0, or +1
    if (Math.abs(joyX)   > Math.abs(rawSteer)) rawSteer = joyX;
    if (Math.abs(gpSteer) > Math.abs(rawSteer)) rawSteer = gpSteer;
    rawSteer = MathUtils.clamp(rawSteer * _steerSensitivity, -1, 1);
    _state.steer = _invertSteer ? -rawSteer : rawSteer;

    // Digital buttons — any source active = active
    _state.handbrake = kbHandbrake || gpHandbrake;
    _state.nitro     = kbNitro     || gpNitro     || touchNitro;
    _state.horn      = kbHorn      || gpHorn      || touchHorn;
    _state.camCycle  = kbCamCycle  || gpCamCycle  || touchCamCycle;
    _state.pause     = kbPause     || gpPause;
    _state.interact  = kbInteract  || gpInteract;
    _state.map       = kbMap       || gpMap;
    _state.rearView  = kbRearView  || gpRearView;

    // ── 5. Edge detection ─────────────────────────────────────────────────
    for (const a of DIGITAL_ACTIONS) {
      const prev = _prevDigital.get(a) ?? false;
      const curr = _state[a];
      if (curr && !prev) _state.justPressed.add(a);
      if (!curr && prev) _state.justReleased.add(a);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // END-OF-FRAME RESET
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Clear any one-shot state that must not persist between frames.
   * Call at the END of Game.js each tick (after all systems have read input).
   */
  function endFrame() {
    // Edge triggers are already cleared at the start of update().
    // This method exists as a hook for future one-shot state.
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC QUERY API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Steering axis.  -1 = full left, +1 = full right, 0 = centre.
   * @returns {number}
   */
  function getSteer()    { return _state.steer;    }

  /**
   * Throttle axis.  0 = off, 1 = full.
   * @returns {number}
   */
  function getThrottle() { return _state.throttle; }

  /**
   * Brake axis.  0 = off, 1 = full.
   * @returns {number}
   */
  function getBrake()    { return _state.brake;    }

  /**
   * Returns true while the handbrake is held.
   */
  function isHandbrakeHeld()  { return _state.handbrake; }

  /**
   * Returns true while nitro is held.
   */
  function isNitroHeld()      { return _state.nitro;     }

  /**
   * Returns true while the horn is held.
   */
  function isHornHeld()       { return _state.horn;      }

  /**
   * Returns true while the rear-view key is held.
   */
  function isRearViewHeld()   { return _state.rearView;  }

  /**
   * Returns true on the first frame an action is pressed.
   * @param {string} action  e.g. 'pause', 'interact', 'camCycle'
   */
  function justPressed(action)  { return _state.justPressed.has(action);  }

  /**
   * Returns true on the first frame an action is released.
   * @param {string} action
   */
  function justReleased(action) { return _state.justReleased.has(action); }

  /**
   * Returns true if the action is currently held (any frame).
   * @param {string} action
   */
  function isHeld(action) {
    if (action in _state && typeof _state[action] === 'boolean') {
      return _state[action];
    }
    return false;
  }

  /**
   * Return the raw joystick vector { x, y } for custom use.
   * Both axes are normalised -1 … +1. Returns { x:0, y:0 } on keyboard/gamepad.
   */
  function getJoystick() {
    return { x: _touch.joystick.x, y: _touch.joystick.y };
  }

  /**
   * Returns true if a gamepad is currently connected and active.
   */
  function isGamepadConnected() { return _gamepad.connected; }

  /**
   * Returns a debug snapshot of the entire _state for the dev console.
   */
  function getDebugState() {
    return {
      steer:      _state.steer,
      throttle:   _state.throttle,
      brake:      _state.brake,
      handbrake:  _state.handbrake,
      nitro:      _state.nitro,
      horn:       _state.horn,
      camCycle:   _state.camCycle,
      pause:      _state.pause,
      interact:   _state.interact,
      rearView:   _state.rearView,
      joystick:   { x: _touch.joystick.x, y: _touch.joystick.y },
      gamepad:    _gamepad.connected ? 'connected' : 'none',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS & KEY REMAPPING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Set steering sensitivity multiplier.
   * @param {number} v  Typically 0.5 – 1.5.
   */
  function setSteerSensitivity(v)  { _steerSensitivity = MathUtils.clamp(v, 0.2, 2.0); }

  /**
   * Invert the steering axis (useful for some controller layouts).
   * @param {boolean} v
   */
  function setInvertSteer(v)       { _invertSteer  = !!v; }

  /**
   * Enable or disable on-screen touch controls.
   * @param {boolean} v
   */
  function setTouchEnabled(v) {
    _touchEnabled = !!v;
    const tc = document.getElementById('touch-controls');
    if (tc) tc.classList.toggle('hidden', !_touchEnabled);
    if (!_touchEnabled) _releaseJoystick();
  }

  /**
   * Enable or disable gamepad input.
   * @param {boolean} v
   */
  function setGamepadEnabled(v)    { _gamepadEnabled = !!v; }

  /**
   * Remap a single action to a new set of key codes.
   * @param {string}   action     e.g. 'throttle'
   * @param {string[]} keyCodes   Array of KeyboardEvent.code strings.
   */
  function remapAction(action, keyCodes) {
    if (!Array.isArray(keyCodes) || keyCodes.length === 0) return;
    _bindings[action] = [...keyCodes];
    _persistBindings();
  }

  /**
   * Reset all key bindings to factory defaults.
   */
  function resetBindings() {
    _bindings = _cloneBindings(DEFAULT_BINDINGS);
    _persistBindings();
  }

  /**
   * Return the current binding for an action (array of key codes).
   * @param {string} action
   * @returns {string[]}
   */
  function getBinding(action) {
    return [...(_bindings[action] || [])];
  }

  /**
   * Return all current bindings as a plain object.
   */
  function getAllBindings() {
    return _cloneBindings(_bindings);
  }

  // ── Persist bindings to SaveSystem settings ──────────────────────────────
  function _persistBindings() {
    SaveSystem.setSetting('keyBindings', _bindings);
  }

  function _loadSettings() {
    const settings = SaveSystem.loadSettings();

    if (settings.keyBindings) {
      // Only import known action keys
      for (const action of Object.keys(DEFAULT_BINDINGS)) {
        if (Array.isArray(settings.keyBindings[action])) {
          _bindings[action] = settings.keyBindings[action];
        }
      }
    }

    if (typeof settings.steerSensitivity === 'number') {
      setSteerSensitivity(settings.steerSensitivity);
    }
    if (typeof settings.invertSteer === 'boolean') {
      setInvertSteer(settings.invertSteer);
    }
    if (typeof settings.touchControls === 'boolean') {
      setTouchEnabled(settings.touchControls);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOCUS / VISIBILITY GUARDS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Clear all held-key state when the window loses focus.
   * Prevents "stuck keys" when the player alt-tabs.
   */
  function _onBlur() {
    _keys.clear();
    _releaseJoystick();
    for (const btn of Object.values(_touch.buttons)) {
      btn.active  = false;
      btn.touchId = null;
    }
    for (const el of Object.values(_actionButtons)) {
      if (el) el.classList.remove('active');
    }
  }

  window.addEventListener('blur',             _onBlur);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) _onBlur();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════════════════════════════════════════

  function _cloneBindings(src) {
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      out[k] = [...v];
    }
    return out;
  }

  /**
   * Returns a human-readable label for a KeyboardEvent.code string.
   * e.g. 'KeyW' → 'W', 'ArrowUp' → '↑', 'Space' → 'SPACE'
   * @param {string} code
   * @returns {string}
   */
  function keyLabel(code) {
    const MAP = {
      Space:         'SPACE',
      ArrowUp:       '↑',
      ArrowDown:     '↓',
      ArrowLeft:     '←',
      ArrowRight:    '→',
      ShiftLeft:     'L-SHIFT',
      ShiftRight:    'R-SHIFT',
      ControlLeft:   'L-CTRL',
      ControlRight:  'R-CTRL',
      AltLeft:       'L-ALT',
      AltRight:      'R-ALT',
      Enter:         'ENTER',
      Escape:        'ESC',
      Tab:           'TAB',
      Backspace:     'BKSP',
    };
    if (MAP[code]) return MAP[code];
    // 'KeyW' → 'W', 'Digit4' → '4', 'Numpad0' → 'NUM0'
    if (code.startsWith('Key'))    return code.slice(3);
    if (code.startsWith('Digit'))  return code.slice(5);
    if (code.startsWith('Numpad')) return `NUM${code.slice(6)}`;
    return code;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    window.removeEventListener('keydown',              _onKeyDown);
    window.removeEventListener('keyup',                _onKeyUp);
    window.removeEventListener('blur',                 _onBlur);
    window.removeEventListener('gamepadconnected',     _onGamepadConnected);
    window.removeEventListener('gamepaddisconnected',  _onGamepadDisconnected);
    document.removeEventListener('touchmove',          _onTouchMove);
    document.removeEventListener('touchend',           _onTouchEnd);
    document.removeEventListener('touchcancel',        _onTouchEnd);
    console.info('[InputManager] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    init,
    dispose,

    // Per-frame (call in this order)
    update,
    endFrame,

    // Driving axes (called every frame by PlayerCar.js)
    getSteer,
    getThrottle,
    getBrake,

    // Digital states
    isHandbrakeHeld,
    isNitroHeld,
    isHornHeld,
    isRearViewHeld,
    isHeld,

    // Edge triggers (one-frame events)
    justPressed,
    justReleased,

    // Raw joystick
    getJoystick,

    // Gamepad
    isGamepadConnected,
    rumble,

    // Low-level keyboard
    isKeyHeld,

    // Settings
    setSteerSensitivity,
    setInvertSteer,
    setTouchEnabled,
    setGamepadEnabled,

    // Key remapping
    remapAction,
    resetBindings,
    getBinding,
    getAllBindings,

    // UI helpers
    keyLabel,

    // Debug
    getDebugState,

    // Constants
    DEFAULT_BINDINGS,
  });

})();

if (typeof module !== 'undefined') module.exports = InputManager;
/* ```

---

**File 11 ✅ — `js/core/InputManager.js` done.**

This is the complete unified input layer for the game. It handles all four input surfaces simultaneously and merges them into a single clean state every frame. The keyboard system maps configurable action names to arrays of `KeyboardEvent.code` strings with full remapping and localStorage persistence. The virtual joystick handles touchstart/move/end, computes a clamped polar offset, moves the thumb visual, applies a dead-zone, and splits the Y axis into separate throttle and brake floats. Action buttons capture their own touch identifiers so simultaneous multi-touch works correctly. The gamepad poller reads both trigger axes and face buttons, applies a configurable dead-zone, and maps the full standard layout including D-pad fallback steering. All three sources are merged with a max-wins strategy, combined into five final outputs — steer, throttle, brake, and eight digital booleans — and edge-triggered `justPressed`/`justReleased` sets are computed each frame so systems like the garage and pause menu get clean single-frame events. Blur and visibility-change listeners prevent stuck keys when alt-tabbing. Haptic rumble, steer sensitivity, invert-steer, and touch-enable are all runtime-configurable.

**Say "File 12" for `js/world/Sky.js`.** */
