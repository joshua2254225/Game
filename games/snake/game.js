/* ===================================================== SNAKE.IO — Neon Arena game.js

Ziele dieser Version:

langsamer, sauberer Bewegungsrhythmus

große Welt mit Kamera-Follow

lockerer verteilte Hindernisse

professionelle Struktur in klaren Modulen ===================================================== */


(() => { 'use strict';

/* ===================================================== 1) DOM / CANVAS ===================================================== */ const canvas = document.getElementById('gameCanvas'); const ctx = canvas.getContext('2d');

const ui = { scoreValue: document.getElementById('scoreValue'), bestValue: document.getElementById('bestValue'), finalScore: document.getElementById('finalScore'), finalBest: document.getElementById('finalBest'), deathReason: document.getElementById('deathReason'), startOverlay: document.getElementById('startOverlay'), gameOverOverlay: document.getElementById('gameOverOverlay'), startButton: document.getElementById('startButton'), restartButton: document.getElementById('restartButton'), joystickBase: document.getElementById('joystickBase'), joystickKnob: document.getElementById('joystickKnob'), };

/* ===================================================== 2) CONFIG ===================================================== */ const CONFIG = { // Darstellung cellSize: 24, renderPadding: 2,

// Spielgefühl: bewusst langsamer als die alte Version
tickIntervalMs: 155,
tickIntervalMinMs: 110,
speedEveryPoints: 7,
speedStepMs: 6,

// Große Welt, deutlich größer als der sichtbare Bildschirm
worldCellsX: 120,
worldCellsY: 120,

// Kamera / Sichtfeld
cameraSmoothing: 0.12,
cameraDeadZone: 18,

// Arena-Struktur
borderThickness: 2, // Zellen
initialSnakeLength: 4,
initialCoins: 18,
initialStoneClusters: 22,
maxStonePlacementAttempts: 220,
stoneClusterSpacingMin: 8,
stoneClusterSpacingSoft: 12,
stoneClusterSpacingHard: 15,
coinSpawnAttempts: 300,

// Gameplay
wrapAroundWorld: false,
allowReverseTurn: false,
slowTurnBuffer: 1,

// Visuals
background: '#020810',
gridColor: 'rgba(0,255,136,0.045)',
borderGlow: 'rgba(255,34,68,0.9)',

};

const WORLD = { cols: CONFIG.worldCellsX, rows: CONFIG.worldCellsY, width: CONFIG.worldCellsX * CONFIG.cellSize, height: CONFIG.worldCellsY * CONFIG.cellSize, playMinX: CONFIG.borderThickness, playMinY: CONFIG.borderThickness, playMaxX: CONFIG.worldCellsX - 1 - CONFIG.borderThickness, playMaxY: CONFIG.worldCellsY - 1 - CONFIG.borderThickness, };

const CELL = CONFIG.cellSize;

/* ===================================================== 3) UTILITIES ===================================================== */ const clamp = (v, min, max) => Math.max(min, Math.min(max, v)); const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min; const randFloat = (min, max) => Math.random() * (max - min) + min; const lerp = (a, b, t) => a + (b - a) * t; const dist2 = (ax, ay, bx, by) => { const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy; };

function cellKey(x, y) { return ${x},${y}; }

function roundRectPath(context, x, y, w, h, r) { const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2)); context.beginPath(); context.moveTo(x + rr, y); context.arcTo(x + w, y, x + w, y + h, rr); context.arcTo(x + w, y + h, x, y + h, rr); context.arcTo(x, y + h, x, y, rr); context.arcTo(x, y, x + w, y, rr); context.closePath(); }

function isOpposite(a, b) { return a.x === -b.x && a.y === -b.y; }

function directionFromDelta(dx, dy) { if (Math.abs(dx) > Math.abs(dy)) { return dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 }; } return dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 }; }

/* ===================================================== 4) WORLD DATA / MODULE ===================================================== */ const World = { blocked: new Set(), stones: [], coins: [], center: { x: Math.floor(WORLD.cols / 2), y: Math.floor(WORLD.rows / 2), },

clear() {
  this.blocked.clear();
  this.stones = [];
  this.coins = [];
},

inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WORLD.cols && y < WORLD.rows;
},

