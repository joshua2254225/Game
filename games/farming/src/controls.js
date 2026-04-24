// src/controls.js

export class Joystick {
  constructor() {
    this.active = false;
    this.origin = { x: 0, y: 0 };
    this.delta = { x: 0, y: 0 };

    this.createUI();
    this.addEvents();
  }

  createUI() {
    this.base = document.createElement("div");
    this.stick = document.createElement("div");

    this.base.style.position = "fixed";
    this.base.style.left = "40px";
    this.base.style.bottom = "40px";
    this.base.style.width = "120px";
    this.base.style.height = "120px";
    this.base.style.borderRadius = "50%";
    this.base.style.background = "rgba(255,255,255,0.2)";

    this.stick.style.position = "absolute";
    this.stick.style.left = "40px";
    this.stick.style.top = "40px";
    this.stick.style.width = "40px";
    this.stick.style.height = "40px";
    this.stick.style.borderRadius = "50%";
    this.stick.style.background = "rgba(255,255,255,0.5)";

    this.base.appendChild(this.stick);
    document.body.appendChild(this.base);
  }

  addEvents() {
    window.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      this.active = true;
      this.origin.x = touch.clientX;
      this.origin.y = touch.clientY;
    });

    window.addEventListener("touchmove", (e) => {
      if (!this.active) return;

      const touch = e.touches[0];
      this.delta.x = touch.clientX - this.origin.x;
      this.delta.y = touch.clientY - this.origin.y;

      // Begrenzen
      const max = 40;
      this.delta.x = Math.max(-max, Math.min(max, this.delta.x));
      this.delta.y = Math.max(-max, Math.min(max, this.delta.y));

      this.stick.style.transform =
        `translate(${this.delta.x}px, ${this.delta.y}px)`;
    });

    window.addEventListener("touchend", () => {
      this.active = false;
      this.delta.x = 0;
      this.delta.y = 0;
      this.stick.style.transform = `translate(0px, 0px)`;
    });
  }

  getDirection() {
    return {
      x: this.delta.x / 40,
      y: this.delta.y / 40
    };
  }
      }
