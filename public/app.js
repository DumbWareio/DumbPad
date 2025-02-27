import { OperationsManager, OperationType } from './operations.js';
import { CollaborationManager } from './collaboration.js';
import { CursorManager } from './cursor-manager.js';
import { marked } from '/js/marked/marked.esm.js';

// Set up markdown parser
marked.setOptions({
    breaks: true,
    gfm: true
});

document.addEventListener('DOMContentLoaded', () => {
    const DEBUG = false;
    const editor = document.getElementById('editor');
    const themeToggle = document.getElementById('theme-toggle');
    const saveStatus = document.getElementById('save-status');
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
    // Download modal elements
    const downloadModal = document.getElementById('download-modal');
    const downloadTxt = document.getElementById('download-txt');
    const downloadMd = document.getElementById('download-md');
    const downloadCancel = document.getElementById('download-cancel');
    // Inject markdown preview pane
    const previewPane = document.createElement('div');
    previewPane.id = 'preview-pane';
    previewPane.className = 'preview-container';
    const editorContainer = editor.parentElement;
    editorContainer.appendChild(previewPane);
    let isPreviewMode = false;
    
    // Theme handling
    const THEME_KEY = 'dumbpad_theme';
    let currentTheme = localStorage.getItem(THEME_KEY) || 'light';
    
    // Apply initial theme
    document.body.classList.toggle('dark-mode', currentTheme === 'dark');
    themeToggle.innerHTML = currentTheme === 'dark' ? '<span class="sun">☀</span>' : '<span class="moon">☽</span>';
    
    // Theme toggle handler
    themeToggle.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.classList.toggle('dark-mode');
        themeToggle.innerHTML = currentTheme === 'dark' ? '<span class="sun">☀</span>' : '<span class="moon">☽</span>';
        localStorage.setItem(THEME_KEY, currentTheme);
    });
    
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
            
            notepadSelector.innerHTML = data.notepads_list.notepads
                .map(pad => `<option value="${pad.id}"${pad.id === currentNotepadId?'selected':''}>${pad.name}</option>`)
                .join('');
        } catch (err) {
            console.error('Error loading notepads:', err);
            return [];
        }
    };

    // Load notes
    const loadNotes = async (notepadId) => {
        try {
            const response = await fetchWithPin(`/api/notes/${notepadId}`);
            const data = await response.json();
            editor.value = data.content;
            previousEditorValue = data.content;
            
            // Update preview if in preview mode
            if (isPreviewMode) {
                previewPane.innerHTML = marked.parse(data.content);
            }
        } catch (err) {
            console.error('Error loading notes:', err);
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
        debouncedSave(target.value);
        collaborationManager.updateLocalCursor();
        
        // Update markdown preview in real-time if in preview mode
        if (isPreviewMode) {
            previewPane.innerHTML = marked.parse(target.value);
        }
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
        
        debouncedSave(target.value);
        collaborationManager.updateLocalCursor();
        
        // Update markdown preview if in preview mode
        if (isPreviewMode) {
            previewPane.innerHTML = marked.parse(target.value);
        }
    });

    // Function to toggle between edit and preview modes
    const toggleMarkdownPreview = () => {
        isPreviewMode = !isPreviewMode;
        
        if (isPreviewMode) {
            // Render and show the markdown
            previewPane.innerHTML = marked.parse(editor.value);
            previewPane.style.display = 'block';
            editor.style.display = 'none';
            
            // Apply the same styling as the editor
            previewPane.style.backgroundColor = window.getComputedStyle(editor).backgroundColor;
            previewPane.style.color = window.getComputedStyle(editor).color;
            previewPane.style.padding = window.getComputedStyle(editor).padding;
            previewMarkdownBtn.classList.add('active');

        } else {
            previewPane.style.display = 'none';
            editor.style.display = 'block';
            previewMarkdownBtn.classList.remove('active');
        }
    };
    
    // Add event listener for the markdown toggle button
    previewMarkdownBtn.addEventListener('click', toggleMarkdownPreview);

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
        } catch (err) {
            console.error('Error creating notepad:', err);
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
        } catch (err) {
            console.error('Error renaming notepad:', err);
        }
    };

    // Save notes with debounce
    const saveNotes = async (content) => {
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
            
            saveStatus.textContent = 'Saved';
            saveStatus.classList.add('visible');
            lastSaveTime = Date.now();
            setTimeout(() => {
                saveStatus.classList.remove('visible');
            }, 2000);
        } catch (err) {
            console.error('Error saving notes:', err);
            saveStatus.textContent = 'Error saving';
            saveStatus.classList.add('visible');
            setTimeout(() => {
                saveStatus.classList.remove('visible');
            }, 2000);
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

    notepadSelector.addEventListener('change', (e) => {
        currentNotepadId = e.target.value;
        collaborationManager.currentNotepadId = currentNotepadId;
        loadNotes(currentNotepadId);
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
            currentNotepadId = 'default';
            collaborationManager.currentNotepadId = currentNotepadId;
            notepadSelector.value = currentNotepadId;
            await loadNotes(currentNotepadId);
            
            if (collaborationManager.ws && collaborationManager.ws.readyState === WebSocket.OPEN) {
                collaborationManager.ws.send(JSON.stringify({
                    type: 'notepad_change'
                }));
            }
            
            saveStatus.textContent = 'Notepad deleted';
            saveStatus.classList.add('visible');
            setTimeout(() => {
                saveStatus.classList.remove('visible');
            }, 2000);
        } catch (err) {
            console.error('Error deleting notepad:', err);
            saveStatus.textContent = 'Error deleting notepad';
            saveStatus.classList.add('visible');
            setTimeout(() => {
                saveStatus.classList.remove('visible');
            }, 2000);
        }
    };

    deleteNotepadBtn.addEventListener('click', () => {
        if (currentNotepadId === 'default') {
            alert('Cannot delete the default notepad');
            return;
        }
        deleteModal.classList.add('visible');
    });

    deleteCancel.addEventListener('click', () => {
        deleteModal.classList.remove('visible');
    });

    deleteConfirm.addEventListener('click', async () => {
        await deleteNotepad();
        deleteModal.classList.remove('visible');
    });

    // Handle Ctrl+S
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveNotes(editor.value);
        }
    });

    // Show download modal
    downloadNotepadBtn.addEventListener('click', () => {
        downloadModal.classList.add('visible');
    });

    // Cancel download
    downloadCancel.addEventListener('click', () => {
        downloadModal.classList.remove('visible');
    });

    // Download as TXT
    downloadTxt.addEventListener('click', () => {
        downloadNotepad('txt');
        downloadModal.classList.remove('visible');
    });

    // Download as MD
    downloadMd.addEventListener('click', () => {
        downloadNotepad('md');
        downloadModal.classList.remove('visible');
    });

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
        
        saveStatus.textContent = 'Downloaded';
        saveStatus.classList.add('visible');
        setTimeout(() => {
            saveStatus.classList.remove('visible');
        }, 2000);
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

        saveStatus.textContent = 'Printing...';
        saveStatus.classList.add('visible');
        setTimeout(() => {
            saveStatus.classList.remove('visible');
        }, 2000);
    };

    printNotepadBtn.addEventListener('click', printNotepad);

    // Initialize the app
    const initializeApp = () => {
        fetch(`/api/config`)
            .then(response => response.json())
            .then(config => {
                document.getElementById('page-title').textContent = `${config.siteTitle} - Simple Notes`;
                document.getElementById('header-title').textContent = config.siteTitle;
                baseUrl = config.baseUrl;

                loadNotepads().then(() => {
                    loadNotes(currentNotepadId);
                });
            })
            .catch(err => console.error('Error loading site configuration:', err));
    };

    // Initialize WebSocket connection
    collaborationManager.setupWebSocket();

    // Start the app
    initializeApp();
});