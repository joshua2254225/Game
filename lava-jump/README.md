3D Lava Jump

A modular 3D lava jump game built with HTML, CSS, and JavaScript.

This project is designed to be:

- easy to extend
- easy to understand
- split into many small files
- usable on desktop and mobile in landscape mode

---

Project goals

- Build a fun 3D platform-style lava jump game
- Keep the code base modular and clean
- Separate input, UI, level data, and gameplay systems
- Support keyboard controls on desktop
- Support touch controls on mobile
- Make future updates easy by adding new files instead of rewriting old ones

---

Folder structure

lava-jump/
├─ index.html
├─ styles/
│  ├─ base.css
│  ├─ layout.css
│  ├─ hud.css
│  ├─ menus.css
│  └─ mobile.css
├─ assets/
│  ├─ textures/
│  ├─ models/
│  ├─ sounds/
│  └─ icons/
└─ js/
   ├─ main.js
   ├─ config/
   │  ├─ gameConfig.js
   │  ├─ controlsConfig.js
   │  └─ levelConfig.js
   ├─ core/
   │  ├─ game.js
   │  ├─ sceneManager.js
   │  ├─ renderer.js
   │  ├─ camera.js
   │  ├─ clock.js
   │  └─ resize.js
   ├─ input/
   │  ├─ inputManager.js
   │  ├─ desktopInput.js
   │  ├─ mobileInput.js
   │  ├─ touchControls.js
   │  └─ inputMap.js
   ├─ entities/
   │  ├─ player.js
   │  ├─ lava.js
   │  ├─ platform.js
   │  ├─ obstacle.js
   │  ├─ coin.js
   │  ├─ checkpoint.js
   │  └─ enemy.js
   ├─ systems/
   │  ├─ movementSystem.js
   │  ├─ collisionSystem.js
   │  ├─ jumpSystem.js
   │  ├─ lavaSystem.js
   │  ├─ scoreSystem.js
   │  ├─ healthSystem.js
   │  └─ respawnSystem.js
   ├─ levels/
   │  ├─ levelLoader.js
   │  ├─ levelBuilder.js
   │  ├─ level01.js
   │  ├─ level02.js
   │  ├─ level03.js
   │  └─ levelTemplate.js
   ├─ ui/
   │  ├─ hud.js
   │  ├─ menu.js
   │  ├─ pauseMenu.js
   │  ├─ gameOver.js
   │  ├─ winScreen.js
   │  └─ toast.js
   ├─ audio/
   │  ├─ audioManager.js
   │  ├─ soundLoader.js
   │  ├─ music.js
   │  └─ sfx.js
   ├─ utils/
   │  ├─ math.js
   │  ├─ time.js
   │  ├─ storage.js
   │  ├─ dom.js
   │  └─ debug.js
   └─ data/
      ├─ gameState.js
      ├─ constants.js
      └─ ...

---

Control design

The game uses a single action-based input model.

Example action mapping

KeyW -> MOVE_FORWARD
ArrowUp -> MOVE_FORWARD
touch-forward -> MOVE_FORWARD
Space -> JUMP
touch-jump -> JUMP

That means game logic only checks actions, not raw keys or touch events.

---

Mobile support

The game is designed for:

- phones
- tablets
- landscape mode

Mobile controls include:

- left
- right
- forward
- jump

If the device is in portrait mode, the game can show an orientation warning.

---

Recommended build order

1. HTML shell
2. base CSS and layout CSS
3. configuration files
4. input manager and input bindings
5. main bootstrap file
6. core systems
7. entities
8. level loader and level builder
9. HUD and UI screens
10. audio and polish

---

Notes for development

- Keep every file focused on one job.
- Use level data files for game content.
- Keep gameplay logic separate from UI logic.
- Add new levels by creating new files.
- Add new entities or mechanics by adding new modules instead of expanding one giant file.

---

Current file set

This project now includes:

- index shell
- base styling
- layout styling
- config files
- input files
- main bootstrap file
- utility files
- core files
- entities
- systems
- level files
- UI files
- this README

---

Next steps

The next useful files would be:

- "styles/hud.css"
- "styles/menus.css"
- "styles/mobile.css"
- "js/audio/audioManager.js"
- "js/audio/soundLoader.js"

After that, the game can be connected into a playable first version.