inPlayableArea(x, y) {
  return (
    x >= WORLD.playMinX &&
    y >= WORLD.playMinY &&
    x <= WORLD.playMaxX &&
    y <= WORLD.playMaxY
  );
},

isBlocked(x, y) {
  return this.blocked.has(cellKey(x, y));
},

setBlocked(x, y) {
  this.blocked.add(cellKey(x, y));
},

addStoneCell(x, y) {
  if (!this.inBounds(x, y)) return false;
  if (!this.inPlayableArea(x, y)) return false;
  const key = cellKey(x, y);
  if (this.blocked.has(key)) return false;
  this.blocked.add(key);
  this.stones.push({ x, y, pulse: Math.random() * Math.PI * 2 });
  return true;
},

addCoin(x, y) {
  const key = cellKey(x, y);
  if (!this.inBounds(x, y) || this.blocked.has(key)) return false;
  if (this.coins.some(c => c.x === x && c.y === y)) return false;
  this.coins.push({ x, y, pulse: Math.random() * Math.PI * 2, glow: Math.random() });
  return true;
},

removeCoinAt(x, y) {
  const idx = this.coins.findIndex(c => c.x === x && c.y === y);
  if (idx !== -1) this.coins.splice(idx, 1);
},

spawnCoins(count) {
  let tries = 0;
  while (this.coins.length < count && tries < CONFIG.coinSpawnAttempts) {
    const x = randInt(WORLD.playMinX + 1, WORLD.playMaxX - 1);
    const y = randInt(WORLD.playMinY + 1, WORLD.playMaxY - 1);
    if (!this.blocked.has(cellKey(x, y)) && !this.isNearSnakeStart(x, y)) {
      this.addCoin(x, y);
    }
    tries++;
  }
},

isNearSnakeStart(x, y) {
  const cx = this.center.x;
  const cy = this.center.y;
  return dist2(x, y, cx, cy) < 64;
},

