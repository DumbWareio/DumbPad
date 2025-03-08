import { OperationsManager, OperationType } from './operations.js';
import { CollaborationManager } from './collaboration.js';
import { CursorManager } from './cursor-manager.js';
import { StatusManager } from './status.js';
import SearchManager from './search.js';
import { marked } from '/js/marked/marked.esm.js';
import * as OfflineSync from './offline-sync.js';

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered with scope:', registration.scope);
            
            // Set up background sync when supported
            if ('sync' in registration) {
                // Register a sync when needed
                window.registerSync = () => {
                    registration.sync.register('sync-notes')
                        .then(() => console.log('Sync registered'))
                        .catch(err => console.error('Sync registration failed:', err));
                };
            } else {
                window.registerSync = () => {
                    // Fallback for browsers without background sync
                    if (navigator.onLine) {
                        // Send a message to the service worker to check for queued requests
                        registration.active.postMessage({ type: 'CHECK_SYNC' });
                    }
                };
            }
            
            // Listen for messages from the service worker
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data && event.data.type === 'sync-complete') {
                    console.log('Sync completed for:', event.data.url);
                    // Update the UI to reflect successful sync
                    updateSyncStatus('synced');
                    statusManager.show('All changes synced', 'success', 3000);
                }
            });
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const DEBUG = false;
    let isPreviewMode = false;
    const editorContainer = document.getElementById('editor-container');
    const editor = document.getElementById('editor');
    const previewContainer = document.getElementById('preview-container');
    const previewPane = document.getElementById('preview-pane');
    const themeToggle = document.getElementById('theme-toggle');
    const statusManager = new StatusManager(document.getElementById('status-container'));
    const notepadSelector = document.getElementById('notepad-selector');
    const newNotepadBtn = document.getElementById('new-notepad');
    const renameNotepadBtn = document.getElementById('rename-notepad');
    const downloadNotepadBtn = document.getElementById('download-notepad');
    const printNotepadBtn = document.getElementById('print-notepad');
    const previewMarkdownBtn = document.getElementById('preview-markdown');
    const deleteNotepadBtn = document.getElementById('delete-notepad');
    const renameModal = document.getElementById('rename-modal');
    const deleteModal = document.getElementById('delete-modal');
    const renameInput = document.getElementById('rename-input');
    const renameCancel = document.getElementById('rename-cancel');
    const renameConfirm = document.getElementById('rename-confirm');
    const deleteCancel = document.getElementById('delete-cancel');
    const deleteConfirm = document.getElementById('delete-confirm');
    const tooltips = document.querySelectorAll('[data-tooltip]');
    const downloadModal = document.getElementById('download-modal');
    const downloadTxt = document.getElementById('download-txt');
    const downloadMd = document.getElementById('download-md');
    const downloadCancel = document.getElementById('download-cancel');
    
    // Sync UI elements
    const syncStatusIndicator = document.getElementById('sync-status');
    const syncModal = document.getElementById('sync-modal');
    const syncNowBtn = document.getElementById('sync-now');
    const syncCancelBtn = document.getElementById('sync-cancel');
    const syncProgressBar = document.getElementById('sync-progress-bar');
    const syncProgressStatus = document.getElementById('sync-progress-status');
    
    // Conflict resolution UI elements
    const conflictModal = document.getElementById('conflict-modal');
    const useLocalBtn = document.getElementById('use-local');
    const useServerBtn = document.getElementById('use-server');
    const useMergedBtn = document.getElementById('use-merged');
    const useCustomBtn = document.getElementById('use-custom');
    const localPreview = document.querySelector('.local-preview');
    const serverPreview = document.querySelector('.server-preview');
    const mergedPreview = document.querySelector('.merged-preview');
    const customResolution = document.getElementById('custom-resolution');
    
    // Theme handling
    const THEME_KEY = 'dumbpad_theme';
    let currentTheme = localStorage.getItem(THEME_KEY) || 'light';
    
    // Apply initial theme
    document.body.classList.toggle('dark-mode', currentTheme === 'dark');
    themeToggle.innerHTML = currentTheme === 'dark' ? '<span class="sun">☀</span>' : '<span class="moon">☽</span>';
    const addThemeEventListeners = () => {
        // Theme toggle handler
        themeToggle.addEventListener('click', () => {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.body.classList.toggle('dark-mode');
            themeToggle.innerHTML = currentTheme === 'dark' ? '<span class="sun">☀</span>' : '<span class="moon">☽</span>';
            inheritEditorStyles(previewPane);
            localStorage.setItem(THEME_KEY, currentTheme);
        });
    }
    
    let saveTimeout;
    let lastSaveTime = Date.now();
    const SAVE_INTERVAL = 2000;
    let currentNotepadId = 'default';
    let baseUrl = '';
    let previousEditorValue = editor.value;

    // Add credentials to all API requests
    const fetchWithPin = async (url, options = {}) => {
        options.credentials = 'same-origin';
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
        return fetch(fullUrl, options);
    };

    // Load notepads list
    const loadNotepads = async () => {
        try {
            const response = await fetchWithPin('/api/notepads');
            const data = await response.json();

            currentNotepadId = data['note_history'];
            if (collaborationManager) {
                collaborationManager.currentNotepadId = currentNotepadId;
            }
            
            notepadSelector.innerHTML = data.notepads_list
                .map(pad => `<option value="${pad.id}"${pad.id === currentNotepadId?'selected':''}>${pad.name}</option>`)
                .join('');
        } catch (err) {
            console.error('Error loading notepads:', err);
            return [];
        }
    };

    // Load notes
    const loadNotes = async (notepadId) => {
        if (!notepadId) return;
        
        try {
            const result = await fetchWithPin(`/api/notes/${notepadId}`);
            const data = await result.json();
            
            if (data.success) {
                editor.value = data.content;
                currentVersion = data.content; // Store the current server version
                
                if (isPreviewMode) {
                    previewPane.innerHTML = marked.parse(data.content);
                }
                
                // Check if there are pending offline edits for this notepad
                if (isInitialLoad) {
                    isInitialLoad = false;
                    
                    try {
                        const latestOfflineEdit = await OfflineSync.getLatestOfflineEdit(notepadId);
                        if (latestOfflineEdit) {
                            // We have offline edits, ask user what to do
                            const shouldUseOffline = confirm(
                                'You have unsynchronized changes for this notepad. Would you like to use your offline version?'
                            );
                            
                            if (shouldUseOffline) {
                                editor.value = latestOfflineEdit.content;
                                if (isPreviewMode) {
                                    previewPane.innerHTML = marked.parse(latestOfflineEdit.content);
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Error checking for offline edits:', err);
                    }
                }
                
                return data.content;
            } else {
                throw new Error(data.error || 'Failed to load notes');
            }
        } catch (err) {
            console.error('Error loading notes:', err);
            statusManager.show('Error loading notepad', 'error', 3000);
            
            // Try to load from IndexedDB if we're offline
            try {
                const latestOfflineEdit = await OfflineSync.getLatestOfflineEdit(notepadId);
                if (latestOfflineEdit) {
                    editor.value = latestOfflineEdit.content;
                    if (isPreviewMode) {
                        previewPane.innerHTML = marked.parse(latestOfflineEdit.content);
                    }
                    
                    statusManager.show('Loaded offline version', 'warning', 3000);
                    updateSyncStatus('offline');
                    return latestOfflineEdit.content;
                }
            } catch (offlineErr) {
                console.error('Failed to load offline version:', offlineErr);
            }
            
            return '';
        }
    };

    // Initialize managers
    const operationsManager = new OperationsManager();
    operationsManager.DEBUG = DEBUG;

    const cursorManager = new CursorManager({ editor });
    cursorManager.DEBUG = DEBUG;

    // Generate user ID and color
    const userId = Math.random().toString(36).substring(2, 15);
    window.userId = userId; // Store userId globally for debugging
    const userColor = getRandomColor(userId);

    let collaborationManager = null;
    
    // Initialize the collaboration manager after other functions are defined
    collaborationManager = new CollaborationManager({
        userId,
        userColor,
        currentNotepadId,
        operationsManager,
        editor,
        onNotepadChange: loadNotepads,
        onUserDisconnect: (disconnectedUserId) => cursorManager.handleUserDisconnection(disconnectedUserId),
        onCursorUpdate: (remoteUserId, position, color) => cursorManager.updateCursorPosition(remoteUserId, position, color)
    });
    collaborationManager.DEBUG = DEBUG;

    // Generate a deterministic color for the user based on their ID
    function getRandomColor(userId) {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB',
            '#E67E22', '#27AE60', '#F1C40F', '#E74C3C'
        ];
        
        // Use a more sophisticated hash function (FNV-1a)
        let hash = 2166136261; // FNV offset basis
        for (let i = 0; i < userId.length; i++) {
            hash ^= userId.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        
        // Add timestamp component to further reduce collisions
        // but keep it deterministic for the same user
        const timeComponent = parseInt(userId.slice(-4), 36);
        hash = (hash ^ timeComponent) >>> 0; // Convert to unsigned 32-bit
        
        // Use modulo bias reduction technique
        const MAX_INT32 = 0xFFFFFFFF;
        const scaled = (hash / MAX_INT32) * colors.length;
        const index = Math.floor(scaled);
        
        return colors[index];
    }

    const addEditorEventListeners = () => {
        // Track cursor position and selection
        editor.addEventListener('mouseup', () => collaborationManager.updateLocalCursor());
        editor.addEventListener('keyup', () => collaborationManager.updateLocalCursor());
        editor.addEventListener('click', () => collaborationManager.updateLocalCursor());
        editor.addEventListener('scroll', () => cursorManager.updateAllCursors());

        // Handle text input events
        editor.addEventListener('input', (e) => {
            if (collaborationManager.isReceivingUpdate) {
                if (DEBUG) console.log('Ignoring input event during remote update');
                return;
            }
    
            const target = e.target;
            const changeStart = target.selectionStart;
            
            // Handle different types of input
            if (e.inputType.startsWith('delete')) {
                // Calculate what was deleted by comparing with previous value
                const lengthDiff = previousEditorValue.length - target.value.length;
                
                // For bulk deletions or continuous delete
                if (lengthDiff > 0) {
                    let deletedContent;
                    let deletePosition;
                    
                    if (e.inputType === 'deleteContentBackward') {
                        // Backspace: deletion happens before cursor
                        deletePosition = changeStart;
                        deletedContent = previousEditorValue.substring(deletePosition, deletePosition + lengthDiff);
                    } else {
                        // Delete key: deletion happens at cursor
                        deletePosition = changeStart;
                        deletedContent = previousEditorValue.substring(deletePosition, deletePosition + lengthDiff);
                    }
                    
                    const operation = operationsManager.createOperation(
                        OperationType.DELETE,
                        deletePosition,
                        deletedContent,
                        userId
                    );
                    if (DEBUG) console.log('Created DELETE operation:', operation);
                    collaborationManager.sendOperation(operation);
                }
            } else {
                // For insertions
                let insertedText;
                let insertPosition = changeStart;
                
                if (e.inputType === 'insertFromPaste') {
                    // Handle paste operation
                    const selectionDiff = previousEditorValue.length - target.value.length + e.data.length;
                    
                    // If there was selected text that was replaced
                    if (selectionDiff > 0) {
                        // First create a delete operation for the selected text
                        const deletePosition = changeStart - e.data.length;
                        const deletedContent = previousEditorValue.substring(deletePosition, deletePosition + selectionDiff);
                        
                        const deleteOperation = operationsManager.createOperation(
                            OperationType.DELETE,
                            deletePosition,
                            deletedContent,
                            userId
                        );
                        if (DEBUG) console.log('Created DELETE operation for paste:', deleteOperation);
                        collaborationManager.sendOperation(deleteOperation);
                        
                        insertPosition = deletePosition;
                    }
                    
                    insertedText = e.data;
                } else if (e.inputType === 'insertLineBreak') {
                    insertedText = '\n';
                } else {
                    insertedText = e.data || target.value.substring(changeStart - 1, changeStart);
                }
                
                const operation = operationsManager.createOperation(
                    OperationType.INSERT,
                    insertPosition - (e.inputType === 'insertFromPaste' ? 0 : insertedText.length),
                    insertedText,
                    userId
                );
                if (DEBUG) console.log('Created INSERT operation:', operation);
                collaborationManager.sendOperation(operation);
            }
    
            previousEditorValue = target.value;
            // Update markdown preview in real-time if in preview mode
            if (isPreviewMode) {
                previewPane.innerHTML = marked.parse(target.value);
            }

            debouncedSave(target.value);
            collaborationManager.updateLocalCursor();
        });
    
        // Handle composition events (for IME input)
        editor.addEventListener('compositionstart', () => {
            collaborationManager.isReceivingUpdate = true;
        });
        
        editor.addEventListener('compositionend', (e) => {
            collaborationManager.isReceivingUpdate = false;
            const target = e.target;
            const endPosition = target.selectionStart;
            const composedText = e.data;
            
            if (composedText) {
                const operation = operationsManager.createOperation(
                    OperationType.INSERT,
                    endPosition - composedText.length,
                    composedText,
                    userId
                );
                if (DEBUG) console.log('Created composition operation:', operation);
                collaborationManager.sendOperation(operation);
            }
    
            // Update markdown preview in real-time if in preview mode
            if (isPreviewMode) {
                previewPane.innerHTML = marked.parse(target.value);
            }
        
            debouncedSave(target.value);
            collaborationManager.updateLocalCursor();
        });
    }

    // Function to toggle between edit and preview modes
    const toggleMarkdownPreview = () => {
        isPreviewMode = !isPreviewMode;
        if (isPreviewMode) {
            // Render and show the markdown
            inheritEditorStyles(previewPane);
            previewPane.innerHTML = marked.parse(editor.value);
            previewContainer.style.display = 'block';
            editorContainer.style.display = 'none';
            previewMarkdownBtn.classList.add('active');
            statusManager.show('Markdown Preview On');
        } else {
            previewContainer.style.display = 'none';
            editorContainer.style.display = 'block';
            previewMarkdownBtn.classList.remove('active');
            editor.focus();
            statusManager.show('Markdown Preview Off', 'error');
        }

        collaborationManager.updateLocalCursor();
    }

    function inheritEditorStyles(element) {
        element.style.backgroundColor = window.getComputedStyle(editor).backgroundColor;
        element.style.color = window.getComputedStyle(editor).color;
        element.style.padding = window.getComputedStyle(editor).padding;
    }

    /* Notepad Controls */
    // Create new notepad
    const createNotepad = async () => {
        try {
            const response = await fetchWithPin('/api/notepads', { method: 'POST' });
            const newNotepad = await response.json();
            await loadNotepads();
            notepadSelector.value = newNotepad.id;
            currentNotepadId = newNotepad.id;
            collaborationManager.currentNotepadId = currentNotepadId;
            editor.value = '';
            previousEditorValue = '';
            
            // Clear preview if in preview mode
            if (isPreviewMode) {
                previewPane.innerHTML = '';
            }
            
            if (collaborationManager.ws && collaborationManager.ws.readyState === WebSocket.OPEN) {
                collaborationManager.ws.send(JSON.stringify({
                    type: 'notepad_change'
                }));
            }

            statusManager.show(`New notepad: ${newNotepad.name}`, 'success', 3000)
        } catch (err) {
            console.error('Error creating notepad:', err);
            statusManager.show('Error creating notepad', 'error', 3000)
        }
    };

    // Rename notepad
    const renameNotepad = async (newName) => {
        try {
            await fetchWithPin(`/api/notepads/${currentNotepadId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: newName }),
            });
            await loadNotepads();
            notepadSelector.value = currentNotepadId;
            
            // Broadcast the rename to other users
            if (collaborationManager.ws && collaborationManager.ws.readyState === WebSocket.OPEN) {
                collaborationManager.ws.send(JSON.stringify({
                    type: 'notepad_rename',
                    notepadId: currentNotepadId,
                    newName: newName
                }));
            }

            statusManager.show('Renamed notepad')
        } catch (err) {
            console.error('Error renaming notepad:', err);
            statusManager.show('Error renaming notepad', 'error', 3000)
        }
    };

    // Save notes with debounce
    const saveNotes = async (content) => {
        try {
            // Check if we're online
            if (!OfflineSync.isOnline()) {
                // We're offline, save to IndexedDB
                await OfflineSync.saveOfflineEdit(currentNotepadId, content, currentVersion);
                updateSyncStatus('offline');
                statusManager.show('Saved offline', 'warning', 3000);
                lastSaveTime = Date.now();
                return;
            }
            
            // We're online, try to save to server
            const response = await fetchWithPin(`/api/notes/${currentNotepadId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content }),
            });
            
            // Check if the request was handled offline by the service worker
            const responseData = await response.json();
            if (responseData.offline) {
                updateSyncStatus('pending');
                statusManager.show('Saved offline (will sync when online)', 'warning', 3000);
            } else {
                // Normal online save
                if (collaborationManager.ws && collaborationManager.ws.readyState === WebSocket.OPEN && !collaborationManager.isReceivingUpdate) {
                    collaborationManager.ws.send(JSON.stringify({
                        type: 'update',
                        notepadId: currentNotepadId,
                        content: content
                    }));
                }
                
                updateSyncStatus('synced');
                statusManager.show('Saved');
                currentVersion = content; // Store current server version
            }
            
            lastSaveTime = Date.now();
        } catch (err) {
            console.error('Error saving notes:', err);
            
            // Try to save offline
            try {
                await OfflineSync.saveOfflineEdit(currentNotepadId, content, currentVersion);
                updateSyncStatus('offline');
                statusManager.show('Saved offline', 'warning', 3000);
                lastSaveTime = Date.now();
            } catch (offlineErr) {
                console.error('Failed to save offline:', offlineErr);
                statusManager.show('Error saving', 'error', 3000);
            }
        }
    };

    // Check if we should do a periodic save
    const checkPeriodicSave = (content) => {
        const now = Date.now();
        if (now - lastSaveTime >= SAVE_INTERVAL) {
            saveNotes(content);
        }
    };

    // Debounced save
    const debouncedSave = (content) => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveNotes(content);
        }, 300);
    };

    // Delete notepad
    const deleteNotepad = async () => {
        try {
            if (currentNotepadId === 'default') {
                alert('Cannot delete the default notepad');
                return;
            }
            
            const response = await fetchWithPin(`/api/notepads/${currentNotepadId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete notepad');
            }
            
            await loadNotepads();

            // select previous notepad
            selectNextNotepad(false);
            
            if (collaborationManager.ws && collaborationManager.ws.readyState === WebSocket.OPEN) {
                collaborationManager.ws.send(JSON.stringify({
                    type: 'notepad_change'
                }));
            }
            
            // Hide Delete Modal
            deleteModal.classList.remove('visible');
            statusManager.show('Notepad deleted')
        } catch (err) {
            console.error('Error deleting notepad:', err);
            statusManager.show('Error deleting notepad', 'error', 3000);
        }
    };

    // Download file with specified extension
    const downloadNotepad = (extension) => {
        const notepadName = notepadSelector.options[notepadSelector.selectedIndex].text;
        const content = editor.value;
        
        // Strip any existing extension from notepad name
        const baseName = notepadName.includes('.')
            ? notepadName.substring(0, notepadName.lastIndexOf('.'))
            : notepadName;
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}.${extension}`;
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        statusManager.show('Downloading...');
    };

    // Print current notepad
    const printNotepad = () => {
        const notepadName = notepadSelector.options[notepadSelector.selectedIndex].text;
        const content = editor.value;
        
        const printWindow = window.open('', '_blank');

        const formattedContent = notepadName.toLowerCase().endsWith('.md') || isPreviewMode
            ? marked.parse(content)
            : content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${notepadName}</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        line-height: 1.6;
                        padding: 2rem;
                        white-space: pre-wrap;
                    }
                    @media print {
                        body {
                            padding: 0;
                        }
                    }
                </style>
            </head>
            <body>
                ${formattedContent}
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);

        statusManager.show('Printing...');
    };

    const getNotepadIndexById = (id) => {
        // Find the index of the option with the matching id
        const options = notepadSelector.options;
        let newIndex = -1; // Initialize to -1 (not found)

        for (let i = 0; i < options.length; i++) {
            if (options[i].value === id) {
                newIndex = i;
                break; // Found the index, exit the loop
            }
        }

        // Update the selectedIndex if found
        if (newIndex !== -1) return notepadSelector.selectedIndex = newIndex;
        else {
            console.warn(`Notepad with id '${id}' not found in selector.`);
            return -1;
        }
    }

    /* IMPORTANT
    this loadNotes is async so this function must be awaited 
    or else autosave can overwrite other notepads with previous editor content */
    const selectNotepad = async (id) => {
        currentNotepadId = id;
        collaborationManager.currentNotepadId = currentNotepadId;
        await loadNotes(currentNotepadId);
        editor.focus();

        notepadSelector.selectedIndex = getNotepadIndexById(id);
    }

    const getNextNotepadIndex = (forward = true) => {
        const options = notepadSelector.options;
        const currentIndex = notepadSelector.selectedIndex;
        let newIndex;
        if (forward)
            newIndex = (currentIndex + 1) % options.length;
        else // backwards
            newIndex = (currentIndex - 1 + options.length) % options.length;

        return newIndex;
    }

    const selectNextNotepad = async (forward = true) => {
        const newIndex = getNextNotepadIndex(forward);
        await selectNotepad(notepadSelector[newIndex].value);
    }

    const addNotepadControlsEventListeners = () => {
        notepadSelector.addEventListener('change', async (e) => {
            await selectNotepad(e.target.value);
        });
    
        newNotepadBtn.addEventListener('click', createNotepad);
    
        renameNotepadBtn.addEventListener('click', () => {
            const currentNotepad = notepadSelector.options[notepadSelector.selectedIndex];
            renameInput.value = currentNotepad.text;
            renameModal.classList.add('visible');
            renameInput.focus();
            renameInput.select();
        });
        renameInput.addEventListener('keyup', async (e) => {
            if (e.key === 'Enter') {
                const newName = renameInput.value.trim();
                if (newName) {
                    await renameNotepad(newName);
                    renameModal.classList.remove('visible');
                }
            }
        });
        renameCancel.addEventListener('click', () => {
            renameModal.classList.remove('visible');
        });
        renameConfirm.addEventListener('click', async () => {
            const newName = renameInput.value.trim();
            if (newName) {
                await renameNotepad(newName);
                renameModal.classList.remove('visible');
            }
        });
        
        deleteNotepadBtn.addEventListener('click', () => {
            if (currentNotepadId === 'default') {
                alert('Cannot delete the default notepad');
                return;
            }
            deleteModal.classList.add('visible');
            deleteCancel.focus();
        });
        deleteCancel.addEventListener('click', () => {
            deleteModal.classList.remove('visible');
        });
        deleteConfirm.addEventListener('click', async () => {
            await deleteNotepad();
        });
    
        downloadNotepadBtn.addEventListener('click', () => {
            downloadModal.classList.add('visible');
            downloadCancel.focus();
        });
        downloadCancel.addEventListener('click', () => {
            downloadModal.classList.remove('visible');
        });
        downloadTxt.addEventListener('click', () => {
            // Download as TXT
            downloadNotepad('txt');
            downloadModal.classList.remove('visible');
        })
        downloadMd.addEventListener('click', () => {
            // Download as MD
            downloadNotepad('md');
            downloadModal.classList.remove('visible');
        });

        printNotepadBtn.addEventListener('click', printNotepad);
        previewMarkdownBtn.addEventListener('click', toggleMarkdownPreview);
    }

    const addShortcutEventListeners = () => {
        document.addEventListener('keydown', async (e) => {
            const windowsModifier = e.ctrlKey;
            const macModifier = e.metaKey;

            if ((windowsModifier && e.altKey) || (macModifier && e.ctrlKey)) {
                /* For browser-reserved shortcuts 
                Windows: Ctrl + Alt
                Mac: Command + Ctrl
                */
               switch(e.key) {
                    case 'n': {
                        e.preventDefault();
                        createNotepad();
                        break;
                    }
                    case 'r': {
                        e.preventDefault();
                        renameNotepadBtn.click();
                        break;
                    }
                    case 'a': {
                        e.preventDefault();
                        downloadNotepadBtn.click();
                        break;
                    }
                    case 'm': {
                        e.preventDefault();
                        previewMarkdownBtn.click();
                        break;
                    }
                    case 'x': {
                        e.preventDefault();
                        deleteNotepadBtn.click();
                        break;
                    }
                    case 'ArrowUp': {
                        e.preventDefault();
                        selectNextNotepad(false); // selects previous notepad
                        break;
                    }
                    case 'ArrowDown': {
                        e.preventDefault();
                        selectNextNotepad();
                        break;
                    }
                    default:
                        break;
               }
            }
            else if (windowsModifier || macModifier) {
                switch(e.key) {
                    case 's': {
                        e.preventDefault();
                        saveNotes(editor.value);
                        break;
                    }
                    case 'p': {
                        e.preventDefault();
                        printNotepad();
                        break;
                    }
                    case 'k': {
                        e.preventDefault();
                        searchManager.openModal();
                        break;
                    }
                    default:
                        break;
                }
            }
        });
    }

    const addEventListeners = () => {
        addThemeEventListeners();
        addEditorEventListeners();
        addNotepadControlsEventListeners();
        addShortcutEventListeners();
        searchManager.addEventListeners();
    }

    const setupToolTips = () => {
        tooltips.forEach((element) => {
            let tooltip = document.createElement('div');
            tooltip.classList.add('tooltip');
            document.body.appendChild(tooltip);
    
            element.addEventListener('mouseover', (e) => {
                tooltip.textContent = element.getAttribute('data-tooltip');
                tooltip.style.left = e.pageX + 10 + 'px';
                tooltip.style.top = e.pageY + 10 + 'px';
                tooltip.classList.add('show');
            });
            element.addEventListener('mouseout', () => {
                tooltip.classList.remove('show');
            });
        });
    }

    // Initialize the app
    const searchManager = new SearchManager(fetchWithPin, selectNotepad);
    const initializeApp = () => {
        fetch(`/api/config`)
            .then(response => response.json())
            .then(config => {
                document.getElementById('page-title').textContent = `${config.siteTitle} - Simple Notes`;
                document.getElementById('header-title').textContent = config.siteTitle;
                baseUrl = config.baseUrl;

                loadNotepads().then(() => {
                    checkForOfflineEdits(); // Check for offline edits after loading notepads
                });
            })
            .catch(err => console.error('Error loading site configuration:', err));
        
        addEventListeners();
        setupToolTips();
        marked.setOptions({ // Set up markdown parser
            breaks: true,
            gfm: true
        });
    };

    // Initialize WebSocket connection
    collaborationManager.setupWebSocket();

    // Initialize offline synchronization
    let isInitialLoad = true;
    let currentVersion = ''; // Tracks the known server version
    
    // Initialize IndexedDB
    OfflineSync.initIndexedDB().catch(err => {
        console.error('Failed to initialize IndexedDB:', err);
    });
    
    // Check for offline edits and prompt for sync if needed
    async function checkForOfflineEdits() {
        try {
            const pendingEdits = await OfflineSync.getPendingOfflineEdits();
            if (pendingEdits.length > 0) {
                showSyncModal(pendingEdits);
            }
        } catch (err) {
            console.error('Error checking for offline edits:', err);
        }
    }
    
    // Show the sync modal with pending edits
    function showSyncModal(pendingEdits) {
        syncProgressBar.style.width = '0%';
        syncProgressStatus.textContent = `Found ${pendingEdits.length} pending change${pendingEdits.length > 1 ? 's' : ''}`;
        syncModal.style.display = 'block';
    }
    
    // Handle sync now button click
    syncNowBtn.addEventListener('click', async () => {
        syncProgressStatus.textContent = 'Starting synchronization...';
        
        try {
            const pendingEdits = await OfflineSync.getPendingOfflineEdits();
            let processed = 0;
            
            for (const edit of pendingEdits) {
                syncProgressStatus.textContent = `Syncing notepad: ${getNotepadNameById(edit.notepadId) || edit.notepadId}`;
                
                try {
                    // Try to get the current server version
                    const serverResponse = await fetchWithPin(`/api/notes/${edit.notepadId}`, {
                        method: 'GET'
                    });
                    
                    const serverData = await serverResponse.json();
                    
                    if (!serverData.success) {
                        throw new Error('Failed to fetch server version');
                    }
                    
                    const serverContent = serverData.content;
                    const localContent = edit.content;
                    const originalContent = edit.originalVersion;
                    
                    // Check if there's a conflict
                    if (serverContent !== originalContent && serverContent !== localContent) {
                        // We have a conflict, show conflict resolution UI
                        await showConflictResolution(edit.notepadId, originalContent, localContent, serverContent);
                    } else {
                        // No conflict, just save
                        await fetchWithPin(`/api/notes/${edit.notepadId}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ content: localContent }),
                        });
                        
                        // Mark edit as synced
                        await OfflineSync.markEditAsSynced(edit.id);
                    }
                } catch (error) {
                    console.error(`Error syncing edit for notepad ${edit.notepadId}:`, error);
                    syncProgressStatus.textContent = `Error syncing notepad: ${getNotepadNameById(edit.notepadId) || edit.notepadId}`;
                    // Continue with next edit
                }
                
                processed++;
                syncProgressBar.style.width = `${(processed / pendingEdits.length) * 100}%`;
            }
            
            updateSyncStatus('synced');
            syncProgressStatus.textContent = 'All changes synchronized!';
            syncProgressBar.style.width = '100%';
            
            // Close the modal after a short delay
            setTimeout(() => {
                syncModal.style.display = 'none';
                statusManager.show('All changes synced', 'success', 3000);
            }, 1500);
            
        } catch (err) {
            console.error('Sync process failed:', err);
            syncProgressStatus.textContent = 'Sync failed. Please try again.';
        }
    });
    
    // Handle sync cancel button click
    syncCancelBtn.addEventListener('click', () => {
        syncModal.style.display = 'none';
    });
    
    // Show conflict resolution dialog
    function showConflictResolution(notepadId, originalContent, localContent, serverContent) {
        return new Promise((resolve, reject) => {
            // Set conflict content previews
            localPreview.textContent = localContent;
            serverPreview.textContent = serverContent;
            
            // Try to auto-merge
            const mergedContent = OfflineSync.threeWayMerge(originalContent, localContent, serverContent);
            
            // Show merged result
            mergedPreview.textContent = mergedContent;
            customResolution.value = mergedContent;
            
            // Show conflict modal
            conflictModal.style.display = 'block';
            
            // Handle resolution selection
            const conflictResolverHandler = async (content) => {
                try {
                    // Save the resolved content
                    await fetchWithPin(`/api/notes/${notepadId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ content }),
                    });
                    
                    // Mark any offline edits for this notepad as synced
                    const pendingEdits = await OfflineSync.getPendingOfflineEdits();
                    for (const edit of pendingEdits) {
                        if (edit.notepadId === notepadId) {
                            await OfflineSync.markEditAsSynced(edit.id);
                        }
                    }
                    
                    // Close conflict modal
                    conflictModal.style.display = 'none';
                    
                    // If this is the current notepad, update the editor
                    if (notepadId === currentNotepadId) {
                        editor.value = content;
                        if (isPreviewMode) {
                            previewPane.innerHTML = marked.parse(content);
                        }
                    }
                    
                    resolve(true);
                } catch (err) {
                    console.error('Error saving conflict resolution:', err);
                    reject(err);
                }
            };
            
            // Set up event listeners for conflict resolution
            useLocalBtn.onclick = () => conflictResolverHandler(localContent);
            useServerBtn.onclick = () => conflictResolverHandler(serverContent);
            useMergedBtn.onclick = () => conflictResolverHandler(mergedContent);
            useCustomBtn.onclick = () => conflictResolverHandler(customResolution.value);
        });
    }
    
    // Update the sync status indicator
    function updateSyncStatus(status) {
        syncStatusIndicator.className = `sync-status ${status}`;
        
        switch(status) {
            case 'synced':
                syncStatusIndicator.title = 'All changes saved';
                break;
            case 'offline':
                syncStatusIndicator.title = 'You are working offline';
                break;
            case 'pending':
                syncStatusIndicator.title = 'Changes pending synchronization';
                break;
        }
    }
    
    // Set up network status listeners
    const connectivityListeners = OfflineSync.setupConnectivityListeners({
        onOnline: async () => {
            console.log('Back online');
            updateSyncStatus('pending');
            statusManager.show('Back online, syncing changes...', 'info', 3000);
            
            // Register for background sync
            if (window.registerSync) {
                window.registerSync();
            }
            
            // Check if we need to sync changes
            checkForOfflineEdits();
        },
        onOffline: () => {
            console.log('Went offline');
            updateSyncStatus('offline');
            statusManager.show('You are offline. Changes will be saved locally.', 'warning', 3000);
        }
    });
    
    // Check for offline edits at startup
    if (OfflineSync.isOnline()) {
        updateSyncStatus('synced');
    } else {
        updateSyncStatus('offline');
    }
    
    // Start the app
    initializeApp();
});