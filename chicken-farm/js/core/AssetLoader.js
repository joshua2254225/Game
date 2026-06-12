// js/core/AssetLoader.js
// Loads images, sounds, and other assets with progress tracking.

export class AssetLoader {
  constructor() {
    this.images = new Map();
    this.sounds = new Map();
    this.data = new Map();

    this.totalAssets = 0;
    this.loadedAssets = 0;
    this.onProgress = null;
    this.onComplete = null;
  }

  setProgressCallback(callback) {
    this.onProgress = typeof callback === "function" ? callback : null;
  }

  setCompleteCallback(callback) {
    this.onComplete = typeof callback === "function" ? callback : null;
  }

  getProgress() {
    if (this.totalAssets === 0) return 0;
    return this.loadedAssets / this.totalAssets;
  }

  emitProgress() {
    if (this.onProgress) {
      this.onProgress({
        loaded: this.loadedAssets,
        total: this.totalAssets,
        progress: this.getProgress()
      });
    }
  }

  emitComplete() {
    if (this.onComplete) {
      this.onComplete({
        loaded: this.loadedAssets,
        total: this.totalAssets,
        progress: this.getProgress()
      });
    }
  }

  async loadImage(name, src) {
    this.totalAssets += 1;

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        this.images.set(name, img);
        this.loadedAssets += 1;
        this.emitProgress();
        resolve(img);
      };

      img.onerror = () => {
        this.loadedAssets += 1;
        this.emitProgress();
        reject(new Error(`Failed to load image: ${src}`));
      };

      img.src = src;
    });
  }

  async loadSound(name, src) {
    this.totalAssets += 1;

    try {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Failed to fetch sound: ${src}`);
      }

      const audioData = await response.arrayBuffer();
      this.sounds.set(name, audioData);

      this.loadedAssets += 1;
      this.emitProgress();
      return audioData;
    } catch (error) {
      this.loadedAssets += 1;
      this.emitProgress();
      throw error;
    }
  }

  async loadJSON(name, src) {
    this.totalAssets += 1;

    try {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Failed to fetch JSON: ${src}`);
      }

      const json = await response.json();
      this.data.set(name, json);

      this.loadedAssets += 1;
      this.emitProgress();
      return json;
    } catch (error) {
      this.loadedAssets += 1;
      this.emitProgress();
      throw error;
    }
  }

  async loadText(name, src) {
    this.totalAssets += 1;

    try {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Failed to fetch text: ${src}`);
      }

      const text = await response.text();
      this.data.set(name, text);

      this.loadedAssets += 1;
      this.emitProgress();
      return text;
    } catch (error) {
      this.loadedAssets += 1;
      this.emitProgress();
      throw error;
    }
  }

  async loadBatch(items = []) {
    const tasks = items.map((item) => {
      const type = (item.type || "").toLowerCase();

      if (type === "image") {
        return this.loadImage(item.name, item.src);
      }

      if (type === "sound") {
        return this.loadSound(item.name, item.src);
      }

      if (type === "json") {
        return this.loadJSON(item.name, item.src);
      }

      if (type === "text") {
        return this.loadText(item.name, item.src);
      }

      return Promise.reject(new Error(`Unknown asset type: ${item.type}`));
    });

    const results = await Promise.allSettled(tasks);
    this.emitComplete();
    return results;
  }

  getImage(name) {
    return this.images.get(name) || null;
  }

  getSound(name) {
    return this.sounds.get(name) || null;
  }

  getData(name) {
    return this.data.get(name) || null;
  }

  hasImage(name) {
    return this.images.has(name);
  }

  hasSound(name) {
    return this.sounds.has(name);
  }

  hasData(name) {
    return this.data.has(name);
  }

  clear() {
    this.images.clear();
    this.sounds.clear();
    this.data.clear();
    this.totalAssets = 0;
    this.loadedAssets = 0;
  }
}
