import { Game } from './core/Game.js';

/**
 * Chicken Farm Tycoon - Main Bootstrapper
 * * This file acts as the execution entry point. By using ES6 modules,
 * we ensure that dependencies are loaded cleanly without polluting the global scope.
 */
window.addEventListener('DOMContentLoaded', () => {
    // 1. Instantiate the master game orchestrator
    const game = new Game();
    
    // 2. Expose the game instance globally *only* for developer console debugging
    // This lets us inspect state during development (e.g., typing window.GAME in console)
    window.GAME = game;

    // 3. Fire up the engine initialization sequence
    game.init().catch(error => {
        // Catch-all safety net for system critical failures during boot
        console.error("Master Boot Failure: Initialization sequence aborted.", error);
        
        // Update the loading screen text to inform the player
        const loadingText = document.getElementById('loading-text');
        if (loadingText) {
            loadingText.textContent = "Fatal Boot Error. Please refresh or check console.";
            loadingText.style.color = "#e74c3c";
        }
    });
});
