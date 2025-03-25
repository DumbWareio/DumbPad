export default class SettingsManager {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.SETTINGS_KEY = 'dumbpad_settings';
    this.settingsInputAutoSaveStatusInterval = document.getElementById('autosave-status-interval-input');
  }
  
  getSettings() {
    try {
      const currentSettings = this.storageManager.load(this.SETTINGS_KEY);
      // console.log("Current Settings:", currentSettings);
      return currentSettings;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  saveSettings(appSettings, reset) {
    try {
      const settingsToSave = reset ? appSettings : this.getInputValues(appSettings);
      this.storageManager.save(this.SETTINGS_KEY, settingsToSave);
      // console.log("Saved new settings:", newSettings);
    }
    catch (err) {
      console.error(err);
    }
  }

  loadSettings(appSettings, reset) {
    try {
      let currentSettings = this.getSettings();
  
      if (reset || !currentSettings) { // Set to default settings
        // Add default settings for additional settings below:
        appSettings.saveStatusMessageInterval = 1000;
  
        currentSettings = appSettings;
        this.saveSettings(currentSettings, true);
      }
  
      // initialize/update values and inputs in app.js below:
      appSettings.saveStatusMessageInterval = currentSettings.saveStatusMessageInterval;
      this.settingsInputAutoSaveStatusInterval.value = currentSettings.saveStatusMessageInterval;
      
      return currentSettings;
    }
    catch (err) {
      console.error(err);
    }
  }

  getInputValues(appSettings) {
    // Get and set values from inputs to appSettings
    let newInterval = parseInt(this.settingsInputAutoSaveStatusInterval.value.trim());
    if (isNaN(newInterval) || newInterval < 0) newInterval = null;
    appSettings.saveStatusMessageInterval = newInterval;

    return appSettings;
  }
}