import { OperationsManager, OperationType } from './managers/operations.js';
import { CollaborationManager } from './managers/collaboration.js';
import { CursorManager } from './managers/cursor-manager.js';
import { ToastManager } from './managers/toaster.js';
import SearchManager from './managers/search.js';
import StorageManager from './managers/storage.js';
import SettingsManager from './managers/settings.js'
import ConfirmationManager from './managers/confirmation.js';
import { PreviewManager } from './managers/preview.js';
import { marked } from '/js/marked/marked.esm.js';

document.addEventListener('DOMContentLoaded', async () => {
    const DEBUG = false;
    const THEME_KEY = 'dumbpad_theme';
    let appSettings = {};
    const editorContainer = document.getElementById('editor-container');
    const editor = document.getElementById('editor');
    const previewContainer = document.getElementById('preview-container');
    const previewPane = document.getElementById('preview-pane');
    const themeToggle = document.getElementById('theme-toggle');
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    const toaster = new ToastManager(document.getElementById('toast-container'));
    const copyLinkBtn = document.getElementById('copy-link');
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
    let currentNotepads = []; // Global array to hold current notepads list
    let isInitialLoad = true; // Track if this is the initial page load
    let isHandlingTabOperation = false; // Flag to prevent input event interference with tab operations

    // Initialize managers
    const operationsManager = new OperationsManager();
    operationsManager.DEBUG = DEBUG;
    const cursorManager = new CursorManager({ editor });
    cursorManager.DEBUG = DEBUG;
    const storageManager = new StorageManager();
    let currentTheme =  storageManager.load(THEME_KEY);
    const settingsManager = new SettingsManager(storageManager, applySettings);
    const confirmationManager = new ConfirmationManager();
    const searchManager = new SearchManager(fetchWithPin, selectNotepad, closeAllModals);
    
    // Initialize preview manager
    const previewManager = new PreviewManager({
        editor,
        editorContainer,
        previewContainer,
        previewPane,
        previewMarkdownBtn,
        toaster,
        collaborationManager: null, // Will be set after collaboration manager is created
        marked
    });
    previewManager.DEBUG = DEBUG;

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
        renameNotepad,
        addCopyLangButtonsToCodeBlocks: () => previewManager.addCopyLangButtonsToCodeBlocks()
    });
    collaborationManager.DEBUG = DEBUG;
    collaborationManager.setupWebSocket(); // Initialize WebSocket connection immediately
    
    // Set collaboration manager reference in preview manager
    previewManager.collaborationManager = collaborationManager;

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
    async function fetchWithPin(url, options = {}) {
        options.credentials = 'same-origin';
        try {
            return fetch(url, options); 
        } 
        catch (error) {
            console.log(error);
            toaster.show(error, "error", true);
        }
    };

    // Copy current notepad link to clipboard
    async function copyCurrentNotepadLink() {
        try {
            const currentUrl = window.location.href;
            await navigator.clipboard.writeText(currentUrl);
            toaster.show('Link copied to clipboard', 'success');
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = window.location.href;
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                document.execCommand('copy');
                toaster.show('Link copied to clipboard', 'success');
            } catch (fallbackErr) {
                toaster.show('Failed to copy link', 'error');
            }
            
            document.body.removeChild(textArea);
        }
    };

    // Update URL with notepad name without reloading the page
    function updateUrlWithNotepad(notepadName) {
        if (!notepadName) return;
        
        const url = new URL(window.location);
        url.searchParams.set('id', notepadName);
        
        // Use pushState to update URL without reloading
        window.history.pushState({ notepadName }, '', url.toString());
    }

    // Handle query parameter selection on initial page load
    function handleQueryParameterSelection(notepadsList, defaultNotepadId) {
        if (!isInitialLoad) {
            return defaultNotepadId; // Return default if not initial load
        }

        const urlParams = new URLSearchParams(window.location.search);
        const requestedId = urlParams.get('id');
        
        if (requestedId) {
            // Try to find notepad by ID first, then by name (case-insensitive)
            const foundNotepad = notepadsList.find(np => 
                np.id === requestedId || np.name.toLowerCase() === requestedId.toLowerCase()
            );
            
            if (foundNotepad) {
                return foundNotepad.id;
            } else {
                // Notepad not found, show error toast
                toaster.show(`Notepad '${requestedId}' not found`, 'error');
            }
        }
        
        return defaultNotepadId; // Return default if no query param or not found
    }

    // Load notepads list
    async function loadNotepads() {
        try {
            const response = await fetchWithPin('/api/notepads');
            const data = await response.json();
            
            // Store notepads list globally for navigation and lookup
            currentNotepads = data.notepads_list;

            // Handle query parameter selection (only on initial page load)
            const selectedNotepadId = handleQueryParameterSelection(data.notepads_list, data['note_history']);
            
            currentNotepadId = selectedNotepadId;
            if (collaborationManager) {
                const currentNotepadExists = data.notepads_list.some(np => np.id === currentNotepadId);
                if (currentNotepadExists) await selectNotepad(currentNotepadId);
                else currentNotepadId = await selectNextNotepad(false);
            }
            
            notepadSelector.innerHTML = data.notepads_list
                .map(pad => `<option value="${pad.id}"${pad.id === currentNotepadId ? ' selected' : ''}>${pad.name}</option>`)
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
            
            if (previewManager.getPreviewMode()) {
                // Update preview if in preview mode
                await previewManager.renderMarkdownPreview(data.content);
            }
        } catch (err) {
            console.error('Error loading notes:', err);
        }
    };

    // Helper function to handle tab indentation
    function handleTabIndentation(textarea, start, end, value) {
        isHandlingTabOperation = true;
        
        if (start === end) {
            // No selection: insert two spaces at cursor position
            // Use execCommand for better undo support
            if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                document.execCommand('insertText', false, '  ');
            } else {
                // Fallback: manual insertion with collaboration support
                textarea.setRangeText('  ', start, end, 'end');
                
                // Create operation for collaboration
                const operation = operationsManager.createOperation(
                    OperationType.INSERT,
                    start,
                    '  ',
                    userId
                );
                collaborationManager.sendOperation(operation);
            }
        } else {
            // Selection: indent all selected lines
            const lines = value.split('\n');
            const startLine = value.substring(0, start).split('\n').length - 1;
            const endLine = value.substring(0, end).split('\n').length - 1;
            
            // Build the replacement text
            let replacementText = '';
            let currentPos = 0;
            
            for (let i = startLine; i <= endLine; i++) {
                if (i > startLine) replacementText += '\n';
                replacementText += '  ' + lines[i];
            }
            
            // Find the actual start and end positions of the selected lines
            const lineStartPos = value.lastIndexOf('\n', start - 1) + 1;
            const lineEndPos = end === value.length ? value.length : 
                (value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end));
            
            // Get the original text that will be replaced
            const originalText = value.substring(lineStartPos, lineEndPos);
            
            // Use execCommand for better undo support
            if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                textarea.setSelectionRange(lineStartPos, lineEndPos);
                document.execCommand('insertText', false, replacementText);
                
                // Adjust selection to reflect the changes
                const addedChars = (endLine - startLine + 1) * 2;
                textarea.setSelectionRange(start + 2, end + addedChars);
            } else {
                // Fallback: manual replacement with collaboration support
                textarea.value = value.substring(0, lineStartPos) + replacementText + value.substring(lineEndPos);
                
                // Adjust selection
                const addedChars = (endLine - startLine + 1) * 2;
                textarea.setSelectionRange(start + 2, end + addedChars);
                
                // Create operations for collaboration
                if (originalText !== replacementText) {
                    // Send delete operation for original text
                    const deleteOperation = operationsManager.createOperation(
                        OperationType.DELETE,
                        lineStartPos,
                        originalText,
                        userId
                    );
                    collaborationManager.sendOperation(deleteOperation);
                    
                    // Send insert operation for new text
                    const insertOperation = operationsManager.createOperation(
                        OperationType.INSERT,
                        lineStartPos,
                        replacementText,
                        userId
                    );
                    collaborationManager.sendOperation(insertOperation);
                }
            }
        }
        
        // Update previous editor value for change detection
        previousEditorValue = textarea.value;
        
        // Update preview if active
        previewManager.updatePreviewIfActive(textarea.value);
        
        // Save changes
        debouncedSave(textarea.value);
        
        // Clear the flag after a short delay to allow any pending events to be ignored
        setTimeout(() => {
            isHandlingTabOperation = false;
        }, 50);
    }

    // Helper function to handle shift+tab (unindent)
    function handleShiftTabIndentation(textarea, start, end, value) {
        isHandlingTabOperation = true;
        
        if (start === end) {
            // No selection: remove indentation from current line
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const lineEnd = value.indexOf('\n', start);
            const lineText = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);
            
            if (lineText.startsWith('  ')) {
                // Calculate the actual positions
                const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
                const newLineText = lineText.substring(2);
                const newText = newLineText;
                
                // Use execCommand for better undo support  
                if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                    textarea.setSelectionRange(lineStart, actualLineEnd);
                    document.execCommand('insertText', false, newText);
                    
                    // Adjust cursor position
                    const newCursorPos = Math.max(lineStart, start - 2);
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                } else {
                    // Fallback: manual replacement with collaboration support
                    textarea.value = value.substring(0, lineStart) + newText + value.substring(actualLineEnd);
                    
                    // Adjust cursor position
                    const newCursorPos = Math.max(lineStart, start - 2);
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                    
                    // Create operations for collaboration
                    const deleteOperation = operationsManager.createOperation(
                        OperationType.DELETE,
                        lineStart,
                        '  ',
                        userId
                    );
                    collaborationManager.sendOperation(deleteOperation);
                }
                
                // Update previous editor value for change detection
                previousEditorValue = textarea.value;
                
                // Update preview if active
                previewManager.updatePreviewIfActive(textarea.value);
                
                // Save changes
                debouncedSave(textarea.value);
            }
        } else {
            // Selection: remove indentation from all selected lines
            const lines = value.split('\n');
            const startLine = value.substring(0, start).split('\n').length - 1;
            const endLine = value.substring(0, end).split('\n').length - 1;
            
            // Find lines that can be unindented
            const linesToUnindent = [];
            for (let i = startLine; i <= endLine; i++) {
                if (lines[i].startsWith('  ')) {
                    linesToUnindent.push(i);
                }
            }
            
            if (linesToUnindent.length > 0) {
                // Build the replacement text
                let replacementText = '';
                for (let i = startLine; i <= endLine; i++) {
                    if (i > startLine) replacementText += '\n';
                    if (lines[i].startsWith('  ')) {
                        replacementText += lines[i].substring(2);
                    } else {
                        replacementText += lines[i];
                    }
                }
                
                // Find the actual start and end positions of the selected lines
                const lineStartPos = value.lastIndexOf('\n', start - 1) + 1;
                const lineEndPos = end === value.length ? value.length : 
                    (value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end));
                
                // Get the original text that will be replaced
                const originalText = value.substring(lineStartPos, lineEndPos);
                
                // Use execCommand for better undo support
                if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                    textarea.setSelectionRange(lineStartPos, lineEndPos);
                    document.execCommand('insertText', false, replacementText);
                    
                    // Adjust selection
                    const removedChars = linesToUnindent.length * 2;
                    const removedFromStart = lines[startLine].startsWith('  ') ? 2 : 0;
                    const newStart = Math.max(0, start - removedFromStart);
                    const newEnd = Math.max(newStart, end - removedChars);
                    textarea.setSelectionRange(newStart, newEnd);
                } else {
                    // Fallback: manual replacement with collaboration support
                    textarea.value = value.substring(0, lineStartPos) + replacementText + value.substring(lineEndPos);
                    
                    // Adjust selection
                    const removedChars = linesToUnindent.length * 2;
                    const removedFromStart = lines[startLine].startsWith('  ') ? 2 : 0;
                    const newStart = Math.max(0, start - removedFromStart);
                    const newEnd = Math.max(newStart, end - removedChars);
                    textarea.setSelectionRange(newStart, newEnd);
                    
                    // Create operations for collaboration
                    if (originalText !== replacementText) {
                        // Send delete operation for original text
                        const deleteOperation = operationsManager.createOperation(
                            OperationType.DELETE,
                            lineStartPos,
                            originalText,
                            userId
                        );
                        collaborationManager.sendOperation(deleteOperation);
                        
                        // Send insert operation for new text
                        const insertOperation = operationsManager.createOperation(
                            OperationType.INSERT,
                            lineStartPos,
                            replacementText,
                            userId
                        );
                        collaborationManager.sendOperation(insertOperation);
                    }
                }
                
                // Update previous editor value for change detection
                previousEditorValue = textarea.value;
                
                // Update preview if active
                previewManager.updatePreviewIfActive(textarea.value);
                
                // Save changes
                debouncedSave(textarea.value);
            }
        }
        
        // Clear the flag after a short delay to allow any pending events to be ignored
        setTimeout(() => {
            isHandlingTabOperation = false;
        }, 50);
    }

    function addEditorEventListeners() {
        // Track cursor position and selection
        editor.addEventListener('mouseup', () => collaborationManager.updateLocalCursor());
        editor.addEventListener('keyup', () => collaborationManager.updateLocalCursor());
        editor.addEventListener('click', () => collaborationManager.updateLocalCursor());
        editor.addEventListener('scroll', () => cursorManager.updateAllCursors());

        // Handle tab/shift-tab indentation
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault(); // Prevent default tab behavior (focus change)
                
                const textarea = e.target;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const value = textarea.value;
                
                if (e.shiftKey) {
                    // Shift+Tab: Remove indentation
                    handleShiftTabIndentation(textarea, start, end, value);
                } else {
                    // Tab: Add indentation
                    handleTabIndentation(textarea, start, end, value);
                }

                collaborationManager.updateLocalCursor();
            }
        });

        // Handle text input events
        editor.addEventListener('input', (e) => {
            if (collaborationManager.isReceivingUpdate) {
                if (DEBUG) console.log('Ignoring input event during remote update');
                return;
            }
            
            // Skip input handling if we're in the middle of a tab operation
            if (isHandlingTabOperation) {
                if (DEBUG) console.log('Ignoring input event during tab operation');
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
            previewManager.updatePreviewIfActive(target.value);

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
            previewManager.updatePreviewIfActive(target.value);
        
            debouncedSave(target.value);
            collaborationManager.updateLocalCursor();
        });
    }

    /* Notepad Controls */
    // Create new notepad
    async function createNotepad() {
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
            if (previewManager.getPreviewMode()) {
                previewManager.clearPreview();
            }
            
            // Update URL with new notepad name
            updateUrlWithNotepad(newNotepad.name);
            
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
            const response = await fetchWithPin(`/api/notepads/${currentNotepadId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: newName }),
            });
            
            const result = await response.json();
            await loadNotepads();
            notepadSelector.value = currentNotepadId;
            
            // Show notification if the backend modified the name for uniqueness
            if (result.name !== newName && showStatus) {
                toaster.show(`Name changed to "${result.name}" to ensure uniqueness`);
            }
            
            // Update URL with new notepad name
            updateUrlWithNotepad(result.name);
            
            // Broadcast the rename to other users (use the final name from server)
            if (collaborationManager.ws && collaborationManager.ws.readyState === WebSocket.OPEN) {
                collaborationManager.ws.send(JSON.stringify({
                    type: 'notepad_rename',
                    notepadId: currentNotepadId,
                    newName: result.name
                }));
            }

            if (showStatus && result.name === newName) {
                toaster.show('Renamed notepad');
            }
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
    function checkPeriodicSave(content) {
        const now = Date.now();
        if (now - lastSaveTime >= SAVE_INTERVAL) {
            saveNotes(content, true);
        }
    };

    // Debounced save
    function debouncedSave(content) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            await saveNotes(content, true);
        }, 300);
    };

    // Delete notepad
    async function deleteNotepad() {
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
    function downloadNotepad(extension) {
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
    async function printNotepad() {
        const notepadName = notepadSelector.options[notepadSelector.selectedIndex].text;
        const content = editor.value;
        const currentSettings = settingsManager.getSettings();
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        
        const printWindow = window.open('', '_blank');

        try {
            const { formattedContent, mainStyles, previewStyles, highlightStyles, printStyles } = 
                await previewManager.preparePrintContent(content, notepadName, currentSettings, currentTheme);
            
            printWindow.document.write(`
                <!DOCTYPE html>
                <html data-theme="${currentTheme}">
                <head>
                    <title>${notepadName}</title>
                    <style>
                        /* Main application styles */
                        ${mainStyles}
                        
                        /* Preview styles */
                        ${previewStyles}
                        
                        /* Highlight.js theme styles */
                        ${highlightStyles}
                        
                        /* Dynamic print styles with injected preview styles */
                        ${printStyles}
                    </style>
                </head>
                <body>
                    <div id="preview-pane">
                        ${formattedContent}
                    </div>
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
        } catch (error) {
            console.error('Error preparing print content:', error);
            toaster.show('Error preparing print', 'error');
            printWindow.close();
        }
    };

    function getNotepadIndexById(id) {
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
    async function selectNotepad(id) {
        currentNotepadId = id;
        collaborationManager.currentNotepadId = currentNotepadId;
        await loadNotes(currentNotepadId);
        editor.focus();

        notepadSelector.selectedIndex = getNotepadIndexById(id);
        
        // Update URL with selected notepad name
        const selectedOption = notepadSelector.options[notepadSelector.selectedIndex];
        if (selectedOption) {
            updateUrlWithNotepad(selectedOption.text);
        }
    }

    function getNextNotepadIndex(forward = true) {
        const options = notepadSelector.options;
        const currentIndex = notepadSelector.selectedIndex;
        let newIndex;
        if (forward)
            newIndex = (currentIndex + 1) % options.length;
        else // backwards
            newIndex = (currentIndex - 1 + options.length) % options.length;

        return newIndex;
    }

    async function selectNextNotepad(forward = true) {
        const newIndex = getNextNotepadIndex(forward);
        const notepadId = notepadSelector[newIndex].value;
        await selectNotepad(notepadId);
        return notepadId;
    }

    function hideModal(modal, toastMessage) {
        modal.classList.remove('visible');
        if (toastMessage) toaster.show(toastMessage);
        editor.focus();
    }

    function showModal(modal, inputToFocus) {
        closeAllModals() // close any open modals
        modal.classList.add('visible');
        if (inputToFocus) inputToFocus.focus();
    }

    function closeAllModals() {
        const modals = document.querySelectorAll('.modal');
        if (modals) modals.forEach(m => hideModal(m));
        searchManager.closeModal();
    }

    function addNotepadControlsEventListeners() {
        copyLinkBtn.addEventListener('click', copyCurrentNotepadLink);
        
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
        previewMarkdownBtn.addEventListener('click', () => previewManager.toggleMarkdownPreview(true));

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

    function addShortcutEventListeners() {
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

    function addThemeEventListeners() {
        // Theme toggle handler
        themeToggle.addEventListener('click', () => {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', currentTheme);
            previewManager.updateHighlightTheme(currentTheme);
            previewManager.inheritEditorStyles(previewManager.previewPane);
            storageManager.save(THEME_KEY, currentTheme);
        });
    }

    async function registerServiceWorker() {
        // Helper function to check service worker version
        const checkServiceWorkerVersion = async (currentAppVersion) => {
            if (navigator.serviceWorker.controller) {
                const messageChannel = new MessageChannel();
                
                messageChannel.port1.onmessage = (event) => {
                    const { updated, firstInstall, version } = event.data;
                    console.log('Service worker version check result:', { updated, firstInstall, version });
                    
                    // Update header title tooltip with current version
                    const headerTitle = document.getElementById('header-title');
                    headerTitle.setAttribute('data-tooltip', `Version: ${version}`);
                    
                    if (updated && !firstInstall) {
                        console.log('Cache updated - reloading page');
                        toaster.show('App updated! Reloading...');
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    } else if (updated && firstInstall) {
                        console.log('Cache installed for the first time');
                    }
                };
                
                navigator.serviceWorker.controller.postMessage(
                    { 
                        type: 'CHECK_VERSION',
                        currentVersion: currentAppVersion 
                    }, 
                    [messageChannel.port2]
                );
            }
        };

        // Register PWA Service Worker
        if ("serviceWorker" in navigator) {
           try {
               const registration = await navigator.serviceWorker.register("/service-worker.js");
               console.log("Service Worker registered:", registration.scope);
               
               // Get the current app version from config
               const configResponse = await fetchWithPin('/api/config');
               const config = await configResponse.json();
               const currentAppVersion = config.version;
               
               // Check for updates
               registration.addEventListener('updatefound', () => {
                   console.log('Service Worker update found');
                   const newWorker = registration.installing;
                   
                   newWorker.addEventListener('statechange', () => {
                       if (newWorker.state === 'installed') {
                           if (navigator.serviceWorker.controller) {
                               // New service worker is installed, but old one is still controlling
                               console.log('New service worker available, will activate on next page load');
                               // The service worker will handle the cache update and page reload
                           } else {
                               // First service worker installation
                               console.log('Service worker installed for the first time');
                           }
                       }
                   });
               });

               // Listen for service worker controller changes
               navigator.serviceWorker.addEventListener('controllerchange', () => {
                   console.log('Service worker controller changed - new version active');
                   // Wait a bit for the new service worker to be ready, then check version
                   setTimeout(() => {
                       checkServiceWorkerVersion(currentAppVersion);
                   }, 100);
               });

               // Wait for service worker to be ready, then check version
               await navigator.serviceWorker.ready;
               
               // Initial version check
               await checkServiceWorkerVersion(currentAppVersion);
           } catch (err) {
               console.log("Service Worker registration failed:", err);
               // Fallback: set version from config if service worker fails
               try {
                   const configResponse = await fetchWithPin('/api/config');
                   const config = await configResponse.json();
                   const headerTitle = document.getElementById('header-title');
                   headerTitle.setAttribute('data-tooltip', `Version: ${config.version} (no cache)`);
               } catch (configErr) {
                   console.log("Config fetch failed:", configErr);
               }
           }

           // Listen for messages from service worker
           navigator.serviceWorker.addEventListener('message', event => {
               if (event.data && event.data.type === 'CACHE_UPDATED') {
                   // Update tooltip with the new version
                   if (event.data.version) {
                       const headerTitle = document.getElementById('header-title');
                       headerTitle.setAttribute('data-tooltip', `Version: ${event.data.version}`);
                   }
                   
                   if (event.data.reload) {
                       console.log('Cache updated - reloading page');
                       toaster.show('App updated! Reloading...');
                       setTimeout(() => {
                           window.location.reload();
                       }, 1000);
                   }
               } else if (event.data && event.data.type === 'CACHE_INSTALLED') {
                   // Update tooltip with the new version
                   if (event.data.version) {
                       const headerTitle = document.getElementById('header-title');
                       headerTitle.setAttribute('data-tooltip', `Version: ${event.data.version}`);
                   }
                   
                   console.log('Cache installed for the first time');
               }
           });
       }
    }
    
    function addBrowserNavigationListener() {
        // Handle browser back/forward buttons
        window.addEventListener('popstate', async (event) => {
            const urlParams = new URLSearchParams(window.location.search);
            const requestedId = urlParams.get('id');
            
            if (requestedId && currentNotepads.length > 0) {
                // Find notepad by name (case-insensitive) or ID
                const foundNotepad = currentNotepads.find(np => 
                    np.id === requestedId || np.name.toLowerCase() === requestedId.toLowerCase()
                );
                
                if (foundNotepad && foundNotepad.id !== currentNotepadId) {
                    // Don't update URL again since we're responding to a popstate
                    const tempSelectNotepad = async (id) => {
                        currentNotepadId = id;
                        collaborationManager.currentNotepadId = currentNotepadId;
                        await loadNotes(currentNotepadId);
                        editor.focus();
                        notepadSelector.selectedIndex = getNotepadIndexById(id);
                    };
                    
                    await tempSelectNotepad(foundNotepad.id);
                }
            }
        });
    };

    function addEventListeners() {
        addThemeEventListeners();
        addEditorEventListeners();
        addNotepadControlsEventListeners();
        addShortcutEventListeners();
        addBrowserNavigationListener();
        searchManager.addEventListeners();
    }

    function detectOS() {
        const userAgent = navigator.userAgent;
        const isMac = /Macintosh|Mac OS X/i.test(userAgent);
        return isMac;
    }

    function setupToolTips() {
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
        previewManager.toggleMarkdownPreview(false, currentSettings.defaultMarkdownPreview, false);
    };

    // Initialize the app
    const initializeApp = async () => {
        setupToolTips();
        addEventListeners();
        appSettings = settingsManager.loadSettings();

        fetch(`/api/config`)
            .then(response => response.json())
            .then(config => { // Load config and initialize markdown functionality
                if (config.error) throw new Error(config.error);

                document.getElementById('page-title').textContent = `${config.siteTitle} - Simple Notes`;
                document.getElementById('header-title').textContent = config.siteTitle;
                
                return previewManager.initializeMarkdown(currentTheme, editor.value);
            })
            .then(async () => { // Load notepads after config and markdown is initialized
                await loadNotepads();
                await loadNotes(currentNotepadId);
                const urlParams = new URLSearchParams(window.location.search);
                if (!urlParams.has('id') && currentNotepads.length > 0) {
                    const currentNotepad = currentNotepads.find(np => np.id === currentNotepadId);
                    if (currentNotepad) updateUrlWithNotepad(currentNotepad.name);
                }
            })
            .finally(() => {
                isInitialLoad = false;
            })
            .catch(err => {
                console.error('Error loading site configuration:', err);
                toaster.show(err, "error", true);
            });
        
        applySettings(appSettings);
        await registerServiceWorker();
    };

    // Start the app
    initializeApp();
});