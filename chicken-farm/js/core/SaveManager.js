// js/core/SaveManager.js
// Handles saving and loading game state in localStorage with basic versioning.

export class SaveManager {
  constructor(storageKey = "chickenFarm3D_save") {
    this.storageKey = storageKey;
    this.version = 1;
    this.lastSaveTime = null;
  }

  canUseStorage() {
    try {
      const testKey = "__chickenfarm_test__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.warn("[SaveManager] localStorage is not available.", error);
      return false;
    }
  }

  createSavePayload(state = {}) {
    return {
      version: this.version,
      savedAt: new Date().toISOString(),
      state: this.cloneState(state)
    };
  }

  cloneState(state) {
    // Safe deep clone for plain game data.
    try {
      return structuredClone(state);
    } catch (error) {
      return JSON.parse(JSON.stringify(state));
    }
  }

  save(state = {}) {
    if (!this.canUseStorage()) {
      return { success: false, message: "Storage not available." };
    }

    try {
      const payload = this.createSavePayload(state);
      const json = JSON.stringify(payload);

      localStorage.setItem(this.storageKey, json);
      this.lastSaveTime = payload.savedAt;

      return {
        success: true,
        message: "Game saved.",
        savedAt: payload.savedAt,
        size: json.length
      };
    } catch (error) {
      console.error("[SaveManager] Save failed:", error);
      return {
        success: false,
        message: "Could not save game.",
        error
      };
    }
  }

  load() {
    if (!this.canUseStorage()) {
      return { success: false, message: "Storage not available." };
    }

    try {
      const raw = localStorage.getItem(this.storageKey);

      if (!raw) {
        return {
          success: false,
          message: "No save found.",
          data: null
        };
      }

      const parsed = JSON.parse(raw);

      if (!parsed || typeof parsed !== "object") {
        return {
          success: false,
          message: "Invalid save data.",
          data: null
        };
      }

      this.lastSaveTime = parsed.savedAt || null;

      return {
        success: true,
        message: "Game loaded.",
        data: parsed
      };
    } catch (error) {
      console.error("[SaveManager] Load failed:", error);
      return {
        success: false,
        message: "Could not load save.",
        error,
        data: null
      };
    }
  }

  exists() {
    if (!this.canUseStorage()) return false;
    return localStorage.getItem(this.storageKey) !== null;
  }

  remove() {
    if (!this.canUseStorage()) {
      return { success: false, message: "Storage not available." };
    }

    try {
      localStorage.removeItem(this.storageKey);
      this.lastSaveTime = null;

      return {
        success: true,
        message: "Save deleted."
      };
    } catch (error) {
      console.error("[SaveManager] Remove failed:", error);
      return {
        success: false,
        message: "Could not delete save.",
        error
      };
    }
  }

  exportToFile(state = {}) {
    const payload = this.createSavePayload(state);
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    return {
      url,
      filename: `chickenfarm_save_v${this.version}.json`,
      blob
    };
  }

  importFromText(text) {
    try {
      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== "object" || !parsed.state) {
        return {
          success: false,
          message: "File does not contain valid save data.",
          data: null
        };
      }

      return {
        success: true,
        message: "Save file imported.",
        data: parsed
      };
    } catch (error) {
      return {
        success: false,
        message: "Could not parse save file.",
        error,
        data: null
      };
    }
  }

  migrateSaveData(parsedSave) {
    if (!parsedSave || typeof parsedSave !== "object") {
      return null;
    }

    const version = Number(parsedSave.version || 1);
    const state = parsedSave.state || {};

    // Future upgrade path:
    // if (version === 1) { ... }
    // if (version === 2) { ... }

    return {
      version: Math.max(version, this.version),
      savedAt: parsedSave.savedAt || new Date().toISOString(),
      state: {
        money: 500,
        day: 1,
        timeMinutes: 360,
        chickenCount: 0,
        weather: "sunny",
        farmName: "My Chicken Farm",
        chickens: [],
        buildings: [],
        inventory: {
          feed: 25,
          water: 50,
          eggs: 0
        },
        stats: {
          eggsSold: 0,
          totalIncome: 0,
          totalExpenses: 0
        },
        ...state
      }
    };
  }

  loadMigrateAndValidate() {
    const result = this.load();

    if (!result.success || !result.data) {
      return result;
    }

    const migrated = this.migrateSaveData(result.data);

    if (!migrated) {
      return {
        success: false,
        message: "Save data could not be migrated.",
        data: null
      };
    }

    return {
      success: true,
      message: "Save loaded and migrated.",
      data: migrated
    };
  }
}
