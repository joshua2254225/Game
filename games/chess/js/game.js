import { createInitialBoard, cloneBoard, inBounds, otherColor, squareName, pieceValue } from "./utils.js";

export class ChessGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      board: createInitialBoard(),
      turn: "w",
      selected: null,
      legalMoves: [],
      castling: {
        wK: true,
        wQ: true,
        bK: true,
        bQ: true,
      },
      enPassant: null,
      status: "playing",
      winner: null,
      lastMove: null,
      history: [],
      captured: {
        w: [],
        b: [],
      },
    };

    return this.state;
  }

  get board() {
    return this.state.board;
  }

  get turn() {
    return this.state.turn;
  }

  get status() {
    return this.state.status;
  }

  clearSelection() {
    this.state.selected = null;
    this.state.legalMoves = [];
  }

  selectSquare(row, col) {
    const piece = this.state.board[row][col];

    if (this.state.status === "checkmate" || this.state.status === "stalemate") {
      return { action: "blocked" };
    }

    if (this.state.selected) {
      const legalMove = this.state.legalMoves.find((move) => move.to.r === row && move.to.c === col);
      if (legalMove) {
        const result = this.makeMove(legalMove);
        return { action: "move", result };
      }
    }

    if (piece && piece.color === this.state.turn) {
      this.state.selected = { r: row, c: col };
      this.state.legalMoves = this.getLegalMovesFrom(row, col);
      return { action: "select" };
    }

    this.clearSelection();
    return { action: "clear" };
  }

  getLegalMovesFrom(row, col) {
    return this.generateLegalMoves(this.state.turn).filter((move) => move.from.r === row && move.from.c === col);
  }

  generateLegalMoves(color = this.state.turn, state = this.state) {
    const pseudo = [];

    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const piece = state.board[r][c];
        if (!piece || piece.color !== color) continue;
        pseudo.push(...this._pseudoMovesForPiece(state, r, c, piece));
      }
    }

    const legal = [];
    for (const move of pseudo) {
      const temp = this._cloneState(state);
      this._applyMove(temp, move, { skipStatus: true });
      if (!this._isInCheck(temp.board, color)) {
        legal.push(move);
      }
    }

    return legal;
  }

  makeMove(move) {
    if (!move) return { ok: false, reason: "invalid-move" };

    const legalMoves = this.generateLegalMoves(this.state.turn);
    const normalized = legalMoves.find(
      (candidate) =>
        candidate.from.r === move.from.r &&
        candidate.from.c === move.from.c &&
        candidate.to.r === move.to.r &&
        candidate.to.c === move.to.c &&
        candidate.promotion === move.promotion &&
        candidate.castle === move.castle &&
        candidate.enPassant === move.enPassant
    );

    if (!normalized) {
      return { ok: false, reason: "not-legal" };
    }

    const stateBefore = this._cloneState(this.state);
    this._applyMove(this.state, normalized, { skipStatus: false });
    this.state.lastMove = normalized;
    this.state.selected = null;
    this.state.legalMoves = [];

    const notation = this._moveToNotation(normalized, stateBefore, this.state);
    this.state.history.push(notation);

    return { ok: true, move: normalized, notation };
  }

  getStatusText() {
    if (this.state.status === "checkmate") {
      return `${this.state.winner === "w" ? "White" : "Black"} wins by checkmate.`;
    }
    if (this.state.status === "stalemate") {
      return "Stalemate. Draw.";
    }

    const turnText = this.state.turn === "w" ? "White" : "Black";
    const checkSuffix = this._isInCheck(this.state.board, this.state.turn) ? " — check!" : "";
    return `${turnText} to move.${checkSuffix}`;
  }

  getCapturedSummary() {
    return {
      whiteCaptured: [...this.state.captured.w],
      blackCaptured: [...this.state.captured.b],
    };
  }

  toFEN() {
    const rows = [];
    for (let r = 0; r < 8; r += 1) {
      let empty = 0;
      let rowStr = "";
      for (let c = 0; c < 8; c += 1) {
        const piece = this.state.board[r][c];
        if (!piece) {
          empty += 1;
          continue;
        }

        if (empty > 0) {
          rowStr += empty;
          empty = 0;
        }

        const symbol = piece.color === "w" ? piece.type.toUpperCase() : piece.type;
        rowStr += symbol;
      }

      if (empty > 0) rowStr += empty;
      rows.push(rowStr);
    }

    const castling = [
      this.state.castling.wK ? "K" : "",
      this.state.castling.wQ ? "Q" : "",
      this.state.castling.bK ? "k" : "",
      this.state.castling.bQ ? "q" : "",
    ].join("") || "-";

    const enPassant = this.state.enPassant ? squareName(this.state.enPassant.r, this.state.enPassant.c) : "-";
    return `${rows.join("/")}` +
      ` ${this.state.turn}` +
      ` ${castling}` +
      ` ${enPassant}` +
      ` 0 1`;
  }

  _cloneState(state) {
    return {
      board: cloneBoard(state.board),
      turn: state.turn,
      selected: state.selected ? { ...state.selected } : null,
      legalMoves: state.legalMoves.map((move) => ({
        ...move,
        from: { ...move.from },
        to: { ...move.to },
        piece: { ...move.piece },
        capture: move.capture ? { ...move.capture } : null,
      })),
      castling: { ...state.castling },
      enPassant: state.enPassant ? { ...state.enPassant } : null,
      status: state.status,
      winner: state.winner,
      lastMove: state.lastMove
        ? {
            ...state.lastMove,
            from: { ...state.lastMove.from },
            to: { ...state.lastMove.to },
            piece: { ...state.lastMove.piece },
            capture: state.lastMove.capture ? { ...state.lastMove.capture } : null,
          }
        : null,
      history: [...state.history],
      captured: {
        w: [...state.captured.w],
        b: [...state.captured.b],
      },
    };
  }

  _applyMove(state, move, { skipStatus = false } = {}) {
    const board = state.board;
    const piece = board[move.from.r][move.from.c];
    const target = board[move.to.r][move.to.c];
    const movingColor = piece.color;
    const enemy = otherColor(movingColor);

    if (!piece) {
      throw new Error("Missing piece on source square.");
    }

    // capture bookkeeping
    let capturedPiece = target ? { ...target } : null;

    if (move.enPassant) {
      const captureRow = move.from.r;
      const captureCol = move.to.c;
      capturedPiece = board[captureRow][captureCol] ? { ...board[captureRow][captureCol] } : null;
      board[captureRow][captureCol] = null;
    }

    if (capturedPiece) {
      state.captured[capturedPiece.color].push(capturedPiece.type);
    }

    // move the piece
    board[move.from.r][move.from.c] = null;
    board[move.to.r][move.to.c] = { ...piece };

    // castling rook move
    if (move.castle === "kingside") {
      const rookFrom = { r: move.from.r, c: 7 };
      const rookTo = { r: move.from.r, c: 5 };
      board[rookTo.r][rookTo.c] = board[rookFrom.r][rookFrom.c];
      board[rookFrom.r][rookFrom.c] = null;
    } else if (move.castle === "queenside") {
      const rookFrom = { r: move.from.r, c: 0 };
      const rookTo = { r: move.from.r, c: 3 };
      board[rookTo.r][rookTo.c] = board[rookFrom.r][rookFrom.c];
      board[rookFrom.r][rookFrom.c] = null;
    }

    // promotion
    if (move.promotion) {
      board[move.to.r][move.to.c] = { type: move.promotion, color: movingColor };
    }

    // update castling rights
    if (piece.type === "k") {
      if (movingColor === "w") {
        state.castling.wK = false;
        state.castling.wQ = false;
      } else {
        state.castling.bK = false;
        state.castling.bQ = false;
      }
    }

    if (piece.type === "r") {
      if (movingColor === "w") {
        if (move.from.r === 7 && move.from.c === 0) state.castling.wQ = false;
        if (move.from.r === 7 && move.from.c === 7) state.castling.wK = false;
      } else {
        if (move.from.r === 0 && move.from.c === 0) state.castling.bQ = false;
        if (move.from.r === 0 && move.from.c === 7) state.castling.bK = false;
      }
    }

    if (capturedPiece && capturedPiece.type === "r") {
      if (capturedPiece.color === "w") {
        if (move.to.r === 7 && move.to.c === 0) state.castling.wQ = false;
        if (move.to.r === 7 && move.to.c === 7) state.castling.wK = false;
      } else {
        if (move.to.r === 0 && move.to.c === 0) state.castling.bQ = false;
        if (move.to.r === 0 && move.to.c === 7) state.castling.bK = false;
      }
    }

    // en passant setup
    state.enPassant = null;
    if (piece.type === "p" && Math.abs(move.to.r - move.from.r) === 2) {
      state.enPassant = {
        r: (move.from.r + move.to.r) / 2,
        c: move.from.c,
      };
    }

    state.turn = enemy;

    if (skipStatus) return;

    const nextLegal = this.generateLegalMoves(state.turn, state);
    const nextInCheck = this._isInCheck(state.board, state.turn);

    if (nextLegal.length === 0) {
      state.status = nextInCheck ? "checkmate" : "stalemate";
      state.winner = nextInCheck ? movingColor : null;
      return;
    }

    state.status = nextInCheck ? "check" : "playing";
    state.winner = null;
  }

  _pseudoMovesForPiece(state, row, col, piece) {
    const moves = [];
    const board = state.board;
    const enemy = otherColor(piece.color);

    const pushMove = (toRow, toCol, extras = {}) => {
      if (!inBounds(toRow, toCol)) return;
      const target = board[toRow][toCol];
      if (target && target.color === piece.color) return;

      moves.push({
        from: { r: row, c: col },
        to: { r: toRow, c: toCol },
        piece: { ...piece },
        capture: target ? { ...target } : null,
        ...extras,
      });
    };

    if (piece.type === "p") {
      const dir = piece.color === "w" ? -1 : 1;
      const startRow = piece.color === "w" ? 6 : 1;
      const promotionRow = piece.color === "w" ? 0 : 7;

      const oneStep = row + dir;
      if (inBounds(oneStep, col) && !board[oneStep][col]) {
        if (oneStep === promotionRow) {
          for (const promo of ["q", "r", "b", "n"]) {
            pushMove(oneStep, col, { promotion: promo });
          }
        } else {
          pushMove(oneStep, col);
        }

        const twoStep = row + dir * 2;
        if (row === startRow && !board[twoStep][col]) {
          pushMove(twoStep, col, { pawnDouble: true });
        }
      }

      for (const deltaCol of [-1, 1]) {
        const captureRow = row + dir;
        const captureCol = col + deltaCol;
        if (!inBounds(captureRow, captureCol)) continue;
        const target = board[captureRow][captureCol];

        if (target && target.color === enemy) {
          if (captureRow === promotionRow) {
            for (const promo of ["q", "r", "b", "n"]) {
              pushMove(captureRow, captureCol, { promotion: promo });
            }
          } else {
            pushMove(captureRow, captureCol);
          }
        }

        if (state.enPassant && state.enPassant.r === captureRow && state.enPassant.c === captureCol) {
          moves.push({
            from: { r: row, c: col },
            to: { r: captureRow, c: captureCol },
            piece: { ...piece },
            capture: { type: "p", color: enemy },
            enPassant: true,
          });
        }
      }

      return moves;
    }

    if (piece.type === "n") {
      const jumps = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ];
      for (const [dr, dc] of jumps) {
        pushMove(row + dr, col + dc);
      }
      return moves;
    }

    if (piece.type === "b" || piece.type === "r" || piece.type === "q") {
      const directions = [];
      if (piece.type === "b" || piece.type === "q") directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
      if (piece.type === "r" || piece.type === "q") directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);

      for (const [dr, dc] of directions) {
        let r = row + dr;
        let c = col + dc;
        while (inBounds(r, c)) {
          const target = board[r][c];
          if (!target) {
            pushMove(r, c);
          } else {
            if (target.color !== piece.color) pushMove(r, c);
            break;
          }
          r += dr;
          c += dc;
        }
      }

      return moves;
    }

    if (piece.type === "k") {
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          pushMove(row + dr, col + dc);
        }
      }

      const isInCheckNow = this._isInCheck(board, piece.color);

      if (!isInCheckNow) {
        const backRank = piece.color === "w" ? 7 : 0;
        const enemyColor = otherColor(piece.color);

        // kingside castling
        const kingsideRight = piece.color === "w" ? state.castling.wK : state.castling.bK;
        if (kingsideRight) {
          const f1 = board[backRank][5];
          const g1 = board[backRank][6];
          const rook = board[backRank][7];
          if (!f1 && !g1 && rook && rook.type === "r" && rook.color === piece.color) {
            const squaresSafe = !this._isSquareAttacked(board, backRank, 5, enemyColor) &&
                                !this._isSquareAttacked(board, backRank, 6, enemyColor);
            if (squaresSafe) {
              moves.push({
                from: { r: row, c: col },
                to: { r: backRank, c: 6 },
                piece: { ...piece },
                castle: "kingside",
              });
            }
          }
        }

        // queenside castling
        const queensideRight = piece.color === "w" ? state.castling.wQ : state.castling.bQ;
        if (queensideRight) {
          const b1 = board[backRank][1];
          const c1 = board[backRank][2];
          const d1 = board[backRank][3];
          const rook = board[backRank][0];
          if (!b1 && !c1 && !d1 && rook && rook.type === "r" && rook.color === piece.color) {
            const squaresSafe = !this._isSquareAttacked(board, backRank, 3, enemyColor) &&
                                !this._isSquareAttacked(board, backRank, 2, enemyColor);
            if (squaresSafe) {
              moves.push({
                from: { r: row, c: col },
                to: { r: backRank, c: 2 },
                piece: { ...piece },
                castle: "queenside",
              });
            }
          }
        }
      }

      return moves;
    }

    return moves;
  }

  _findKing(board, color) {
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const piece = board[r][c];
        if (piece && piece.color === color && piece.type === "k") {
          return { r, c };
        }
      }
    }
    return null;
  }

  _isInCheck(board, color) {
    const king = this._findKing(board, color);
    if (!king) return false;
    return this._isSquareAttacked(board, king.r, king.c, otherColor(color));
  }

  _isSquareAttacked(board, row, col, byColor) {
    const pawnDir = byColor === "w" ? -1 : 1;
    const pawnRow = row - pawnDir;
    for (const dc of [-1, 1]) {
      const c = col + dc;
      if (inBounds(pawnRow, c)) {
        const piece = board[pawnRow][c];
        if (piece && piece.color === byColor && piece.type === "p") return true;
      }
    }

    const knightJumps = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of knightJumps) {
      const r = row + dr;
      const c = col + dc;
      if (!inBounds(r, c)) continue;
      const piece = board[r][c];
      if (piece && piece.color === byColor && piece.type === "n") return true;
    }

    const directions = [
      [-1, 0, ["r", "q"]],
      [1, 0, ["r", "q"]],
      [0, -1, ["r", "q"]],
      [0, 1, ["r", "q"]],
      [-1, -1, ["b", "q"]],
      [-1, 1, ["b", "q"]],
      [1, -1, ["b", "q"]],
      [1, 1, ["b", "q"]],
    ];

    for (const [dr, dc, validTypes] of directions) {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c)) {
        const piece = board[r][c];
        if (piece) {
          if (piece.color === byColor && validTypes.includes(piece.type)) {
            return true;
          }
          break;
        }
        r += dr;
        c += dc;
      }
    }

    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        const piece = board[r][c];
        if (piece && piece.color === byColor && piece.type === "k") return true;
      }
    }

    return false;
  }

  _moveToNotation(move, stateBefore, stateAfter) {
    if (move.castle === "kingside") {
      return this._appendCheckSuffix("O-O", stateAfter);
    }
    if (move.castle === "queenside") {
      return this._appendCheckSuffix("O-O-O", stateAfter);
    }

    const piece = move.piece;
    const pieceLetter = { p: "", n: "N", b: "B", r: "R", q: "Q", k: "K" }[piece.type] ?? "";
    const destination = squareName(move.to.r, move.to.c);
    const isCapture = Boolean(move.capture || move.enPassant);
    const fromFile = String.fromCharCode(97 + move.from.c);
    let notation = "";

    if (piece.type === "p" && isCapture) {
      notation = `${fromFile}x${destination}`;
    } else {
      notation = `${pieceLetter}${isCapture ? "x" : ""}${destination}`;
    }

    if (move.promotion) {
      notation += `=${move.promotion.toUpperCase()}`;
    }

    return this._appendCheckSuffix(notation, stateAfter);
  }

  _appendCheckSuffix(notation, stateAfter) {
    if (stateAfter.status === "checkmate") return `${notation}#`;
    if (stateAfter.status === "check") return `${notation}+`;
    return notation;
  }
}
