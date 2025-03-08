/**
 * Offline synchronization utilities for DumbPad
 * Provides IndexedDB storage and synchronization functionality
 */

const DB_NAME = 'dumbpad-offline';
const DB_VERSION = 1;
const OFFLINE_STORE = 'offline-edits';
const OFFLINE_METADATA = 'metadata';

// Initialize the IndexedDB database
export function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = event => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = event => {
      resolve(event.target.result);
    };
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      // Create offline edits store
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        const store = db.createObjectStore(OFFLINE_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('notepadId', 'notepadId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Create metadata store
      if (!db.objectStoreNames.contains(OFFLINE_METADATA)) {
        const metaStore = db.createObjectStore(OFFLINE_METADATA, { keyPath: 'key' });
      }
    };
  });
}

// Save an offline edit to IndexedDB
export async function saveOfflineEdit(notepadId, content, originalVersion) {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OFFLINE_STORE], 'readwrite');
    const store = transaction.objectStore(OFFLINE_STORE);
    
    const edit = {
      notepadId,
      content,
      originalVersion,
      timestamp: Date.now(),
      synced: false
    };
    
    const request = store.add(edit);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get all pending offline edits
export async function getPendingOfflineEdits() {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OFFLINE_STORE], 'readonly');
    const store = transaction.objectStore(OFFLINE_STORE);
    const index = store.index('timestamp');
    
    const request = index.getAll();
    
    request.onsuccess = () => {
      const edits = request.result.filter(edit => !edit.synced);
      resolve(edits);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get the latest offline edit for a notepad
export async function getLatestOfflineEdit(notepadId) {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OFFLINE_STORE], 'readonly');
    const store = transaction.objectStore(OFFLINE_STORE);
    const index = store.index('timestamp');
    
    const request = index.openCursor(null, 'prev');
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && cursor.value.notepadId === notepadId && !cursor.value.synced) {
        resolve(cursor.value);
      } else if (cursor) {
        cursor.continue();
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Mark an offline edit as synced
export async function markEditAsSynced(id) {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OFFLINE_STORE], 'readwrite');
    const store = transaction.objectStore(OFFLINE_STORE);
    
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const edit = getRequest.result;
      if (edit) {
        edit.synced = true;
        const updateRequest = store.put(edit);
        updateRequest.onsuccess = () => resolve(true);
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve(false);
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Set a metadata value
export async function setMetadata(key, value) {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OFFLINE_METADATA], 'readwrite');
    const store = transaction.objectStore(OFFLINE_METADATA);
    
    const request = store.put({ key, value });
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Get a metadata value
export async function getMetadata(key) {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OFFLINE_METADATA], 'readonly');
    const store = transaction.objectStore(OFFLINE_METADATA);
    
    const request = store.get(key);
    
    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.value);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Check online status and return true if online
export function isOnline() {
  return navigator.onLine;
}

// Listen for online/offline events
export function setupConnectivityListeners(callbacks) {
  window.addEventListener('online', callbacks.onOnline);
  window.addEventListener('offline', callbacks.onOffline);
  
  return {
    remove: () => {
      window.removeEventListener('online', callbacks.onOnline);
      window.removeEventListener('offline', callbacks.onOffline);
    }
  };
}

// Perform diff between two strings
export function simpleDiff(oldStr, newStr) {
  if (oldStr === newStr) return null;
  
  // For simplicity, this is a basic implementation
  // A more sophisticated diff algorithm would be better for production
  
  // Find common prefix
  let i = 0;
  while (i < oldStr.length && i < newStr.length && oldStr[i] === newStr[i]) {
    i++;
  }
  
  // Find common suffix
  let j = 0;
  while (
    j < oldStr.length - i && 
    j < newStr.length - i && 
    oldStr[oldStr.length - 1 - j] === newStr[newStr.length - 1 - j]
  ) {
    j++;
  }
  
  const oldMiddle = oldStr.substring(i, oldStr.length - j);
  const newMiddle = newStr.substring(i, newStr.length - j);
  
  return {
    index: i,
    removed: oldMiddle,
    added: newMiddle
  };
}

// Simple three-way merge
export function threeWayMerge(original, modified1, modified2) {
  if (modified1 === modified2) return modified1;
  if (modified1 === original) return modified2;
  if (modified2 === original) return modified1;
  
  // This is a very simplistic merge algorithm
  // For a real application, consider using a proper diff/merge library
  
  const diff1 = simpleDiff(original, modified1);
  const diff2 = simpleDiff(original, modified2);
  
  // If changes don't overlap, we can merge them
  if (diff1 && diff2) {
    const noConflict = (
      diff1.index + diff1.removed.length <= diff2.index || 
      diff2.index + diff2.removed.length <= diff1.index
    );
    
    if (noConflict) {
      // Apply both changes
      if (diff1.index < diff2.index) {
        // Apply diff1 then diff2
        const interim = original.substring(0, diff1.index) + 
                      diff1.added + 
                      original.substring(diff1.index + diff1.removed.length);
        
        // Adjust diff2.index based on changes from diff1
        const adjustment = diff1.added.length - diff1.removed.length;
        const adjustedDiff2Index = diff2.index + adjustment;
        
        return interim.substring(0, adjustedDiff2Index) + 
               diff2.added + 
               interim.substring(adjustedDiff2Index + diff2.removed.length);
      } else {
        // Apply diff2 then diff1
        const interim = original.substring(0, diff2.index) + 
                      diff2.added + 
                      original.substring(diff2.index + diff2.removed.length);
        
        // Adjust diff1.index based on changes from diff2
        const adjustment = diff2.added.length - diff2.removed.length;
        const adjustedDiff1Index = diff1.index + adjustment;
        
        return interim.substring(0, adjustedDiff1Index) + 
               diff1.added + 
               interim.substring(adjustedDiff1Index + diff1.removed.length);
      }
    }
  }
  
  // If we can't automatically merge, return conflict markers
  return `<<<<<<< LOCAL\n${modified1}\n=======\n${modified2}\n>>>>>>> SERVER`;
} 