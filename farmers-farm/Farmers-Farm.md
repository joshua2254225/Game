# 🚜 Farmers Farm — Architecture & Development Plan

**Studios:** ArcadeOwl Games Studios × TechNODE-3 Studios
**Engine:** Vanilla HTML / CSS / JavaScript (no frameworks, no build step required)
**Target:** Desktop + Mobile (landscape-locked), GTA-style open small-town farming sim

---

## 1. Core Design Principles

Before the tree, here's the reasoning behind the architecture, since you asked for something that scales cleanly to 100+ files and stays easy to update:

1. **One responsibility per file.** A file should do one job (e.g. `RainEffect.js` only renders rain, it never touches player stats). This is what makes future updates safe — you can rewrite `RainEffect.js` completely without breaking anything else.
2. **No raw input in game logic.** Every gameplay system (player movement, vehicle driving, camera) listens to **abstract commands** (`MOVE_FORWARD`, `INTERACT`, `CAMERA_ROTATE`) — never to `keydown` or `touchstart` directly. This is the Input Translation Layer you asked for (full breakdown in section 3).
3. **Event-driven communication.** Modules don't call each other directly where avoidable. They talk through a central `EventBus.js` (publish/subscribe pattern). Example: `HarvestSystem.js` fires `crop:harvested`, and both `Wallet.js` and `HUDMoney.js` react independently. This means you can add a new system later (e.g. an achievements module) without editing existing files.
4. **Data/logic separation.** Crop stats, vehicle stats, shop prices, NPC schedules etc. live in `/src/data/*.json`. The code that *uses* that data is generic. Want a new crop? Add a JSON entry — no JS changes needed.
5. **Config-driven tuning.** Day length (2h15m/1h45m), starting money, weather probabilities — all constants live in `Config.js`, not scattered through logic files.

---

## 2. Full File & Folder Structure (100+ files)

