export default class StorageManager {
  constructor() {
      if (!window.localStorage) {
          throw new Error("Local Storage is not supported in this environment.");
      }
  }

  /**
   * Saves data to localStorage
   * @param {string} key - The key under which data is stored
   * @param {any} value - The value to be stored (will be stringified)
   * @returns {boolean} - Returns true if successful, false otherwise
   */
  save(key, value) {
      try {
          if (!key) throw new Error("Key cannot be empty.");
          const serializedValue = JSON.stringify(value);
          localStorage.setItem(key, serializedValue);
          return true;
      } catch (error) {
          console.error(`Error saving to localStorage: ${error.message}`);
          return false;
      }
  }

  /**
   * Loads data from localStorage
   * @param {string} key - The key of the data to retrieve
   * @returns {any|null} - The retrieved value or null if not found
   */
  load(key) {
      try {
          if (!key) throw new Error("Key cannot be empty.");
          const data = localStorage.getItem(key);
          const parsedData = data ? JSON.parse(data) : null;
          return parsedData;
      } catch (error) {
          console.error(`Error loading from localStorage: ${error.message}`);
          return null;
      }
  }

  /**
   * Removes an item from localStorage
   * @param {string} key - The key of the item to remove
   * @returns {boolean} - Returns true if successful, false otherwise
   */
  remove(key) {
      try {
          if (!key) throw new Error("Key cannot be empty.");
          localStorage.removeItem(key);
          return true;
      } catch (error) {
          console.error(`Error removing from localStorage: ${error.message}`);
          return false;
      }
  }

  /**
   * Clears all localStorage data
   * @returns {boolean} - Returns true if successful, false otherwise
   */
  clearAll() {
      try {
          localStorage.clear();
          return true;
      } catch (error) {
          console.error(`Error clearing localStorage: ${error.message}`);
          return false;
      }
  }
}