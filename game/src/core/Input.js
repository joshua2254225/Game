import * as THREE from 'three';

export class Input {
    /**
     * @param {THREE.PerspectiveCamera} camera 
     * @param {HTMLElement} domElement The canvas element to listen for mouse events on
     */
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement || document.body;

        // Keyboard tracking state object
        this.keys = {
            w: false, a: false, s: false, d: false,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            Shift: false // Used for sprinting/faster camera pan speeds
        };

        // Mouse tracking normalization properties (Vector2 coordinates range from -1 to +1)
        this.mousePosition = new THREE.Vector2();
        
        // Track whether a click occurred this frame (consumed by interaction systems)
        this.isMouseClicked = false;

        // Internal bindings to maintain safe context inside event listeners
        this._onKeyDownBinding = this._onKeyDown.bind(this);
        this._onKeyUpBinding = this._onKeyUp.bind(this);
        this._onMouseMoveBinding = this._onMouseMove.bind(this);
        this._onMouseDownBinding = this._onMouseDown.bind(this);

        this._initListeners();
    }

    /**
     * Attaches structural desktop EventListeners to the browser runtime.
     * @private
     */
    _initListeners() {
        window.addEventListener('keydown', this._onKeyDownBinding, false);
        window.addEventListener('keyup', this._onKeyUpBinding, false);
        this.domElement.addEventListener('mousemove', this._onMouseMoveBinding, false);
        this.domElement.addEventListener('mousedown', this._onMouseDownBinding, false);
    }

    /**
     * Keyboard downward press handler.
     * @private
     */
    _onKeyDown(event) {
        const key = event.key.toLowerCase();
        
        if (key in this.keys) {
            this.keys[key] = true;
        } else if (event.key in this.keys) {
            this.keys[event.key] = true; // Handles non-case keys like Shift/Arrows
        }
    }

    /**
     * Keyboard upward release handler.
     * @private
     */
    _onKeyUp(event) {
        const key = event.key.toLowerCase();

        if (key in this.keys) {
            this.keys[key] = false;
        } else if (event.key in this.keys) {
            this.keys[event.key] = false;
        }
    }

    /**
     * Maps mouse pixels into WebGL standardized device coordinates (-1 to 1).
     * @private
     */
    _onMouseMove(event) {
        const rect = this.domElement.getBoundingClientRect();
        
        // Advanced math mapping coordinates for Three.js Raycaster utility use
        this.mousePosition.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mousePosition.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    /**
     * Standard mouse down interaction interceptor.
     * @private
     */
    _onMouseDown(event) {
        // Only accept left-mouse button interactions (Button code 0)
        if (event.button !== 0) return;
        
        this.isMouseClicked = true;
    }

    /**
     * Clears single-frame status flags. Called at the end of the frame tick.
     */
    clearFrameFlags() {
        this.isMouseClicked = false;
    }

    /**
     * Lifecycle teardown method. Essential for memory leak prevention when swapping maps/states.
     */
    destroy() {
        window.removeEventListener('keydown', this._onKeyDownBinding);
        window.removeEventListener('keyup', this._onKeyUpBinding);
        this.domElement.removeEventListener('mousemove', this._onMouseMoveBinding);
        this.domElement.removeEventListener('mousedown', this._onMouseDownBinding);
        console.log("Input listener binds destroyed completely.");
    }
}
