export default class SettingsManager {
  constructor(storageManager, applySettings) {
    this.storageManager = storageManager;
    this.SETTINGS_KEY = 'dumbpad_settings';
    this.applySettings = applySettings
    this.settingsInputAutoSaveStatusInterval = document.getElementById('autosave-status-interval-input');
    this.settingsEnableRemoteConnectionMessages = document.getElementById('settings-remote-connection-messages');
    this.settingsDefaultPreviewEditor = document.getElementById('settings-default-preview-editor');
    this.settingsDefaultPreviewSplit = document.getElementById('settings-default-preview-split');
    this.settingsDefaultPreviewFull = document.getElementById('settings-default-preview-full');
    this.settingsDisablePrintExpand = document.getElementById('settings-disable-print-expand');
  }
  
  defaultSettings() {
    return { // Add additional default settings in here:
      saveStatusMessageInterval: 500,
      enableRemoteConnectionMessages: false,
      defaultMarkdownPreviewMode: 'off', // 'off', 'split', or 'preview-only'
      disablePrintExpand: false,
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
      this.applySettings(settingsToSave);
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

      appSettings.defaultMarkdownPreviewMode = currentSettings.defaultMarkdownPreviewMode || 'off';
      // Set the appropriate radio button based on the saved setting
      switch (currentSettings.defaultMarkdownPreviewMode) {
        case 'split':
          this.settingsDefaultPreviewSplit.checked = true;
          break;
        case 'preview-only':
          this.settingsDefaultPreviewFull.checked = true;
          break;
        default:
          this.settingsDefaultPreviewEditor.checked = true;
          break;
      }

      appSettings.disablePrintExpand = currentSettings.disablePrintExpand;
      this.settingsDisablePrintExpand.checked = currentSettings.disablePrintExpand;
      
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

    // Get the selected radio button value for default preview mode
    if (this.settingsDefaultPreviewEditor.checked) {
      appSettings.defaultMarkdownPreviewMode = 'off';
    } else if (this.settingsDefaultPreviewSplit.checked) {
      appSettings.defaultMarkdownPreviewMode = 'split';
    } else if (this.settingsDefaultPreviewFull.checked) {
      appSettings.defaultMarkdownPreviewMode = 'preview-only';
    } else {
      appSettings.defaultMarkdownPreviewMode = 'off'; // fallback to default
    }

    appSettings.disablePrintExpand = this.settingsDisablePrintExpand.checked;
    
    return appSettings;
  }
}