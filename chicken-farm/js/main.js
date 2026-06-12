// js/main.js
import { Game } from "./core/Game.js";

class App {
  constructor() {
    this.game = null;
    this.isGameStarted = false;
    this.isLoading = true;

    this.elements = {};
    this.loadingProgress = 0;
    this.loadingTimer = null;
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.checkDesktopMode();
    this.runLoadingSequence();
  }

  cacheElements() {
    this.elements.desktopWarning = document.getElementById("desktop-warning");
    this.elements.gameApp = document.getElementById("game-app");
    this.elements.loadingScreen = document.getElementById("loading-screen");
    this.elements.loadingBarFill = document.getElementById("loading-bar-fill");
    this.elements.loadingText = document.getElementById("loading-text");

    this.elements.mainMenu = document.getElementById("main-menu");
    this.elements.gameScreen = document.getElementById("game-screen");
    this.elements.gameCanvas = document.getElementById("game-canvas");

    this.elements.btnNewGame = document.getElementById("btn-new-game");
    this.elements.btnContinue = document.getElementById("btn-continue");
    this.elements.btnSettings = document.getElementById("btn-settings");
    this.elements.btnCredits = document.getElementById("btn-credits");

    this.elements.btnResume = document.getElementById("btn-resume");
    this.elements.btnSave = document.getElementById("btn-save");
    this.elements.btnLoad = document.getElementById("btn-load");
    this.elements.btnExit = document.getElementById("btn-exit");

    this.elements.moneyValue = document.getElementById("money-value");
    this.elements.dayValue = document.getElementById("day-value");
    this.elements.timeValue = document.getElementById("time-value");
    this.elements.chickenCount = document.getElementById("chicken-count");

    this.elements.notificationArea = document.getElementById("notification-area");
    this.elements.buildMenu = document.getElementById("build-menu");
    this.elements.infoPanel = document.getElementById("info-panel");
  }

  bindEvents() {
    window.addEventListener("resize", () => this.checkDesktopMode());

    this.elements.btnNewGame?.addEventListener("click", () => this.startNewGame());
    this.elements.btnContinue?.addEventListener("click", () => this.continueGame());
    this.elements.btnSettings?.addEventListener("click", () => this.openSettings());
    this.elements.btnCredits?.addEventListener("click", () => this.openCredits());

    this.elements.btnResume?.addEventListener("click", () => this.resumeGame());
    this.elements.btnSave?.addEventListener("click", () => this.saveGame());
    this.elements.btnLoad?.addEventListener("click", () => this.loadGame());
    this.elements.btnExit?.addEventListener("click", () => this.exitToMenu());

    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
  }

  checkDesktopMode() {
    const isSmallScreen = window.innerWidth < 900;

    if (isSmallScreen) {
      this.elements.desktopWarning.style.display = "flex";
      this.elements.gameApp.style.display = "none";
    } else {
      this.elements.desktopWarning.style.display = "none";
      this.elements.gameApp.style.display = "block";
    }
  }

  runLoadingSequence() {
    const messages = [
      "Initializing farm engine...",
      "Loading 3D systems...",
      "Preparing farm terrain...",
      "Checking animal systems...",
      "Loading UI panels...",
      "Ready to start."
    ];

    let index = 0;
    this.loadingTimer = setInterval(() => {
      this.loadingProgress += 18;
      if (this.loadingProgress > 100) this.loadingProgress = 100;

      this.elements.loadingBarFill.style.width = `${this.loadingProgress}%`;
      this.elements.loadingText.textContent = messages[index] || "Ready.";

      index += 1;

      if (this.loadingProgress >= 100) {
        clearInterval(this.loadingTimer);
        setTimeout(() => this.finishLoading(), 500);
      }
    }, 320);
  }

  finishLoading() {
    this.isLoading = false;
    this.elements.loadingScreen.classList.add("hidden");
    this.elements.mainMenu.classList.remove("hidden");
  }

  startNewGame() {
    this.showScreen("game");
    this.isGameStarted = true;

    if (!this.game) {
      this.game = new Game({
        canvas: this.elements.gameCanvas,
        hud: {
          moneyValue: this.elements.moneyValue,
          dayValue: this.elements.dayValue,
          timeValue: this.elements.timeValue,
          chickenCount: this.elements.chickenCount,
          notificationArea: this.elements.notificationArea,
          buildMenu: this.elements.buildMenu,
          infoPanel: this.elements.infoPanel
        }
      });
    }

    if (typeof this.game.start === "function") {
      this.game.start();
    }

    this.notify("New farm created. Good luck!", "success");
  }

