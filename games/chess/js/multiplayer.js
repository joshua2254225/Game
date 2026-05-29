// Firebase / multiplayer hooks live here later.
// This file intentionally stays lightweight so you can grow it without
// mixing online logic into the chess rules or board rendering.

export function createMultiplayerAdapter() {
  return {
    mode: "offline-placeholder",
    async init() {
      return { ok: true, message: "Multiplayer adapter placeholder loaded." };
    },
    async host() {
      throw new Error("Firebase multiplayer is not wired yet.");
    },
    async join() {
      throw new Error("Firebase multiplayer is not wired yet.");
    },
    async sendMove() {
      throw new Error("Firebase multiplayer is not wired yet.");
    },
    listen() {
      return () => {};
    },
  };
}
