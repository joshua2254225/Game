/* =========================================================
FILE 21: js/core/renderer.js

This file manages the rendering surface for the game.

Purpose:

- Own the canvas rendering context
- Handle renderer sizing and clear behavior
- Keep drawing logic separate from game logic
- Prepare the project for future 3D rendering updates

This file is intentionally renderer-focused only.
It does not decide movement, collisions, scoring, or level flow.
========================================================= */

import gameConfig from "../config/gameConfig.js";
import { setStyles } from "../utils/dom.js";

/**

* Renderer

* ---

* A lightweight canvas renderer wrapper.

* 

* The first version is intentionally simple and flexible.

* It creates a drawing context and exposes a few helper methods

* so later game systems can render frames without needing direct

* canvas setup code everywhere.
  */
  class Renderer {
  constructor(options = {}) {
  this.options = {
  canvas: null,
  backgroundColor: gameConfig.rendering.backgroundColor,
  clearAlpha: gameConfig.rendering.clearAlpha,
  antialias: gameConfig.rendering.antialias,
  pixelRatioLimit: gameConfig.rendering.pixelRatioLimit,
  debug: false,
  ...options
  };
  
  this.canvas = this.options.canvas;
  this.context = null;
  
  this.width = 0;
  this.height = 0;
  this.pixelRatio = 1;
  
  this.clearColor = this.options.backgroundColor;
  this.clearAlpha = this.options.clearAlpha;
  
  this.initialized = false;
  
  if (this.canvas) {
  this.init(this.canvas);
  }
  }

/* -------------------------------------------------------
INITIALIZATION
------------------------------------------------------- */

init(canvas = this.canvas) {
if (!canvas) {
throw new Error("[Renderer] Canvas element is required.");
}

this.canvas = canvas;

/*
  We use a standard 2D canvas context here for the first file.
  The game structure stays flexible, so a future WebGL or 3D
  renderer can be introduced later without changing the rest
  of the project architecture.
*/
this.context = canvas.getContext("2d", {
  alpha: true,
  desynchronized: true,
  willReadFrequently: false
});

if (!this.context) {
  throw new Error("[Renderer] Unable to create 2D rendering context.");
}

this.initialized = true;

if (this.options.debug) {
  console.log("[Renderer] initialized");
}

return this;

}

/* -------------------------------------------------------
SIZE CONTROL
------------------------------------------------------- */

resize(width, height, pixelRatio = 1) {
if (!this.canvas) return null;

this.width = Math.max(1, Math.floor(width || 1));
this.height = Math.max(1, Math.floor(height || 1));
this.pixelRatio = Math.max(1, Math.min(pixelRatio || 1, this.options.pixelRatioLimit));

/*
  We keep the canvas element visually matched to the viewport.
  The actual pixel buffer is scaled by device pixel ratio so the
  game can look crisp on high-density screens.
*/
this.canvas.style.width = `${this.width}px`;
this.canvas.style.height = `${this.height}px`;
this.canvas.width = Math.floor(this.width * this.pixelRatio);
this.canvas.height = Math.floor(this.height * this.pixelRatio);

/*
  Scale drawing so coordinates can be expressed in CSS pixels.
  This makes later rendering code simpler to read.
*/
if (this.context) {
  this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
}

if (this.options.debug) {
  console.log("[Renderer] resize", {
    width: this.width,
    height: this.height,
    pixelRatio: this.pixelRatio
  });
}

return this.getSize();

}

getSize() {
return {
width: this.width,
height: this.height,
pixelRatio: this.pixelRatio
};
}

/* -------------------------------------------------------
DRAWING CONTROLS
------------------------------------------------------- */

clear(color = this.clearColor, alpha = this.clearAlpha) {
if (!this.context || !this.canvas) return;

const ctx = this.context;

/*
  Clear the whole canvas before a new frame.
  We keep this explicit so later render code stays predictable.
*/
ctx.save();
ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
ctx.clearRect(0, 0, this.width, this.height);

if (alpha > 0) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, this.width, this.height);
  ctx.globalAlpha = 1;
}

