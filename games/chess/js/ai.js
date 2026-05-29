import { otherColor, pieceValue, cloneBoard } from "./utils.js";

function evaluateBoard(board, color) {
  let score = 0;

  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const value = pieceValue(piece.type);
      score += piece.color === color ? value : -value;
    }
  }

  return score;
}

function moveScore(move) {
  let score = 0;

  if (move.capture) {
    score += pieceValue(move.capture.type) * 10 - pieceValue(move.piece.type);
  }

  if (move.promotion) {
    score += pieceValue(move.promotion) || 0;
  }

  if (move.castle) {
    score += 30;
  }

  return score;
}

function fallbackMove(game, color) {
  const legal = game.generateLegalMoves(color);
  if (!legal.length) return null;

  let bestMoves = [];
  let bestScore = -Infinity;

  for (const move of legal) {
    const temp = game._cloneState(game.state);
    game._applyMove(temp, move, { skipStatus: true });
    let score = evaluateBoard(temp.board, color) + moveScore(move);

    // Prefer delivering check or mate.
    const enemy = otherColor(color);
    const enemyLegal = game.generateLegalMoves(enemy, temp);
    const enemyInCheck = game._isInCheck(temp.board, enemy);
    if (enemyLegal.length === 0 && enemyInCheck) score += 20000;
    if (enemyInCheck) score += 120;

    // Mild randomness to avoid identical games.
    score += Math.random() * 8;

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

async function tryStockfish(game, color, options = {}) {
  const engineUrl = options.engineUrl || "./stockfish/stockfish.js";
  if (typeof Worker === "undefined") {
    throw new Error("Web Workers not available.");
  }

  const worker = new Worker(engineUrl);
  const board = game.toFEN();
  const skill = Number.isFinite(options.depth) ? options.depth : 10;

  return await new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        worker.terminate();
        reject(new Error("Stockfish timeout."));
      }
    }, options.timeoutMs ?? 4000);

    worker.onmessage = (event) => {
      const line = String(event.data || "");
      if (line.startsWith("bestmove")) {
        const parts = line.split(" ");
        const uci = parts[1];
        resolved = true;
        clearTimeout(timer);
        worker.terminate();
        resolve(uci);
      }
    };

    worker.onerror = (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        worker.terminate();
        reject(err);
      }
    };

    worker.postMessage("uci");
    worker.postMessage("isready");
    worker.postMessage(`position fen ${board}`);
    worker.postMessage(`go depth ${skill}`);
  });
}

export async function getAIMove(game, color, options = {}) {
  const legalMoves = game.generateLegalMoves(color);
  if (!legalMoves.length) return null;

  if (options.useStockfish) {
    try {
      const uci = await tryStockfish(game, color, options);
      const move = legalMoves.find((m) => {
        const from = String.fromCharCode(97 + m.from.c) + (8 - m.from.r);
        const to = String.fromCharCode(97 + m.to.c) + (8 - m.to.r);
        const promo = m.promotion ? m.promotion : "";
        return `${from}${to}${promo}` === uci;
      });
      if (move) return move;
    } catch (error) {
      console.warn("Stockfish unavailable, using fallback AI.", error);
    }
  }

  return fallbackMove(game, color);
}