```
farmers-farm/
│
├── index.html
├── README.md
│
├── assets/
│   ├── images/
│   │   ├── studios/
│   │   │   ├── arcadeowl-logo.png
│   │   │   └── technode3-logo.png
│   │   ├── player/
│   │   ├── vehicles/
│   │   ├── crops/
│   │   ├── animals/
│   │   ├── npcs/
│   │   ├── buildings/
│   │   ├── terrain/
│   │   ├── weather/
│   │   └── ui/
│   ├── audio/
│   │   ├── sfx/
│   │   ├── music/
│   │   └── ambient/
│   ├── fonts/
│   └── icons/
│
├── css/
│   ├── base/
│   │   ├── reset.css
│   │   ├── variables.css
│   │   └── typography.css
│   ├── layout/
│   │   ├── layout.css
│   │   ├── responsive.css
│   │   └── landscape-lock.css
│   ├── components/
│   │   ├── hud.css
│   │   ├── menus.css
│   │   ├── mobile-controls.css
│   │   ├── dialogue.css
│   │   ├── inventory.css
│   │   ├── shop.css
│   │   ├── clock-widget.css
│   │   ├── splash-screen.css
│   │   └── sleep-screen.css
│   ├── animations/
│   │   ├── transitions.css
│   │   ├── weather-animations.css
│   │   ├── ui-animations.css
│   │   └── camera-transitions.css
│   └── themes/
│       └── seasons.css
│
└── src/
    ├── main.js                          # Entry point, boot sequence
    │
    ├── core/
    │   ├── GameEngine.js                # Top-level orchestrator
    │   ├── GameLoop.js                  # requestAnimationFrame loop, fixed timestep
    │   ├── GameState.js                 # Central state object
    │   ├── EventBus.js                  # Pub/sub system
    │   ├── Config.js                    # Tunable constants (day length, start money...)
    │   ├── Constants.js                 # Enums, IDs
    │   ├── SceneManager.js              # Switches between splash/menu/game/sleep
    │   └── BootSequence.js              # Orchestrates studio intros → menu
    │
    ├── input/
    │   ├── InputManager.js              # Top-level input coordinator
    │   ├── InputTranslator.js           # Raw event → Command (THE core of section 3)
    │   ├── CommandQueue.js              # Buffers commands per frame
    │   ├── CommandTypes.js              # Enum of all game commands
    │   └── devices/
    │       ├── KeyboardDevice.js
    │       ├── MouseDevice.js
    │       ├── TouchDevice.js
    │       ├── VirtualJoystickDevice.js
    │       ├── VirtualButtonDevice.js
    │       └── DeviceDetector.js        # Detects desktop vs mobile at boot
    │
    ├── rendering/
    │   ├── Renderer.js                  # Draws the active scene to canvas
    │   ├── CanvasManager.js             # Handles resize, DPI scaling
    │   ├── RenderLayers.js              # Z-order: terrain < objects < weather < UI
    │   ├── Camera.js                    # Base camera class
    │   ├── CameraController.js          # Switches modes, handles rotate/zoom input
    │   └── cameraModes/
    │       ├── InVehicleCamera.js       # Perspective 1
    │       ├── ChaseCamera.js           # Perspective 2 (behind vehicle)
    │       └── TopDownCamera.js         # Perspective 3 (90° aerial)
    │
    ├── world/
    │   ├── World.js                     # Owns terrain, entities, buildings
    │   ├── Grid.js                      # Tile grid math
    │   ├── Tile.js                      # Single tile (soil/road/grass/water)
    │   ├── Chunk.js                     # Groups tiles for performance
    │   ├── TerrainGenerator.js          # Builds the map layout
    │   ├── CollisionMap.js              # Walkable/drivable lookup
    │   ├── time/
    │   │   ├── TimeManager.js           # Master clock (game-time ↔ real-time)
    │   │   ├── DayNightCycle.js         # Lighting based on time of day
    │   │   ├── SeasonManager.js         # Winter/Spring/Summer/Autumn state
    │   │   └── Calendar.js              # Tracks day count, season progression
    │   └── weather/
    │       ├── WeatherSystem.js         # State machine: picks/transitions weather
    │       ├── WeatherTypes.js          # Enum + data (rain/sun/storm/fog)
    │       ├── RainEffect.js
    │       ├── ThunderstormEffect.js
    │       ├── FogEffect.js
    │       ├── SunEffect.js
    │       └── WeatherAudioBridge.js    # Plays correct ambient sound per weather
    │
    ├── entities/
    │   ├── Entity.js                    # Base class (position, sprite, update)
    │   ├── EntityManager.js             # Spawns/tracks all entities
    │   ├── player/
    │   │   ├── Player.js
    │   │   ├── PlayerController.js      # Consumes commands → moves player
    │   │   ├── PlayerStats.js           # Energy, health, money ref
    │   │   ├── PlayerInventory.js
    │   │   └── PlayerAnimator.js        # Walk/run/interact animation states
    │   ├── vehicles/
    │   │   ├── Vehicle.js               # Base vehicle class
    │   │   ├── VehicleController.js     # Consumes commands → drives vehicle
    │   │   ├── VehiclePhysics.js        # Acceleration, turning, friction
    │   │   ├── Tractor.js
    │   │   ├── Harvester.js
    │   │   ├── PickupTruck.js
    │   │   └── VehicleEntryExit.js      # Handles get in/out logic + camera swap
    │   ├── animals/
    │   │   ├── Animal.js
    │   │   ├── AnimalAI.js              # Simple wander/graze behavior
    │   │   ├── Cow.js
    │   │   ├── Chicken.js
    │   │   ├── Sheep.js
    │   │   └── Fish.js
    │   └── npcs/
    │       ├── NPC.js
    │       ├── NPCSchedule.js           # Where NPC is per hour
    │       ├── NPCDialogue.js
    │       ├── ShopkeeperNPC.js
    │       ├── HairStylistNPC.js
    │       └── MarketVendorNPC.js
    │
    ├── farming/
    │   ├── Field.js                     # A plot the player owns
    │   ├── SoilManager.js               # Soil quality, moisture, fertility
    │   ├── IrrigationSystem.js
    │   ├── GrowthSystem.js              # Advances crop stages over time
    │   ├── HarvestSystem.js
    │   ├── PlantingSystem.js
    │   ├── FishingSystem.js
    │   └── crops/
    │       ├── Crop.js                  # Base crop class
    │       ├── Wheat.js
    │       ├── Corn.js
    │       ├── Potato.js
    │       ├── Carrot.js
    │       └── Pumpkin.js
    │
    ├── buildings/
    │   ├── Building.js
    │   ├── House.js
    │   ├── Barn.js
    │   ├── StoreBuilding.js
    │   ├── MarketBuilding.js
    │   ├── HairSalonBuilding.js
    │   ├── Bed.js
    │   └── SleepSystem.js               # Sleep screen + time skip logic
    │
    ├── economy/
    │   ├── Wallet.js                    # Player money, starting funds
    │   ├── Shop.js                      # Generic buy/sell logic
    │   ├── Market.js                    # Crop sell prices, fluctuation
    │   ├── PriceSystem.js               # Supply/demand-ish price curve
    │   └── TransactionManager.js        # Validates + executes purchases
    │
    ├── ui/
    │   ├── UIManager.js                 # Mounts/unmounts UI panels
    │   ├── screens/
    │   │   ├── SplashScreen.js          # Boot logo screen
    │   │   ├── StudioIntroArcadeOwl.js  # "ArcadeOwl Games Studios presents"
    │   │   ├── StudioIntroTechNODE3.js  # "TechNODE-3 Studios presents"
    │   │   ├── MainMenuScreen.js
    │   │   ├── LoadingScreen.js
    │   │   └── SleepScreen.js           # Black screen + "Sleeping..." message
    │   ├── hud/
    │   │   ├── HUDManager.js
    │   │   ├── HUDMoney.js
    │   │   ├── HUDClock.js              # Time/day/season display
    │   │   ├── HUDWeatherIcon.js
    │   │   ├── HUDMinimap.js
    │   │   ├── HUDEnergyBar.js
    │   │   └── HUDHotbar.js
    │   ├── menus/
    │   │   ├── PauseMenu.js
    │   │   ├── SettingsMenu.js
    │   │   ├── InventoryMenu.js
    │   │   ├── ShopMenu.js
    │   │   └── AlarmClockMenu.js        # Choose wake-up time before sleeping
    │   ├── mobileControls/
    │   │   ├── VirtualJoystickUI.js
    │   │   ├── VirtualButtonsUI.js
    │   │   ├── TouchCameraDragUI.js
    │   │   └── MobileLayoutAdapter.js
    │   └── notifications/
    │       ├── ToastNotification.js
    │       └── DialogueBox.js
    │
    ├── audio/
    │   ├── AudioManager.js
    │   ├── SFXPlayer.js
    │   ├── MusicPlayer.js
    │   └── AmbientSoundController.js
    │
    ├── save/
    │   ├── SaveManager.js
    │   └── LocalStorageAdapter.js
    │
    ├── utils/
    │   ├── MathUtils.js
    │   ├── CollisionUtils.js
    │   ├── EasingFunctions.js
    │   ├── RandomGenerator.js           # Seeded RNG for weather/spawns
    │   └── Logger.js
    │
    └── data/
        ├── crops.json
        ├── vehicles.json
        ├── npcs.json
        ├── shopItems.json
        ├── weatherPatterns.json
        └── seasonConfig.json
```

