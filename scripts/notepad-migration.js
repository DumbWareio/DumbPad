const fs = require('fs').promises;
const path = require('path');

/**
 * Helper function to sanitize filename for file system
 * @param {string} name - The notepad name to sanitize
 * @returns {string} - Sanitized filename safe for filesystem use
 */
function sanitizeFilename(name) {
    // Replace invalid filesystem characters with underscores
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

/**
 * Helper function to get file path for notepad (tries name-based first, falls back to ID-based)
 * @param {Object} notepad - The notepad object with id and name
 * @param {string} dataDir - The data directory path
 * @returns {Promise<string>} - The file path to use for this notepad
 */
async function getNotepadFilePath(notepad, dataDir) {
    const sanitizedName = sanitizeFilename(notepad.name);
    const nameBasedPath = path.join(dataDir, `${sanitizedName}.txt`);
    const idBasedPath = path.join(dataDir, `${notepad.id}.txt`);
    
    // Check if name-based file exists
    try {
        await fs.access(nameBasedPath);
        return nameBasedPath;
    } catch {
        // Fall back to ID-based file
        try {
            await fs.access(idBasedPath);
            return idBasedPath;
        } catch {
            // Neither exists, return name-based path for new files
            return nameBasedPath;
        }
    }
}

/**
 * Helper function to migrate file from ID-based to name-based filename
 * @param {Object} notepad - The notepad object with id and name
 * @param {string} dataDir - The data directory path
 * @returns {Promise<string>} - The final file path after migration
 */
async function migrateNotepadFile(notepad, dataDir) {
    const sanitizedName = sanitizeFilename(notepad.name);
    const oldPath = path.join(dataDir, `${notepad.id}.txt`);
    const newPath = path.join(dataDir, `${sanitizedName}.txt`);
    
    // Skip if already using name-based filename
    if (oldPath === newPath) return newPath;
    
    try {
        // Check if old file exists
        await fs.access(oldPath);
        
        // Check if new path already exists
        try {
            await fs.access(newPath);
            // New file exists, keep old one to avoid conflicts
            return oldPath;
        } catch {
            // New path doesn't exist, safe to migrate
            await fs.rename(oldPath, newPath);
            console.log(`Migrated notepad file: ${oldPath} -> ${newPath}`);
            return newPath;
        }
    } catch {
        // Old file doesn't exist, return new path
        return newPath;
    }
}

/**
 * Function to migrate all existing notepads to name-based filenames
 * @param {Array} notepads - Array of notepad objects
 * @param {string} dataDir - The data directory path
 * @returns {Promise<void>}
 */
async function migrateAllNotepadsToNameBasedFiles(notepads, dataDir) {
    try {
        console.log('Checking for notepad files to migrate...');
        
        let migratedCount = 0;
        for (const notepad of notepads) {
            const oldPath = path.join(dataDir, `${notepad.id}.txt`);
            const sanitizedName = sanitizeFilename(notepad.name);
            const newPath = path.join(dataDir, `${sanitizedName}.txt`);
            
            // Only migrate if old path exists and new path doesn't
            if (oldPath !== newPath) {
                try {
                    await fs.access(oldPath);
                    try {
                        await fs.access(newPath);
                        // Both exist, keep old one
                        console.log(`Skipping migration for ${notepad.name}: both ${oldPath} and ${newPath} exist`);
                    } catch {
                        // Only old exists, safe to migrate
                        await fs.rename(oldPath, newPath);
                        console.log(`Migrated: ${oldPath} -> ${newPath}`);
                        migratedCount++;
                    }
                } catch {
                    // Old file doesn't exist, nothing to migrate
                }
            }
        }
        
        if (migratedCount > 0) {
            console.log(`Successfully migrated ${migratedCount} notepad files to name-based filenames`);
        } else {
            console.log('No notepad files needed migration');
        }
    } catch (err) {
        console.error('Error during notepad file migration:', err);
    }
}

/**
 * Migrate default notepad file from ID-based to name-based if needed
 * @param {string} dataDir - The data directory path
 * @returns {Promise<void>}
 */
async function migrateDefaultNotepad(dataDir) {
    const defaultNotepad = { id: 'default', name: 'Default Notepad' };
    const defaultNotePath = await getNotepadFilePath(defaultNotepad, dataDir);
    
    try {
        await fs.access(defaultNotePath);
    } catch {
        // If name-based file doesn't exist, check for ID-based file
        const legacyDefaultPath = path.join(dataDir, 'default.txt');
        try {
            await fs.access(legacyDefaultPath);
            // Legacy file exists, migrate it to name-based
            if (defaultNotePath !== legacyDefaultPath) {
                await fs.rename(legacyDefaultPath, defaultNotePath);
                console.log(`Migrated default notepad: ${legacyDefaultPath} -> ${defaultNotePath}`);
            }
        } catch {
            // Neither exists, create new name-based file
            await fs.writeFile(defaultNotePath, '');
        }
    }
}

module.exports = {
    sanitizeFilename,
    getNotepadFilePath,
    migrateNotepadFile,
    migrateAllNotepadsToNameBasedFiles,
    migrateDefaultNotepad
};
