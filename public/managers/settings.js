export default class SettingsManager {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.SETTINGS_KEY = 'dumbpad_settings';
    this.settingsInputAutoSaveStatusInterval = document.getElementById('autosave-status-interval-input');
    this.settingsEnableRemoteConnectionMessages = document.getElementById('settings-remote-connection-messages');
  }
  
  defaultSettings() {
    return { // Add additional default settings in here:
      saveStatusMessageInterval: 500,
      enableRemoteConnectionMessages: false,
    }
  }

  getSettings() {
    try {
      let currentSettings = this.storageManager.load(this.SETTINGS_KEY);
      if (!currentSettings) currentSettings = this.defaultSettings();
      // console.log("Current Settings:", currentSettings);
      return currentSettings;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  saveSettings(reset) {
    try {
      const settingsToSave = reset ? this.defaultSettings() : this.getInputValues();
      this.storageManager.save(this.SETTINGS_KEY, settingsToSave);
      // console.log("Saved new settings:", newSettings);
      return settingsToSave;
    }
    catch (err) {
      console.error(err);
    }
  }

  loadSettings(reset) {
    try {
      const appSettings = this.defaultSettings();
      let currentSettings = this.getSettings();
  
      // saves default values to local storage
      if (reset || !currentSettings) currentSettings = this.saveSettings(true);
  
      // initialize/update values and inputs in app.js below:
      appSettings.saveStatusMessageInterval = currentSettings.saveStatusMessageInterval;
      this.settingsInputAutoSaveStatusInterval.value = currentSettings.saveStatusMessageInterval;

      appSettings.enableRemoteConnectionMessages = currentSettings.enableRemoteConnectionMessages;
      this.settingsEnableRemoteConnectionMessages.checked = currentSettings.enableRemoteConnectionMessages;
      
      return currentSettings;
    }
    catch (err) {
      console.error(err);
    }
  }

  getInputValues() {
    const appSettings = this.defaultSettings();

    // Get and set values from inputs to appSettings
    let newInterval = parseInt(this.settingsInputAutoSaveStatusInterval.value.trim());
    if (isNaN(newInterval) || newInterval <= 0) newInterval = null;
    appSettings.saveStatusMessageInterval = newInterval;

    appSettings.enableRemoteConnectionMessages = this.settingsEnableRemoteConnectionMessages.checked;

    return appSettings;
  }
}