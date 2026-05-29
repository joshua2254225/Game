import { createGame } from "./game.js";
import { renderBoard } from "./board.js";
import { initStockfish, getBestMove } from "./ai.js";

// DOM
const boardEl = document.getElementById("board");
const newGameBtn = document.getElementById("newGameBtn");
const flipBtn = document.getElementById("flipBtn");
const modeSelect = document.getElementById("modeSelect");
const aiColorSelect = document.getElementById("aiColorSelect");
const statusText = document.getElementById("statusText");
const capturedWhiteEl = document.getElementById("capturedWhite");
const capturedBlackEl = document.getElementById("capturedBlack");
const historyListEl = document.getElementById("historyList");

// State
let game = createGame();
let flipped = false;
let aiThinking = false;

const PIECE_SYMBOLS_WHITE = {
  p: "♙",
  n: "♘",
  b: "♗",
  r: "♖",
  q: "♕",
  k: "♔",
};

const PIECE_SYMBOLS_BLACK = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

init();

function init() {
  if (!boardEl) {
    throw new Error('Missing #board element in index.html');
  }

  initStockfish();

  newGameBtn?.addEventListener("click", startNewGame);
  flipBtn?.addEventListener("click", toggleFlip);
  modeSelect?.addEventListener("change", handleModeChange);
  aiColorSelect?.addEventListener("change", handleModeChange);
  window.addEventListener("resize", handleResize);

  renderAll();

  if (modeSelect?.value === "ai" && game.state.turn === aiColorSelect.value) {
    maybeMakeAIMove();
  }
}

function renderAll() {
  renderBoard(boardEl, game, flipped, handleSquareClick);
  updateSidePanels();
}

function updateSidePanels() {
  const baseStatus = game.getStatusText();
  const aiColor = aiColorSelect?.value ?? "b";
  const aiActive = modeSelect?.value === "ai";
  const aiToMove = game.state.turn === aiColor;

  if (game.state.status === "checkmate" || game.state.status === "stalemate") {
    statusText.textContent = baseStatus;
  } else if (aiThinking && aiActive && aiToMove) {
    statusText.textContent = `${baseStatus} — Stockfish thinking...`;
  } else {
    statusText.textContent = baseStatus;
  }

  renderCapturedPieces();
  renderHistory();
}

function renderCapturedPieces() {
  const summary = game.getCapturedSummary();

  capturedWhiteEl.innerHTML = "";
  capturedBlackEl.innerHTML = "";

  for (const type of summary.whiteCaptured) {
    const span = document.createElement("span");
    span.textContent = PIECE_SYMBOLS_BLACK[type] ?? type;
    capturedWhiteEl.appendChild(span);
  }

  for (const type of summary.blackCaptured) {
    const span = document.createElement("span");
    span.textContent = PIECE_SYMBOLS_WHITE[type] ?? type;
    capturedBlackEl.appendChild(span);
  }
}

function renderHistory() {
  historyListEl.innerHTML = "";

  game.state.history.forEach((move, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${move}`;
    historyListEl.appendChild(li);
  });
}

function startNewGame() {
  aiThinking = false;
  game = createGame();
  renderAll();

  if (modeSelect?.value === "ai" && game.state.turn === aiColorSelect.value) {
    maybeMakeAIMove();
  }
}

function toggleFlip() {
  flipped = !flipped;
  renderAll();
}

function handleModeChange() {
  renderAll();

  if (
    modeSelect?.value === "ai" &&
    game.state.status !== "checkmate" &&
    game.state.status !== "stalemate" &&
    game.state.turn === aiColorSelect.value
  ) {
    maybeMakeAIMove();
  }
}

function handleSquareClick(row, col) {
  if (modeSelect?.value === "ai" && aiThinking) {
    return;
  }

  const result = game.selectSquare(row, col);

  renderAll();

  if (
    result?.action === "move" &&
    modeSelect?.value === "ai" &&
    game.state.status !== "checkmate" &&
    game.state.status !== "stalemate"
  ) {
    maybeMakeAIMove();
  }
}

async function maybeMakeAIMove(retry = 0) {
  if (modeSelect?.value !== "ai") return;
  if (game.state.status === "checkmate" || game.state.status === "stalemate") return;

  const aiColor = aiColorSelect?.value ?? "b";
  if (game.state.turn !== aiColor) return;
  if (aiThinking) return;

  aiThinking = true;
  updateSidePanels();

  try {
    const fen = game.toFEN();
    const bestMove = await getBestMove(fen, 10);

    if (!bestMove) {
      if (retry < 40 && modeSelect?.value === "ai" && game.state.turn === aiColor) {
        setTimeout(() => {
          aiThinking = false;
          maybeMakeAIMove(retry + 1);
        }, 250);
      }
      return;
    }

    const applied = applyStockfishMove(bestMove);

    renderAll();

    if (!applied) {
      console.warn("Stockfish move could not be applied:", bestMove);
    }
  } catch (error) {
    console.error("AI move error:", error);
  } finally {
    aiThinking = false;
    updateSidePanels();
  }
}

function applyStockfishMove(moveStr) {
  if (!moveStr || moveStr.length < 4) return false;
  if (moveStr === "0000") return false;

  const from = algebraicToCoords(moveStr.slice(0, 2));
  const to = algebraicToCoords(moveStr.slice(2, 4));
  const promotion = moveStr.length >= 5 ? moveStr[4].toLowerCase() : null;

  if (!from || !to) return false;

  const legalMoves = game.generateLegalMoves(game.state.turn);

  let move =
    legalMoves.find(
      (m) =>
        m.from.r === from.r &&
        m.from.c === from.c &&
        m.to.r === to.r &&
        m.to.c === to.c &&
        m.promotion === promotion
    ) ||
    legalMoves.find(
      (m) =>
        m.from.r === from.r &&
        m.from.c === from.c &&
        m.to.r === to.r &&
        m.to.c === to.c
    );

  if (!move) {
    return false;
  }

  const result = game.makeMove(move);
  return Boolean(result?.ok);
}

function algebraicToCoords(square) {
  if (!square || square.length !== 2) return null;

  const file = square[0].toLowerCase();
  const rank = Number.parseInt(square[1], 10);

  if (!Number.isInteger(rank) || rank < 1 || rank > 8) return null;

  const c = file.charCodeAt(0) - 97;
  const r = 8 - rank;

  if (c < 0 || c > 7 || r < 0 || r > 7) return null;

  return { r, c };
}

function handleResize() {
  renderAll();
}