**File count:** ~120 files across code, styles, and data — organized so every new feature (a new crop, a new vehicle, a new weather type) means *adding* a file, not editing five existing ones.

---

## 3. The Input / Command Translation Layer

This is the piece that makes desktop and mobile behave identically under the hood. Here's the flow:

```
Raw Input Event                Translator                 Unified Command              Consumer
─────────────────         ─────────────────         ─────────────────────         ─────────────────
KeyboardDevice.js    ┐                                                        ┌──▶ PlayerController.js
MouseDevice.js        ├──▶  InputTranslator.js  ──▶  CommandQueue.js  ────────┤
TouchDevice.js         │                                                        ├──▶ VehicleController.js
VirtualJoystickDevice ┘                                                        └──▶ CameraController.js
```

**How it works, step by step:**

1. **Device layer (dumb listeners).** Each file in `/input/devices/` only knows how to read its own input type. `KeyboardDevice.js` listens for `keydown`/`keyup`. `TouchDevice.js` listens for `touchstart`/`touchmove`/`touchend`. Neither knows what a "command" is — they just report raw events to the translator.

2. **`InputTranslator.js` is the single source of truth.** It holds a mapping table like:
   ```js
   { key: "w", command: "MOVE_FORWARD" }
   { key: "ArrowUp", command: "MOVE_FORWARD" }
   { virtualButton: "joystick-up", command: "MOVE_FORWARD" }
   ```
   Whatever the physical input was, it resolves to the same `MOVE_FORWARD` command. Desktop's WASD and mobile's joystick both emit `MOVE_FORWARD` — the rest of the game never knows or cares which device was used.

