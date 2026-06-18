// js/core/Camera.js`

//```javascript
/**
 * ============================================================================
 * CITY RACER — Camera.js
 * ============================================================================
 * Manages all camera behaviour for the game.
 *
 * Camera modes:
 *   'follow'   — Third-person chase camera behind the car, spring-damped.
 *   'hood'     — First-person bonnet/hood camera mounted on the car.
 *   'orbit'    — Free-orbit camera for exploring (pause / map view).
 *   'cinematic'— Scripted cinematic for race start, finish, and replay.
 *
 * Features:
 *   • Per-mode smooth interpolation via spring-damper
 *   • Speed-dependent FOV breathing (faster = wider FOV)
 *   • Look-ahead: camera leads slightly in the direction of travel
 *   • Camera shake (collisions, rumble strips, nitro activation)
 *   • Collision avoidance: pushes camera out of buildings/terrain
 *   • Smooth mode transitions (cross-fades between positions)
 *   • Cinematic scripting: orbit pan, low-angle drift, fly-over
 *   • Touch / mouse orbit input for 'orbit' mode
 *   • Rear-view mirror simulation (returns a secondary camera)
 * ============================================================================
 */

'use strict';

const Camera = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const MODES = Object.freeze({
    FOLLOW:    'follow',
    HOOD:      'hood',
    ORBIT:     'orbit',
    CINEMATIC: 'cinematic',
  });

  // Follow camera default offsets relative to car
  const FOLLOW_CFG = {
    offsetUp:       2.8,    // height above car pivot
    offsetBack:     7.5,    // distance behind car
    lookAheadDist:  4.0,    // how far ahead of car the camera looks at
    lookAheadSpeed: 0.06,   // how quickly look-ahead tracks direction
    posLerp:        0.10,   // position interpolation speed (per frame factor)
    lookLerp:       0.14,   // look-target interpolation speed
    minDist:        4.0,    // closest the camera can get to the car
    maxDist:        14.0,   // furthest it can pull back
    collisionMask:  true,   // whether to avoid geometry
  };

  // Hood camera offsets relative to car local space
  const HOOD_CFG = {
    offsetX:  0.0,    // centred
    offsetY:  0.82,   // above dashboard
    offsetZ:  0.55,   // forward of car pivot (toward front)
    pitchBias:-0.04,  // slight downward tilt (feels more natural)
  };

  // Speed-based FOV
  const FOV_CFG = {
    base:     60,     // degrees at standstill
    max:      78,     // degrees at top speed
    smoothing: 0.05,  // lerp factor per frame
  };

  // Camera shake parameters
  const SHAKE_CFG = {
    decayRate:   5.0,   // units per second — shake decays exponentially
    maxMagnitude: 0.6,  // world units
  };

  // Orbit mode
  const ORBIT_CFG = {
    minPolar:   0.12,   // radians above horizon (prevent going underground)
    maxPolar:   1.45,   // radians (prevent full top-down flip)
    minRadius:  6,
    maxRadius:  60,
    damping:    0.88,   // inertia factor (0 = instant, 1 = never stops)
    panSpeed:   0.004,  // radians per pixel of input
    zoomSpeed:  0.12,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  let _camera     = null;   // THREE.PerspectiveCamera  (main)
  let _mirrorCam  = null;   // THREE.PerspectiveCamera  (rear-view mirror)

  let _mode       = MODES.FOLLOW;
  let _prevMode   = MODES.FOLLOW;

  // Current and target positions / look-ats
  const _pos      = new THREE.Vector3();   // camera world position
  const _lookAt   = new THREE.Vector3();   // look-at target
  const _up       = new THREE.Vector3(0, 1, 0);

  // Smooth spring state
  const _velPos   = new THREE.Vector3();   // spring velocity for position
  const _velLook  = new THREE.Vector3();   // spring velocity for look-at

  // Look-ahead accumulated direction
  const _lookAheadTarget = new THREE.Vector3();

  // Current FOV (animated)
  let _currentFov = FOV_CFG.base;

  // Shake state
  const _shake = {
    magnitude:  0,
    offset:     new THREE.Vector3(),
    seed:       0,
  };

  // Orbit state
  const _orbit = {
    theta:   0,        // horizontal angle (radians)
    phi:     0.6,      // vertical angle (radians from top)
    radius:  12,
    target:  new THREE.Vector3(),
    dTheta:  0,        // current angular velocity (inertia)
    dPhi:    0,
    dRadius: 0,
    // Touch/mouse tracking
    _pointerDown: false,
    _lastX:       0,
    _lastY:       0,
  };

  // Transition state (blending between modes)
  const _transition = {
    active:    false,
    progress:  0,      // 0→1
    duration:  0.5,    // seconds
    fromPos:   new THREE.Vector3(),
    fromLook:  new THREE.Vector3(),
  };

  // Cinematic state
  const _cinematic = {
    script:    null,   // array of keyframe objects
    time:      0,
    onDone:    null,
  };

  // Target car reference (THREE.Object3D with .position, .rotation.y)
  let _target     = null;

  // Speed reference for FOV breathing (set by PlayerCar each frame)
  let _speedKmh   = 0;

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create and configure the main camera (and rear-view mirror camera).
   * Must be called once after Renderer.init().
   *
   * @param {number} [fov]    Starting FOV in degrees.
   * @returns {THREE.PerspectiveCamera}  The main camera.
   */
  function init(fov = FOV_CFG.base) {
    const aspect = window.innerWidth / window.innerHeight;

    // Main camera
    _camera = new THREE.PerspectiveCamera(fov, aspect, 0.15, 350);
    _camera.name = 'mainCamera';
    _currentFov  = fov;

    // Rear-view mirror camera (wide-angle, looks backward)
    _mirrorCam = new THREE.PerspectiveCamera(90, 4 / 1, 0.15, 120);
    _mirrorCam.name = 'mirrorCamera';

    // Register resize handler
    Renderer.onResize((w, h) => {
      _camera.aspect    = w / h;
      _camera.updateProjectionMatrix();
    });

    // Attach orbit input listeners
    _attachOrbitInput();

    console.info('[Camera] Initialised.');
    return _camera;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TARGET BINDING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Bind the camera to a target car object.
   * @param {THREE.Object3D} carObject  The car's root Three.js object.
   */
  function attachToTarget(carObject) {
    _target = carObject;

    // Snap camera to correct position immediately (no lerp on first frame)
    if (_target) {
      _snapToTarget();
    }
  }

  /**
   * Immediately move the camera to where it should be for the current target.
   * Avoids the "fly-in" on scene load.
   */
  function _snapToTarget() {
    if (!_target) return;

    const desired = _calcFollowPosition();
    _pos.copy(desired.pos);
    _lookAt.copy(desired.look);
    _lookAheadTarget.copy(_target.position);
    _camera.position.copy(_pos);
    _camera.lookAt(_lookAt);
    _velPos.set(0, 0, 0);
    _velLook.set(0, 0, 0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODE SWITCHING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Switch to a new camera mode with an optional smooth transition.
   *
   * @param {string}  newMode     One of the MODES constants.
   * @param {object}  [opts]
   * @param {number}  [opts.duration=0.5]  Transition blend time in seconds.
   * @param {boolean} [opts.instant=false] Skip the blend entirely.
   */
  function setMode(newMode, opts = {}) {
    if (newMode === _mode) return;
    if (!Object.values(MODES).includes(newMode)) {
      console.warn(`[Camera] Unknown mode: ${newMode}`);
      return;
    }

    _prevMode = _mode;
    _mode     = newMode;

    if (opts.instant) {
      _transition.active = false;
      if (_mode === MODES.ORBIT) {
        // Initialise orbit angles from current camera position relative to target
        _initOrbitFromCurrent();
      }
      _snapToTarget();
      return;
    }

    // Begin blend transition
    _transition.active   = true;
    _transition.progress = 0;
    _transition.duration = opts.duration ?? 0.5;
    _transition.fromPos.copy(_camera.position);
    _transition.fromLook.copy(_lookAt);

    if (_mode === MODES.ORBIT) _initOrbitFromCurrent();
    if (_mode === MODES.CINEMATIC && opts.script) {
      _cinematic.script = opts.script;
      _cinematic.time   = 0;
      _cinematic.onDone = opts.onDone || null;
    }
  }

  /** Cycle through: follow → hood → orbit → follow */
  function cycleMode() {
    const cycle = [MODES.FOLLOW, MODES.HOOD, MODES.ORBIT];
    const idx   = cycle.indexOf(_mode);
    setMode(cycle[(idx + 1) % cycle.length]);
  }

  /** Return the current mode string. */
  function getMode() { return _mode; }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update the camera for this frame.
   * Called by Game.js each tick, before rendering.
   *
   * @param {number} dt           Delta time in seconds.
   * @param {number} [speedKmh]   Current car speed in km/h.
   */
  function update(dt, speedKmh = 0) {
    if (!_camera) return;

    _speedKmh = speedKmh;

    // Update shake decay
    _updateShake(dt);

    // Update FOV
    _updateFOV(dt);

    // Mode-specific update
    switch (_mode) {
      case MODES.FOLLOW:    _updateFollow(dt);    break;
      case MODES.HOOD:      _updateHood(dt);      break;
      case MODES.ORBIT:     _updateOrbit(dt);     break;
      case MODES.CINEMATIC: _updateCinematic(dt); break;
    }

    // Apply shake offset on top of computed position
    _camera.position.add(_shake.offset);

    // Advance transition blend
    if (_transition.active) _updateTransition(dt);

    // Update rear-view mirror
    _updateMirror();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOLLOW MODE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Compute the desired follow-camera position and look-at.
   * Returns { pos, look } as THREE.Vector3 objects.
   */
  function _calcFollowPosition() {
    if (!_target) return { pos: _pos.clone(), look: _lookAt.clone() };

    const carPos = _target.position;
    const carYaw = _target.rotation.y;

    // World-space "behind" direction from car heading
    const sinY = Math.sin(carYaw);
    const cosY = Math.cos(carYaw);

    const desiredPos = new THREE.Vector3(
      carPos.x + sinY * FOLLOW_CFG.offsetBack,
      carPos.y + FOLLOW_CFG.offsetUp,
      carPos.z + cosY * FOLLOW_CFG.offsetBack
    );

    // Look-ahead: aim slightly in front of the car
    const aheadX = carPos.x - sinY * FOLLOW_CFG.lookAheadDist;
    const aheadZ = carPos.z - cosY * FOLLOW_CFG.lookAheadDist;
    const lookTarget = new THREE.Vector3(aheadX, carPos.y + 0.8, aheadZ);

    return { pos: desiredPos, look: lookTarget };
  }

  function _updateFollow(dt) {
    if (!_target) return;

    const { pos: desiredPos, look: desiredLook } = _calcFollowPosition();

    // Smooth look-ahead direction with its own lerp speed
    _lookAheadTarget.lerp(desiredLook, FOLLOW_CFG.lookAheadSpeed);

    // Spring-damp position toward desired
    _springPos(_pos, desiredPos, _velPos, 14, 4.5, dt);

    // Smooth look-at
    _pos.lerp(desiredPos, FOLLOW_CFG.posLerp);
    _lookAt.lerp(_lookAheadTarget, FOLLOW_CFG.lookLerp);

    // Collision avoidance — push camera out of solid geometry
    const safePt = _avoidCollision(_pos, _target.position, dt);

    _camera.position.copy(safePt);
    _camera.lookAt(_lookAt);
    _camera.up.copy(_up);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HOOD MODE
  // ══════════════════════════════════════════════════════════════════════════

  function _updateHood(dt) {
    if (!_target) return;

    // Position: mounted on the car's local space
    const localOffset = new THREE.Vector3(
      HOOD_CFG.offsetX,
      HOOD_CFG.offsetY,
      -HOOD_CFG.offsetZ    // negative Z = forward in Three.js local space
    );
    localOffset.applyEuler(_target.rotation);

    const camPos = _target.position.clone().add(localOffset);

    // Look-at: far ahead along the car's facing direction
    const carYaw   = _target.rotation.y;
    const lookDist = 30;
    const lookPt   = new THREE.Vector3(
      _target.position.x - Math.sin(carYaw) * lookDist,
      _target.position.y + HOOD_CFG.offsetY + HOOD_CFG.pitchBias * lookDist,
      _target.position.z - Math.cos(carYaw) * lookDist
    );

    // Very tight lerp — feel glued to the car
    _pos.lerp(camPos,   0.9);
    _lookAt.lerp(lookPt, 0.9);

    _camera.position.copy(_pos);
    _camera.lookAt(_lookAt);
    _camera.up.copy(_up);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ORBIT MODE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise orbit angles from the current camera position relative to target.
   */
  function _initOrbitFromCurrent() {
    if (!_target) return;
    const offset = _camera.position.clone().sub(_target.position);
    _orbit.radius = offset.length();
    _orbit.phi    = Math.acos(MathUtils.clamp(offset.y / _orbit.radius, -1, 1));
    _orbit.theta  = Math.atan2(offset.x, offset.z);
    _orbit.target.copy(_target.position);
  }

  function _updateOrbit(dt) {
    // Smoothly track the target if there is one
    if (_target) {
      _orbit.target.lerp(_target.position, 0.08);
    }

    // Apply inertia damping to angular velocities
    _orbit.dTheta  *= ORBIT_CFG.damping;
    _orbit.dPhi    *= ORBIT_CFG.damping;
    _orbit.dRadius *= ORBIT_CFG.damping;

    // Integrate velocities
    _orbit.theta  += _orbit.dTheta;
    _orbit.phi     = MathUtils.clamp(
      _orbit.phi + _orbit.dPhi,
      ORBIT_CFG.minPolar,
      ORBIT_CFG.maxPolar
    );
    _orbit.radius  = MathUtils.clamp(
      _orbit.radius + _orbit.dRadius,
      ORBIT_CFG.minRadius,
      ORBIT_CFG.maxRadius
    );

    // Compute Cartesian position from spherical coords
    const sinPhi = Math.sin(_orbit.phi);
    const cosPhi = Math.cos(_orbit.phi);
    const desiredPos = new THREE.Vector3(
      _orbit.target.x + _orbit.radius * sinPhi * Math.sin(_orbit.theta),
      _orbit.target.y + _orbit.radius * cosPhi,
      _orbit.target.z + _orbit.radius * sinPhi * Math.cos(_orbit.theta)
    );

    _pos.lerp(desiredPos, 0.12);
    _camera.position.copy(_pos);
    _camera.lookAt(_orbit.target);
    _camera.up.copy(_up);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CINEMATIC MODE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Keyframe schema:
   * {
   *   time:     number,           // seconds from script start
   *   pos:      [x, y, z],       // camera world position (or null = car-relative)
   *   lookAt:   [x, y, z],       // world look-at (or 'car' to track car)
   *   fov:      number,           // target FOV (optional)
   *   easing:   'linear'|'ease'  // interpolation style
   * }
   */
  function _updateCinematic(dt) {
    const script = _cinematic.script;
    if (!script || script.length < 2) {
      setMode(MODES.FOLLOW);
      return;
    }

    _cinematic.time += dt;

    const totalDuration = script[script.length - 1].time;
    const t             = _cinematic.time;

    if (t >= totalDuration) {
      if (_cinematic.onDone) _cinematic.onDone();
      setMode(MODES.FOLLOW);
      return;
    }

    // Find surrounding keyframes
    let kA = script[0], kB = script[1];
    for (let i = 1; i < script.length; i++) {
      if (script[i].time >= t) {
        kA = script[i - 1];
        kB = script[i];
        break;
      }
    }

    // Local t within this segment
    const segLen   = kB.time - kA.time;
    let   segT     = segLen > 0 ? (t - kA.time) / segLen : 1;

    if (kB.easing === 'ease') {
      segT = MathUtils.smoothstep(segT);
    }

    // Interpolate position
    const pA = _resolveKFPos(kA);
    const pB = _resolveKFPos(kB);
    const newPos = new THREE.Vector3().lerpVectors(pA, pB, segT);

    // Interpolate look-at
    const lA = _resolveKFLook(kA);
    const lB = _resolveKFLook(kB);
    const newLook = new THREE.Vector3().lerpVectors(lA, lB, segT);

    // Interpolate FOV
    if (kA.fov !== undefined && kB.fov !== undefined) {
      _camera.fov = MathUtils.lerp(kA.fov, kB.fov, segT);
      _camera.updateProjectionMatrix();
    }

    _camera.position.copy(newPos);
    _camera.lookAt(newLook);
  }

  function _resolveKFPos(kf) {
    if (!kf.pos) {
      return _target ? _target.position.clone().add(new THREE.Vector3(0, 3, 8)) : _pos.clone();
    }
    return new THREE.Vector3(kf.pos[0], kf.pos[1], kf.pos[2]);
  }

  function _resolveKFLook(kf) {
    if (kf.lookAt === 'car') {
      return _target ? _target.position.clone() : _lookAt.clone();
    }
    if (!kf.lookAt) return _lookAt.clone();
    return new THREE.Vector3(kf.lookAt[0], kf.lookAt[1], kf.lookAt[2]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODE TRANSITION BLEND
  // ══════════════════════════════════════════════════════════════════════════

  function _updateTransition(dt) {
    _transition.progress = MathUtils.clamp(
      _transition.progress + dt / _transition.duration,
      0, 1
    );

    const t = MathUtils.smoothstep(_transition.progress);

    // Blend from old position to new computed position
    const currentDesiredPos  = _camera.position.clone();
    const blendedPos  = new THREE.Vector3().lerpVectors(_transition.fromPos,  currentDesiredPos,  t);
    const blendedLook = new THREE.Vector3().lerpVectors(_transition.fromLook, _lookAt, t);

    _camera.position.copy(blendedPos);
    _camera.lookAt(blendedLook);

    if (_transition.progress >= 1) {
      _transition.active = false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOV BREATHING
  // ══════════════════════════════════════════════════════════════════════════

  function _updateFOV(dt) {
    if (!_camera) return;

    // Map speed to FOV
    const maxSpeed  = 280; // km/h reference
    const t         = MathUtils.clamp(_speedKmh / maxSpeed, 0, 1);
    const targetFov = MathUtils.lerp(FOV_CFG.base, FOV_CFG.max, t * t); // quadratic ramp

    _currentFov = MathUtils.lerp(_currentFov, targetFov, FOV_CFG.smoothing);

    if (Math.abs(_camera.fov - _currentFov) > 0.05) {
      _camera.fov = _currentFov;
      _camera.updateProjectionMatrix();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMERA SHAKE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Trigger a camera shake event.
   *
   * @param {number} magnitude   Intensity in world units (e.g. 0.3 for small bump).
   * @param {'collision'|'nitro'|'rumble'} [type='collision']
   */
  function shake(magnitude, type = 'collision') {
    const scaled = MathUtils.clamp(magnitude, 0, SHAKE_CFG.maxMagnitude);

    // Boost multiplier per type
    const mult = type === 'nitro'  ? 0.5 :
                 type === 'rumble' ? 0.3 : 1.0;

    _shake.magnitude = Math.max(_shake.magnitude, scaled * mult);
    _shake.seed      = Math.random() * 999;
  }

  function _updateShake(dt) {
    if (_shake.magnitude < 0.001) {
      _shake.offset.set(0, 0, 0);
      _shake.magnitude = 0;
      return;
    }

    // Decay
    _shake.magnitude *= Math.exp(-SHAKE_CFG.decayRate * dt);

    // Generate offset using hash-based pseudo-random
    const t = performance.now() * 0.01 + _shake.seed;
    _shake.offset.set(
      (MathUtils._valueNoise2(t,       0.5) * 2 - 1) * _shake.magnitude,
      (MathUtils._valueNoise2(t + 100, 0.5) * 2 - 1) * _shake.magnitude * 0.5,
      (MathUtils._valueNoise2(t + 200, 0.5) * 2 - 1) * _shake.magnitude * 0.3
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLLISION AVOIDANCE (follow mode)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Cast a ray from the car to the desired camera position.
   * If it intersects world geometry, pull the camera closer.
   *
   * @param {THREE.Vector3} desiredPos   Where the camera wants to be.
   * @param {THREE.Vector3} carPos       Car's world position.
   * @returns {THREE.Vector3}  Safe camera position.
   */
  function _avoidCollision(desiredPos, carPos, dt) {
    if (!FOLLOW_CFG.collisionMask) return desiredPos;

    // Simple terrain/ground avoidance: never go below a minimum height
    const minY = carPos.y + 0.5;
    if (desiredPos.y < minY) {
      return new THREE.Vector3(desiredPos.x, minY, desiredPos.z);
    }

    // Full raycasting against buildings is handled by Game.js which has the
    // collidable mesh list. Camera exposes a hook for it (see setCameraBlockers).
    if (_blockers && _blockers.length > 0) {
      const dir  = desiredPos.clone().sub(carPos).normalize();
      const dist = desiredPos.distanceTo(carPos);
      _ray.set(carPos, dir);
      const hits = _ray.intersectObjects(_blockers, false);
      if (hits.length > 0 && hits[0].distance < dist) {
        // Bring camera to just before the hit
        const safeT = MathUtils.clamp((hits[0].distance - 0.5) / dist, 0.2, 1);
        return carPos.clone().lerp(desiredPos, safeT);
      }
    }

    return desiredPos;
  }

  // Blockers list and raycaster — populated by Game.js
  let _blockers = [];
  const _ray    = new THREE.Raycaster();
  _ray.far      = FOLLOW_CFG.maxDist + 2;

  /**
   * Register mesh objects the camera should avoid clipping through.
   * Typically called by BuildingGenerator with all building meshes.
   * @param {THREE.Mesh[]} meshes
   */
  function setCameraBlockers(meshes) {
    _blockers = meshes || [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REAR-VIEW MIRROR
  // ══════════════════════════════════════════════════════════════════════════

  function _updateMirror() {
    if (!_mirrorCam || !_target) return;

    // Mount mirror camera on car's bonnet, looking backwards
    const carYaw = _target.rotation.y;
    const mirrorOffset = new THREE.Vector3(
      Math.sin(carYaw) * -0.8,
      0.78,
      Math.cos(carYaw) * -0.8
    );

    _mirrorCam.position.copy(_target.position).add(mirrorOffset);

    // Look behind
    const behindPt = new THREE.Vector3(
      _target.position.x + Math.sin(carYaw) * 20,
      _target.position.y + 0.5,
      _target.position.z + Math.cos(carYaw) * 20
    );
    _mirrorCam.lookAt(behindPt);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ORBIT INPUT  (touch / mouse)
  // ══════════════════════════════════════════════════════════════════════════

  function _attachOrbitInput() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    // Mouse
    canvas.addEventListener('mousedown',  _orbitPointerDown);
    canvas.addEventListener('mousemove',  _orbitPointerMove);
    canvas.addEventListener('mouseup',    _orbitPointerUp);
    canvas.addEventListener('wheel',      _orbitWheel,      { passive: true });

    // Touch
    canvas.addEventListener('touchstart', _orbitTouchStart, { passive: true });
    canvas.addEventListener('touchmove',  _orbitTouchMove,  { passive: true });
    canvas.addEventListener('touchend',   _orbitPointerUp,  { passive: true });
  }

  function _orbitPointerDown(e) {
    if (_mode !== MODES.ORBIT) return;
    _orbit._pointerDown = true;
    _orbit._lastX       = e.clientX;
    _orbit._lastY       = e.clientY;
  }

  function _orbitPointerMove(e) {
    if (_mode !== MODES.ORBIT || !_orbit._pointerDown) return;
    const dx = e.clientX - _orbit._lastX;
    const dy = e.clientY - _orbit._lastY;
    _orbit._lastX = e.clientX;
    _orbit._lastY = e.clientY;

    _orbit.dTheta -= dx * ORBIT_CFG.panSpeed;
    _orbit.dPhi   -= dy * ORBIT_CFG.panSpeed;
  }

  function _orbitPointerUp() {
    _orbit._pointerDown = false;
  }

  function _orbitWheel(e) {
    if (_mode !== MODES.ORBIT) return;
    _orbit.dRadius += e.deltaY * ORBIT_CFG.zoomSpeed * 0.05;
  }

  let _orbitTouchCache = [];
  let _orbitPrevPinchDist = 0;

  function _orbitTouchStart(e) {
    if (_mode !== MODES.ORBIT) return;
    _orbitTouchCache = Array.from(e.touches);
    if (e.touches.length === 1) {
      _orbit._lastX = e.touches[0].clientX;
      _orbit._lastY = e.touches[0].clientY;
    }
    if (e.touches.length === 2) {
      _orbitPrevPinchDist = _touchPinchDist(e.touches);
    }
  }

  function _orbitTouchMove(e) {
    if (_mode !== MODES.ORBIT) return;

    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - _orbit._lastX;
      const dy = e.touches[0].clientY - _orbit._lastY;
      _orbit._lastX = e.touches[0].clientX;
      _orbit._lastY = e.touches[0].clientY;
      _orbit.dTheta -= dx * ORBIT_CFG.panSpeed;
      _orbit.dPhi   -= dy * ORBIT_CFG.panSpeed;
    }

    if (e.touches.length === 2) {
      const dist    = _touchPinchDist(e.touches);
      const delta   = _orbitPrevPinchDist - dist;
      _orbit.dRadius += delta * ORBIT_CFG.zoomSpeed * 0.04;
      _orbitPrevPinchDist = dist;
    }
  }

  function _touchPinchDist(touches) {
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPRING HELPER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Apply a spring-damper to move `current` toward `target`.
   * Mutates `current` and `velocity` in place.
   *
   * @param {THREE.Vector3} current   Current value (mutated).
   * @param {THREE.Vector3} target    Desired value.
   * @param {THREE.Vector3} velocity  Current spring velocity (mutated).
   * @param {number}        stiffness Spring constant.
   * @param {number}        damping   Damping coefficient.
   * @param {number}        dt        Delta time.
   */
  function _springPos(current, target, velocity, stiffness, damping, dt) {
    const force = new THREE.Vector3()
      .subVectors(target, current)
      .multiplyScalar(stiffness)
      .addScaledVector(velocity, -damping);

    velocity.addScaledVector(force, dt);
    current.addScaledVector(velocity, dt);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CINEMATIC SCRIPT PRESETS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Pre-built cinematic script: race start dramatic low-angle pan.
   * Attach to car position by passing carPos.
   *
   * @param {THREE.Vector3} carPos
   * @returns {Array}  Keyframe array for setMode(CINEMATIC, { script })
   */
  function scriptRaceStart(carPos) {
    const { x, y, z } = carPos;
    return [
      { time: 0,   pos: [x + 12, y + 1.2, z + 5],  lookAt: [x, y + 0.8, z],   fov: 50, easing: 'ease' },
      { time: 1.2, pos: [x +  4, y + 0.9, z + 3],  lookAt: [x, y + 0.8, z],   fov: 55, easing: 'ease' },
      { time: 2.2, pos: [x +  0, y + 5,   z + 10], lookAt: [x, y + 0.5, z],   fov: 65, easing: 'ease' },
      { time: 3.0, pos: [x +  0, y + 3.5, z + 8],  lookAt: 'car', fov: 62, easing: 'linear' },
    ];
  }

  /**
   * Pre-built cinematic: race finish celebration orbit.
   * @param {THREE.Vector3} carPos
   * @returns {Array}
   */
  function scriptRaceFinish(carPos) {
    const { x, y, z } = carPos;
    const r  = 10;
    return [
      { time: 0,   pos: [x + r, y + 3,  z],      lookAt: 'car', fov: 58, easing: 'ease'   },
      { time: 1.5, pos: [x,     y + 4,  z + r],  lookAt: 'car', fov: 55, easing: 'ease'   },
      { time: 3.0, pos: [x - r, y + 3,  z],      lookAt: 'car', fov: 58, easing: 'linear' },
      { time: 4.5, pos: [x,     y + 8,  z - r],  lookAt: 'car', fov: 60, easing: 'ease'   },
    ];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREENSHOT HELPER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Trigger a screenshot of the current frame via Renderer.
   * @returns {string}  PNG data-URL.
   */
  function takeScreenshot() {
    return Renderer.screenshot(_camera);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ══════════════════════════════════════════════════════════════════════════

  function getCamera()        { return _camera;    }
  function getMirrorCamera()  { return _mirrorCam; }
  function getPosition()      { return _camera ? _camera.position.clone() : new THREE.Vector3(); }
  function getLookAt()        { return _lookAt.clone(); }

  /**
   * Return the camera's world-space forward direction projected onto the XZ plane.
   * Used by InputManager to compute car-relative movement directions.
   * @returns {THREE.Vector3}  Normalised XZ direction.
   */
  function getForwardXZ() {
    if (!_camera) return new THREE.Vector3(0, 0, -1);
    const dir = new THREE.Vector3();
    _camera.getWorldDirection(dir);
    dir.y = 0;
    return dir.normalize();
  }

  /**
   * Return the camera's world-space right direction projected onto XZ.
   * @returns {THREE.Vector3}
   */
  function getRightXZ() {
    const fwd = getForwardXZ();
    return new THREE.Vector3(fwd.z, 0, -fwd.x); // 90° CW rotation in XZ
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.removeEventListener('mousedown',  _orbitPointerDown);
      canvas.removeEventListener('mousemove',  _orbitPointerMove);
      canvas.removeEventListener('mouseup',    _orbitPointerUp);
      canvas.removeEventListener('wheel',      _orbitWheel);
      canvas.removeEventListener('touchstart', _orbitTouchStart);
      canvas.removeEventListener('touchmove',  _orbitTouchMove);
      canvas.removeEventListener('touchend',   _orbitPointerUp);
    }
    _camera    = null;
    _mirrorCam = null;
    _target    = null;
    console.info('[Camera] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({
    MODES,

    // Lifecycle
    init,
    dispose,

    // Binding
    attachToTarget,
    setCameraBlockers,

    // Per-frame
    update,

    // Mode management
    setMode,
    cycleMode,
    getMode,

    // Effects
    shake,

    // Speed reference
    setSpeed: (kmh) => { _speedKmh = kmh; },

    // Cinematic scripts
    scriptRaceStart,
    scriptRaceFinish,

    // Orbit input
    setOrbitTarget: (v3) => { _orbit.target.copy(v3); },

    // Accessors
    getCamera,
    getMirrorCamera,
    getPosition,
    getLookAt,
    getForwardXZ,
    getRightXZ,

    // Screenshot
    takeScreenshot,
  });

})();

if (typeof module !== 'undefined') module.exports = Camera;
/*```

---

**File 10 ✅ — `js/core/Camera.js` done.**

This is the complete camera system for the game. It covers all four modes in full: the spring-damped third-person follow camera with look-ahead that smoothly leads the direction of travel, the hood/first-person camera mounted on the car's bonnet with a tight lerp, the free-orbit camera with inertial damping, pinch-to-zoom on touch, and mouse wheel zoom, and the cinematic keyframe system with linear and smoothstep easing that drives race-start and race-finish scripted shots. On top of those modes it layers speed-dependent FOV breathing that widens as you accelerate, a hash-noise camera shake system with per-type intensity multipliers for collisions, nitro, and rumble strips, geometry collision avoidance that raycasts from the car toward the camera and pulls it back if a building is in the way, smooth cross-fade transitions when switching modes, a rear-view mirror secondary camera, and helper methods that expose the camera's XZ forward and right vectors for `InputManager` to use when computing car-relative movement.

**Say "File 11" for `js/core/InputManager.js`.** */
