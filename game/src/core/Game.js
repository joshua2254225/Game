import * as THREE from 'three';

export class Game {
    constructor() {
        // Core WebGL / Three.js properties
        this.container = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;

        // System registries
        this.systems = {};
        this.world = {};
        this.ui = {};
        
        // Game state flag
        this.isInitialized = false;
    }

    /**
     * Initializes the master game engine components sequentially.
     */
    async init() {
        if (this.isInitialized) return;

        // 1. Bind the HTML container element
        this.container = document.getElementById('game-container');
        if (!this.container) {
            throw new Error("Target element '#game-container' not found in DOM.");
        }

        // 2. Initialize Core 3D Graphics Engine
        this._initGraphics();

        // 3. Setup global application event listeners
        window.addEventListener('resize', () => this._onWindowResize(), false);

        // 4. Simulated Asset Loading Pipeline Hook
        // (This will tie into our AssetLoader.js later)
        await this._simulateLoadingProgress();

        // 5. Turn off loading screen once setup completes safely
        this._hideLoadingScreen();

        this.isInitialized = true;
        console.log("Game Engine fully initialized and running.");
    }

    /**
     * Internal setup for Three.js WebGL scene architecture.
     * @private
     */
    _initGraphics() {
        // Create the 3D scene container
        this.scene = new THREE.Scene();

        // Setup a professional perspective camera
        // FOV: 60, Near clipping pane: 0.1, Far clipping pane: 1000
        this.camera = new THREE.PerspectiveCamera(
            60, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        
        // Position camera pointing down at our farm plots initially
        this.camera.position.set(0, 35, 45);
        this.camera.lookAt(0, 0, 0);

        // Configure the high-performance WebGL context renderer
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,       // Smooths jagged edges on 3D meshes
            powerPreference: "high-performance" 
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Dynamic scaling capped at 2x for performance
        this.renderer.shadowMap.enabled = true; // Enables real-time shadow computation
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Beautiful, blurry soft shadows

        // Inject the generated WebGL viewport into our HTML structural layout
        this.container.appendChild(this.renderer.domElement);
    }

    /**
     * Window resize callback to keep the aspect ratio perfect and prevent distortion.
     * @private
     */
    _onWindowResize() {
        if (!this.camera || !this.renderer) return;

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * Temporary mock method to simulate asset reading before asset loader integration.
     * @private
     */
    _simulateLoadingProgress() {
        return new Promise((resolve) => {
            const fill = document.getElementById('loading-bar-fill');
            const text = document.getElementById('loading-text');
            let progress = 0;

            const interval = setInterval(() => {
                progress += 10;
                if (fill) fill.style.width = `${progress}%`;
                if (text) text.textContent = `${progress}%`;

                if (progress >= 100) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100); // Fast simulation for structural testing
        });
    }

    /**
     * Hides the loading graphic overlay smoothly.
     * @private
     */
    _hideLoadingScreen() {
        const loader = document.getElementById('loading-screen');
        if (loader) {
            loader.classList.add('hidden');
        }
    }
}