generateStoneClusters() {
  const clusters = [];
  const patternPool = [
    [{ x: 0, y: 0 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  ];

  const placeCluster = (baseX, baseY, pattern) => {
    const cells = pattern.map(p => ({ x: baseX + p.x, y: baseY + p.y }));
    if (cells.some(c => !this.inPlayableArea(c.x, c.y))) return false;
    if (cells.some(c => this.blocked.has(cellKey(c.x, c.y)))) return false;

    // Lochere Abstände: Clusternicht zu eng im Zentrum und nicht direkt nebeneinander
    for (const other of clusters) {
      const d = Math.sqrt(dist2(baseX, baseY, other.x, other.y));
      if (d < CONFIG.stoneClusterSpacingMin) return false;
    }

    cells.forEach(c => this.addStoneCell(c.x, c.y));
    clusters.push({ x: baseX, y: baseY });
    return true;
  };

  let attempts = 0;
  while (clusters.length < CONFIG.initialStoneClusters && attempts < CONFIG.maxStonePlacementAttempts) {
    const pattern = patternPool[randInt(0, patternPool.length - 1)];

    // Starke Sperrzone um den Startpunkt herum, damit der Anfang spielbar bleibt.
    const ringMin = 18;
    const ringMaxX = WORLD.playMaxX - 2;
    const ringMaxY = WORLD.playMaxY - 2;

    let baseX = randInt(WORLD.playMinX + 3, ringMaxX - 3);
    let baseY = randInt(WORLD.playMinY + 3, ringMaxY - 3);

    // Vermeide das Zentrum großzügig.
    const dCenter = Math.sqrt(dist2(baseX, baseY, this.center.x, this.center.y));
    if (dCenter < ringMin) {
      attempts++;
      continue;
    }

    // Verteile Steine eher in mittleren und äußeren Bereichen, damit die Mitte frei bleibt.
    const edgeBias = Math.min(
      Math.min(baseX - WORLD.playMinX, WORLD.playMaxX - baseX),
      Math.min(baseY - WORLD.playMinY, WORLD.playMaxY - baseY)
    );
    if (edgeBias < 2 && Math.random() < 0.6) {
      attempts++;
      continue;
    }

    placeCluster(baseX, baseY, pattern);
    attempts++;
  }
},

generate() {
  this.clear();

  // Randwände als blockierte Zellen
  for (let x = 0; x < WORLD.cols; x++) {
    for (let y = 0; y < WORLD.rows; y++) {
      const border = (
        x < WORLD.playMinX ||
        y < WORLD.playMinY ||
        x > WORLD.playMaxX ||
        y > WORLD.playMaxY
      );
      if (border) this.setBlocked(x, y);
    }
  }

  this.generateStoneClusters();
  this.spawnCoins(CONFIG.initialCoins);
},

};

/* ===================================================== 5) CAMERA MODULE ===================================================== */ const Camera = { x: 0, y: 0, targetX: 0, targetY: 0, viewW: 0, viewH: 0, scale: 1,

resize() {
  // Canvas im CSS-Fullsize anpassen, auf echten Pixeln rendern
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  this.viewW = rect.width;
  this.viewH = rect.height;

  // Sichtweite in Weltzellen: bewusst groß, damit die Welt groß wirkt.
  this.scale = 1;
},

follow(targetCell) {
  const worldPxX = targetCell.x * CELL + CELL / 2;
  const worldPxY = targetCell.y * CELL + CELL / 2;

  const desiredX = worldPxX - this.viewW / 2;
  const desiredY = worldPxY - this.viewH / 2;

  this.targetX = clamp(desiredX, 0, WORLD.width - this.viewW);
  this.targetY = clamp(desiredY, 0, WORLD.height - this.viewH);

  this.x = lerp(this.x, this.targetX, CONFIG.cameraSmoothing);
  this.y = lerp(this.y, this.targetY, CONFIG.cameraSmoothing);
},

apply() {
  ctx.save();
  ctx.translate(-this.x, -this.y);
},

restore() {
  ctx.restore();
},

};

/* ===================================================== 6) INPUT MODULE ===================================================== */ const Input = { activePointer: false, joyCenter: { x: 0, y: 0 }, joyRadius: 42, joyDeadzone: 12,

directionQueue: [],
currentDir: { x: 1, y: 0 },
nextDir: { x: 1, y: 0 },

bind() {
  document.addEventListener('keydown', this.onKeyDown.bind(this));

  const base = ui.joystickBase;
  base.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
  base.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
  base.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
  base.addEventListener('touchcancel', this.onTouchEnd.bind(this), { passive: false });

  base.addEventListener('mousedown', this.onMouseDown.bind(this));
  document.addEventListener('mousemove', this.onMouseMove.bind(this));
  document.addEventListener('mouseup', this.onMouseUp.bind(this));
},

reset() {
  this.directionQueue = [];
  this.currentDir = { x: 1, y: 0 };
  this.nextDir = { x: 1, y: 0 };
  this.resetJoystick();
},

enqueueDirection(dir) {
  const last = this.directionQueue.length ? this.directionQueue[this.directionQueue.length - 1] : this.nextDir;
  if (last && isOpposite(last, dir)) return;
  this.directionQueue.push(dir);
  if (this.directionQueue.length > CONFIG.slowTurnBuffer) {
    this.directionQueue = this.directionQueue.slice(-CONFIG.slowTurnBuffer);
  }
},

consumeDirection() {
  if (this.directionQueue.length > 0) {
    this.nextDir = this.directionQueue.shift();
  }
  return this.nextDir;
},

setDirection(dir) {
  if (!CONFIG.allowReverseTurn && isOpposite(this.currentDir, dir)) return;
  this.enqueueDirection(dir);
},

onKeyDown(e) {
  if (!Game.running) return;

  const key = e.key.toLowerCase();
  let dir = null;
  if (key === 'arrowup' || key === 'w') dir = { x: 0, y: -1 };
  if (key === 'arrowdown' || key === 's') dir = { x: 0, y: 1 };
  if (key === 'arrowleft' || key === 'a') dir = { x: -1, y: 0 };
  if (key === 'arrowright' || key === 'd') dir = { x: 1, y: 0 };

  if (dir) {
    e.preventDefault();
    this.setDirection(dir);
  }
},

getPointerPos(e) {
  const p = e.touches ? e.touches[0] : e;
  return { x: p.clientX, y: p.clientY };
},

updateJoystick(pos) {
  const rect = ui.joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const clamped = Math.min(dist, this.joyRadius);
  const ox = Math.cos(angle) * clamped;
  const oy = Math.sin(angle) * clamped;

  ui.joystickKnob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;

  if (dist < this.joyDeadzone || !Game.running) return;

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  let dir = null;
  if (absDx > absDy) dir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  else dir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };

  if (dir) this.setDirection(dir);
},

resetJoystick() {
  ui.joystickKnob.style.transform = 'translate(-50%, -50%)';
},

onTouchStart(e) {
  this.activePointer = true;
  this.updateJoystick(this.getPointerPos(e));
  e.preventDefault();
},

onTouchMove(e) {
  if (!this.activePointer) return;
  this.updateJoystick(this.getPointerPos(e));
  e.preventDefault();
},

onTouchEnd(e) {
  this.activePointer = false;
  this.resetJoystick();
  e.preventDefault();
},

onMouseDown(e) {
  this.activePointer = true;
  this.updateJoystick(this.getPointerPos(e));
  e.preventDefault();
},

onMouseMove(e) {
  if (!this.activePointer) return;
  this.updateJoystick(this.getPointerPos(e));
},

onMouseUp() {
  this.activePointer = false;
  this.resetJoystick();
},

};

