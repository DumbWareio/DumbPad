export class CursorManager {
    constructor({ editor }) {
        this.editor = editor;
        this.remoteUsers = new Map(); // Store other users' colors and cursors
        this.DEBUG = false;

        // Cache for text measurements
        this.textMetrics = {
            lineHeight: 0,
            charWidth: 0,
            lastUpdate: 0,
            measurementDiv: null
        };

        this.initializeTextMetrics();
    }

    // Initialize text measurements with debug logging
    initializeTextMetrics() {
        const style = getComputedStyle(this.editor);
        this.textMetrics.measurementDiv = document.createElement('div');
        Object.assign(this.textMetrics.measurementDiv.style, {
            position: 'absolute',
            visibility: 'hidden',
            whiteSpace: 'pre',
            font: style.font,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            letterSpacing: style.letterSpacing,
            padding: '0',
            border: 'none',
            margin: '0'
        });
        document.body.appendChild(this.textMetrics.measurementDiv);
        this.updateTextMetrics();
        
        if (this.DEBUG) {
            console.log('Text metrics initialized:', {
                font: style.font,
                fontSize: style.fontSize,
                lineHeight: style.lineHeight,
                letterSpacing: style.letterSpacing,
                editorStyle: {
                    font: style.font,
                    lineHeight: style.lineHeight,
                    padding: style.padding
                }
            });
        }
    }

    // Update text measurements periodically
    updateTextMetrics() {
        const now = Date.now();
        if (now - this.textMetrics.lastUpdate > 5000) { // Update every 5 seconds
            const style = getComputedStyle(this.editor);
            this.textMetrics.lineHeight = parseFloat(style.lineHeight);
            if (isNaN(this.textMetrics.lineHeight)) {
                this.textMetrics.lineHeight = parseFloat(style.fontSize) * 1.2;
            }
            this.textMetrics.measurementDiv.textContent = 'X';
            this.textMetrics.charWidth = this.textMetrics.measurementDiv.offsetWidth;
            this.textMetrics.lastUpdate = now;
        }
    }

    // Get cursor coordinates using Range API
    getCursorCoordinates(position) {
        // Create a temporary div with the same styling as the editor
        const tempDiv = document.createElement('div');
        const editorStyle = getComputedStyle(this.editor);
        
        Object.assign(tempDiv.style, {
            position: 'absolute',
            visibility: 'hidden',
            whiteSpace: this.editor.style.whiteSpace || 'pre-wrap',
            wordWrap: this.editor.style.wordWrap || 'break-word',
            width: `${this.editor.clientWidth}px`,
            font: editorStyle.font,
            lineHeight: editorStyle.lineHeight,
            letterSpacing: editorStyle.letterSpacing,
            padding: editorStyle.padding,
            boxSizing: 'border-box',
            top: '0',
            left: '0',
            border: editorStyle.border,
            margin: editorStyle.margin
        });
        
        // Create text nodes for before and at cursor
        const textBeforeCursor = document.createTextNode(this.editor.value.substring(0, position));
        const cursorNode = document.createTextNode('\u200B'); // Zero-width space for cursor position
        
        tempDiv.appendChild(textBeforeCursor);
        tempDiv.appendChild(cursorNode);
        
        // Add the temp div to the editor container for proper positioning context
        const container = document.querySelector('.editor-container');
        if (!container) {
            console.error('Editor container not found');
            return null;
        }
        container.appendChild(tempDiv);
        
        // Create and position the range
        const range = document.createRange();
        range.setStart(cursorNode, 0);
        range.setEnd(cursorNode, 1);
        
        // Get the rectangle for the cursor position
        const rects = range.getClientRects();
        const rect = rects[0]; // Use the first rect for the cursor position
        
        // Clean up
        container.removeChild(tempDiv);
        
        if (!rect) {
            if (this.DEBUG) {
                console.warn('Could not get cursor coordinates, falling back to editor position');
            }
            return {
                top: parseFloat(editorStyle.paddingTop) || 0,
                left: parseFloat(editorStyle.paddingLeft) || 0,
                height: parseFloat(editorStyle.lineHeight) || parseFloat(editorStyle.fontSize) * 1.6
            };
        }
        
        // Get editor's padding and margins
        const paddingLeft = parseFloat(editorStyle.paddingLeft) || 0;
        const paddingTop = parseFloat(editorStyle.paddingTop) || 0;
        const marginLeft = parseFloat(editorStyle.marginLeft) || 0;
        const marginTop = parseFloat(editorStyle.marginTop) || 0;
        
        // Calculate position relative to the editor's content area
        const editorRect = this.editor.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Get the line height for proper cursor height
        const lineHeight = parseFloat(editorStyle.lineHeight) || parseFloat(editorStyle.fontSize) * 1.6;
        
        return {
            top: rect.top - containerRect.top + this.editor.scrollTop - (lineHeight * 0.25), // Move up by quarter line height
            left: rect.left - containerRect.left,
            height: lineHeight
        };
    }

    // Create and update remote cursors
    createRemoteCursor(remoteUserId, color) {
        // Double check we never create our own cursor
        if (remoteUserId === window.userId) {
            if (this.DEBUG) {
                console.warn('Attempted to create cursor for our own userId:', remoteUserId);
            }
            return null;
        }
        
        const cursor = document.createElement('div');
        cursor.className = 'remote-cursor';
        cursor.style.color = color;
        
        // Ensure the editor container exists
        const container = document.querySelector('.editor-container');
        if (!container) {
            console.error('Editor container not found');
            return null;
        }
        
        container.appendChild(cursor);
        if (this.DEBUG) {
            console.log('Created remote cursor for user:', remoteUserId, 'color:', color);
        }
        
        // Store user information
        this.remoteUsers.set(remoteUserId, { color, cursor });
        return cursor;
    }

    // Update cursor position with improved measurements
    updateCursorPosition(remoteUserId, position, color) {
        // Don't create or update cursor for our own user ID
        if (remoteUserId === window.userId) {
            return;
        }
        
        let userInfo = this.remoteUsers.get(remoteUserId);
        let cursor;
        
        if (!userInfo) {
            cursor = this.createRemoteCursor(remoteUserId, color);
            if (!cursor) return; // Exit if cursor creation failed
        } else {
            cursor = userInfo.cursor;
            if (color !== userInfo.color) {
                cursor.style.color = color;
                userInfo.color = color;
            }
        }

        // Get cursor coordinates using Range API
        const coords = this.getCursorCoordinates(position);
        if (!coords) return; // Exit if we couldn't get coordinates
        
        if (this.DEBUG) {
            console.log('Cursor coordinates:', coords);
        }
        
        // Store position for scroll updates
        cursor.dataset.position = position;
        
        // Apply position with smooth transition
        cursor.style.transform = `translate3d(${coords.left}px, ${coords.top}px, 0)`;
        cursor.style.height = `${coords.height}px`; // Use full line height
        cursor.style.display = 'block'; // Ensure cursor is visible
    }

    // Handle user disconnection
    handleUserDisconnection(userId) {
        if (this.DEBUG) {
            console.log('User disconnected:', userId);
        }
        const userInfo = this.remoteUsers.get(userId);
        if (userInfo) {
            userInfo.cursor.remove();
            this.remoteUsers.delete(userId);
        }
    }

    // Update all cursors (e.g., on scroll)
    updateAllCursors() {
        this.remoteUsers.forEach((userInfo, userId) => {
            const position = parseInt(userInfo.cursor.dataset.position);
            if (!isNaN(position)) {
                this.updateCursorPosition(userId, position, userInfo.color);
            }
        });
    }

    // Clean up resources
    cleanup() {
        if (this.textMetrics.measurementDiv) {
            this.textMetrics.measurementDiv.remove();
        }
        this.remoteUsers.forEach(userInfo => userInfo.cursor.remove());
        this.remoteUsers.clear();
    }
} 