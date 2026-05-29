let engine = null;
let ready = false;

// ------------------------------
// INIT STOCKFISH ENGINE
// ------------------------------
export function initStockfish() {
  engine = new Worker("./stockfish/stockfish.js");

  engine.postMessage("uci");

  engine.onmessage = (event) => {
    const line = event.data;

    if (line === "uciok") {
      engine.postMessage("isready");
    }

    if (line === "readyok") {
      ready = true;
      console.log("♟️ Stockfish ready");
    }
  };
}

// ------------------------------
// GET BEST MOVE FROM POSITION
// ------------------------------
export function getBestMove(fen, depth = 10) {
  return new Promise((resolve) => {
    if (!engine || !ready) {
      console.warn("Stockfish not ready yet");
      return resolve(null);
    }

    engine.onmessage = (event) => {
      const line = event.data;

      // Example: bestmove e2e4
      if (line.startsWith("bestmove")) {
        const move = line.split(" ")[1];
        resolve(move);
      }
    };

    engine.postMessage("position fen " + fen);
    engine.postMessage("go depth " + depth);
  });
}

// ------------------------------
// OPTIONAL: STOP ENGINE
// ------------------------------
export function stopEngine() {
  if (engine) {
    engine.terminate();
    engine = null;
    ready = false;
  }
      }