/* ===================================================== 7) GAME MODULE ===================================================== */ const Game = { running: false, over: false, score: 0, best: 0, snake: [], particles: [], stepAccumulator: 0, lastTs: 0, deathReason: '', currentTickMs: CONFIG.tickIntervalMs, cameraTarget: { x: 0, y: 0 }, animationFrameId: 0,

loadBest() {
  this.best = parseInt(localStorage.getItem('snakeHighScore') || '0', 10) || 0;
  ui.bestValue.textContent = String(this.best);
},

saveBest() {
  localStorage.setItem('snakeHighScore', String(this.best));
},

reset() {
  World.generate();

  const cx = World.center.x;
  const cy = World.center.y;

  // Startpunkt bewusst frei in der Mitte
  this.snake = [];
  for (let i = 0; i < CONFIG.initialSnakeLength; i++) {
    this.snake.push({ x: cx - i, y: cy });
  }

  this.score = 0;
  this.over = false;
  this.running = false;
  this.stepAccumulator = 0;
  this.lastTs = 0;
  this.deathReason = '';
  this.currentTickMs = CONFIG.tickIntervalMs;
  this.particles = [];

  Input.reset();
  this.syncHUD();
  Camera.x = Math.max(0, cx * CELL - Camera.viewW / 2);
  Camera.y = Math.max(0, cy * CELL - Camera.viewH / 2);
  Camera.follow(this.snake[0]);
},

start() {
  this.hideOverlays();
  this.reset();
  this.running = true;
  this.loop(performance.now());
},

restart() {
  this.hideGameOver();
  this.reset();
  this.running = true;
},

stop(reason) {
  this.running = false;
  this.over = true;
  this.deathReason = reason;
  this.showGameOver();
  this.spawnDeathBurst();

  if (this.score > this.best) {
    this.best = this.score;
    this.saveBest();
  }
  this.syncHUD();
},

syncHUD() {
  ui.scoreValue.textContent = String(this.score);
  ui.bestValue.textContent = String(this.best);
},

showGameOver() {
  ui.deathReason.textContent = this.deathReason;
  ui.finalScore.textContent = String(this.score);
  ui.finalBest.textContent = String(this.best);
  ui.gameOverOverlay.hidden = false;
  ui.gameOverOverlay.classList.add('overlay-visible');
},

hideGameOver() {
  ui.gameOverOverlay.classList.remove('overlay-visible');
  ui.gameOverOverlay.hidden = true;
},

hideOverlays() {
  ui.startOverlay.classList.remove('overlay-visible');
  ui.startOverlay.hidden = true;
  this.hideGameOver();
},

spawnParticleBurst(px, py, color, count = 12, force = 3.2) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + randFloat(-0.25, 0.25);
    this.particles.push({
      x: px,
      y: py,
      vx: Math.cos(angle) * randFloat(0.8, force),
      vy: Math.sin(angle) * randFloat(0.8, force),
      life: 1,
      decay: randFloat(0.02, 0.05),
      size: randFloat(2, 4.5),
      color,
    });
  }
},

spawnDeathBurst() {
  this.snake.forEach((seg, idx) => {
    const px = seg.x * CELL + CELL / 2;
    const py = seg.y * CELL + CELL / 2;
    setTimeout(() => {
      this.spawnParticleBurst(px, py, idx === 0 ? '#ff2244' : '#00ff88', 8, 4.0);
    }, idx * 20);
  });
},

