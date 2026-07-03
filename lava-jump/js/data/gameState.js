/* =========================================================
FILE 12: js/data/gameState.js

This file defines the game's default runtime state.

Purpose:

- Provide a clean starting state for the whole game
- Keep runtime variables in one predictable place
- Make restarts and level resets easier
- Avoid scattering state values across many modules

Important:
This file is data-focused. It does not run the game.
It only describes what the game state should look like
when the app starts or resets.
========================================================= */

/*
Factory function used instead of a single shared object.

Why a function?

- Each new game session gets a fresh copy

- We avoid accidental shared references

- Resetting the game is easier and safer
  /
  function createDefaultGameState() {
  return {
  / -----------------------------------------------------
  APP FLOW
  ----------------------------------------------------- */
  appState: "boot",
  isInitialized: false,
  isRunning: false,
  isPaused: false,
  isLoading: false,
  isGameOver: false,
  isWin: false,
  
  /* -----------------------------------------------------
  LEVEL PROGRESSION
  ----------------------------------------------------- */
  currentLevelId: null,
  currentLevelIndex: 0,
  levelName: "",
  levelLoaded: false,
  levelCompleted: false,
  checkpointId: null,
  respawnPoint: {
  x: 0,
  y: 0,
  z: 0
  },
  
  /* -----------------------------------------------------
  PLAYER
  ----------------------------------------------------- */
  player: {
  id: "player",
  name: "Player",
  state: "idle",
  alive: true,
  health: 100,
  lives: 3,
  score: 0,
  coins: 0,
  jumpsUsed: 0,
  maxJumps: 1,
  onGround: false,
  inLava: false,
  isInvulnerable: false,
  invulnerableUntil: 0,
  position: {
  x: 0,
  y: 0,
  z: 0
  },
  rotation: {
  x: 0,
  y: 0,
  z: 0
  },
  velocity: {
  x: 0,
  y: 0,
  z: 0
  }
  },
  
  /* -----------------------------------------------------
  CAMERA
  ----------------------------------------------------- */
  camera: {
  mode: "follow",
  position: {
  x: 0,
  y: 0,
  z: 0
  },
  target: {
  x: 0,
  y: 0,
  z: 0
  },
  shake: {
  active: false,
  intensity: 0,
  duration: 0
  }
  },
  
  /* -----------------------------------------------------
  WORLD / PHYSICS
  ----------------------------------------------------- */
  world: {
  time: 0,
  elapsedMs: 0,
  deltaTime: 0,
  gravity: -22,
  lavaHeight: -6,
  bounds: {
  minX: -1000,
  maxX: 1000,
  minY: -100,
  maxY: 100,
  minZ: -1000,
  maxZ: 1000
  }
  },
  
  /* -----------------------------------------------------
  SCORE / OBJECTIVES
  ----------------------------------------------------- */
  score: 0,
  coinsCollected: 0,
  timeRemaining: 0,
  objectiveText: "Reach the end without falling into the lava.",
  highScore: 0,
  
  /* -----------------------------------------------------
  INPUT SNAPSHOT
  ----------------------------------------------------- */
  input: {
  activeActions: {},
  lastAction: null,
  lastActionTime: 0
  },
  
  /* -----------------------------------------------------
  UI STATE
  ----------------------------------------------------- */
  ui: {
  hudVisible: true,
  overlayVisible: "start",
  debugVisible: false,
  orientationWarningVisible: false,
  toastMessage: "",
  toastVisible: false
  },
  
  /* -----------------------------------------------------
  AUDIO STATE
  ----------------------------------------------------- */
  audio: {
  masterVolume: 0.85,
  musicVolume: 0.45,
  sfxVolume: 0.8,
  muted: false,
  musicEnabled: true,
  sfxEnabled: true
  },
  
  /* -----------------------------------------------------
  SYSTEM FLAGS
  ----------------------------------------------------- */
  flags: {
  needsSave: false,
  needsResize: false,
  needsCameraUpdate: false,
  needsHudUpdate: false,
  needsInputReset: false
  },
  
  /* -----------------------------------------------------
  DEBUG DATA
  ----------------------------------------------------- */
  debug: {
  enabled: false,
  showCollisionBoxes: false,
  showBounds: false,
  showPlatformIds: false,
  showLevelInfo: false,
  lastFps: 0,
  lastFrameMs: 0,
  lastError: null
  },
  
  /* -----------------------------------------------------
  RUNTIME COLLECTIONS
  ----------------------------------------------------- */
  entities: {
  player: null,
  platforms: [],
  obstacles: [],
  enemies: [],
  coins: [],
  checkpoints: [],
  effects: []
  },
  
  /* -----------------------------------------------------
  METADATA
  ----------------------------------------------------- */
  meta: {
  createdAt: Date.now(),
  updatedAt: Date.now(),
  version: "0.1.0",
  build: "dev"
  }
  };
  }

/*
A shared initial value is still exported for places where a
simple read-only reference is useful.
For actual gameplay sessions, prefer createDefaultGameState().
*/
const initialGameState = createDefaultGameState();

export default initialGameState;
export { createDefaultGameState, initialGameState };
