export const PIECE_SYMBOLS = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

export function otherColor(color) {
  return color === "w" ? "b" : "w";
}

export function inBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

export function squareName(row, col) {
  const file = String.fromCharCode(97 + col);
  const rank = 8 - row;
  return `${file}${rank}`;
}

export function createInitialBoard() {
  const empty = Array.from({ length: 8 }, () => Array(8).fill(null));
  const board = cloneBoard(empty);

  const backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];
  for (let c = 0; c < 8; c += 1) {
    board[0][c] = { type: backRank[c], color: "b" };
    board[1][c] = { type: "p", color: "b" };
    board[6][c] = { type: "p", color: "w" };
    board[7][c] = { type: backRank[c], color: "w" };
  }

  return board;
}

export function pieceValue(type) {
  return { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }[type] ?? 0;
}

export function moveKey(move) {
  return `${move.from.r},${move.from.c}->${move.to.r},${move.to.c}`;
}
