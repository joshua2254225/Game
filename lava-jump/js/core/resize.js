/* =========================================================
FILE 19: js/core/resize.js

This file handles screen sizing and canvas resizing.

Purpose:

- Keep the game scaled correctly on desktop and mobile
- Update the renderer when the viewport changes
- Respect device pixel ratio limits
- Support landscape-first gameplay behavior

This file is intentionally focused only on resizing.
Rendering and gameplay logic live elsewhere.
========================================================= */

import gameConfig from "../config/gameConfig.js";

/**

* ResizeManager

* ---

* Keeps the canvas and related UI aligned with the current

* browser window size.

* 

* The manager does not render the game itself.

* It only calculates and applies size changes.
  */
  class ResizeManager {
  constructor(options = {}) {
  this.options = {
  canvas: null,
  container: null,
  onResize: null,
  pixelRatioLimit: gameConfig.rendering.pixelRatioLimit,
  debug: false,
  ...options
  };
  
  this.canvas = this.options.canvas;
  this.container = this.options.container;
  this.onResize = this.options.onResize;
  
  this.width = 0;
  this.height = 0;
  this.pixelRatio = 1;
  this.aspectRatio = 1;
  
  this.bound = false;
  
  this._handleResize = this._handleResize.bind(this);
  this._handleOrientationChange = this._handleOrientationChange.bind(this);
  }

/* -------------------------------------------------------
BIND / UNBIND
------------------------------------------------------- */

bind() {
if (this.bound || typeof window === "undefined") return;

window.addEventListener("resize", this._handleResize);
window.addEventListener("orientationchange", this._handleOrientationChange);

this.bound = true;
this.update();

if (this.options.debug) {
  console.log("[ResizeManager] bound");
}

}

unbind() {
if (!this.bound || typeof window === "undefined") return;

window.removeEventListener("resize", this._handleResize);
window.removeEventListener("orientationchange", this._handleOrientationChange);

this.bound = false;

if (this.options.debug) {
  console.log("[ResizeManager] unbound");
}

}

/* -------------------------------------------------------
EVENT HANDLERS
------------------------------------------------------- */

_handleResize() {
this.update();
}

_handleOrientationChange() {
/*
Some browsers need a short delay before the viewport
measurements are stable after rotating the device.
*/
window.setTimeout(() => {
this.update();
}, 50);
}

/* -------------------------------------------------------
MEASUREMENT
------------------------------------------------------- */

measure() {
const target = this.container || window;

let width = 0;
let height = 0;

if (target === window) {
  width = window.innerWidth || 0;
  height = window.innerHeight || 0;
} else {
  const rect = target.getBoundingClientRect();
  width = rect.width || 0;
  height = rect.height || 0;
}

this.width = Math.max(1, Math.floor(width));
this.height = Math.max(1, Math.floor(height));
this.aspectRatio = this.width / this.height;

const devicePixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
this.pixelRatio = Math.min(devicePixelRatio, this.options.pixelRatioLimit);

return {
  width: this.width,
  height: this.height,
  pixelRatio: this.pixelRatio,
  aspectRatio: this.aspectRatio
};

}

/* -------------------------------------------------------
APPLY
------------------------------------------------------- */

apply() {
if (!this.canvas) return null;

const size = this.measure();

/*
  Canvas internal resolution should match the display size
  multiplied by the device pixel ratio, but we also clamp it
  to avoid excessive scaling on very dense screens.
*/
const displayWidth = Math.max(1, Math.floor(size.width));
const displayHeight = Math.max(1, Math.floor(size.height));
const bufferWidth = Math.max(1, Math.floor(displayWidth * size.pixelRatio));
const bufferHeight = Math.max(1, Math.floor(displayHeight * size.pixelRatio));

this.canvas.style.width = `${displayWidth}px`;
this.canvas.style.height = `${displayHeight}px`;

if (this.canvas.width !== bufferWidth) {
  this.canvas.width = bufferWidth;
}

if (this.canvas.height !== bufferHeight) {
  this.canvas.height = bufferHeight;
}

if (typeof this.onResize === "function") {
  this.onResize({
    width: displayWidth,
    height: displayHeight,
    pixelRatio: size.pixelRatio,
    aspectRatio: size.aspectRatio,
    canvasWidth: bufferWidth,
    canvasHeight: bufferHeight
  });
}

if (this.options.debug) {
  console.log("[ResizeManager] apply", {
    displayWidth,
    displayHeight,
    bufferWidth,
    bufferHeight,
    pixelRatio: size.pixelRatio
  });
}

return {
  width: displayWidth,
  height: displayHeight,
  pixelRatio: size.pixelRatio,
  aspectRatio: size.aspectRatio,
  canvasWidth: bufferWidth,
  canvasHeight: bufferHeight
};

}

/* -------------------------------------------------------
UPDATE
------------------------------------------------------- */

update() {
return this.apply();
}

/* -------------------------------------------------------
HELPERS
------------------------------------------------------- */

getSize() {
return {
width: this.width,
height: this.height,
pixelRatio: this.pixelRatio,
aspectRatio: this.aspectRatio
};
}

isLandscape() {
return this.width >= this.height;
}

isPortrait() {
return this.height > this.width;
}

/**

* Returns true if the current viewport is large enough for the
* game to display comfortably.
  */
  isPlayable() {
  return this.width >= 320 && this.height >= 240;
  }

/**

* Convenience method for changing the canvas/container reference.
* Useful if the renderer is rebuilt or moved.
  */
  setTarget(canvas, container = null) {
  this.canvas = canvas;
  this.container = container;
  }

/**

* Trigger a manual resize update.
  */
  force() {
  return this.update();
  }

/* -------------------------------------------------------
CLEANUP
------------------------------------------------------- */

destroy() {
this.unbind();
this.canvas = null;
this.container = null;
this.onResize = null;
this.width = 0;
this.height = 0;
this.pixelRatio = 1;
this.aspectRatio = 1;
}
}

export default ResizeManager;
