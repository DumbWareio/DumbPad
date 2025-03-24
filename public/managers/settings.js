export default class SettingsManager {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.SETTINGS_KEY = 'dumbpad_settings';
  }
  
  getSettings() {
    const currentSettings = this.storageManager.load(this.SETTINGS_KEY);
    // console.log("Current Settings:", currentSettings);
    return currentSettings;
  }

  saveSettings(settingsToSave) {
    const currentSettings = this.getSettings();
    const newSettings = { ...currentSettings, ...settingsToSave};
    // console.log("Saving new settings:", newSettings);
    this.storageManager.save(this.SETTINGS_KEY, newSettings);
  }
}