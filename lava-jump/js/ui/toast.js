/* =========================================================
FILE 49: js/ui/toast.js

This file manages small temporary message popups.

Purpose:

- Show short feedback messages to the player
- Keep notification logic separate from gameplay
- Support success, warning, info, and error messages
- Make it easy to display tutorials or hints later

This file controls UI only.
It does not decide gameplay behavior.
========================================================= */

import { setText, toggleClass } from "../utils/dom.js";

/**

* ToastManager

* ---

* A small controller for lightweight popup messages.

* 

* Toasts are useful for:

* - checkpoint reached

* - coin collected

* - pause/resume hints

* - level complete messages

* - warnings like "Rotate your device"
    */
    class ToastManager {
    constructor(options = {}) {
    this.options = {
    defaultDurationMs: 2200,
    debug: false,
    ...options
    };
  
  this.elements = {
  root: null,
  message: null,
  icon: null
  };
  
  this.visible = false;
  this.debug = Boolean(this.options.debug);
  this.currentType = "info";
  this._timer = null;
  }

/* -------------------------------------------------------
BINDING
------------------------------------------------------- */

bind(elements = {}) {
this.elements = {
...this.elements,
...elements
};

if (this.debug) {
  console.log("[ToastManager] bound elements");
}

}

setElement(name, element) {
if (!(name in this.elements)) return false;
this.elements[name] = element;
return true;
}

/* -------------------------------------------------------
SHOW / HIDE
------------------------------------------------------- */

show(message, options = {}) {
const text = message == null ? "" : String(message);
const type = options.type || "info";
const durationMs = Math.max(
0,
Number(options.durationMs ?? this.options.defaultDurationMs) || 0
);

this.currentType = type;
this.visible = true;

setText(this.elements.message, text);
this._applyType(type);
this._setVisible(true);

if (this._timer) {
  clearTimeout(this._timer);
  this._timer = null;
}

if (durationMs > 0) {
  this._timer = window.setTimeout(() => {
    this.hide();
  }, durationMs);
}

if (this.debug) {
  console.log("[ToastManager] show", { message: text, type, durationMs });
}

}

hide() {
this.visible = false;
this._setVisible(false);

if (this._timer) {
  clearTimeout(this._timer);
  this._timer = null;
}

}

toggle(force) {
const next = typeof force === "boolean" ? force : !this.visible;
next ? this.show(this.getMessage(), { type: this.currentType }) : this.hide();
return this.visible;
}

isVisible() {
return this.visible;
}

_setVisible(visible) {
if (this.elements.root) {
this.elements.root.hidden = !visible;
}

if (this.elements.message && !visible) {
  setText(this.elements.message, "");
}

this._updateActiveState(visible);

}

_updateActiveState(visible) {
if (!this.elements.root) return;

toggleClass(this.elements.root, "is-visible", visible);
toggleClass(this.elements.root, "is-hidden", !visible);
toggleClass(this.elements.root, "is-info", this.currentType === "info" && visible);
toggleClass(this.elements.root, "is-success", this.currentType === "success" && visible);
toggleClass(this.elements.root, "is-warning", this.currentType === "warning" && visible);
toggleClass(this.elements.root, "is-error", this.currentType === "error" && visible);

}

_applyType(type) {
if (!this.elements.root) return;

const root = this.elements.root;
root.dataset.toastType = type;

root.classList.remove("is-info", "is-success", "is-warning", "is-error");
root.classList.add(`is-${type}`);

if (this.elements.icon) {
  const iconMap = {
    info: "i",
    success: "✓",
    warning: "!",
    error: "×"
  };

  setText(this.elements.icon, iconMap[type] || "i");
}

}

/* -------------------------------------------------------
CONTENT HELPERS
------------------------------------------------------- */

setMessage(message) {
setText(this.elements.message, message);
}

getMessage() {
return this.elements.message?.textContent || "";
}

setType(type = "info") {
this.currentType = type;
this._applyType(type);
}

/* -------------------------------------------------------
CONVENIENCE METHODS
------------------------------------------------------- */

info(message, durationMs = null) {
this.show(message, {
type: "info",
durationMs
});
}

success(message, durationMs = null) {
this.show(message, {
type: "success",
durationMs
});
}

warning(message, durationMs = null) {
this.show(message, {
type: "warning",
durationMs
});
}

error(message, durationMs = null) {
this.show(message, {
type: "error",
durationMs
});
}

/* -------------------------------------------------------
RESET / DESTROY
------------------------------------------------------- */

reset() {
this.hide();
this.currentType = "info";
this.setMessage("");
}

destroy() {
if (this._timer) {
clearTimeout(this._timer);
this._timer = null;
}

this.hide();
this.elements = {};
this.visible = false;
this.currentType = "info";

}
}

export default ToastManager;