ctx.restore();

}

beginFrame() {
if (!this.context) return;
this.context.save();
this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
}

endFrame() {
if (!this.context) return;
this.context.restore();
}

/* -------------------------------------------------------
BASIC PRIMITIVES
-------------------------------------------------------
These helpers are intentionally simple. The first version of
the game can use them for debug drawing, placeholders, and UI
overlays. Later, more advanced 3D drawing can be added.
------------------------------------------------------- */

drawRect(x, y, width, height, fillStyle = "#ffffff") {
if (!this.context) return;

const ctx = this.context;
ctx.fillStyle = fillStyle;
ctx.fillRect(x, y, width, height);

}

drawStrokeRect(x, y, width, height, strokeStyle = "#ffffff", lineWidth = 1) {
if (!this.context) return;

const ctx = this.context;
ctx.strokeStyle = strokeStyle;
ctx.lineWidth = lineWidth;
ctx.strokeRect(x, y, width, height);

}

drawText(text, x, y, options = {}) {
if (!this.context) return;

const ctx = this.context;
const {
  fillStyle = "#ffffff",
  font = "16px Arial",
  align = "left",
  baseline = "alphabetic"
} = options;

ctx.fillStyle = fillStyle;
ctx.font = font;
ctx.textAlign = align;
ctx.textBaseline = baseline;
ctx.fillText(String(text), x, y);

}

drawCircle(x, y, radius, fillStyle = "#ffffff") {
if (!this.context) return;

const ctx = this.context;
ctx.beginPath();
ctx.arc(x, y, radius, 0, Math.PI * 2);
ctx.fillStyle = fillStyle;
ctx.fill();

}

drawLine(x1, y1, x2, y2, strokeStyle = "#ffffff", lineWidth = 1) {
if (!this.context) return;

const ctx = this.context;
ctx.beginPath();
ctx.moveTo(x1, y1);
ctx.lineTo(x2, y2);
ctx.strokeStyle = strokeStyle;
ctx.lineWidth = lineWidth;
ctx.stroke();

}

/* -------------------------------------------------------
CANVAS STYLE HELPERS
------------------------------------------------------- */

setCanvasStyle(styles = {}) {
if (!this.canvas) return false;
return setStyles(this.canvas, styles);
}

setBackgroundColor(color) {
this.clearColor = color || this.clearColor;
if (this.canvas) {
this.canvas.style.background = "transparent";
}
}

setAlpha(alpha) {
this.clearAlpha = Math.max(0, Math.min(1, alpha));
}

/* -------------------------------------------------------
DEBUG DRAW
-------------------------------------------------------
Useful while building the game and checking coordinate space.
------------------------------------------------------- */

drawDebugGrid(step = 50, color = "rgba(255,255,255,0.08)") {
if (!this.context) return;

const ctx = this.context;

ctx.save();
ctx.beginPath();
ctx.strokeStyle = color;
ctx.lineWidth = 1;

for (let x = 0; x <= this.width; x += step) {
  ctx.moveTo(x, 0);
  ctx.lineTo(x, this.height);
}

for (let y = 0; y <= this.height; y += step) {
  ctx.moveTo(0, y);
  ctx.lineTo(this.width, y);
}

ctx.stroke();
ctx.restore();

}

/* -------------------------------------------------------
SNAPSHOT
------------------------------------------------------- */

snapshot() {
return {
initialized: this.initialized,
hasCanvas: Boolean(this.canvas),
hasContext: Boolean(this.context),
width: this.width,
height: this.height,
pixelRatio: this.pixelRatio,
clearColor: this.clearColor,
clearAlpha: this.clearAlpha
};
}

/* -------------------------------------------------------
CLEANUP
------------------------------------------------------- */

destroy() {
this.context = null;
this.canvas = null;
this.initialized = false;
this.width = 0;
this.height = 0;
this.pixelRatio = 1;
}
}

export default Renderer;
