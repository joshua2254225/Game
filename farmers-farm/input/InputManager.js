/*
================================================================================
 FARMERS FARM  —  src/input/InputManager.js
================================================================================
 PROJECT     : Farmers Farm
 STUDIOS     : ArcadeOwl Games Studios / TechNODE-3 Studios
 PHASE       : Phase 1 — Input Layer   |   FILE 23 of the project (Phase 1 — done)
 DEPENDS ON  : every other file built this phase — DeviceDetector.js (15),
               CommandQueue.js (16), and all five device files (18-22).
               This is the one file in Phase 1 that finally puts
               DeviceDetector.js's result to actual use.
 USED BY     : src/core/GameEngine.js — updated in this same message to
               actually create, start, update, and stop this class, closing
               the loop GameEngine.update() left as an empty placeholder
               back in Phase 0.
================================================================================
 WHAT THIS FILE DOES
   The orchestrator for everything Phase 1 built. Its entire public API is
   three lifecycle methods — start(), update(), stop() — and nothing here
   reads or writes an individual command; consumers (Phase 3's
   CameraController, Phase 7's PlayerController, Phase 8's
   VehicleController) import commandQueue DIRECTLY for that, the same way
   InputTranslator.js does. InputManager's only job is wiring devices up
   and managing frame timing — not being a data-access facade in front of
   the queue.

 THE COMPLETE PICTURE, NOW THAT ALL THE PIECES EXIST
     KeyboardDevice ─┐
     MouseDevice      ├─▶ InputTranslator ─▶ CommandQueue ─▶ (read by
     TouchDevice      │                                       gameplay
     VirtualJoystick   │                                       controllers,
     VirtualButtons   ─┘                                       Phase 3+)
   This file creates and starts every device on the left. The three
   "dumb listener" devices (Keyboard/Mouse/Touch) start unconditionally —
   per DeviceDetector.js's own header, listening for events that never
   fire costs nothing. The two devices with a visual footprint
   (VirtualJoystick/VirtualButtons) only get created when
   detectDevice().isTouchPrimary is true, mounted into #mobile-controls-root.

 update() MUST BE CALLED LAST — same warning as CommandQueue.js's, restated
   This method's entire job is calling commandQueue.endFrame(). Per that
   file's own header, calling it before every gameplay controller has read
   this frame's discrete/value commands makes them invisible too early.
   GameEngine.update() (updated this message) calls this LAST, after every
   other system, for exactly that reason — not a coincidence, a
   requirement.
================================================================================
*/

import { detectDevice } from './devices/DeviceDetector.js';
import { commandQueue } from './CommandQueue.js';
import { KeyboardDevice } from './devices/KeyboardDevice.js';
import { MouseDevice } from './devices/MouseDevice.js';
import { TouchDevice } from './devices/TouchDevice.js';
import { VirtualJoystickDevice } from './devices/VirtualJoystickDevice.js';
import { VirtualButtonDevice } from './devices/VirtualButtonDevice.js';

/**
 * InputManager — creates and owns every input device, and drives the
 * one piece of frame-timing the whole layer depends on.
 */
export class InputManager {
  // Always-on, regardless of device type — see file header.
  #keyboardDevice = new KeyboardDevice();
  #mouseDevice = new MouseDevice();
  #touchDevice = new TouchDevice();

  // Only created in start() if the device turns out to be touch-primary.
  #virtualJoystick = null;
  #virtualButtons = null;

  /** Starts every always-on device, then conditionally mounts the two
   *  touch-only widgets based on DeviceDetector.js's one-time check. */
  start() {
    this.#keyboardDevice.start();
    this.#mouseDevice.start();
    this.#touchDevice.start();

    const { isTouchPrimary } = detectDevice();
    if (!isTouchPrimary) return;

    const mobileControlsRoot = document.getElementById('mobile-controls-root');
    if (!mobileControlsRoot) {
      console.error('[Farmers Farm] #mobile-controls-root not found — virtual controls cannot mount.');
      return;
    }

    this.#virtualJoystick = new VirtualJoystickDevice();
    this.#virtualJoystick.mount(mobileControlsRoot);

    this.#virtualButtons = new VirtualButtonDevice();
    this.#virtualButtons.mount(mobileControlsRoot);
  }

  /**
   * Called once per frame, LAST — see file header. Clears this frame's
   * discrete/value commands so they don't leak into the next one.
   */
  update() {
    commandQueue.endFrame();
  }

  /** Stops every device and unmounts the virtual controls, if present. */
  stop() {
    this.#keyboardDevice.stop();
    this.#mouseDevice.stop();
    this.#touchDevice.stop();
    this.#virtualJoystick?.unmount();
    this.#virtualButtons?.unmount();
  }
}
