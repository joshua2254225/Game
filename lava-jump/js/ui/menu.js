/* =========================================================
FILE 45: js/ui/menu.js

This file manages the game's main menu UI.

Purpose:

- Show and hide menu screens
- Handle start, settings, and level selection actions
- Keep menu logic separate from gameplay
- Make it easy to add more menu screens later

This file controls UI only.
It does not start the actual game loop by itself.
========================================================= */

import { setText, show, hide, toggleClass } from "../utils/dom.js";

/**

* Menu

* ---

* A small controller for menu-related UI elements.

* 

* The menu can manage:

* - main screen

* - level select

* - settings

* - credits

* - pause menu later if needed

* 

* This keeps the interface logic centralized and easier to update.
  */
  class Menu {
  constructor(options = {}) {
  this.options = {
  debug: false,
  ...options
  };
  
  this.elements = {
  root: null,
  mainMenu: null,
  settingsMenu: null,
  levelSelectMenu: null,
  creditsMenu: null,
  backButton: null,
  title: null,
  subtitle: null,
  startButton: null,
  settingsButton: null,
  creditsButton: null,
  levelButtons: []
  };
  
  this.visible = false;
  this.activeScreen = "main";
  this.debug = Boolean(this.options.debug);
  
  this.callbacks = {
  onStart: null,
  onOpenSettings: null,
  onOpenCredits: null,
  onOpenLevelSelect: null,
  onBack: null,
  onLevelSelected: null
  };
  }

/* -------------------------------------------------------
BINDING
------------------------------------------------------- */

bind(elements = {}) {
this.elements = {
...this.elements,
...elements
};

this._wireButtons();

if (this.debug) {
  console.log("[Menu] bound elements");
}

}

setCallbacks(callbacks = {}) {
this.callbacks = {
...this.callbacks,
...callbacks
};
}

/* -------------------------------------------------------
VISIBILITY
------------------------------------------------------- */

show(screen = "main") {
this.visible = true;
this.activeScreen = screen;
this._updateVisibleScreen();
this._toggleRoot(true);
}

hide() {
this.visible = false;
this._toggleRoot(false);
}

toggle(force) {
const next = typeof force === "boolean" ? force : !this.visible;
next ? this.show(this.activeScreen) : this.hide();
return this.visible;
}

isVisible() {
return this.visible;
}

_toggleRoot(visible) {
if (this.elements.root) {
this.elements.root.hidden = !visible;
}
}

_updateVisibleScreen() {
const screens = {
main: this.elements.mainMenu,
settings: this.elements.settingsMenu,
levelSelect: this.elements.levelSelectMenu,
credits: this.elements.creditsMenu
};

for (const [name, element] of Object.entries(screens)) {
  if (!element) continue;
  if (name === this.activeScreen) {
    show(element);
  } else {
    hide(element);
  }
}

if (this.elements.backButton) {
  const showBack = this.activeScreen !== "main";
  this.elements.backButton.hidden = !showBack;
}

}

/* -------------------------------------------------------
WIRING
------------------------------------------------------- */

_wireButtons() {
this._bindButton(this.elements.startButton, () => {
this.callbacks.onStart?.();
});

this._bindButton(this.elements.settingsButton, () => {
  this.openSettings();
  this.callbacks.onOpenSettings?.();
});

this._bindButton(this.elements.creditsButton, () => {
  this.openCredits();
  this.callbacks.onOpenCredits?.();
});

this._bindButton(this.elements.backButton, () => {
  this.goBack();
  this.callbacks.onBack?.();
});

const levelButtons = Array.isArray(this.elements.levelButtons)
  ? this.elements.levelButtons
  : [];

for (const button of levelButtons) {
  this._bindLevelButton(button);
}

}

_bindButton(button, handler) {
if (!button || typeof button.addEventListener !== "function") return;

button.addEventListener("click", (event) => {
  event.preventDefault();
  handler?.();
});

}

_bindLevelButton(button) {
if (!button || typeof button.addEventListener !== "function") return;

button.addEventListener("click", (event) => {
  event.preventDefault();

  const levelId =
    button.dataset?.levelId ||
    button.getAttribute?.("data-level-id") ||
    null;

  this.callbacks.onLevelSelected?.(levelId, button);
});

}

/* -------------------------------------------------------
SCREEN ACTIONS
------------------------------------------------------- */

openMain() {
this.activeScreen = "main";
this._updateVisibleScreen();
this._updateActiveState();
}

openSettings() {
this.activeScreen = "settings";
this._updateVisibleScreen();
this._updateActiveState();
}

openLevelSelect() {
this.activeScreen = "levelSelect";
this._updateVisibleScreen();
this._updateActiveState();
this.callbacks.onOpenLevelSelect?.();
}

openCredits() {
this.activeScreen = "credits";
this._updateVisibleScreen();
this._updateActiveState();
}

goBack() {
if (this.activeScreen === "main") {
this.hide();
return;
}

this.activeScreen = "main";
this._updateVisibleScreen();
this._updateActiveState();

}

_updateActiveState() {
if (!this.elements.root) return;

toggleClass(this.elements.root, "is-main", this.activeScreen === "main");
toggleClass(this.elements.root, "is-settings", this.activeScreen === "settings");
toggleClass(this.elements.root, "is-level-select", this.activeScreen === "levelSelect");
toggleClass(this.elements.root, "is-credits", this.activeScreen === "credits");

}

/* -------------------------------------------------------
TEXT / CONTENT
------------------------------------------------------- */

setTitle(text) {
setText(this.elements.title, text);
}

setSubtitle(text) {
setText(this.elements.subtitle, text);
}

setLevelButtons(levels = []) {
if (!this.elements.levelSelectMenu) return;

/*
  Level buttons can be populated externally or generated here
  later if the menu needs a dynamic level list.
*/
this.elements.levelButtons = Array.isArray(levels)
  ? levels
  : [];

if (this.debug) {
  console.log("[Menu] level buttons set", this.elements.levelButtons.length);
}

}

setStartButtonLabel(text) {
setText(this.elements.startButton, text);
}

setSettingsButtonLabel(text) {
setText(this.elements.settingsButton, text);
}

setCreditsButtonLabel(text) {
setText(this.elements.creditsButton, text);
}

/* -------------------------------------------------------
HELPERS
------------------------------------------------------- */

isScreen(name) {
return this.activeScreen === name;
}

getActiveScreen() {
return this.activeScreen;
}

focusStartButton() {
this.elements.startButton?.focus?.();
}

focusBackButton() {
this.elements.backButton?.focus?.();
}

pulseButton(button) {
if (!button) return;
button.classList.add("is-pulsed");

window.setTimeout(() => {
  button.classList.remove("is-pulsed");
}, 180);

}

/* -------------------------------------------------------
RESET / DESTROY
------------------------------------------------------- */

reset() {
this.activeScreen = "main";
this._updateVisibleScreen();
this._updateActiveState();
}

destroy() {
this.hide();
this.elements = {};
this.callbacks = {};
this.visible = false;
this.activeScreen = "main";
}
}

export default Menu;
