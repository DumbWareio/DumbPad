import { OperationsManager, OperationType } from './managers/operations.js';
import { CollaborationManager } from './managers/collaboration.js';
import { CursorManager } from './managers/cursor-manager.js';
import { ToastManager } from './managers/toaster.js';
import SearchManager from './managers/search.js';
import StorageManager from './managers/storage.js';
import SettingsManager from './managers/settings.js'
import ConfirmationManager from './managers/confirmation.js';
import { marked } from '/js/marked/marked.esm.js';

document.addEventListener('DOMContentLoaded', () => {
    const DEBUG = false;
    let isPreviewMode = false;
    const THEME_KEY = 'dumbpad_theme';
    let appSettings = {};
    const editorContainer = document.getElementById('editor-container');
    const editor = document.getElementById('editor');
    const previewContainer = document.getElementById('preview-container');
    const previewPane = document.getElementById('preview-pane');
    const themeToggle = document.getElementById('theme-toggle');
    const toaster = new ToastManager(document.getElementById('toast-container'));
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
    const settingsButton = document.getElementById('settings-button');
    const settingsModal = document.getElementById('settings-modal');
    const settingsCancel = document.getElementById('settings-cancel');
    const settingsSave = document.getElementById('settings-save');
    const settingsReset = document.getElementById('settings-reset');
    const settingsInputAutoSaveStatusInterval = document.getElementById('autosave-status-interval-input');
    const settingsEnableRemoteConnectionMessages = document.getElementById('settings-remote-connection-messages');

    let saveTimeout;
    let lastSaveTime = Date.now();
    const SAVE_INTERVAL = 2000;
    let currentNotepadId = 'default';
    let previousEditorValue = editor.value;

    // Initialize managers
    const operationsManager = new OperationsManager();
    operationsManager.DEBUG = DEBUG;
    const cursorManager = new CursorManager({ editor });
    cursorManager.DEBUG = DEBUG;
    const storageManager = new StorageManager();
    let currentTheme =  storageManager.load(THEME_KEY);
    const settingsManager = new SettingsManager(storageManager, applySettings);
    const confirmationManager = new ConfirmationManager();

    // Generate user ID and color
    const userId = Math.random().toString(36).substring(2, 15);
    window.userId = userId; // Store userId globally for debugging
    const userColor = getRandomColor(userId);

    let collaborationManager = null;
    
    // Initialize the collaboration manager
    collaborationManager = new CollaborationManager({
        userId,
        userColor,
        currentNotepadId,
        operationsManager,
        editor,
        onNotepadChange: loadNotepads,
        onUserDisconnect: (disconnectedUserId) => cursorManager.handleUserDisconnection(disconnectedUserId),
        onCursorUpdate: (remoteUserId, position, color) => cursorManager.updateCursorPosition(remoteUserId, position, color),
        settingsManager,
        toaster,
        confirmationManager,
        saveNotes,
        renameNotepad
    });
    collaborationManager.DEBUG = DEBUG;
    collaborationManager.setupWebSocket(); // Initialize WebSocket connection immediately

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
    
    // Add credentials to all API requests
    const fetchWithPin = async (url, options = {}) => {
        options.credentials = 'same-origin';
        try {
            return fetch(url, options); 
        } 
        catch (error) {
            console.log(error);
            toaster.show(error, "error", true);
        }
    };

    // Load notepads list
    async function loadNotepads() {
        try {
            const response = await fetchWithPin('/api/notepads');
            const data = await response.json();

            currentNotepadId = data['note_history'];
            if (collaborationManager) {
                const currentNotepadExists = data.notepads_list.some(np => np.id === currentNotepadId);
                if (currentNotepadExists) await selectNotepad(currentNotepadId);
                else currentNotepadId = await selectNextNotepad(false);
            }
            
            notepadSelector.innerHTML = data.notepads_list
                .map(pad => `<option value="${pad.id}"${pad.id === currentNotepadId ? 'selected' : ''}>${pad.name}</option>`)
                .join('');
        } catch (err) {
            console.error('Error loading notepads:', err);
            return [];
        }
    };

    // Load notes
    async function loadNotes(notepadId) {
        try {
            const response = await fetchWithPin(`/api/notes/${notepadId}`);
            const data = await response.json();
            previousEditorValue = data.content;
            editor.value = data.content;
            
            if (isPreviewMode) {
                // Update preview if in preview mode
                previewPane.innerHTML = marked.parse(data.content);
            }
        } catch (err) {
            console.error('Error loading notes:', err);
        }
    };

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
    function toggleMarkdownPreview(toggle, enable, enableStatusMessage = true) {
        if (toggle) isPreviewMode = !isPreviewMode;
        else isPreviewMode = enable;
         
        if (isPreviewMode) {
            // Render and show the markdown
            inheritEditorStyles(previewPane);
            previewPane.innerHTML = marked.parse(editor.value);
            previewContainer.style.display = 'block';
            editorContainer.style.display = 'none';
            previewMarkdownBtn.classList.add('active');
            if (enableStatusMessage) toaster.show('Markdown Preview On', 'success');
        } else {
            previewContainer.style.display = 'none';
            editorContainer.style.display = 'block';
            previewMarkdownBtn.classList.remove('active');
            editor.focus();
            if (enableStatusMessage) toaster.show('Markdown Preview Off', 'error');
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

            toaster.show(`New notepad: ${newNotepad.name}`, 'success')
        } catch (err) {
            console.error('Error creating notepad:', err);
            toaster.show('Error creating notepad', 'error', true);
        }
    };

    // Rename notepad
    async function renameNotepad(newName, showStatus = true) {
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

            if (showStatus) toaster.show('Renamed notepad')
        } catch (err) {
            console.error('Error renaming notepad:', err);
            toaster.show('Error renaming notepad', 'error', true);
        }
    };

    // Save notes with debounce
    async function saveNotes(content, isAutoSave, showStatus = true) {
        try {
            await fetchWithPin(`/api/notes/${currentNotepadId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content }),
            });
            
            if (collaborationManager.ws && collaborationManager.ws.readyState === WebSocket.OPEN && !collaborationManager.isReceivingUpdate) {
                collaborationManager.ws.send(JSON.stringify({
                    type: 'update',
                    notepadId: currentNotepadId,
                    content: content
                }));
            }
            
            lastSaveTime = Date.now();

            if (showStatus) {
                if (isAutoSave) {
                    appSettings = settingsManager.getSettings();
                    toaster.show('Saved', 'success', false, appSettings.saveStatusMessageInterval); // Bypassed if interval is 0 or null
                }
                else toaster.show('Saved');
            }
        } catch (err) {
            console.error('Error saving notes:', err);
            toaster.show('Error saving', 'error', false, 3000);
        }
    };

    // Check if we should do a periodic save
    const checkPeriodicSave = (content) => {
        const now = Date.now();
        if (now - lastSaveTime >= SAVE_INTERVAL) {
            saveNotes(content, true);
        }
    };

    // Debounced save
    const debouncedSave = (content) => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            await saveNotes(content, true);
        }, 300);
    };

    // Delete notepad
    const deleteNotepad = async () => {
        try {
            if (currentNotepadId === 'default') {
                toaster.show('Cannot delete the default notepad', 'error');
                return;
            }
            const currentNotepadName = notepadSelector.options[notepadSelector.selectedIndex].textContent;
            
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
            
            if (collaborationManager.ws && collaborationManager.ws.readyState === WebSocket.OPEN) {
                collaborationManager.ws.send(JSON.stringify({
                    type: 'notepad_delete',
                    notepadId: currentNotepadId,
                    notepadName: currentNotepadName
                }));
            }

            await loadNotepads();
            
            // Hide Delete Modal
            deleteModal.classList.remove('visible');
            toaster.show('Notepad deleted')
        } catch (err) {
            console.error('Error deleting notepad:', err);
            toaster.show('Error deleting notepad', 'error', true);
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
        
        toaster.show('Downloading...');
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

        toaster.show('Printing...');
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
        newIndex <= 0 ? 0 : newIndex;
        notepadSelector.selectedIndex = newIndex;
        return newIndex;
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
        const notepadId = notepadSelector[newIndex].value;
        await selectNotepad(notepadId);
        return notepadId;
    }

    const hideModal = (modal, toastMessage) => {
        modal.classList.remove('visible');
        if (toastMessage) toaster.show(toastMessage);
        editor.focus();
    }

    const showModal = (modal, inputToFocus) => {
        closeAllModals() // close any open modals
        modal.classList.add('visible');
        if (inputToFocus) inputToFocus.focus();
    }

    const closeAllModals = () => {
        const modals = document.querySelectorAll('.modal');
        if (modals) modals.forEach(m => hideModal(m));
        searchManager.closeModal();
    }

    const addNotepadControlsEventListeners = () => {
        notepadSelector.addEventListener('change', async (e) => {
            await selectNotepad(e.target.value);
        });
    
        newNotepadBtn.addEventListener('click', createNotepad);
    
        renameNotepadBtn.addEventListener('click', () => {
            closeAllModals() // close any open modals
            const currentNotepad = notepadSelector.options[notepadSelector.selectedIndex];
            renameInput.value = currentNotepad.text;
            showModal(renameModal, renameInput);
        });
        renameInput.addEventListener('keyup', async (e) => {
            if (e.key === 'Enter') {
                const newName = renameInput.value.trim();
                if (newName) {
                    await renameNotepad(newName);
                    hideModal(renameModal);
                }
            }
        });
        renameCancel.addEventListener('click', () => {
            hideModal(renameModal);
        });
        renameConfirm.addEventListener('click', async () => {
            const newName = renameInput.value.trim();
            if (newName) {
                await renameNotepad(newName);
                hideModal(renameModal);
            }
        });
        
        deleteNotepadBtn.addEventListener('click', () => {
            if (currentNotepadId === 'default') {
                toaster.show('Cannot delete the default notepad', 'error');
                return;
            }

            document.querySelectorAll('.modal-ws-count').forEach(m => m.remove());
            if (collaborationManager.getWSCount() > 1) {
                const modalMessage = deleteModal.querySelector('.modal-message');
                const prependMessage = document.createElement('p');
                prependMessage.classList.add('modal-ws-count', 'modal-message');
                prependMessage.innerHTML = '<br/><strong>One or more Collaborators are connected<strong><br/>';
                modalMessage.parentNode.insertBefore(prependMessage, modalMessage);
            }
            showModal(deleteModal, deleteCancel);
        });
        deleteCancel.addEventListener('click', () => {
            hideModal(deleteModal);
        });
        deleteConfirm.addEventListener('click', async () => {
            await deleteNotepad();
        });
    
        downloadNotepadBtn.addEventListener('click', () => {
            showModal(downloadModal, downloadCancel);
        });
        downloadCancel.addEventListener('click', () => {
            hideModal(downloadModal);
        });
        downloadTxt.addEventListener('click', () => {
            // Download as TXT
            downloadNotepad('txt');
            hideModal(downloadModal);
        })
        downloadMd.addEventListener('click', () => {
            // Download as MD
            downloadNotepad('md');
            hideModal(downloadModal);
        });

        printNotepadBtn.addEventListener('click', () => {
            printNotepad();
        });
        previewMarkdownBtn.addEventListener('click', () => toggleMarkdownPreview(true));

        settingsButton.addEventListener('click', () => {
            settingsManager.loadSettings();
            showModal(settingsModal, settingsInputAutoSaveStatusInterval);
        });
        settingsCancel.addEventListener('click', () => {
            hideModal(settingsModal);
        });
        settingsReset.addEventListener('click', () => {
            settingsManager.loadSettings(true); // true resets to default
            hideModal(settingsModal, 'Settings reset');
        });
        settingsSave.addEventListener('click', () => {
            settingsManager.saveSettings();
            hideModal(settingsModal, 'Settings Saved');
        });
        settingsInputAutoSaveStatusInterval.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                settingsManager.saveSettings();
                hideModal(settingsModal, 'Settings Saved');
            }
        });
        settingsEnableRemoteConnectionMessages.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                settingsManager.saveSettings();
                hideModal(settingsModal, 'Settings Saved');
            }
        });
    }

    const addShortcutEventListeners = () => {
        document.addEventListener('keydown', async (e) => {
            if (e.key === 'Escape') closeAllModals();

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
                    case ',': {
                        e.preventDefault();
                        settingsButton.click();
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
                        await saveNotes(editor.value);
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

    const addThemeEventListeners = () => {
        // Theme toggle handler
        themeToggle.addEventListener('click', () => {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', currentTheme);
            themeToggle.innerHTML = currentTheme === 'dark' ? '<span class="sun">☀</span>' : '<span class="moon">☽</span>';
            inheritEditorStyles(previewPane);
            storageManager.save(THEME_KEY, currentTheme);
        });
    }

    const registerServiceWorker = () => {
        // Register PWA Service Worker
        if ("serviceWorker" in navigator) {
           navigator.serviceWorker.register("/service-worker.js")
               .then((reg) => console.log("Service Worker registered:", reg.scope))
               .catch((err) => console.log("Service Worker registration failed:", err));
       }
   }

    const addEventListeners = () => {
        addThemeEventListeners();
        addEditorEventListeners();
        addNotepadControlsEventListeners();
        addShortcutEventListeners();
        searchManager.addEventListeners();
    }

    const detectOS = () => {
        const userAgent = navigator.userAgent;
        const isMac = /Macintosh|Mac OS X/i.test(userAgent);
        return isMac;
    }

    const setupToolTips = () => {
        // Check if it's a mobile device using a media query or pointer query
        const isMobile = window.matchMedia('(max-width: 585px)').matches || window.matchMedia('(pointer: coarse)').matches;
        if (isMobile) return;

        const isMac = detectOS();
        
        tooltips.forEach((element) => {
            let tooltipText = element.getAttribute('data-tooltip');
            const shortcutsStr = element.getAttribute('data-shortcuts');

            if (tooltipText && shortcutsStr) {
                try {
                    const shortcuts = JSON.parse(shortcutsStr);
                    let shortcutToUse = isMac ? shortcuts.mac : shortcuts.win;
    
                    if (shortcutToUse) {
                        tooltipText = tooltipText.replace(`{shortcut}`, shortcutToUse);
                        element.setAttribute('data-tooltip', tooltipText);
                    } else {
                        console.warn(`No shortcut found for ${isMac ? 'mac' : 'win'}`);
                    }
    
                } catch (error) {
                    console.error("Error parsing shortcuts:", error);
                }
            }

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
    
    function applySettings(currentSettings) {
        toggleMarkdownPreview(false, currentSettings.defaultMarkdownPreview, false);
    };

    const searchManager = new SearchManager(fetchWithPin, selectNotepad, closeAllModals);

    // Initialize the app
    const initializeApp = async () => {
        fetch(`/api/config`)
            .then(response => response.json())
            .then(config => {
                if (config.error) throw new Error(config.error);

                document.getElementById('page-title').textContent = `${config.siteTitle} - Simple Notes`;
                document.getElementById('header-title').textContent = config.siteTitle;

                loadNotepads().then(() => {
                    loadNotes(currentNotepadId);
                });
            })
            .catch(err => {
                console.error('Error loading site configuration:', err);
                toaster.show(err, "error", true);
            });
        
        appSettings = settingsManager.loadSettings();

        addEventListeners();
        setupToolTips();
        marked.setOptions({ // Set up markdown parser
            breaks: true,
            gfm: true
        });

        applySettings(appSettings);

        registerServiceWorker();
    };


    // Start the app
    initializeApp();
});