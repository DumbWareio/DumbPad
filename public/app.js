import { OperationsManager, OperationType } from './managers/operations.js';
import { CollaborationManager } from './managers/collaboration.js';
import { CursorManager } from './managers/cursor-manager.js';
import { ToastManager } from './managers/toaster.js';
import SearchManager from './managers/search.js';
import StorageManager from './managers/storage.js';
import SettingsManager from './managers/settings.js'
import ConfirmationManager from './managers/confirmation.js';
import { marked } from '/js/marked/marked.esm.js';
import markedExtendedTables from '/js/marked-extended-tables/index.js';
import markedAlert from '/js/marked-alert/index.js';
import * as markedHighlight from '/js/marked-highlight/index.umd.js';
// import { HighlightJS as hljs } from '/js/highlight.js/es/common.js';


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
        renameNotepad,
        addCopyButtonsToCodeBlocks: () => addCopyButtonsToCodeBlocks()
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

    // Copy current notepad link to clipboard
    const copyCurrentNotepadLink = async () => {
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
            
            if (isPreviewMode) {
                // Update preview if in preview mode
                previewPane.innerHTML = marked.parse(data.content);
                addCopyButtonsToCodeBlocks(); // Add copy buttons after rendering
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
                addCopyButtonsToCodeBlocks(); // Add copy buttons after rendering
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
                addCopyButtonsToCodeBlocks(); // Add copy buttons after rendering
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
            addCopyButtonsToCodeBlocks(); // Add copy buttons after rendering
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

    // Add copy buttons to code blocks
    function addCopyButtonsToCodeBlocks() {
        const codeBlocks = previewPane.querySelectorAll('pre');
        
        codeBlocks.forEach(pre => {
            // Remove existing copy button if present
            const existingButton = pre.querySelector('.copy-button');
            if (existingButton) {
                existingButton.remove();
            }
            
            // Create copy button
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
                    <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
                </svg>
            `;
            copyButton.setAttribute('aria-label', 'Copy to clipboard');
            
            // Add click handler
            copyButton.addEventListener('click', async () => {
                const codeElement = pre.querySelector('code');
                const textToCopy = codeElement ? codeElement.textContent : pre.textContent;
                
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    toaster.show('Copied to clipboard');
                } catch (err) {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = textToCopy;
                    document.body.appendChild(textArea);
                    textArea.select();
                    
                    try {
                        document.execCommand('copy');
                        toaster.show('Copied to clipboard');
                    } catch (fallbackErr) {
                        toaster.show('Failed to copy code', 'error');
                    }
                    
                    document.body.removeChild(textArea);
                }
            });
            
            // Add button to the pre element
            pre.appendChild(copyButton);
        });
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
    const printNotepad = async () => {
        const notepadName = notepadSelector.options[notepadSelector.selectedIndex].text;
        const content = editor.value;
        
        const printWindow = window.open('', '_blank');

        let formattedContent = notepadName.toLowerCase().endsWith('.md') || isPreviewMode
            ? marked.parse(content)
            : content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        
        // Auto-expand details elements for print by adding 'open' attribute
        const currentSettings = settingsManager.getSettings();
        if (formattedContent.includes('<details') && !currentSettings.disablePrintExpand) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = formattedContent;
            
            // Find all details elements and add the 'open' attribute
            const detailsElements = tempDiv.querySelectorAll('details');
            detailsElements.forEach(details => {
                details.setAttribute('open', '');
            });
            
            formattedContent = tempDiv.innerHTML;
        }
        
        // Get current theme
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        
        // Load main and preview styles for print
        let mainStyles = '';
        let previewStyles = '';
        let printStyles = '';
        try {
            const [mainResponse, previewResponse] = await Promise.all([
                fetch('Assets/styles.css'),
                fetch('Assets/preview-styles.css')
            ]);
            mainStyles = await mainResponse.text();
            previewStyles = await previewResponse.text();
        } catch (error) {
            console.warn('Could not load styles for print:', error);
        }
        
        // Create print-specific styles by wrapping preview styles in @media print
        printStyles = `
            /* Base print layout */
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                line-height: 1.6;
                padding: 2rem;
                color: var(--text-color);
                background-color: var(--bg-color);
                margin: 0;
            }

            /* Ensure proper theme inheritance */
            * {
                color: inherit;
                background-color: inherit;
            }

            @media print {
                /* Force browsers to print background colors */
                body {
                    padding: 1rem;
                    color: var(--text-color) !important;
                    background-color: var(--bg-color) !important;
                    -webkit-print-color-adjust: exact !important;
                    color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                /* Force all elements to preserve their theme colors */
                *, *::before, *::after {
                    -webkit-print-color-adjust: exact !important;
                    color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                /* Hide copy buttons in print */
                .copy-button {
                    display: none !important;
                }

                /* Inject all preview styles into print media */
                ${previewStyles}
            }
        `;
        
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
        
        // Update URL with selected notepad name
        const selectedOption = notepadSelector.options[notepadSelector.selectedIndex];
        if (selectedOption) {
            updateUrlWithNotepad(selectedOption.text);
        }
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
            inheritEditorStyles(previewPane);
            storageManager.save(THEME_KEY, currentTheme);
        });
    }

    const registerServiceWorker = async () => {
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
    
    const addBrowserNavigationListener = () => {
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

    const addEventListeners = () => {
        addThemeEventListeners();
        addEditorEventListeners();
        addNotepadControlsEventListeners();
        addShortcutEventListeners();
        addBrowserNavigationListener();
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

    function initializeMarkDown() {
        marked.use(markedExtendedTables()); // Use marked-extended-tables for table support
        marked.use(markedAlert()); // Use marked-alert for alert blocks
        marked.use(markedHighlight({
            emptyLangClass: 'hljs',
            langPrefix: 'hljs language-',
            highlight(code, lang, info) {
              const language = hljs.getLanguage(lang) ? lang : 'plaintext';
              return hljs.highlight(code, { language }).value;
            }
          })); 
        marked.setOptions({ // Set up markdown parser
            breaks: true,
            gfm: true
        });
    }

    const searchManager = new SearchManager(fetchWithPin, selectNotepad, closeAllModals);

    // Initialize the app
    const initializeApp = async () => {
        await registerServiceWorker();
        initializeMarkDown();
        setupToolTips();
        addEventListeners();

        fetch(`/api/config`)
            .then(response => response.json())
            .then(config => {
                if (config.error) throw new Error(config.error);

                document.getElementById('page-title').textContent = `${config.siteTitle} - Simple Notes`;
                document.getElementById('header-title').textContent = config.siteTitle;

                loadNotepads().then(() => {
                    loadNotes(currentNotepadId).then(() => {
                        // Update URL with current notepad name if no query param was present
                        const urlParams = new URLSearchParams(window.location.search);
                        if (!urlParams.has('id') && currentNotepads.length > 0) {
                            const currentNotepad = currentNotepads.find(np => np.id === currentNotepadId);
                            if (currentNotepad) {
                                updateUrlWithNotepad(currentNotepad.name);
                            }
                        }
                    });
                    // Mark initial load as complete after first load
                    isInitialLoad = false;
                });
            })
            .catch(err => {
                console.error('Error loading site configuration:', err);
                toaster.show(err, "error", true);
            });
        
        appSettings = settingsManager.loadSettings();
        applySettings(appSettings);
    };


    // Start the app
    initializeApp();
});