eatCoinAt(x, y) {
  const coinIndex = World.coins.findIndex(c => c.x === x && c.y === y);
  if (coinIndex === -1) return false;

  const coin = World.coins[coinIndex];
  World.coins.splice(coinIndex, 1);
  this.score += 1;
  this.syncHUD();
  this.spawnParticleBurst(x * CELL + CELL / 2, y * CELL + CELL / 2, '#ffd700', 14, 4.4);

  // Langsamere Geschwindigkeit, aber leicht ansteigend.
  const dynamic = CONFIG.tickIntervalMs - Math.floor(this.score / CONFIG.speedEveryPoints) * CONFIG.speedStepMs;
  this.currentTickMs = clamp(dynamic, CONFIG.tickIntervalMinMs, CONFIG.tickIntervalMs);

  // Nachspawnen, aber mit Luft: nicht sofort auf voller Dichte.
  setTimeout(() => {
    this.trySpawnCoinFarFromSnake();
  }, 5000);

  return true;
},

trySpawnCoinFarFromSnake() {
  for (let i = 0; i < 160; i++) {
    const x = randInt(WORLD.playMinX + 1, WORLD.playMaxX - 1);
    const y = randInt(WORLD.playMinY + 1, WORLD.playMaxY - 1);
    if (World.isBlocked(x, y)) continue;
    if (this.snake.some(s => dist2(s.x, s.y, x, y) < 64)) continue;
    if (World.coins.some(c => c.x === x && c.y === y)) continue;
    World.addCoin(x, y);
    return true;
  }
  return false;
},

step() {
  const head = this.snake[0];
  const dir = Input.consumeDirection();
  Input.currentDir = dir;

  const next = {
    x: head.x + dir.x,
    y: head.y + dir.y,
  };

  // Wand / Außenbereich
  if (!World.inBounds(next.x, next.y) || !World.inPlayableArea(next.x, next.y)) {
    this.stop('DU BIST GEGEN DIE AUSSENWAND GEFALLEN');
    return;
  }

  // Selbstkollision
  if (this.snake.some(seg => seg.x === next.x && seg.y === next.y)) {
    this.stop('DU HAST DEINEN EIGENEN SCHWANZ GETROFFEN');
    return;
  }

  // Stein-Kollision
  if (World.isBlocked(next.x, next.y)) {
    this.stop('DU BIST IN EINEN STEIN GELAUFEN');
    return;
  }

  this.snake.unshift(next);

  const ate = this.eatCoinAt(next.x, next.y);
  if (!ate) {
    this.snake.pop();
  }

  // Kamera folgt der Schlange immer weich.
  Camera.follow(this.snake[0]);

  // Kleine Dynamik für sehr lange Schlangen
  if (this.snake.length > 20) {
    this.currentTickMs = Math.max(CONFIG.tickIntervalMinMs, this.currentTickMs - 0.1);
  }
},

updateParticles() {
  for (let i = this.particles.length - 1; i >= 0; i--) {
    const p = this.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.93;
    p.vy *= 0.93;
    p.life -= p.decay;
    if (p.life <= 0) this.particles.splice(i, 1);
  }
},

loop(ts) {
  this.animationFrameId = requestAnimationFrame(this.loop.bind(this));

  const dt = this.lastTs ? (ts - this.lastTs) : 16;
  this.lastTs = ts;

  if (this.running) {
    this.stepAccumulator += dt;
    while (this.stepAccumulator >= this.currentTickMs) {
      this.step();
      if (!this.running) break;
      this.stepAccumulator -= this.currentTickMs;
    }
    this.updateParticles();
  }

  Renderer.draw(ts, this);
},

};

