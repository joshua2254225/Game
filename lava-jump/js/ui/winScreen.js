/* =========================================================
FILE 48: js/ui/winScreen.js

This file manages the level complete / win screen.

Purpose:

- Show the victory overlay when the player reaches the end
- Display final score, coins, time, and bonus information
- Provide next level and restart actions
- Keep win-state UI separate from gameplay systems

This file controls UI only.
It does not decide when the level is complete.
========================================================= */

import { show, hide, setText, toggleClass } from "../utils/dom.js";

/**

* WinScreen

* ---

* A small controller for the victory panel and its buttons.

* 

* The game core can connect callbacks for:

* - next level

* - restart

* - return to menu
    */
    class WinScreen {
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
  bonusValue: null,
  nextButton: null,
  restartButton: null,
  menuButton: null
  };
  
  this.callbacks = {
  onNext: null,
  onRestart: null,
  onMenu: null
  };
  
  this.visible = false;
  this.debug = Boolean(this.options.debug);
  
  this.state = {
  lastScore: 0,
  lastCoins: 0,
  lastTime: 0,
  lastBonus: 0,
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
  console.log("[WinScreen] bound elements");
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
this._bindButton(this.elements.nextButton, () => {
this.callbacks.onNext?.();
});

this._bindButton(this.elements.restartButton, () => {
  this.callbacks.onRestart?.();
});

this._bindButton(this.elements.menuButton, () => {
  this.callbacks.onMenu?.();
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
CONTENT / SUMMARY
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

setBonus(value) {
const next = Number(value) || 0;
this.state.lastBonus = next;
setText(this.elements.bonusValue, String(next));
}

setReason(reason) {
this.state.reason = reason == null ? "" : String(reason);
}

/**

* Update the whole win summary at once.
  */
  updateSummary(summary = {}) {
  if (summary.title != null) this.setTitle(summary.title);
  if (summary.subtitle != null) this.setSubtitle(summary.subtitle);
  if (summary.score != null) this.setScore(summary.score);
  if (summary.coins != null) this.setCoins(summary.coins);
  if (summary.time != null) this.setTime(summary.time);
  if (summary.bonus != null) this.setBonus(summary.bonus);
  if (summary.reason != null) this.setReason(summary.reason);
  }

/* -------------------------------------------------------
HELPERS
------------------------------------------------------- */

focusNextButton() {
this.elements.nextButton?.focus?.();
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
this.state.lastScore = 0;
this.state.lastCoins = 0;
this.state.lastTime = 0;
this.state.lastBonus = 0;
this.state.reason = "";
}

destroy() {
this.hide();
this.elements = {};
this.callbacks = {};
this.visible = false;
}
}

export default WinScreen;
