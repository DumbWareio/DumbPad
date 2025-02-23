/**
 * direct-view.js - Handles authentication and notepad loading for direct view access
 * Manages the flow of authenticating and loading notepads via direct links
 */

import { OperationsManager, OperationType } from './operations.js';
import { CollaborationManager } from './collaboration.js';
import { CursorManager } from './cursor-manager.js';

class DirectViewManager {
    constructor() {
        this.noteId = null;
        this.editor = document.getElementById('editor');
        this.notepadTitle = document.getElementById('notepadTitle');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.saveStatus = document.getElementById('saveStatus');
        
        // Debug flag - set to true for detailed logging
        this.DEBUG = true;
        
        // Convert div to textarea to match main app behavior
        this.convertEditorToTextarea();
        
        // Initialize managers
        this.operationsManager = new OperationsManager();
        this.operationsManager.DEBUG = this.DEBUG;
        this.cursorManager = new CursorManager({ editor: this.editor });
        this.cursorManager.DEBUG = this.DEBUG;
        
        // Generate user ID and color
        this.userId = Math.random().toString(36).substring(2, 15);
        this.userColor = this.getRandomColor(this.userId);
        
        this.previousEditorValue = '';
        this.baseUrl = '';
        
        if (this.DEBUG) console.log('DirectViewManager initialized');
    }

    convertEditorToTextarea() {
        const editorContainer = this.editor.parentElement;
        const textarea = document.createElement('textarea');
        textarea.id = 'editor';
        textarea.className = 'editor';
        textarea.spellcheck = false;
        textarea.placeholder = 'Loading...';
        editorContainer.replaceChild(textarea, this.editor);
        this.editor = textarea;
    }

    async init() {
        if (this.DEBUG) console.log('Starting initialization...');
        
        const urlParams = new URLSearchParams(window.location.search);
        this.noteId = urlParams.get('note');

        if (this.DEBUG) console.log('Notepad ID:', this.noteId);

        if (!this.noteId) {
            if (this.DEBUG) console.log('No notepad ID found, redirecting to home');
            window.location.replace('/');
            return;
        }

        if (this.DEBUG) console.log('Checking authentication...');
        const isAuthenticated = await this.checkAuthentication();
        if (!isAuthenticated) {
            if (this.DEBUG) console.log('Authentication failed, stopping initialization');
            return;
        }

        if (this.DEBUG) console.log('Authentication successful, loading notepad...');
        await this.loadNotepad();
        this.setupEventListeners();
        this.initializeCollaboration();
        if (this.DEBUG) console.log('Initialization complete');
    }

    async checkAuthentication() {
        try {
            if (this.DEBUG) console.log('Starting authentication check...');
            
            // Get site configuration first
            if (this.DEBUG) console.log('Fetching site configuration...');
            const configResponse = await fetch('/api/config');
            const config = await configResponse.json();
            this.baseUrl = config.baseUrl;
            if (this.DEBUG) console.log('Base URL set to:', this.baseUrl);

            // Check if a PIN is required first
            if (this.DEBUG) console.log('Checking if PIN is required...');
            const pinResponse = await fetch(`/api/pin-required/${this.noteId}`);
            const pinData = await pinResponse.json();
            if (this.DEBUG) console.log('PIN required check result:', pinData);
            
            // If no PIN required, we can proceed
            if (!pinData.required) {
                if (this.DEBUG) console.log('No PIN required, proceeding...');
                return true;
            }

            // Try to access with current cookie
            if (this.DEBUG) console.log('PIN required, checking current authentication...');
            const authCheckResponse = await this.fetchWithPin(`/api/notes/${this.noteId}`);
            if (this.DEBUG) console.log('Auth check response:', authCheckResponse.status);
            
            if (authCheckResponse.ok) {
                if (this.DEBUG) console.log('Current authentication valid');
                return true;
            }

            // If we get here, we need authentication
            if (this.DEBUG) console.log('Authentication needed, redirecting to login...');
            this.redirectToLogin();
            return false;
        } catch (error) {
            console.error('Authentication check failed:', error);
            if (this.DEBUG) console.log('Authentication check error:', error);
            return false;
        }
    }

    redirectToLogin() {
        const currentUrl = encodeURIComponent(window.location.href);
        if (this.DEBUG) console.log('Redirecting to login with redirect URL:', currentUrl);
        window.location.replace(`/login.html?redirect=${currentUrl}`);
    }