3. **`CommandQueue.js` buffers commands for the current frame.** `GameLoop.js` drains this queue once per tick, so input handling never gets tangled with rendering timing.

4. **Consumers subscribe to commands, not devices.** `PlayerController.js` asks "is `MOVE_FORWARD` active?" — it has zero knowledge of keyboards or touchscreens. This means if you add gamepad support later, you only touch `/input/devices/`, nothing in gameplay code changes.

5. **Camera rotation/zoom is a command too.** Mouse-drag on desktop and touch-drag on mobile both translate to `CAMERA_ROTATE(deltaX)` and `CAMERA_ZOOM(deltaY)` commands, consumed identically by `CameraController.js`, whether you're on foot or in a vehicle (with the vehicle case additionally locking pitch so you can't see yourself from the 90° top-down mode).

6. **`DeviceDetector.js`** runs once at boot to decide which device listeners to activate (touch UI stays hidden on desktop, virtual joystick/buttons mount only on mobile) — but this is purely about *which listeners are active*, never about changing what commands mean.

This layer is genuinely the backbone of the whole project — once it's built (early in the roadmap below), everything else — player movement, vehicle driving, camera, menus — plugs into it the same way.

---

## 4. Development Roadmap (build order)

We'll build in this order so every phase is playable/testable before moving to the next, and each phase only depends on files already built.

**Phase 0 — Skeleton**
`index.html`, base CSS files, `main.js`, `GameEngine.js`, `GameLoop.js`, `EventBus.js`, `Config.js`, `Constants.js`

**Phase 1 — Input Layer** *(built early since everything depends on it)*
All of `/input/` — devices, translator, command queue, command types

**Phase 2 — Boot Flow & Studio Intros**
`SceneManager.js`, `BootSequence.js`, `SplashScreen.js`, `StudioIntroArcadeOwl.js`, `StudioIntroTechNODE3.js`, `MainMenuScreen.js`

**Phase 3 — Rendering & Camera**
`Renderer.js`, `CanvasManager.js`, `Camera.js`, `CameraController.js`, all 3 `cameraModes/` files

**Phase 4 — World Base**
`World.js`, `Grid.js`, `Tile.js`, `Chunk.js`, `TerrainGenerator.js`, `CollisionMap.js`

**Phase 5 — Time & Seasons**
`TimeManager.js`, `DayNightCycle.js`, `SeasonManager.js`, `Calendar.js`

**Phase 6 — Weather**
`WeatherSystem.js`, `WeatherTypes.js`, `RainEffect.js`, `ThunderstormEffect.js`, `FogEffect.js`, `SunEffect.js`

**Phase 7 — Player**
`Entity.js`, `EntityManager.js`, all `/entities/player/` files

**Phase 8 — Vehicles**
All `/entities/vehicles/` files, `VehicleEntryExit.js` (camera perspective switching lives here)

**Phase 9 — Farming Core**
`Field.js`, `SoilManager.js`, `GrowthSystem.js`, `PlantingSystem.js`, `HarvestSystem.js`, all `/crops/` files

**Phase 10 — Economy**
`Wallet.js`, `Shop.js`, `Market.js`, `PriceSystem.js`, `TransactionManager.js`

**Phase 11 — Buildings & Sleep**
All `/buildings/` files including `SleepSystem.js` and `AlarmClockMenu.js`

**Phase 12 — NPCs, Animals, Fishing**
All `/npcs/`, `/animals/`, `FishingSystem.js`

**Phase 13 — Full UI/HUD**
All `/ui/` files

**Phase 14 — Audio**
All `/audio/` files

**Phase 15 — Save System & Polish**
`/save/` files, animation passes, final CSS polish

---

## 5. Next Step

Confirm this structure and order works for you (or tell me what to adjust), and we'll start Phase 0 — one file per message, fully commented, ready to copy.
