/**
 * ══════════════════════════════════════════════════════════════════════════
 * LAVA JUMP — Controls Manager
 *
 * Provides a unified input API for:
 *   • Virtual joystick  (bottom-left, touch)
 *   • Jump button       (bottom-right, touch)
 *   • Camera swipe      (anywhere on canvas not covered by UI)
 *   • Keyboard fallback (WASD / Arrows / Space — for desktop testing)
 * ══════════════════════════════════════════════════════════════════════════
 */

class Controls {

  constructor() {
    // ── Joystick ─────────────────────────────────────────────────────────
    this.joystick = { x: 0, y: 0 };     // normalised -1 … +1
    this._joyId     = null;              // active touch identifier
    this._joyCenter = { x: 0, y: 0 };   // base center in screen px
    this.JOYSTICK_R = 44;                // radius in px for clamping

    // ── Jump ─────────────────────────────────────────────────────────────
    this._jumpId      = null;
    this._jumpPending = false;           // cleared by consumeJump()

    // ── Camera swipe ──────────────────────────────────────────────────────
    this._camId    = null;
    this._camLastX = 0;
    this._camDelta = 0;                  // cleared by consumeCameraRotation()

    // ── DOM refs ──────────────────────────────────────────────────────────
    this._base  = document.getElementById('joystick-base');
    this._thumb = document.getElementById('joystick-thumb');
    this._jumpEl = document.getElementById('jump-btn');

    // ── Keyboard ─────────────────────────────────────────────────────────
    this._keys = {};

    this._initTouch();
    this._initKeyboard();
  }

  // ── TOUCH ──────────────────────────────────────────────────────────────

  _initTouch() {
    const base  = this._base;
    const jumpEl = this._jumpEl;

    // Joystick — touchstart on the base element
    base.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._joyId = t.identifier;
      const r = base.getBoundingClientRect();
      this._joyCenter.x = r.left + r.width  / 2;
      this._joyCenter.y = r.top  + r.height / 2;
      base.classList.add('active');
      this._moveJoy(t);
    }, { passive: false });

    // Jump button
    jumpEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._jumpId      = e.changedTouches[0].identifier;
      this._jumpPending = true;
      jumpEl.classList.add('active');
    }, { passive: false });

    jumpEl.addEventListener('touchend', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._jumpId) {
          this._jumpId = null;
          jumpEl.classList.remove('active');
        }
      }
    }, { passive: false });

    // Global move & end — handles joystick drag and camera swipe
    document.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId)  this._moveJoy(t);
        if (t.identifier === this._camId) {
          this._camDelta += t.clientX - this._camLastX;
          this._camLastX  = t.clientX;
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId)  this._releaseJoy();
        if (t.identifier === this._camId)  this._camId = null;
        if (t.identifier === this._jumpId) {
          this._jumpId = null;
          jumpEl.classList.remove('active');
        }
      }
    }, { passive: true });

    // Camera swipe starts on the canvas (right 65% of screen)
    const canvas = document.getElementById('game-canvas');
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (this._camId === null && t.clientX > window.innerWidth * 0.35) {
          this._camId    = t.identifier;
          this._camLastX = t.clientX;
        }
      }
    }, { passive: true });
  }

  _moveJoy(touch) {
    const dx   = touch.clientX - this._joyCenter.x;
    const dy   = touch.clientY - this._joyCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r    = this.JOYSTICK_R;
    const c    = Math.min(dist, r);
    const ang  = Math.atan2(dy, dx);
    const ox   = Math.cos(ang) * c;
    const oy   = Math.sin(ang) * c;

    this._thumb.style.transform =
      `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;

    this.joystick.x =  ox / r;
    this.joystick.y = -oy / r;   // screen-Y inverted → +Y = forward
  }

  _releaseJoy() {
    this._joyId = null;
    this.joystick.x = 0;
    this.joystick.y = 0;
    this._thumb.style.transform = 'translate(-50%, -50%)';
    this._base.classList.remove('active');
  }

  // ── KEYBOARD ────────────────────────────────────────────────────────────

  _initKeyboard() {
    document.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (e.code === 'Space') {
        this._jumpPending = true;
        e.preventDefault();
      }
    });
    document.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
    });
  }

  // ── PUBLIC API ───────────────────────────────────────────────────────────

  /**
   * Returns a movement vector {x, y} in –1 … +1 range.
   * x = strafe right/left, y = move forward/backward.
   * Combines joystick and keyboard; clamps to unit circle.
   */
  getMovement() {
    let x = this.joystick.x;
    let y = this.joystick.y;

    if (this._keys['KeyA'] || this._keys['ArrowLeft'])  x -= 1;
    if (this._keys['KeyD'] || this._keys['ArrowRight']) x += 1;
    if (this._keys['KeyW'] || this._keys['ArrowUp'])    y += 1;
    if (this._keys['KeyS'] || this._keys['ArrowDown'])  y -= 1;

    const len = Math.sqrt(x * x + y * y);
    if (len > 1) { x /= len; y /= len; }

    return { x, y };
  }

  /**
   * Returns true once per jump-press, then resets.
   */
  consumeJump() {
    const j = this._jumpPending;
    this._jumpPending = false;
    return j;
  }

  /**
   * Returns accumulated horizontal camera-swipe pixels since last call, then resets.
   */
  consumeCameraRotation() {
    const d = this._camDelta;
    this._camDelta = 0;
    return d;
  }

  /**
   * Reset all state — call when pausing or changing level.
   */
  reset() {
    this._releaseJoy();
    this._jumpPending = false;
    this._camDelta    = 0;
    this._camId       = null;
    this._jumpId      = null;
    this._keys        = {};
    this._jumpEl.classList.remove('active');
  }
}
