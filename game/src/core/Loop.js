import * as THREE from 'three';

export class Loop {
    /**
     * @param {THREE.WebGLRenderer} renderer 
     * @param {THREE.Scene} scene 
     * @param {THREE.PerspectiveCamera} camera 
     */
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        // Three.js internal clock to track precise frame delta times
        this.clock = new THREE.Clock();
        
        // Array to store objects or systems that need to run logic every single frame
        this.updatables = [];
        
        // Loop status flag
        this.isRunning = false;
    }

    /**
     * Starts the animation loop execution pipeline.
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        // Reset the clock so delta time doesn't spike from loading delays
        this.clock.getDelta(); 
        
        // Begin the internal loop execution
        this.renderer.setAnimationLoop(() => {
            this._tick();
        });
        
        console.log("Game loop ticker started successfully.");
    }

    /**
     * Halts the loop processing. Essential for pausing or exit routines.
     */
    stop() {
        this.isRunning = false;
        this.renderer.setAnimationLoop(null);
        console.log("Game loop ticker paused.");
    }

    /**
     * Core update cycle executed every frame (~60-144 times per second).
     * @private
     */
    _tick() {
        // Capture delta time (seconds passed since the last frame)
        const deltaTime = this.clock.getDelta();

        // Safety cap: If the player switches tabs, delta time can spike dramatically,
        // which makes physics objects pass through walls or chickens teleport.
        // We cap it at 0.1 seconds (100ms) to maintain realistic simulation stability.
        const cappedDelta = Math.min(deltaTime, 0.1);

        // 1. Update game simulation state logic across all registered elements
        for (let i = 0; i < this.updatables.length; i++) {
            try {
                this.updatables[i].update(cappedDelta);
            } catch (error) {
                console.error("Error updating system loop instance:", this.updatables[i], error);
            }
        }

        // 2. Render the updated 3D coordinate space to the browser viewport
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Registers a new entity or system to receive frame updates.
     * @param {Object} object Must implement an .update(deltaTime) function
     */
    register(object) {
        if (object && typeof object.update === 'function') {
            if (!this.updatables.includes(object)) {
                this.updatables.push(object);
            }
        } else {
            console.warn("Registration rejected: Object missing required 'update' method.", object);
        }
    }

    /**
     * Unregisters an entity or system when it's destroyed (e.g., selling a chicken).
     * @param {Object} object 
     */
    unregister(object) {
        const index = this.updatables.indexOf(object);
        if (index !== -1) {
            this.updatables.splice(index, 1);
        }
    }
}