  continueGame() {
    const saved = localStorage.getItem("chickenFarm3D_save");

    if (!saved) {
      this.notify("No save found yet.", "warning");
      return;
    }

    this.showScreen("game");
    this.isGameStarted = true;

    if (!this.game) {
      this.game = new Game({
        canvas: this.elements.gameCanvas,
        hud: {
          moneyValue: this.elements.moneyValue,
          dayValue: this.elements.dayValue,
          timeValue: this.elements.timeValue,
          chickenCount: this.elements.chickenCount,
          notificationArea: this.elements.notificationArea,
          buildMenu: this.elements.buildMenu,
          infoPanel: this.elements.infoPanel
        }
      });
    }

    if (typeof this.game.loadFromSave === "function") {
      this.game.loadFromSave(saved);
    }

    if (typeof this.game.start === "function") {
      this.game.start();
    }

    this.notify("Save loaded.", "success");
  }

  openSettings() {
    this.notify("Settings menu will be added soon.", "warning");
  }

  openCredits() {
    this.notify("Chicken Farm 3D prototype by you.", "success");
  }

  resumeGame() {
    this.elements.pauseMenu?.classList.add("hidden");
    if (this.game && typeof this.game.setPaused === "function") {
      this.game.setPaused(false);
    }
    this.notify("Game resumed.", "success");
  }

  saveGame() {
    if (!this.game || typeof this.game.getSaveData !== "function") {
      this.notify("Nothing to save yet.", "warning");
      return;
    }

    const data = this.game.getSaveData();
    localStorage.setItem("chickenFarm3D_save", data);
    this.notify("Game saved.", "success");
  }

  loadGame() {
    const saved = localStorage.getItem("chickenFarm3D_save");

    if (!saved) {
      this.notify("No save found.", "danger");
      return;
    }

    if (!this.game) {
      this.game = new Game({
        canvas: this.elements.gameCanvas,
        hud: {
          moneyValue: this.elements.moneyValue,
          dayValue: this.elements.dayValue,
          timeValue: this.elements.timeValue,
          chickenCount: this.elements.chickenCount,
          notificationArea: this.elements.notificationArea,
          buildMenu: this.elements.buildMenu,
          infoPanel: this.elements.infoPanel
        }
      });
    }

    if (typeof this.game.loadFromSave === "function") {
      this.game.loadFromSave(saved);
      this.notify("Game loaded.", "success");
    } else {
      this.notify("Load system not ready yet.", "warning");
    }
  }

  exitToMenu() {
    if (this.game && typeof this.game.stop === "function") {
      this.game.stop();
    }

    this.showScreen("menu");
    this.isGameStarted = false;
    this.notify("Returned to main menu.", "success");
  }

  showScreen(screenName) {
    if (screenName === "game") {
      this.elements.mainMenu.classList.add("hidden");
      this.elements.gameScreen.classList.remove("hidden");
    } else {
      this.elements.gameScreen.classList.add("hidden");
      this.elements.mainMenu.classList.remove("hidden");
      this.elements.pauseMenu?.classList.add("hidden");
    }
  }

  notify(message, type = "success") {
    if (!this.elements.notificationArea) return;

    const note = document.createElement("div");
    note.className = `notification notification--${type} animate-slide-up`;
    note.textContent = message;

    this.elements.notificationArea.appendChild(note);

    setTimeout(() => {
      note.classList.add("is-dismissing");
      setTimeout(() => note.remove(), 250);
    }, 2500);
  }

  handleKeyDown(event) {
    if (event.key === "Escape" && this.isGameStarted) {
      const pauseMenu = document.getElementById("pause-menu");
      if (!pauseMenu) return;

      const isHidden = pauseMenu.classList.contains("hidden");
      pauseMenu.classList.toggle("hidden", !isHidden);

      if (this.game && typeof this.game.setPaused === "function") {
        this.game.setPaused(isHidden);
      }
    }

    if (event.key === "F5") {
      event.preventDefault();
      this.saveGame();
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
});
