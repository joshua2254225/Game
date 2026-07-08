/* =========================================================
FILE 46: js/ui/pauseMenu.js

This file manages the pause menu UI.

Purpose:

- Show and hide the pause screen
- Provide resume, restart, and quit actions
- Keep pause logic separate from gameplay systems
- Make it easy to add more pause options later

This file controls UI state only.
It does not pause the simulation directly unless a callback
tells the game core to do so.
========================================================= */

import { show, hide, setText, toggleClass } from "../utils/dom.js";

/**

* PauseMenu

* ---

* A small controller for the pause overlay and its buttons.

* 

* The game core can connect callbacks for:

* - resume

* - restart

* - quit

* - settings
    */
    class PauseMenu {
    constructor(options = {}) {
    this.options = {
    debug: false,
    ...options
    };
  
  this.elements = {
  root: null,
  panel: null,
  title: null,
  subtitle: null,
  resumeButton: null,
  restartButton: null,
  quitButton: null,
  settingsButton: null
  };
  
  this.callbacks = {
  onResume: null,
  onRestart: null,
  onQuit: null,
  onSettings: null
  };
  
  this.visible = false;
  this.debug = Boolean(this.options.debug);
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
  console.log("[PauseMenu] bound elements");
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

show() {
this.visible = true;
this._setVisible(true);
}

hide() {
this.visible = false;
this._setVisible(false);
}

toggle(force) {
const next = typeof force === "boolean" ? force : !this.visible;
next ? this.show() : this.hide();
return this.visible;
}

isVisible() {
return this.visible;
}

_setVisible(visible) {
if (this.elements.root) {
this.elements.root.hidden = !visible;
}

if (this.elements.panel) {
  visible ? show(this.elements.panel) : hide(this.elements.panel);
}

this._updateActiveState();

}

_updateActiveState() {
if (!this.elements.root) return;

toggleClass(this.elements.root, "is-visible", this.visible);
toggleClass(this.elements.root, "is-hidden", !this.visible);

}

/* -------------------------------------------------------
BUTTON WIRING
------------------------------------------------------- */

_wireButtons() {
this._bindButton(this.elements.resumeButton, () => {
this.callbacks.onResume?.();
});

this._bindButton(this.elements.restartButton, () => {
  this.callbacks.onRestart?.();
});

this._bindButton(this.elements.quitButton, () => {
  this.callbacks.onQuit?.();
});

this._bindButton(this.elements.settingsButton, () => {
  this.callbacks.onSettings?.();
});

}

_bindButton(button, handler) {
if (!button || typeof button.addEventListener !== "function") return;

button.addEventListener("click", (event) => {
  event.preventDefault();
  handler?.();
});

}

/* -------------------------------------------------------
CONTENT
------------------------------------------------------- */

setTitle(text) {
setText(this.elements.title, text);
}

setSubtitle(text) {
setText(this.elements.subtitle, text);
}

setResumeLabel(text) {
setText(this.elements.resumeButton, text);
}

setRestartLabel(text) {
setText(this.elements.restartButton, text);
}

setQuitLabel(text) {
setText(this.elements.quitButton, text);
}

setSettingsLabel(text) {
setText(this.elements.settingsButton, text);
}

/* -------------------------------------------------------
HELPERS
------------------------------------------------------- */

focusResumeButton() {
this.elements.resumeButton?.focus?.();
}

focusRestartButton() {
this.elements.restartButton?.focus?.();
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
this.hide();
}

destroy() {
this.hide();
this.elements = {};
this.callbacks = {};
this.visible = false;
}
}

export default PauseMenu;
