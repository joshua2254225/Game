/*js/main.js*/
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LAVA JUMP — Entry Point
 *
 * Boot order:
 *   1. Controls  — sets up joystick, jump button, keyboard
 *   2. Game      — builds Three.js scene, starts render loop
 *   3. UI        — wires up menus, HUD, and game callbacks
 *
 * The lava scene renders immediately behind the main menu,
 * so the player sees animated lava before they press Play.
 * ══════════════════════════════════════════════════════════════════════════
 */

window.addEventListener('DOMContentLoaded', () => {

  const canvas = document.getElementById('game-canvas');

  // 1 — Input handler (touch + keyboard)
  const controls = new Controls();

  // 2 — 3D game engine (Three.js) — render loop starts here
  const game = new Game(canvas, controls);

  // 3 — UI / menu / HUD manager
  const ui = new UI(game, controls);

  // Pre-load level 1 into the scene (paused) so the menu has a
  // live lava background instead of a black canvas.
  game.loadLevel(LEVELS[0]);
  game.pause();

  // Expose for quick browser-console debugging during development
  window._lavaJump = { game, controls, ui, LEVELS };

});