    async fetchWithPin(url, options = {}) {
        options.credentials = 'same-origin';
        const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
        if (this.DEBUG) console.log('Fetching with PIN:', fullUrl);
        return fetch(fullUrl, options);
    }

    async loadNotepad() {
        try {
            if (this.DEBUG) console.log('Starting notepad load...');
            
            // Get site configuration first
            if (this.DEBUG) console.log('Fetching site configuration...');
            const configResponse = await fetch('/api/config');
            const config = await configResponse.json();
            this.baseUrl = config.baseUrl;
            document.getElementById('header-title').textContent = config.siteTitle;
            document.getElementById('page-title').textContent = `${config.siteTitle} - Direct View`;

            // Load the notepad content
            if (this.DEBUG) console.log('Loading notepad content...');
            const response = await this.fetchWithPin(`/api/notes/${this.noteId}`);
            if (this.DEBUG) console.log('Notepad content response:', response.status);
            
            if (!response.ok) {
                if (this.DEBUG) console.log('Failed to load notepad content');
                throw new Error('Failed to load notepad');
            }

            const data = await response.json();
            this.editor.value = data.content || '';
            this.previousEditorValue = data.content || '';
            if (this.DEBUG) console.log('Notepad content loaded successfully');

            // Get notepad name
            if (this.DEBUG) console.log('Fetching notepad name...');
            const notepadsResponse = await this.fetchWithPin('/api/notepads');
            const notepadsData = await notepadsResponse.json();
            const notepad = notepadsData.notepads_list.notepads.find(n => n.id === this.noteId);
            if (notepad) {
                this.notepadTitle.textContent = notepad.name;
                if (this.DEBUG) console.log('Notepad name set:', notepad.name);
            }
        } catch (error) {
            console.error('Failed to load notepad:', error);
            if (this.DEBUG) console.log('Notepad load error:', error);
            this.connectionStatus.textContent = 'Failed to load notepad';
            this.connectionStatus.classList.add('error');
        }
    }

    initializeCollaboration() {
        this.collaborationManager = new CollaborationManager({
            userId: this.userId,
            userColor: this.userColor,
            currentNotepadId: this.noteId,
            operationsManager: this.operationsManager,
            editor: this.editor,
            onUserDisconnect: (disconnectedUserId) => this.cursorManager.handleUserDisconnection(disconnectedUserId),
            onCursorUpdate: (remoteUserId, position, color) => this.cursorManager.updateCursorPosition(remoteUserId, position, color),
            onConnectionStatusChange: (status) => this.handleConnectionStatus(status)
        });
        this.collaborationManager.DEBUG = this.DEBUG;

        this.collaborationManager.setupWebSocket();
    }

    handleConnectionStatus(status) {
        if (status === 'connected') {
            this.connectionStatus.textContent = 'Connected';
            this.connectionStatus.classList.remove('error');
            // Hide the status after 2 seconds
            setTimeout(() => {
                this.connectionStatus.textContent = '';
            }, 2000);
        } else if (status === 'disconnected') {
            this.connectionStatus.textContent = 'Disconnected';
            this.connectionStatus.classList.add('error');
        } else if (status === 'connecting') {
            this.connectionStatus.textContent = 'Connecting...';
            this.connectionStatus.classList.remove('error');
        }
    }

