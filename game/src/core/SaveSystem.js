export class SaveSystem {
    /**
     * @param {string} saveKey Unique identifier for the LocalStorage slot
     */
    constructor(saveKey = 'ChickenFarmTycoon_SaveData') {
        this.saveKey = saveKey;
        this.currentVersion = '1.0.0'; // Track versioning to prevent legacy breaking changes
    }

    /**
     * Serializes and writes game state data to the browser storage profile.
     * @param {Object} gameState The structural data object from the Game manager
     * @returns {boolean} True if successful, false otherwise
     */
    save(gameState) {
        try {
            const packageData = {
                version: this.currentVersion,
                timestamp: Date.now(),
                data: gameState
            };

            const serializedData = JSON.stringify(packageData);
            localStorage.setItem(this.saveKey, serializedData);
            
            console.log(`Game autosaved successfully at ${new Date(packageData.timestamp).toLocaleTimeString()}`);
            return true;
        } catch (error) {
            console.error("SaveSystem Error: Failed to write data payload to LocalStorage.", error);
            return false;
        }
    }

    /**
     * Fetches, verifies, and parses stored game progress from browser memory.
     * @returns {Object|null} Unpacked data payload if valid, null if no save exists or data is corrupt
     */
    load() {
        try {
            const rawData = localStorage.getItem(this.saveKey);
            
            // Return null cleanly if no save profile exists yet
            if (!rawData) {
                console.log("SaveSystem: No previous save profile detected. Starting fresh simulation.");
                return null;
            }

            const parsedPackage = JSON.parse(rawData);

            // Version Control Validation Guard
            if (!this._isValidVersion(parsedPackage.version)) {
                console.warn(`SaveSystem Warning: Version mismatch! Save data version: ${parsedPackage.version}, Engine version: ${this.currentVersion}. Handling migrations.`);
                // Future Hook: Implement migration adapters here if structural changes happen
            }

            console.log("SaveSystem: Progress profile loaded and restored into memory successfully.");
            return parsedPackage.data;

        } catch (error) {
            console.error("SaveSystem Critical Error: Stored payload is corrupted or unparsable. Wiping data path recommended.", error);
            return null;
        }
    }

    /**
     * Clears all stored farm simulation progress from the user's hard drive.
     */
    clear() {
        try {
            localStorage.removeItem(this.saveKey);
            console.log("SaveSystem: Simulation progress completely wiped from LocalStorage.");
            return true;
        } catch (error) {
            console.error("SaveSystem Error: Failed to clear the target storage entry.", error);
            return false;
        }
    }

    /**
     * Helper check to instantly see if a save profile already exists (useful for main menus).
     * @returns {boolean}
     */
    hasSave() {
        return localStorage.getItem(this.saveKey) !== null;
    }

    /**
     * Internal validator to parse incoming data versions.
     * @private
     * @param {string} dataVersion 
     */
    _isValidVersion(dataVersion) {
        return dataVersion === this.currentVersion;
    }
}
