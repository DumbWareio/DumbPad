import { marked } from '/js/marked/marked.esm.js';

export class CollaborationManager {
    constructor({ userId, userColor, currentNotepadId, operationsManager, editor, onNotepadChange, onUserDisconnect, onCursorUpdate }) {
        this.userId = userId;
        this.userColor = userColor;
        this.currentNotepadId = currentNotepadId;
        this.operationsManager = operationsManager;
        this.editor = editor;
        this.onNotepadChange = onNotepadChange;
        this.onUserDisconnect = onUserDisconnect;
        this.onCursorUpdate = onCursorUpdate;
        this.previewPane = document.getElementById('preview-pane');
        
        this.ws = null;
        this.isReceivingUpdate = false;
        this.lastCursorUpdate = 0;
        this.CURSOR_UPDATE_INTERVAL = 50; // More frequent cursor updates
        this.DEBUG = false;
        this.pauseReconnection = false; // Flag to control reconnection attempts
        
        // For cursor update debouncing
        this.cursorUpdateTimeout = null;
    }

    // Initialize WebSocket connection
    setupWebSocket() {
        // Don't attempt to reconnect if we're deliberately paused (offline)
        if (this.pauseReconnection) {
            if (this.DEBUG) {
                console.log('WebSocket reconnection paused (offline mode)');
            }
            return;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        if (this.DEBUG) {
            console.log('Attempting WebSocket connection to:', wsUrl);
        }
        
        this.ws = new WebSocket(wsUrl);
        this.setupWebSocketHandlers();
    }

    // Set up WebSocket event handlers
    setupWebSocketHandlers() {
        this.ws.onmessage = this.handleWebSocketMessage.bind(this);
        
        this.ws.onclose = () => {
            if (this.DEBUG) {
                console.log('WebSocket connection closed');
            }
            
            // Only attempt to reconnect if we're not deliberately paused (offline)
            if (!this.pauseReconnection) {
                setTimeout(() => this.setupWebSocket(), 5000);
            }
        };
        
        this.ws.onopen = () => {
            if (this.DEBUG) {
                console.log('WebSocket connection established');
            }
            // Clear pauseReconnection flag when successfully connected
            this.pauseReconnection = false;
            this.updateLocalCursor();
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    // Handle incoming WebSocket messages
    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            if (this.DEBUG) {
                console.log('Received WebSocket message:', data);
            }
            
            if (data.type === 'cursor' && data.notepadId === this.currentNotepadId) {
                this.handleCursorUpdate(data);
            }
            else if (data.type === 'ack') {
                this.handleOperationAck(data);
            }
            else if (data.type === 'operation' && data.notepadId === this.currentNotepadId) {
                this.handleRemoteOperation(data);
            }
            else if (data.type === 'notepad_rename') {
                // Handle remote notepad rename
                this.handleNotepadRename(data);
            }
            else if (data.type === 'notepad_change') {
                this.onNotepadChange();
            }
            else if (data.type === 'user_disconnected') {
                this.onUserDisconnect(data.userId);
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    }

    // Handle cursor updates from other users
    handleCursorUpdate(data) {
        // Enhanced logging for cursor updates
        if (this.DEBUG) {
            console.log('Cursor update debug:', {
                receivedUserId: data.userId,
                ourUserId: this.userId,
                receivedType: typeof data.userId,
                ourType: typeof this.userId,
                isOurs: data.userId === this.userId
            });
        }
        
        // Ignore cursor updates from our own user ID
        if (data.userId === this.userId) {
            if (this.DEBUG) {
                console.log('Ignoring our own cursor update');
            }
            return;
        }
        
        if (this.DEBUG) {
            console.log('Updating cursor for user:', data.userId, 'at position:', data.position);
        }
        
        this.onCursorUpdate(data.userId, data.position, data.color);
    }

    // Handle operation acknowledgments from the server
    handleOperationAck(data) {
        if (this.DEBUG) {
            console.log('Operation acknowledged:', data.operationId);
        }
        this.operationsManager.handleOperationAck(data.operationId, data.serverVersion);
    }

    // Handle operations from other users
    handleRemoteOperation(data) {
        if (data.userId !== this.userId) {
            if (this.DEBUG) {
                console.log('Applying remote operation:', data.operation);
            }
            this.isReceivingUpdate = true;
            
            // Transform operation against pending operations
            let operation = data.operation;
            const pendingOps = this.operationsManager.getPendingOperations();
            
            for (const pending of pendingOps) {
                const transformed = this.operationsManager.transformOperation(operation, pending);
                if (transformed) {
                    operation = transformed;
                } else {
                    if (this.DEBUG) {
                        console.log('Operation was nullified by transformation');
                    }
                    this.isReceivingUpdate = false;
                    return;
                }
            }
            
            // Save current cursor position
            const currentPos = this.editor.selectionStart;
            const currentEnd = this.editor.selectionEnd;
            
            // Apply the operation
            this.editor.value = this.operationsManager.applyOperation(operation, this.editor.value);
            
            // Update the preview pane in markdown
            this.previewPane.innerHTML = marked.parse(this.editor.value);

            // Adjust cursor position based on operation type and position
            let newPos = currentPos;
            let newEnd = currentEnd;
            
            if (operation.type === 'insert') {
                if (operation.position < currentPos) {
                    newPos += operation.text.length;
                    newEnd += operation.text.length;
                }
            } else if (operation.type === 'delete') {
                if (operation.position < currentPos) {
                    newPos = Math.max(operation.position, 
                        currentPos - operation.text.length);
                    newEnd = Math.max(operation.position, 
                        currentEnd - operation.text.length);
                }
            }
            
            // Restore adjusted cursor position
            this.editor.setSelectionRange(newPos, newEnd);
            
            this.isReceivingUpdate = false;
            this.updateLocalCursor();
        }
    }

    // Send an operation to the server
    sendOperation(operation) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.isReceivingUpdate) {
            if (this.DEBUG) {
                console.log('Sending operation:', operation);
            }
            
            this.ws.send(JSON.stringify({
                type: 'operation',
                operation,
                notepadId: this.currentNotepadId,
                userId: this.userId
            }));

            // Set up retry if no acknowledgment received
            const retryTimeout = setTimeout(() => {
                if (this.operationsManager.pendingOperations.has(operation.id)) {
                    if (this.DEBUG) {
                        console.log('Operation not acknowledged, retrying:', operation.id);
                    }
                    this.sendOperation(operation);
                }
            }, 3000); // Retry after 3 seconds

            // Store retry timeout with the operation
            operation.retryTimeout = retryTimeout;
        }
    }

    // Update local cursor position
    updateLocalCursor() {
        clearTimeout(this.cursorUpdateTimeout);
        this.cursorUpdateTimeout = setTimeout(() => {
            const now = Date.now();
            if (now - this.lastCursorUpdate < this.CURSOR_UPDATE_INTERVAL) return;
            
            this.lastCursorUpdate = now;
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const position = this.editor.selectionStart;
                if (this.DEBUG) {
                    console.log('Sending cursor update, position:', position);
                }
                this.ws.send(JSON.stringify({
                    type: 'cursor',
                    userId: this.userId,
                    color: this.userColor,
                    position: position,
                    notepadId: this.currentNotepadId
                }));
            }
        }, 50); // 50ms debounce
    }

    // Clean up resources
    cleanup() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        clearTimeout(this.cursorUpdateTimeout);
    }

    // Handle remote notepad rename
    handleNotepadRename(data) {
        const option = document.querySelector(`#notepad-selector option[value="${data.notepadId}"]`);
        if (option) {
            option.textContent = data.newName;
        } else {
            // If we can't find the option, refresh the entire list
            this.onNotepadChange();
        }
    }
} 