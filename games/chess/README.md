# Arcade Chess Starter

A modular chess starter built with vanilla HTML, CSS, and JavaScript.

## Included files

- `index.html`
- `style.css`
- `js/game.js` — chess rules and game state
- `js/board.js` — board rendering
- `js/ai.js` — fallback AI + Stockfish hook
- `js/multiplayer.js` — Firebase placeholder
- `js/utils.js` — helpers
- `stockfish/README.md` — where to place the engine later

## Run locally

Because the project uses ES modules, open it through a local server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Next steps

- Add `stockfish/stockfish.js` to enable the Stockfish worker path.
- Wire Firebase in `js/multiplayer.js` for online matches.
- Add UI polish, clocks, matchmaking, and rematches.
