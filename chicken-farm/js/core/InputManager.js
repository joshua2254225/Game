// js/core/InputManager.js
// Handles keyboard, mouse, and desktop-only controls for the farm game.

export class InputManager {
  constructor(canvas = null) {
    this.canvas = canvas;

    this.enabled = true;
    this.keysDown = new Set();
    this.mouse = {
      x: 0,
      y: 0,
      down: false,
      button: -1
    };

    this.callbacks = {
      onKeyDown: null,
      onKeyUp: null,
      onMouseMove: null,
      onMouseDown: null,
      onMouseUp: null,
      onClick: null,
      onRightClick: null,
      onWheel: null
    };

    this.boundHandlers = {
      keydown: (e) => this.handleKeyDown(e),
      keyup: (e) => this.handleKeyUp(e),
      mousemove: (e) => this.handleMouseMove(e),
      mousedown: (e) => this.handleMouseDown(e),
      mouseup: (e) => this.handleMouseUp(e),
      click: (e) => this.handleClick(e),
      contextmenu: (e) => this.handleContextMenu(e),
      wheel: (e) => this.handleWheel(e),
      blur: () => this.handleWindowBlur()
    };

    this.isListening = false;
  }

  init() {
    if (this.isListening) return;

    window.addEventListener("keydown", this.boundHandlers.keydown);
    window.addEventListener("keyup", this.boundHandlers.keyup);
    window.addEventListener("blur", this.boundHandlers.blur);

    window.addEventListener("mousemove", this.boundHandlers.mousemove, { passive: true });
    window.addEventListener("mousedown", this.boundHandlers.mousedown);
    window.addEventListener("mouseup", this.boundHandlers.mouseup);
    window.addEventListener("click", this.boundHandlers.click);
    window.addEventListener("wheel", this.boundHandlers.wheel, { passive: true });

    if (this.canvas) {
      this.canvas.addEventListener("contextmenu", this.boundHandlers.contextmenu);
    }

    this.isListening = true;
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = {
      ...this.callbacks,
      ...callbacks
    };
  }

  setEnabled(value) {
    this.enabled = Boolean(value);

    if (!this.enabled) {
      this.keysDown.clear();
      this.mouse.down = false;
      this.mouse.button = -1;
    }
  }

  isKeyDown(key) {
    return this.keysDown.has(String(key).toLowerCase());
  }

  getMousePosition() {
    return {
      x: this.mouse.x,
      y: this.mouse.y,
      down: this.mouse.down,
      button: this.mouse.button
    };
  }

  handleKeyDown(event) {
    if (!this.enabled) return;

    const key = String(event.key).toLowerCase();
    this.keysDown.add(key);

    if (typeof this.callbacks.onKeyDown === "function") {
      this.callbacks.onKeyDown(event, key);
    }
  }

  handleKeyUp(event) {
    const key = String(event.key).toLowerCase();
    this.keysDown.delete(key);

    if (!this.enabled) return;

    if (typeof this.callbacks.onKeyUp === "function") {
      this.callbacks.onKeyUp(event, key);
    }
  }

  handleMouseMove(event) {
    if (!this.enabled) return;

    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;

    if (typeof this.callbacks.onMouseMove === "function") {
      this.callbacks.onMouseMove(event, this.getMousePosition());
    }
  }

  handleMouseDown(event) {
    if (!this.enabled) return;

    this.mouse.down = true;
    this.mouse.button = event.button;

    if (typeof this.callbacks.onMouseDown === "function") {
      this.callbacks.onMouseDown(event, this.getMousePosition());
    }
  }

  handleMouseUp(event) {
    if (!this.enabled) return;

    this.mouse.down = false;

    if (typeof this.callbacks.onMouseUp === "function") {
      this.callbacks.onMouseUp(event, this.getMousePosition());
    }

    this.mouse.button = -1;
  }

  handleClick(event) {
    if (!this.enabled) return;

    if (typeof this.callbacks.onClick === "function") {
      this.callbacks.onClick(event, this.getMousePosition());
    }
  }

  handleContextMenu(event) {
    // Desktop game: right-click may be used for rotate / inspect later.
    event.preventDefault();

    if (!this.enabled) return;

    if (typeof this.callbacks.onRightClick === "function") {
      this.callbacks.onRightClick(event, this.getMousePosition());
    }
  }

  handleWheel(event) {
    if (!this.enabled) return;

    if (typeof this.callbacks.onWheel === "function") {
      this.callbacks.onWheel(event, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ
      });
    }
  }

  handleWindowBlur() {
    this.keysDown.clear();
    this.mouse.down = false;
    this.mouse.button = -1;
  }

  destroy() {
    if (!this.isListening) return;

    window.removeEventListener("keydown", this.boundHandlers.keydown);
    window.removeEventListener("keyup", this.boundHandlers.keyup);
    window.removeEventListener("blur", this.boundHandlers.blur);

    window.removeEventListener("mousemove", this.boundHandlers.mousemove);
    window.removeEventListener("mousedown", this.boundHandlers.mousedown);
    window.removeEventListener("mouseup", this.boundHandlers.mouseup);
    window.removeEventListener("click", this.boundHandlers.click);
    window.removeEventListener("wheel", this.boundHandlers.wheel);

    if (this.canvas) {
      this.canvas.removeEventListener("contextmenu", this.boundHandlers.contextmenu);
    }

    this.keysDown.clear();
    this.mouse.down = false;
    this.mouse.button = -1;
    this.isListening = false;
  }
}