/* ===================================================== 8) RENDERER MODULE ===================================================== */ const Renderer = { draw(ts, game) { // Szene vorbereiten ctx.clearRect(0, 0, Camera.viewW, Camera.viewH); ctx.fillStyle = CONFIG.background; ctx.fillRect(0, 0, Camera.viewW, Camera.viewH);

Camera.apply();

  this.drawBackdrop();
  this.drawGrid();
  this.drawArenaBorders();
  this.drawStoneClusters(ts);
  this.drawCoins(ts);
  this.drawSnake(ts, game.snake);
  this.drawParticles(game.particles);
  this.drawFocusRing(game.snake[0]);

  Camera.restore();
},

drawBackdrop() {
  const g1 = ctx.createRadialGradient(
    WORLD.width * 0.35,
    WORLD.height * 0.28,
    40,
    WORLD.width * 0.5,
    WORLD.height * 0.5,
    Math.max(WORLD.width, WORLD.height) * 0.8
  );
  g1.addColorStop(0, 'rgba(0,255,136,0.05)');
  g1.addColorStop(0.4, 'rgba(0,240,255,0.02)');
  g1.addColorStop(1, 'rgba(2,8,16,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
},

drawGrid() {
  ctx.save();
  ctx.strokeStyle = CONFIG.gridColor;
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD.cols; x++) {
    const px = x * CELL + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, WORLD.height);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD.rows; y++) {
    const py = y * CELL + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(WORLD.width, py);
    ctx.stroke();
  }
  ctx.restore();
},

drawArenaBorders() {
  const b = CONFIG.borderThickness * CELL;
  const t = performance.now() / 1000;
  const pulse = 0.55 + Math.sin(t * 2.5) * 0.15;

  ctx.save();
  ctx.fillStyle = `rgba(255,34,68,${0.08 + pulse * 0.03})`;
  ctx.fillRect(0, 0, WORLD.width, b);
  ctx.fillRect(0, WORLD.height - b, WORLD.width, b);
  ctx.fillRect(0, 0, b, WORLD.height);
  ctx.fillRect(WORLD.width - b, 0, b, WORLD.height);

  ctx.strokeStyle = `rgba(255,34,68,${pulse})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ff2244';
  ctx.shadowBlur = 10;
  ctx.strokeRect(b, b, WORLD.width - b * 2, WORLD.height - b * 2);
  ctx.shadowBlur = 0;

  // Warnstreifen nur an den äußeren Kanten
  ctx.globalAlpha = 0.12;
  for (let x = 0; x < WORLD.cols; x += 2) {
    ctx.fillStyle = '#ff2244';
    ctx.fillRect(x * CELL, 0, CELL, CELL);
    ctx.fillRect(x * CELL, WORLD.height - CELL, CELL, CELL);
  }
  for (let y = 0; y < WORLD.rows; y += 2) {
    ctx.fillStyle = '#ff2244';
    ctx.fillRect(0, y * CELL, CELL, CELL);
    ctx.fillRect(WORLD.width - CELL, y * CELL, CELL, CELL);
  }
  ctx.restore();
},

drawStoneClusters(ts) {
  const time = ts / 1000;
  for (const stone of World.stones) {
    const x = stone.x * CELL;
    const y = stone.y * CELL;
    const wobble = Math.sin(time * 2.5 + stone.pulse) * 0.35;

    const grad = ctx.createRadialGradient(
      x + CELL * 0.32,
      y + CELL * 0.25,
      2,
      x + CELL / 2,
      y + CELL / 2,
      CELL * 0.7
    );
    grad.addColorStop(0, '#8b8b9b');
    grad.addColorStop(0.55, '#5a5a6a');
    grad.addColorStop(1, '#2f303a');

    ctx.save();
    ctx.translate(0, wobble);
    ctx.fillStyle = grad;
    roundRectPath(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 4);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 7);
    ctx.lineTo(x + 11, y + 11);
    ctx.moveTo(x + 12, y + 5);
    ctx.lineTo(x + 8, y + 10);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.ellipse(x + 8, y + 7, 4, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
},

drawCoins(ts) {
  const time = ts / 1000;
  for (const coin of World.coins) {
    const cx = coin.x * CELL + CELL / 2;
    const cy = coin.y * CELL + CELL / 2;
    const bob = Math.sin(time * 3 + coin.pulse) * 1.5;
    const scale = 0.92 + Math.sin(time * 2.2 + coin.pulse) * 0.06;
    const radius = (CELL / 2 - 4) * scale;

    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy + bob, 0, cx, cy + bob, radius * 2.8);
    glow.addColorStop(0, 'rgba(255,215,0,0.28)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, radius * 2.6, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(cx - radius * 0.35, cy + bob - radius * 0.35, 0, cx, cy + bob, radius);
    body.addColorStop(0, '#fff7b0');
    body.addColorStop(0.45, '#ffd700');
    body.addColorStop(1, '#b8860b');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(100,60,0,0.65)';
    ctx.font = `bold ${Math.floor(CELL * 0.45)}px Share Tech Mono`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', cx, cy + bob + 0.5);
    ctx.restore();
  }
},

drawSnake(ts, snake) {
  const time = ts / 1000;
  for (let i = snake.length - 1; i >= 0; i--) {
    const seg = snake[i];
    const x = seg.x * CELL;
    const y = seg.y * CELL;
    const head = i === 0;
    const progress = i / Math.max(1, snake.length - 1);

    const hue = head ? 154 : 142 + progress * 18;
    const light = head ? 54 : 56 - progress * 14;

    ctx.save();
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = head ? 16 : 7;

    const g = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
    g.addColorStop(0, `hsl(${hue}, 100%, ${Math.min(70, light + 8)}%)`);
    g.addColorStop(1, `hsl(${hue + 10}, 90%, ${Math.max(26, light - 12)}%)`);
    ctx.fillStyle = g;
    roundRectPath(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, head ? 7 : 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (head) {
      const dir = Input.currentDir;
      const eyeOffsetX = dir.x === 1 ? 0.62 : dir.x === -1 ? 0.28 : 0.25;
      const eyeOffsetY1 = dir.y === 1 ? 0.65 : 0.25;
      const eyeOffsetY2 = dir.y === -1 ? 0.35 : 0.65;
      const eyeX = x + CELL * eyeOffsetX;
      const eye1Y = y + CELL * eyeOffsetY1;
      const eye2Y = y + CELL * eyeOffsetY2;

      ctx.fillStyle = '#00170a';
      ctx.beginPath(); ctx.arc(eyeX, eye1Y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX, eye2Y, 3, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(eyeX + 1, eye1Y - 1, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX + 1, eye2Y - 1, 1, 0, Math.PI * 2); ctx.fill();

      if (Math.sin(time * 9) > 0) {
        ctx.strokeStyle = '#ff5577';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const sx = x + CELL / 2;
        const sy = y + CELL / 2;
        let ex = sx;
        let ey = sy;
        if (dir.x === 1) ex += CELL * 0.6;
        else if (dir.x === -1) ex -= CELL * 0.6;
        else if (dir.y === 1) ey += CELL * 0.6;
        else ey -= CELL * 0.6;
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    } else if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(x + CELL / 2, y + CELL / 2, CELL * 0.22, CELL * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
},

drawParticles(particles) {
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
},

drawFocusRing(head) {
  if (!head) return;
  const x = head.x * CELL + CELL / 2;
  const y = head.y * CELL + CELL / 2;
  const t = performance.now() / 1000;
  const pulse = 0.5 + Math.sin(t * 4) * 0.12;

  ctx.save();
  ctx.strokeStyle = `rgba(0,255,136,${pulse})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, CELL * 1.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
},

                                                                                                                                                       
                                                                                                                                                       
};

        /* =====================================================
   9) EVENTS / BOOT
===================================================== */

