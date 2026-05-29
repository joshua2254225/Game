import { ChessGame } from "./game.js";
import { renderBoard } from "./board.js";
import { getAIMove } from "./ai.js";

const game = new ChessGame();

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("statusText");
const capturedWhiteEl = document.getElementById("capturedWhite");
const capturedBlackEl = document.getElementById("capturedBlack");
const historyListEl = document.getElementById("historyList");
const newGameBtn = document.getElementById("newGameBtn");
const flipBtn = document.getElementById("flipBtn");
const modeSelect = document.getElementById("modeSelect");
const aiColorSelect = document.getElementById("aiColorSelect");

let flipped = false;
let mode = "local";
let aiColor = "b";
let aiThinking = false;

function renderUI() {
  renderBoard(boardEl, game, flipped, onSquareClick);
  statusEl.textContent = game.getStatusText();

  const captured = game.getCapturedSummary();
  capturedWhiteEl.textContent = captured.whiteCaptured.map((t) => ({
    p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚",
  }[t] ?? t)).join(" ");
  capturedBlackEl.textContent = captured.blackCaptured.map((t) => ({
    p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔",
  }[t] ?? t)).join(" ");

  historyListEl.innerHTML = "";
  game.state.history.forEach((notation, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${notation}`;
    historyListEl.appendChild(li);
  });
}

function updateModeFromUI() {
  mode = modeSelect.value;
  aiColor = aiColorSelect.value;
  maybeTriggerAI();
  renderUI();
}

async function maybeTriggerAI() {
  if (mode !== "ai") return;
  if (game.state.status === "checkmate" || game.state.status === "stalemate") return;
  if (game.turn !== aiColor) return;
  if (aiThinking) return;

  aiThinking = true;
  try {
    const move = await getAIMove(game, aiColor, {
      useStockfish: false,
      depth: 10,
      timeoutMs: 3500,
    });

    if (move) {
      game.makeMove(move);
    }
  } finally {
    aiThinking = false;
    renderUI();

    // If AI just played and it is still AI turn due to a bug or promotion flow,
    // this keeps the UI responsive rather than locking up.
  }
}

function onSquareClick(row, col) {
  if (mode === "ai" && game.turn === aiColor) return;

  const result = game.selectSquare(row, col);
  if (result.action === "move" || result.action === "select" || result.action === "clear") {
    renderUI();
    if (mode === "ai") {
      window.setTimeout(() => {
        maybeTriggerAI();
      }, 160);
    }
  }
}

newGameBtn.addEventListener("click", () => {
  game.reset();
  aiThinking = false;
  renderUI();
  maybeTriggerAI();
});

flipBtn.addEventListener("click", () => {
  flipped = !flipped;
  renderUI();
});

modeSelect.addEventListener("change", updateModeFromUI);
aiColorSelect.addEventListener("change", updateModeFromUI);

// Initial boot
renderUI();
maybeTriggerAI();
