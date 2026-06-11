/*js/ui.js*/
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LAVA JUMP — UI Manager
 *
 * Manages all screen transitions, HUD updates, countdown,
 * level select grid, and star/progress persistence.
 * ══════════════════════════════════════════════════════════════════════════
 */

class UI {

  constructor(game, controls) {
    this.game     = game;
    this.controls = controls;

    // ── Progress: levelId → bestStars (0–3) ──────────────────────────────
    this.progress   = this._loadProgress();
    this.currentIdx = 0;

    // ── Countdown internal state ─────────────────────────────────────────
    this._cdInterval = null;
    this._cdActive   = false;

    this._buildLevelGrid();
    this._bindButtons();
    this._bindGameCallbacks();
    this._checkOrientation();

    window.addEventListener('orientationchange', () => {
      setTimeout(() => this._checkOrientation(), 350);
    });
    window.addEventListener('resize', () => this._checkOrientation());
  }

  // ════════════════════════════════════════════════════════════════════════
  // ORIENTATION GUARD
  // ════════════════════════════════════════════════════════════════════════

  _checkOrientation() {
    document.getElementById('rotate-overlay')
      .classList.toggle('hidden', window.innerWidth > window.innerHeight);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PROGRESS STORAGE
  // ════════════════════════════════════════════════════════════════════════

  _loadProgress() {
    try   { return JSON.parse(localStorage.getItem('lavaJump_v1')) || {}; }
    catch { return {}; }
  }

  _saveProgress() {
    try { localStorage.setItem('lavaJump_v1', JSON.stringify(this.progress)); }
    catch {}
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEVEL GRID
  // ════════════════════════════════════════════════════════════════════════

  _buildLevelGrid() {
    const grid = document.getElementById('levels-grid');
    grid.innerHTML = '';

    LEVELS.forEach((lvl, idx) => {
      // Level is unlocked if it's the first one, or if the previous level
      // has any stars (meaning it was completed at least once).
      const unlocked = idx === 0 || this.progress[LEVELS[idx - 1].id] !== undefined;
      const stars    = this.progress[lvl.id] || 0;

      const card = document.createElement('div');
      card.className = `level-card ${unlocked ? 'unlocked' : 'locked'}`;
      card.innerHTML = `
        <div class="lc-num">${lvl.id}</div>
        <div class="lc-name">${lvl.name}</div>
        <div class="lc-stars">
          ${[1,2,3].map(s =>
            `<span style="color:${s<=stars?'#FFD700':'#444'}">${s<=stars?'★':'☆'}</span>`
          ).join('')}
        </div>
        ${!unlocked ? '<div class="lock-icon">🔒</div>' : ''}
      `;

      if (unlocked) card.addEventListener('click', () => this._startLevel(idx));
      grid.appendChild(card);
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // BUTTON BINDINGS
  // ════════════════════════════════════════════════════════════════════════

  _bindButtons() {
    const $ = id => document.getElementById(id);

    // Main menu
    $('btn-play').addEventListener('click', () => {
      const idx = LEVELS.findIndex(l => !this.progress[l.id]);
      this._startLevel(idx >= 0 ? idx : 0);
    });
    $('btn-levels').addEventListener('click', () => this._showOnly('level-select'));
    $('btn-back-from-levels').addEventListener('click', () => this._showOnly('main-menu'));

    // HUD
    $('btn-pause').addEventListener('click', () => this._doPause());

    // Camera mode buttons
    document.querySelectorAll('.cam-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.game.setCameraMode(parseInt(btn.dataset.cam));
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Countdown
    $('btn-cancel-countdown').addEventListener('click', () => this._cancelCountdown());

    // Pause menu
    $('btn-resume').addEventListener('click',             () => this._doResume());
    $('btn-restart-from-pause').addEventListener('click', () => this._doRestart());
    $('btn-menu-from-pause').addEventListener('click',    () => this._doGoMenu());

    // Level complete
    $('btn-next-level').addEventListener('click',          () => this._doNextLevel());
    $('btn-retry-from-complete').addEventListener('click', () => this._doRestart());
    $('btn-menu-from-complete').addEventListener('click',  () => this._doGoMenu());

    // Game over
    $('btn-retry-from-over').addEventListener('click', () => this._doRestart());
    $('btn-menu-from-over').addEventListener('click',  () => this._doGoMenu());
  }

  // ════════════════════════════════════════════════════════════════════════
  // GAME CALLBACKS
  // ════════════════════════════════════════════════════════════════════════

  _bindGameCallbacks() {
    this.game.onCoinCollect = (collected, total) => {
      document.getElementById('hud-coins').textContent = `${collected}/${total}`;
    };

    this.game.onTimerUpdate = (sec) => {
      const m  = Math.floor(sec / 60).toString().padStart(2, '0');
      const s  = Math.floor(sec % 60).toString().padStart(2, '0');
      const el = document.getElementById('hud-timer');
      el.textContent = `${m}:${s}`;
      el.classList.toggle('danger', sec <= 10);
    };

    this.game.onLevelComplete = (stats) => this._onComplete(stats);
    this.game.onPlayerDeath   = (reason) => this._onDeath(reason);
  }

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════

  /** Hide all overlay screens except the one with the given ID. */
  _showOnly(screenId) {
    ['main-menu','level-select','pause-menu','level-complete','game-over']
      .forEach(id => document.getElementById(id)
        .classList.toggle('hidden', id !== screenId));
  }

  _showGameUI() {
    document.getElementById('game-hud').classList.remove('hidden');
    document.getElementById('touch-controls').classList.remove('hidden');
  }

  _hideGameUI() {
    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
    document.getElementById('countdown-overlay').classList.add('hidden');
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEVEL FLOW
  // ════════════════════════════════════════════════════════════════════════

  _startLevel(idx) {
    this.currentIdx = idx;
    const lvl = LEVELS[idx];

    // Load level into the 3D scene (paused) so it renders behind countdown
    this.game.loadLevel(lvl);
    this.game.pause();
    this.controls.reset();

    // Hide all overlay menus, show game UI
    this._showOnly('__none__');
    this._showGameUI();

    // Set initial HUD values
    document.getElementById('hud-level-num').textContent  = lvl.id;
    document.getElementById('hud-coins').textContent      = `0/${lvl.coins.length}`;
    this._setTimerDisplay(lvl.timeLimit);

    // Start 5-second countdown; callback starts the game
    this._runCountdown(() => this.game.start());
  }

  _runCountdown(onDone) {
    let n = 5;
    this._cdActive = true;
    const overlay  = document.getElementById('countdown-overlay');
    const numEl    = document.getElementById('countdown-num');
    overlay.classList.remove('hidden');
    numEl.textContent = n;

    this._cdInterval = setInterval(() => {
      if (!this._cdActive) { clearInterval(this._cdInterval); return; }
      n--;
      if (n <= 0) {
        clearInterval(this._cdInterval);
        overlay.classList.add('hidden');
        if (this._cdActive) onDone();
      } else {
        numEl.textContent = n;
      }
    }, 1000);
  }

  _cancelCountdown() {
    this._cdActive = false;
    clearInterval(this._cdInterval);
    document.getElementById('countdown-overlay').classList.add('hidden');
    this._hideGameUI();
    this._showOnly('main-menu');
    this.game.pause();
    this.controls.reset();
  }

  // ── Pause / Resume ────────────────────────────────────────────────────

  _doPause() {
    this.game.pause();
    this._showOnly('pause-menu');
  }

  _doResume() {
    this._showOnly('__none__');
    this.game.resume();
  }

  // ── Restart ───────────────────────────────────────────────────────────

  _doRestart() {
    this._showOnly('__none__');
    document.getElementById('countdown-overlay').classList.add('hidden');

    this.game.resetLevel();   // loads level, keeps firstTry = false
    this.game.pause();
this.controls.reset();

    const lvl = LEVELS[this.currentIdx];
    document.getElementById('hud-coins').textContent = `0/${lvl.coins.length}`;
    this._setTimerDisplay(lvl.timeLimit);

    this._runCountdown(() => this.game.start());
  }

  // ── Main menu ─────────────────────────────────────────────────────────

  _doGoMenu() {
    this._cdActive = false;
    clearInterval(this._cdInterval);
    this._hideGameUI();
    this._showOnly('main-menu');
    this.game.pause();
    this.controls.reset();
  }

  // ── Next level ────────────────────────────────────────────────────────

  _doNextLevel() {
    const next = this.currentIdx + 1;
    if (next < LEVELS.length) {
      this._showOnly('__none__');
      this._startLevel(next);
    } else {
      // All levels done — return to menu
      this._doGoMenu();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEVEL COMPLETE
  // ════════════════════════════════════════════════════════════════════════

  _onComplete(stats) {
    /*
     * STAR RULES:
     *   1 star  → completed the level (any run)
     *   2 stars → completed AND timer did not expire
     *   3 stars → first try + timer remaining + all coins collected
     */
    let stars = 1;
    if (stats.timeRemaining > 0)                                        stars = 2;
    if (stars >= 2 && stats.firstTry && stats.coinsCollected === stats.totalCoins) stars = 3;

    // Persist if this is an improvement
    const lvlId = LEVELS[this.currentIdx].id;
    const prev  = this.progress[lvlId] || 0;
    if (stars > prev) {
      this.progress[lvlId] = stars;
      this._saveProgress();
    }

    // Show result screen
    this._showOnly('level-complete');

    // Animated stars
    const starsEl = document.getElementById('stars-display');
    starsEl.innerHTML = [1,2,3].map(i =>
      `<span class="star-icon ${i > stars ? 'empty' : ''}">
        ${i <= stars ? '★' : '☆'}
       </span>`
    ).join('');

    // Score details
    const timeLeft = Math.floor(stats.timeRemaining);
    let details = `
      Coins: <b class="highlight">${stats.coinsCollected}/${stats.totalCoins}</b><br>
      Time left: <b class="highlight">${timeLeft}s</b>
    `;
    if (stats.firstTry)                                       details += `<br><span class="perfect-row">✨ First Try!</span>`;
    if (stats.coinsCollected === stats.totalCoins)            details += `<br><span class="perfect-row">🪙 All Coins!</span>`;
    if (stars === 3)                                          details += `<br><span class="perfect-row">🏆 Perfect Run!</span>`;
    document.getElementById('score-details').innerHTML = details;

    // Hide "Next Level" button if this was the last level
    document.getElementById('btn-next-level')
      .classList.toggle('hidden', this.currentIdx + 1 >= LEVELS.length);

    // Refresh grid so newly-unlocked level and new stars appear
    this._buildLevelGrid();
  }

  // ════════════════════════════════════════════════════════════════════════
  // GAME OVER
  // ════════════════════════════════════════════════════════════════════════

  _onDeath(reason) {
    this._showOnly('game-over');
    document.getElementById('over-reason').textContent =
      reason === 'timer' ? '⏱ Time ran out!' : '🌋 You fell into the lava!';
  }

  // ════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════════

  _setTimerDisplay(seconds) {
    const m  = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s  = Math.floor(seconds % 60).toString().padStart(2, '0');
    const el = document.getElementById('hud-timer');
    el.textContent = `${m}:${s}`;
    el.classList.remove('danger');
  }
}