function resizeAll() {
  Camera.resize();
  if (Game.snake.length) {
    Camera.follow(Game.snake[0]);
  }
}

function boot() {
  Game.loadBest();
  resizeAll();
  World.generate();
  Game.reset();

  // Start-Overlay bleibt sichtbar, Spiel-Loop läuft schon im Hintergrund
  ui.startOverlay.hidden = false;
  ui.startOverlay.classList.add('overlay-visible');

  // Ein erstes Bild rendern
  Renderer.draw(performance.now(), Game);

  // Loop genau EINMAL starten
  if (!Game._loopStarted) {
    Game._loopStarted = true;
    requestAnimationFrame(ts => Game.loop(ts));
  }

  Input.bind();

  ui.startButton.addEventListener('click', () => {
    ui.startOverlay.hidden = true;
    ui.startOverlay.classList.remove('overlay-visible');
    Game.running = true;
    Game.over = false;
    Game.stepAccumulator = 0;
  });

  ui.restartButton.addEventListener('click', () => {
    ui.gameOverOverlay.hidden = true;
    ui.gameOverOverlay.classList.remove('overlay-visible');
    Game.reset();
    Game.running = true;
  });
}

window.addEventListener('resize', resizeAll);
window.addEventListener('orientationchange', resizeAll);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
  }
