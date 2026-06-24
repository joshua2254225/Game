/* ## `js/systems/RaceSystem.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — RaceSystem.js
 * ============================================================================
 * Manages all racing events from entry through results.
 *
 * Responsibilities:
 *   • Race entry validation (car requirement, entry fee, night-only gate)
 *   • Countdown sequence (3-2-1-GO) before race start
 *   • Checkpoint system: ordered gates the player must pass through
 *   • Lap tracking for multi-lap circuits
 *   • AI opponent spawning and management for each race
 *   • Live race position calculation (1st/2nd/3rd/…)
 *   • Race timer (count-up) and optional time limit (count-down)
 *   • Wrong-way detection (player heading away from next checkpoint)
 *   • Race finish: prize award via EconomySystem, results screen
 *   • Checkpoint marker billboards (animated flag poles)
 *   • Race start/finish line mesh
 *   • HUD race overlay control (timer, position, lap counter)
 *   • Minimap checkpoint dots
 * ============================================================================
 */

'use strict';

const RaceSystem = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  // Radius (world units) to trigger a checkpoint pass
  const CHECKPOINT_RADIUS = 12;

  // Wrong-way angle threshold (radians) — heading more than this from
  // the correct direction for more than WRONG_WAY_TIME triggers banner
  const WRONG_WAY_ANGLE  = 2.0;
  const WRONG_WAY_TIME   = 2.5;   // seconds

  // AI opponent behaviour constants
  const AI_SPEED_VARIANCE = 8;    // ± km/h variance from race's nominal speed
  const AI_CATCH_UP_MULT  = 1.12; // AI speeds up when far behind player
  const AI_RUBBER_BAND_DIST = 40; // units — rubber band activation distance

  // Checkpoint visual
  const CP_HEIGHT    = 6.0;
  const CP_FLAG_SIZE = 2.5;

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  /** Reference to the player vehicle. */
  let _player       = null;

  /** Current active race config (null when not racing). */
  let _raceCfg      = null;

  /** Race state machine. */
  let _state        = 'idle';  // idle | countdown | racing | finished

  /** Countdown value (3 → 2 → 1 → 0 = GO). */
  let _countdown    = 0;
  let _cdTimer      = 0;

  /** Race elapsed time (seconds). */
  let _raceTimer    = 0;

  /** Time-limit countdown (seconds). 0 = no limit. */
  let _timeLimit    = 0;

  /** Current lap (1-indexed). */
  let _currentLap   = 1;

  /** Index into the checkpoints array for the NEXT checkpoint. */
  let _nextCpIndex  = 0;

  /** How many times the player has passed through all checkpoints. */
  let _lapCpCount   = 0;

  /** AI racer data array. */
  const _aiRacers   = [];

  /** Checkpoint marker meshes. */
  const _cpMarkers  = [];

  /** Start/finish line mesh. */
  let _startLineMesh = null;

  /** Wrong-way tracking. */
  let _wrongWayTimer = 0;
  let _wrongWayShown = false;
  let _wrongWayEl    = null;

  /** Current race positions: { entity, lapProgress, position } */
  const _positions  = [];

  /** Frame counter. */
  let _frame        = 0;

  /** Camera cinematic played. */
  let _introPlayed  = false;

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Set the player reference. Call once after PlayerCar is created.
   * @param {PlayerCar} playerCar
   */
  function setPlayer(playerCar) {
    _player = playerCar;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE ENTRY
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Attempt to enter a race. Validates requirements and deducts entry fee.
   *
   * @param {string}   raceId       CONFIG.RACES entry id.
   * @param {object}   playerState  Live SaveSystem state.
   * @returns {{ success:boolean, message:string }}
   */
  function enterRace(raceId, playerState) {
    if (_state !== 'idle') {
      return { success: false, message: 'A race is already in progress.' };
    }

    const raceCfg = CONFIG.RACES.find(r => r.id === raceId);
    if (!raceCfg) {
      return { success: false, message: `Race "${raceId}" not found.` };
    }

    // ── Night-only gate ───────────────────────────────────────────────────
    if (raceCfg.nightOnly && !Sky.isNight()) {
      return {
        success: false,
        message: `${raceCfg.name} only runs at night. Come back after 20:00.`,
      };
    }

    // ── Car requirement ───────────────────────────────────────────────────
    if (raceCfg.requiredCar && playerState.activeCar !== raceCfg.requiredCar) {
      const reqName = CONFIG.CARS[raceCfg.requiredCar]?.name || raceCfg.requiredCar;
      return {
        success: false,
        message: `This race requires the ${reqName} or better.`,
      };
    }

    // ── Entry fee ─────────────────────────────────────────────────────────
    const feeResult = EconomySystem.payEntryFee(raceId);
    if (!feeResult.success) {
      return { success: false, message: feeResult.message };
    }

    // ── All checks passed — begin race ────────────────────────────────────
    _beginRace(raceCfg, playerState);
    return { success: true, message: `Entering ${raceCfg.name}…` };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE SETUP
  // ══════════════════════════════════════════════════════════════════════════

  function _beginRace(raceCfg, playerState) {
    _raceCfg      = raceCfg;
    _raceTimer    = 0;
    _currentLap   = 1;
    _nextCpIndex  = 0;
    _lapCpCount   = 0;
    _wrongWayTimer = 0;
    _wrongWayShown = false;
    _introPlayed  = false;
    _frame        = 0;

    _timeLimit    = raceCfg.timeLimit || 0;

    // Teleport player to race start
    if (_player) {
      const sp = raceCfg.startPos;
      _player.setPosition(
        sp.x,
        CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y,
        sp.z,
        sp.heading || 0
      );
      _player.velocity.set(0, 0, 0);
    }

    // Build checkpoint markers
    _buildCheckpointMarkers(raceCfg.checkpoints);

    // Build start/finish line
    _buildStartLine(raceCfg.startPos);

    // Spawn AI opponents
    _spawnAIOpponents(raceCfg, playerState);

    // Begin countdown
    _state     = 'countdown';
    _countdown = 3;
    _cdTimer   = 0;

    // Show race HUD
    _showRaceHUD();

    // Cinematic intro
    if (!_introPlayed) {
      _introPlayed = true;
      const introScript = Camera.scriptRaceStart(
        _player ? _player.position.clone() : new THREE.Vector3()
      );
      Camera.setMode('cinematic', { script: introScript, duration: 0.3,
        onDone: () => Camera.setMode('follow') });
    }

    console.info(`[RaceSystem] Race started: ${raceCfg.name} | Laps: ${raceCfg.laps} | AI: ${_aiRacers.length}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT MARKERS
  // ══════════════════════════════════════════════════════════════════════════

  function _buildCheckpointMarkers(checkpoints) {
    _clearCheckpointMarkers();

    const CHEQUERED  = [0xFFFFFF, 0x111111];
    const flagCanvas = document.createElement('canvas');
    flagCanvas.width  = 64;
    flagCanvas.height = 64;
    const ctx         = flagCanvas.getContext('2d');

    // Draw chequered flag texture
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? '#FFFFFF' : '#111111';
        ctx.fillRect(col * 8, row * 8, 8, 8);
      }
    }

    const flagTex = new THREE.CanvasTexture(flagCanvas);

    checkpoints.forEach((cp, idx) => {
      const grp  = new THREE.Group();
      grp.name   = `checkpoint_${idx}`;

      // Pole
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.6, roughness: 0.4 });
      const pole    = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.10, CP_HEIGHT, 8),
        poleMat
      );
      pole.position.y = CP_HEIGHT / 2;
      pole.castShadow = true;
      grp.add(pole);

      // Flag
      const flagMat = new THREE.MeshBasicMaterial({
        map:         flagTex,
        side:        THREE.DoubleSide,
        transparent: true,
        opacity:     idx === 0 ? 1.0 : 0.55,
      });
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(CP_FLAG_SIZE, CP_FLAG_SIZE * 0.6),
        flagMat
      );
      flag.position.set(CP_FLAG_SIZE / 2, CP_HEIGHT - CP_FLAG_SIZE * 0.3, 0);
      flag.name = 'flag';
      grp.add(flag);

      // Number label
      const numCanvas  = document.createElement('canvas');
      numCanvas.width  = numCanvas.height = 64;
      const nc         = numCanvas.getContext('2d');
      nc.fillStyle     = idx === 0 ? '#00FF88' : '#FFDD00';
      nc.beginPath();
      nc.arc(32, 32, 30, 0, Math.PI * 2);
      nc.fill();
      nc.fillStyle     = '#000000';
      nc.font          = 'bold 32px Orbitron, Arial';
      nc.textAlign     = 'center';
      nc.textBaseline  = 'middle';
      nc.fillText(String(idx + 1), 32, 33);

      const numTex = new THREE.CanvasTexture(numCanvas);
      const num    = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.2),
        new THREE.MeshBasicMaterial({
          map:         numTex,
          transparent: true,
          depthWrite:  false,
          side:        THREE.DoubleSide,
        })
      );
      num.position.set(0, CP_HEIGHT + 0.8, 0);
      num.name = 'numLabel';
      grp.add(num);

      // Ground ring
      const ringMat = new THREE.MeshBasicMaterial({
        color:       idx === 0 ? 0x00FF88 : 0xFFDD00,
        transparent: true,
        opacity:     0.55,
        side:        THREE.DoubleSide,
        depthWrite:  false,
      });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(CHECKPOINT_RADIUS * 0.5, CHECKPOINT_RADIUS * 0.6, 24),
        ringMat
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y  = 0.05;
      grp.add(ring);

      grp.position.set(
        cp.x,
        CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y,
        cp.z
      );
      grp.userData.cpIndex = idx;
      Renderer.add(grp);
      _cpMarkers.push(grp);
    });
  }

  function _clearCheckpointMarkers() {
    for (const m of _cpMarkers) {
      Renderer.disposeObject(m);
      Renderer.remove(m);
    }
    _cpMarkers.length = 0;
  }

  function _highlightNextCheckpoint(idx) {
    _cpMarkers.forEach((m, i) => {
      const ring = m.children.find(c => c.geometry?.type === 'RingGeometry');
      const flag = m.children.find(c => c.name === 'flag');
      if (ring) ring.material.opacity = i === idx ? 0.85 : 0.30;
      if (flag) flag.material.opacity = i === idx ? 1.00 : 0.40;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // START / FINISH LINE
  // ══════════════════════════════════════════════════════════════════════════

  function _buildStartLine(startPos) {
    if (_startLineMesh) {
      Renderer.disposeObject(_startLineMesh);
      Renderer.remove(_startLineMesh);
    }

    // Chequered stripe across the road
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 32;
    const ctx     = canvas.getContext('2d');
    const SQ      = 32;

    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = col % 2 === 0 ? '#FFFFFF' : '#111111';
      ctx.fillRect(col * SQ, 0, SQ, 32);
    }

    const tex  = new THREE.CanvasTexture(canvas);
    const mat  = new THREE.MeshBasicMaterial({
      map:         tex,
      transparent: true,
      opacity:     0.85,
      depthWrite:  false,
    });

    const geo  = new THREE.PlaneGeometry(CONFIG.ROADS.ROAD_WIDTH, 1.2);
    geo.rotateX(-Math.PI / 2);

    _startLineMesh = new THREE.Mesh(geo, mat);
    _startLineMesh.position.set(
      startPos.x,
      CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y + 0.02,
      startPos.z
    );
    _startLineMesh.rotation.y = startPos.heading || 0;
    _startLineMesh.matrixAutoUpdate = false;
    _startLineMesh.updateMatrix();
    Renderer.add(_startLineMesh);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AI OPPONENTS
  // ══════════════════════════════════════════════════════════════════════════

  function _spawnAIOpponents(raceCfg, playerState) {
    // Clear previous
    for (const ai of _aiRacers) ai.car?.dispose();
    _aiRacers.length = 0;

    const count      = raceCfg.opponents || 3;
    const checkpoints = raceCfg.checkpoints;

    // Build a path through all checkpoints using CityMap
    const cpRoute = CityMap.buildCheckpointRoute(checkpoints);

    for (let i = 0; i < count; i++) {
      // Stagger start positions behind the player
      const staggerZ  = -(i + 1) * (CONFIG.ROADS.ROAD_WIDTH + 0.5);
      const spawnX    = raceCfg.startPos.x + Math.cos(raceCfg.startPos.heading || 0) * staggerZ * 0.5;
      const spawnZ    = raceCfg.startPos.z + Math.sin(raceCfg.startPos.heading || 0) * staggerZ * 0.5;

      // Random AI speed based on race's implied difficulty
      const topSpeed  = CONFIG.CARS.sport_sedan.stats.topSpeed +
                        MathUtils.randFloat(-AI_SPEED_VARIANCE, AI_SPEED_VARIANCE);

      const aiCfg = {
        id:    `ai_racer_${i}`,
        name:  `Rival ${i + 1}`,
        stats: {
          topSpeed,
          acceleration: 4.5 + Math.random() * 1.5,
          handling:     0.78,
          braking:      0.80,
          grip:         0.72,
          weight:       1250,
          damageReduction: 0,
        },
        body:   CONFIG.CARS.sport_sedan.body,
        colors: {
          body:  MathUtils.randPick(CONFIG.TRAFFIC.CAR_COLORS),
          roof:  0x222222,
          wheel: 0x222222,
        },
      };

      // Use TrafficCar as a base — reuse its path-following logic
      const startNode = CityMap.nearestNode(spawnX, spawnZ);
      const goalNode  = checkpoints.length > 1
        ? CityMap.nearestNodeToCheckpoint(checkpoints[checkpoints.length - 1])
        : CityMap.randomNode();

      if (!startNode || !goalNode) continue;

      const car = new TrafficCar(aiCfg, startNode.id, goalNode.id);
      car.setPosition(spawnX, CONFIG.WORLD.GROUND_Y + CONFIG.ROADS.ROAD_Y, spawnZ,
                      raceCfg.startPos.heading || 0);

      _aiRacers.push({
        car,
        cpIndex:      0,
        lap:          1,
        lapProgress:  0,
        finished:     false,
        finishTime:   null,
        placement:    null,
        speedMult:    0.88 + Math.random() * 0.18,  // 88–106 % of top speed
        route:        cpRoute,
        routeIndex:   0,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {number} dt  Delta time seconds.
   */
  function update(dt) {
    if (_state === 'idle') return;
    _frame++;

    switch (_state) {
      case 'countdown': _updateCountdown(dt); break;
      case 'racing':    _updateRacing(dt);    break;
      case 'finished':  /* wait for UI */     break;
    }

    // Always animate checkpoint markers
    _animateCheckpoints(dt);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COUNTDOWN
  // ══════════════════════════════════════════════════════════════════════════

  function _updateCountdown(dt) {
    _cdTimer += dt;

    if (_cdTimer >= 1.0) {
      _cdTimer   = 0;
      _countdown -= 1;

      _showCountdownNumber(_countdown);

      if (_countdown <= 0) {
        _state = 'racing';
        _showCountdownGO();
        _highlightNextCheckpoint(0);
        return;
      }
    }
  }

  function _showCountdownNumber(n) {
    const el = document.getElementById('race-countdown');
    if (!el) return;
    el.textContent = n > 0 ? String(n) : 'GO!';
    el.className   = n > 0 ? 'show num' : 'show go';
    el.style.display = 'block';
    setTimeout(() => {
      if (el.textContent === String(n) || el.textContent === 'GO!') {
        // only hide if not overwritten
      }
    }, 900);
  }

  function _showCountdownGO() {
    const el = document.getElementById('race-countdown');
    if (!el) return;
    el.textContent   = 'GO!';
    el.className     = 'show go';
    el.style.display = 'block';
    setTimeout(() => {
      el.style.display = 'none';
      el.className     = '';
    }, 1200);

    Camera.shake(0.2, 'nitro');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACING UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  function _updateRacing(dt) {
    _raceTimer += dt;

    // ── Time limit ────────────────────────────────────────────────────────
    if (_timeLimit > 0) {
      _timeLimit -= dt;
      if (_timeLimit <= 0) {
        _finishRace('timeout');
        return;
      }
    }

    // ── Player checkpoint detection ───────────────────────────────────────
    if (_player && _raceCfg) {
      _checkPlayerCheckpoints();
    }

    // ── Wrong-way detection ───────────────────────────────────────────────
    _checkWrongWay(dt);

    // ── AI racer updates ──────────────────────────────────────────────────
    if (_frame % 2 === 0) {
      _updateAIRacers(dt * 2);
    }

    // ── Position calculation ──────────────────────────────────────────────
    if (_frame % 10 === 0) {
      _calculatePositions();
    }

    // ── Race HUD update ───────────────────────────────────────────────────
    _updateRaceHUD();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  function _checkPlayerCheckpoints() {
    const checkpoints = _raceCfg.checkpoints;
    if (_nextCpIndex >= checkpoints.length) return;

    const cp  = checkpoints[_nextCpIndex];
    const dx  = _player.position.x - cp.x;
    const dz  = _player.position.z - cp.z;
    const d2  = dx * dx + dz * dz;

    if (d2 > CHECKPOINT_RADIUS * CHECKPOINT_RADIUS) return;

    // Checkpoint passed!
    _nextCpIndex++;
    _lapCpCount++;

    // Flash effect
    _spawnCheckpointFlash();

    // Check lap completion
    if (_nextCpIndex >= checkpoints.length) {
      _currentLap++;

      if (_currentLap > _raceCfg.laps) {
        // Race complete!
        _finishRace('complete');
        return;
      }

      // New lap — wrap checkpoint index
      _nextCpIndex = 0;
      Notifications.toast('🏁', `Lap ${_currentLap - 1} complete!`, 'success', 2.0);
    }

    _highlightNextCheckpoint(_nextCpIndex);
  }

  function _spawnCheckpointFlash() {
    const el = document.createElement('div');
    el.className = 'checkpoint-flash';
    document.body.appendChild(el);

    const banner = document.createElement('div');
    banner.className   = 'race-checkpoint-banner';
    banner.textContent = _nextCpIndex === 0 ? 'LAP COMPLETE!' : 'CHECKPOINT!';
    document.body.appendChild(banner);

    setTimeout(() => {
      el.remove();
      banner.remove();
    }, 1200);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRONG-WAY DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  function _checkWrongWay(dt) {
    if (!_player || !_raceCfg) return;

    const checkpoints = _raceCfg.checkpoints;
    if (_nextCpIndex >= checkpoints.length) return;

    const cp = checkpoints[_nextCpIndex];

    // Direction from player toward next checkpoint
    const dx      = cp.x - _player.position.x;
    const dz      = cp.z - _player.position.z;
    const towardAngle = Math.atan2(dx, dz);

    // Angle between player heading and toward-checkpoint direction
    const angleDiff = Math.abs(MathUtils.angleDelta(_player.heading, towardAngle));

    if (angleDiff > WRONG_WAY_ANGLE && Math.abs(_player.speedKmh) > 20) {
      _wrongWayTimer += dt;
    } else {
      _wrongWayTimer = Math.max(0, _wrongWayTimer - dt * 2);
    }

    const shouldShow = _wrongWayTimer > WRONG_WAY_TIME;
    if (shouldShow !== _wrongWayShown) {
      _wrongWayShown = shouldShow;
      _toggleWrongWayBanner(shouldShow);
    }
  }

  function _toggleWrongWayBanner(show) {
    if (show && !_wrongWayEl) {
      _wrongWayEl = document.createElement('div');
      _wrongWayEl.className = 'wrong-way-banner';
      _wrongWayEl.textContent = 'WRONG WAY!';
      document.body.appendChild(_wrongWayEl);
    } else if (!show && _wrongWayEl) {
      _wrongWayEl.remove();
      _wrongWayEl = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AI RACER UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  function _updateAIRacers(dt) {
    for (const ai of _aiRacers) {
      if (ai.finished) continue;

      const car = ai.car;
      if (!car || !car.alive) continue;

      // ── AI checkpoint progress ────────────────────────────────────────
      const checkpoints = _raceCfg.checkpoints;
      if (ai.cpIndex < checkpoints.length) {
        const cp  = checkpoints[ai.cpIndex];
        const dx  = car.position.x - cp.x;
        const dz  = car.position.z - cp.z;

        if (dx * dx + dz * dz < (CHECKPOINT_RADIUS * 1.2) ** 2) {
          ai.cpIndex++;
          ai.lapProgress = ai.cpIndex / checkpoints.length;

          if (ai.cpIndex >= checkpoints.length) {
            ai.lap++;
            ai.cpIndex = 0;

            if (ai.lap > _raceCfg.laps) {
              ai.finished   = true;
              ai.finishTime = _raceTimer;
              continue;
            }
          }
        }
      }

      // ── Rubber-banding ────────────────────────────────────────────────
      let speedMult = ai.speedMult;
      if (_player) {
        const distToPlayer = car.position.distanceTo(_player.position);
        if (distToPlayer > AI_RUBBER_BAND_DIST) {
          speedMult *= AI_CATCH_UP_MULT;
        }
      }

      // Override TrafficCar's base speed for race context
      car._baseSpeedKmh = car.stats.topSpeed * speedMult;

      // Update the AI car physics
      car.update(dt, []);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POSITION CALCULATION
  // ══════════════════════════════════════════════════════════════════════════

  function _calculatePositions() {
    if (!_raceCfg) return;

    const TOTAL_CPS = _raceCfg.checkpoints.length;

    // Score = completed laps × checkpoints-per-lap + checkpoints-this-lap
    const playerScore = (_currentLap - 1) * TOTAL_CPS + _nextCpIndex;

    const racers = [{ label: 'player', score: playerScore }];

    for (const ai of _aiRacers) {
      if (ai.finished) {
        racers.push({ label: ai.car?.id || 'ai', score: 9999 });
      } else {
        const score = (ai.lap - 1) * TOTAL_CPS + ai.cpIndex;
        racers.push({ label: ai.car?.id || 'ai', score });
      }
    }

    // Sort descending
    racers.sort((a, b) => b.score - a.score);

    const playerPos = racers.findIndex(r => r.label === 'player') + 1;

    // Update HUD position badge
    const posEl     = document.getElementById('race-pos');
    const totalEl   = document.getElementById('race-pos-total');
    const badgeEl   = document.getElementById('race-pos-badge');

    if (posEl)   posEl.textContent    = String(playerPos);
    if (totalEl) totalEl.textContent  = `/${racers.length}`;
    if (badgeEl) {
      badgeEl.className = `race-position-badge ${playerPos === 1 ? 'p1' : ''}`;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT ANIMATION
  // ══════════════════════════════════════════════════════════════════════════

  function _animateCheckpoints(dt) {
    const t = performance.now() * 0.001;

    _cpMarkers.forEach((grp, idx) => {
      // Flag wave
      const flag = grp.children.find(c => c.name === 'flag');
      if (flag) {
        flag.rotation.y = Math.sin(t * 2.5 + idx * 0.8) * 0.35;
      }

      // Number label always faces camera
      const num    = grp.children.find(c => c.name === 'numLabel');
      const camera = Camera.getCamera();
      if (num && camera) num.quaternion.copy(camera.quaternion);

      // Ground ring pulse
      grp.children.forEach(child => {
        if (child.geometry?.type === 'RingGeometry') {
          child.rotation.z += dt * (idx === _nextCpIndex ? 1.5 : 0.4);
          if (idx === _nextCpIndex) {
            child.material.opacity = 0.5 + Math.sin(t * 4) * 0.3;
          }
        }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE FINISH
  // ══════════════════════════════════════════════════════════════════════════

  function _finishRace(reason) {
    _state = 'finished';

    // Calculate final player position
    const TOTAL_CPS   = _raceCfg.checkpoints.length;
    const playerScore = (_currentLap - 1) * TOTAL_CPS + _nextCpIndex;

    let playerPlacement = 1;
    for (const ai of _aiRacers) {
      if (!ai.finished) continue;
      const aiScore = _raceCfg.laps * TOTAL_CPS;
      if (aiScore > playerScore) playerPlacement++;
    }

    // DNF if timeout
    if (reason === 'timeout') playerPlacement = 0;

    // Award prize
    const prizeResult = EconomySystem.awardRacePrize(_raceCfg.id, playerPlacement);

    // Cinematic finish
    if (_player) {
      const finishScript = Camera.scriptRaceFinish(_player.position.clone());
      Camera.setMode('cinematic', {
        script:   finishScript,
        duration: 0.5,
        onDone:   () => Camera.setMode('follow'),
      });
    }

    // Show result screen
    _showResultScreen(playerPlacement, prizeResult);

    // Clean up
    _toggleWrongWayBanner(false);
    _hideRaceHUD();
    _clearCheckpointMarkers();

    if (_startLineMesh) {
      Renderer.disposeObject(_startLineMesh);
      Renderer.remove(_startLineMesh);
      _startLineMesh = null;
    }

    // Stop AI cars
    for (const ai of _aiRacers) {
      if (ai.car) ai.car.beginDespawn();
    }

    console.info(`[RaceSystem] Race finished. Placement: ${playerPlacement} | Time: ${_raceTimer.toFixed(2)}s`);
  }

  function _showResultScreen(placement, prizeResult) {
    const placeEl  = document.getElementById('results-place');
    const nameEl   = document.getElementById('results-race-name');
    const timeEl   = document.getElementById('results-time');
    const speedEl  = document.getElementById('results-top-speed');
    const damageEl = document.getElementById('results-damage');
    const prizeEl  = document.getElementById('results-prize');

    const placeLabels  = ['', '1ST', '2ND', '3RD'];
    const placeClasses = ['', 'place-1st', 'place-2nd', 'place-3rd'];

    if (placeEl) {
      placeEl.textContent = placement > 0 ? (placeLabels[placement] || `${placement}TH`) : 'DNF';
      placeEl.className   = `results-place-display ${placeClasses[placement] || 'place-dnf'}`;
    }
    if (nameEl)   nameEl.textContent  = _raceCfg.name;
    if (timeEl)   timeEl.textContent  = MathUtils.formatTime(_raceTimer, true);
    if (speedEl)  speedEl.textContent = `${Math.round(_player?._topSpeedSession || 0)} km/h`;
    if (damageEl) damageEl.textContent = `${Math.round(_player?.damage || 0)}%`;
    if (prizeEl)  prizeEl.textContent  = String(prizeResult.prize);

    // Show the screen
    window.dispatchEvent(new CustomEvent('cityracer:show_results', {
      detail: { placement, prizeResult, raceId: _raceCfg.id }
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RACE HUD
  // ══════════════════════════════════════════════════════════════════════════

  function _showRaceHUD() {
    const hud = document.getElementById('race-hud');
    if (hud) hud.classList.add('active');

    const lapCur   = document.getElementById('race-lap-cur');
    const lapTotal = document.getElementById('race-lap-total');
    if (lapCur)   lapCur.textContent   = '1';
    if (lapTotal) lapTotal.textContent = String(_raceCfg.laps);
  }

  function _hideRaceHUD() {
    const hud = document.getElementById('race-hud');
    if (hud) hud.classList.remove('active');
  }

  function _updateRaceHUD() {
    // Timer
    const timerEl = document.getElementById('race-timer');
    if (timerEl) {
      if (_timeLimit > 0) {
        timerEl.textContent = MathUtils.formatTime(_timeLimit, false);
        timerEl.className   = `race-timer ${_timeLimit < 30 ? 'danger' : _timeLimit < 60 ? 'warn' : ''}`;
      } else {
        timerEl.textContent = MathUtils.formatTime(_raceTimer, true);
        timerEl.className   = 'race-timer';
      }
    }

    // Lap counter
    const lapCur = document.getElementById('race-lap-cur');
    if (lapCur) lapCur.textContent = String(Math.min(_currentLap, _raceCfg.laps));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC ABORT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Abandon the current race (called from pause menu).
   */
  function abortRace() {
    if (_state === 'idle') return;
    _finishRace('timeout');
    _state = 'idle';
    _raceCfg = null;
    _aiRacers.length = 0;
    console.info('[RaceSystem] Race aborted.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MINIMAP FEED
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return checkpoint positions for the minimap.
   * @returns {Array<{ x, z, type, color }>}
   */
  function getMinimapMarkers() {
    if (_state === 'idle' || !_raceCfg) return [];

    return _raceCfg.checkpoints.map((cp, idx) => ({
      x:     cp.x,
      z:     cp.z,
      type:  'checkpoint',
      color: idx === _nextCpIndex ? '#FFDD00' : '#888888',
      size:  idx === _nextCpIndex ? 7 : 4,
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    if (_state !== 'idle') abortRace();

    _clearCheckpointMarkers();

    if (_startLineMesh) {
      Renderer.disposeObject(_startLineMesh);
      Renderer.remove(_startLineMesh);
      _startLineMesh = null;
    }

    for (const ai of _aiRacers) ai.car?.dispose();
    _aiRacers.length = 0;

    _toggleWrongWayBanner(false);
    _hideTaxiHUDIfNeeded();

    _player  = null;
    _raceCfg = null;
    _state   = 'idle';

    console.info('[RaceSystem] Disposed.');
  }

  function _hideTaxiHUDIfNeeded() {
    // No-op placeholder — race HUD is separate
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    dispose,

    // Per-frame
    update,

    // Player binding
    setPlayer,

    // Race entry
    enterRace,
    abortRace,

    // Minimap
    getMinimapMarkers,

    // State queries
    isRacing:      () => _state === 'racing' || _state === 'countdown',
    getCurrentLap: () => _currentLap,
    getRaceTime:   () => _raceTimer,
    getState:      () => _state,

  });

})();

if (typeof module !== 'undefined') module.exports = RaceSystem;
/* ```

---

**File 27 ✅ — `js/systems/RaceSystem.js` done.**

This is the complete race event manager. The entry validator checks night-only gates against `Sky.isNight()`, car requirements against the active car ID, and deducts the entry fee via `EconomySystem.payEntryFee` before touching any race state. The countdown uses a 1-second interval timer that updates the DOM element's text content and CSS class for each number, then fires a camera shake on GO. Checkpoint detection uses squared-distance comparisons each frame, advances the `_nextCpIndex`, wraps it back to zero on lap completion, and checks for race finish when laps exceed the configured count. Wrong-way detection computes the angle between the player's heading and the direction toward the next checkpoint — if that angle exceeds 2 radians for 2.5 seconds the banner appears, and it decays at 2× the accumulation rate so brief direction changes don't trigger it. AI opponents are `TrafficCar` instances with their `_baseSpeedKmh` overridden each frame, and a rubber-band multiplier of 1.12 kicks in when an AI is more than 40 units behind the player. Position calculation scores every racer by `(completedLaps × checkpointsPerLap) + checkpointsThisLap` and sorts descending, updating the race HUD position badge every 10 frames.

**Say "File 28" for `js/locations/Markers.js`.** */
