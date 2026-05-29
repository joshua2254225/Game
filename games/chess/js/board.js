import { PIECE_SYMBOLS, squareName, moveKey } from "./utils.js";

export function renderBoard(container, game, flipped = false, onSquareClick) {
  const state = game.state;
  const ranks = flipped ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
  const files = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  const selectedKey = state.selected ? `${state.selected.r},${state.selected.c}` : null;
  const legalTargetKeys = new Map();
  for (const move of state.legalMoves) {
    legalTargetKeys.set(moveKey(move), move);
  }

  container.innerHTML = "";

  for (const r of ranks) {
    for (const c of files) {
      const square = document.createElement("button");
      const squareColor = (r + c) % 2 === 0 ? "light" : "dark";
      const piece = state.board[r][c];
      const squareKey = `${r},${c}`;
      const isSelected = selectedKey === squareKey;
      const move = state.legalMoves.find((m) => m.to.r === r && m.to.c === c);
      const isTarget = Boolean(move);
      const isLastMove = state.lastMove &&
        ((state.lastMove.from.r === r && state.lastMove.from.c === c) ||
         (state.lastMove.to.r === r && state.lastMove.to.c === c));

      square.className = `square ${squareColor}`;
      if (piece) square.classList.add(`${piece.color}-piece`);
      if (isSelected) square.classList.add("selected");
      if (isTarget) {
        square.classList.add(move.capture || move.enPassant ? "capture-target" : "move-target");
      }
      if (isLastMove) square.classList.add("last-move");

      square.setAttribute("type", "button");
      square.setAttribute("aria-label", `${piece ? piece.color + " " + piece.type : "empty"} on ${squareName(r, c)}`);

      square.dataset.row = String(r);
      square.dataset.col = String(c);

      if (piece) {
        const pieceEl = document.createElement("span");
        pieceEl.className = "piece";
        pieceEl.textContent = PIECE_SYMBOLS[piece.color][piece.type];
        square.appendChild(pieceEl);
      }

      if ((r === 7 && !flipped) || (r === 0 && flipped)) {
        const label = document.createElement("span");
        label.className = "coord";
        label.textContent = String.fromCharCode(97 + c);
        square.appendChild(label);
      }

      square.addEventListener("click", () => onSquareClick?.(r, c));
      container.appendChild(square);
    }
  }
}
