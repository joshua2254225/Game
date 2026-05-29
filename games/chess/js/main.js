import { createGame } from "./game.js";
import { renderBoard } from "./board.js";

// DOM
const boardEl = document.getElementById("board");
const newGameBtn = document.getElementById("newGameBtn");
const flipBtn = document.getElementById("flipBtn");
const modeSelect = document.getElementById("modeSelect");
const aiColorSelect = document.getElementById("aiColorSelect");
const statusText = document.getElementById("statusText");

// STATE
let game = createGame();
let flipped = false;

// ----------------------
// INIT
// ----------------------
init();

function init() {
  render();
  updateStatus();

  newGameBtn.addEventListener("click", startNewGame);
  flipBtn.addEventListener("click", toggleFlip);

  window.addEventListener("resize", handleResize);
}

// ----------------------
// RENDER
// ----------------------
function render() {
  renderBoard(boardEl, game, flipped, handleSquareClick);
}

// ----------------------
// GAME CONTROLS
// ----------------------
function startNewGame() {
  game = createGame();
  render();
  updateStatus();
}

function toggleFlip() {
  flipped = !flipped;
  render();
}

// ----------------------
// CLICK HANDLING
// ----------------------
function handleSquareClick(r, c) {
  const moveResult = game.selectSquare(r, c);

  if (!moveResult) {
    render();
    return;
  }

  render();
  updateStatus();

  // 🤖 AI TURN (optional)
  if (modeSelect.value === "ai") {
    maybeMakeAIMove();
  }
}

// ----------------------
// STATUS
// ----------------------
function updateStatus() {
  const turn = game.state.turn === "white" ? "White" : "Black";
  statusText.textContent = `${turn} to move`;
}

// ----------------------
// AI (Stockfish später)
// ----------------------
function maybeMakeAIMove() {
  const aiColor = aiColorSelect.value;

  if (game.state.turn !== aiColor) return;

  // ⏳ kleine Verzögerung für "natürliches" Gefühl
  setTimeout(() => {
    // TEMP: random move (bis Stockfish drin ist)
    const moves = game.state.legalMoves;
    if (!moves.length) return;

    const randomMove = moves[Math.floor(Math.random() * moves.length)];
    game.makeMove(randomMove);

    render();
    updateStatus();
  }, 300);
}

// ----------------------
// MOBILE FIX (wichtig!)
// ----------------------
function handleResize() {
  // sorgt dafür, dass das Board IMMER korrekt bleibt
  // (triggert Reflow sauber)
  boardEl.style.display = "none";
  requestAnimationFrame(() => {
    boardEl.style.display = "grid";
  });
}
