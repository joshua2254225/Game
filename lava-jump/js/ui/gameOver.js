/* =========================================================
FILE 47: js/ui/gameOver.js

This file manages the game over screen.

Purpose:

- Show the game over overlay
- Display the final score and related summary text
- Provide restart and menu actions
- Keep end-of-run UI separate from the game systems

This file controls UI only.
It does not decide when the game ends.
========================================================= */

import { show, hide, setText, toggleClass } from "../utils/dom.js";

/**

* GameOverScreen

* ---

* A small controller for the game over panel and buttons.

* 

* The game core can connect callbacks for:

* - restart

* - return to menu

* - view stats
    */
    class GameOverScreen {
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
  scoreValue: null,
  coinsValue: null,
  timeValue: null,
  restartButton: null,
  menuButton: null,
  statsButton: null
  };
  
  this.callbacks = {
  onRestart: null,
  onMenu: null,
  onStats: null
  };
  
  this.visible = false;
  this.debug = Boolean(this.options.debug);
  
  this.state = {
  lastScore: 0,
  lastCoins: 0,
  lastTime: 0,
  reason: ""
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
  console.log("[GameOverScreen] bound elements");
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
this._bindButton(this.elements.restartButton, () => {
this.callbacks.onRestart?.();
});

this._bindButton(this.elements.menuButton, () => {
  this.callbacks.onMenu?.();
});

this._bindButton(this.elements.statsButton, () => {
  this.callbacks.onStats?.();
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
CONTENT / STATS
------------------------------------------------------- */

setTitle(text) {
setText(this.elements.title, text);
}

setSubtitle(text) {
setText(this.elements.subtitle, text);
}

setScore(value) {
const next = Number(value) || 0;
this.state.lastScore = next;
setText(this.elements.scoreValue, String(next));
}

setCoins(value) {
const next = Number(value) || 0;
this.state.lastCoins = next;
setText(this.elements.coinsValue, String(next));
}

setTime(value) {
const next = Math.max(0, Number(value) || 0);
this.state.lastTime = next;
setText(this.elements.timeValue, String(next));
}

setReason(reason) {
this.state.reason = reason == null ? "" : String(reason);
}

/**

* Update all visible summary values at once.
* Useful when the game ends and the UI needs a quick refresh.
  */
  updateSummary(summary = {}) {
  if (summary.title != null) this.setTitle(summary.title);
  if (summary.subtitle != null) this.setSubtitle(summary.subtitle);
  if (summary.score != null) this.setScore(summary.score);
  if (summary.coins != null) this.setCoins(summary.coins);
  if (summary.time != null) this.setTime(summary.time);
  if (summary.reason != null) this.setReason(summary.reason);
  }

/* -------------------------------------------------------
HELPERS
------------------------------------------------------- */

focusRestartButton() {
this.elements.restartButton?.focus?.();
}

focusMenuButton() {
this.elements.menuButton?.focus?.();
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
this.state.lastScore = 0;
this.state.lastCoins = 0;
this.state.lastTime = 0;
this.state.reason = "";
}

destroy() {
this.hide();
this.elements = {};
this.callbacks = {};
this.visible = false;
}
}

export default GameOverScreen;