    setupEventListeners() {
        // Track cursor position and selection
        this.editor.addEventListener('mouseup', () => this.collaborationManager.updateLocalCursor());
        this.editor.addEventListener('keyup', () => this.collaborationManager.updateLocalCursor());
        this.editor.addEventListener('click', () => this.collaborationManager.updateLocalCursor());
        this.editor.addEventListener('scroll', () => this.cursorManager.updateAllCursors());

        // Handle text input events
        this.editor.addEventListener('input', (e) => {
            if (this.collaborationManager.isReceivingUpdate) {
                if (this.DEBUG) console.log('Ignoring input event during remote update');
                return;
            }

            const target = e.target;
            const changeStart = target.selectionStart;
            
            if (e.inputType.startsWith('delete')) {
                // Calculate what was deleted by comparing with previous value
                const lengthDiff = this.previousEditorValue.length - target.value.length;
                
                // For bulk deletions or continuous delete
                if (lengthDiff > 0) {
                    let deletedContent;
                    let deletePosition;
                    
                    if (e.inputType === 'deleteContentBackward') {
                        // Backspace: deletion happens before cursor
                        deletePosition = changeStart;
                        deletedContent = this.previousEditorValue.substring(deletePosition, deletePosition + lengthDiff);
                    } else {
                        // Delete key: deletion happens at cursor
                        deletePosition = changeStart;
                        deletedContent = this.previousEditorValue.substring(deletePosition, deletePosition + lengthDiff);
                    }
                    
                    const operation = this.operationsManager.createOperation(
                        OperationType.DELETE,
                        deletePosition,
                        deletedContent,
                        this.userId
                    );
                    if (this.DEBUG) console.log('Created DELETE operation:', operation);
                    this.collaborationManager.sendOperation(operation);
                }
            } else {
                // For insertions
                let insertedText;
                let insertPosition = changeStart;
                
                if (e.inputType === 'insertFromPaste') {
                    // Handle paste operation
                    const selectionDiff = this.previousEditorValue.length - target.value.length + e.data.length;
                    
                    // If there was selected text that was replaced
                    if (selectionDiff > 0) {
                        // First create a delete operation for the selected text
                        const deletePosition = changeStart - e.data.length;
                        const deletedContent = this.previousEditorValue.substring(deletePosition, deletePosition + selectionDiff);
                        
                        const deleteOperation = this.operationsManager.createOperation(
                            OperationType.DELETE,
                            deletePosition,
                            deletedContent,
                            this.userId
                        );
                        if (this.DEBUG) console.log('Created DELETE operation for paste:', deleteOperation);
                        this.collaborationManager.sendOperation(deleteOperation);
                        
                        insertPosition = deletePosition;
                    }
                    
                    insertedText = e.data;
                } else if (e.inputType === 'insertLineBreak') {
                    insertedText = '\n';
                } else {
                    insertedText = e.data || target.value.substring(changeStart - 1, changeStart);
                }
                
                const operation = this.operationsManager.createOperation(
                    OperationType.INSERT,
                    insertPosition - (e.inputType === 'insertFromPaste' ? 0 : insertedText.length),
                    insertedText,
                    this.userId
                );
                if (this.DEBUG) console.log('Created INSERT operation:', operation);
                this.collaborationManager.sendOperation(operation);
            }

            this.previousEditorValue = target.value;
            this.debouncedSave(target.value);
            this.collaborationManager.updateLocalCursor();
        });

        // Handle composition events (for IME input)
        this.editor.addEventListener('compositionstart', () => {
            this.collaborationManager.isReceivingUpdate = true;
        });
        
        this.editor.addEventListener('compositionend', (e) => {
            this.collaborationManager.isReceivingUpdate = false;
            const target = e.target;
            const endPosition = target.selectionStart;
            const composedText = e.data;
            
            if (composedText) {
                const operation = this.operationsManager.createOperation(
                    OperationType.INSERT,
                    endPosition - composedText.length,
                    composedText,
                    this.userId
                );
                if (this.DEBUG) console.log('Created composition operation:', operation);
                this.collaborationManager.sendOperation(operation);
            }
            
            this.debouncedSave(target.value);
            this.collaborationManager.updateLocalCursor();
        });

        // Handle Ctrl+S
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveNotes(this.editor.value);
            }
        });
    }

    debouncedSave(content) {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(() => {
            this.saveNotes(content);
        }, 300);
    }

    async saveNotes(content) {
        try {
            await this.fetchWithPin(`/api/notes/${this.noteId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content }),
            });
            
            this.saveStatus.textContent = 'Saved';
            this.saveStatus.classList.add('visible');
            setTimeout(() => {
                this.saveStatus.textContent = '';
                this.saveStatus.classList.remove('visible');
            }, 2000);
        } catch (err) {
            console.error('Error saving notes:', err);
            this.saveStatus.textContent = 'Error saving';
            this.saveStatus.classList.add('visible');
            setTimeout(() => {
                this.saveStatus.textContent = '';
                this.saveStatus.classList.remove('visible');
            }, 2000);
        }
    }

    getRandomColor(userId) {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB',
            '#E67E22', '#27AE60', '#F1C40F', '#E74C3C'
        ];
        
        let hash = 2166136261;
        for (let i = 0; i < userId.length; i++) {
            hash ^= userId.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        
        const timeComponent = parseInt(userId.slice(-4), 36);
        hash = (hash ^ timeComponent) >>> 0;
        
        const MAX_INT32 = 0xFFFFFFFF;
        const scaled = (hash / MAX_INT32) * colors.length;
        const index = Math.floor(scaled);
        
        return colors[index];
    }
}

// Initialize the direct view manager when the page loads
window.addEventListener('DOMContentLoaded', () => {
    const manager = new DirectViewManager();
    manager.init();
}); 