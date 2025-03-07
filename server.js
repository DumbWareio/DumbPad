require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');
const Fuse = require('fuse.js');

const app = express();
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Set up WebSocket server
const wss = new WebSocket.Server({ server });

// Store all active connections with their user IDs
const clients = new Map();

// Store operations history for each notepad
const operationsHistory = new Map();

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    let userId = null;

    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received WebSocket message:', data);
            
            // Store userId when first received
            if (data.userId && !userId) {
                userId = data.userId;
                clients.set(userId, ws);
                console.log('User connected:', userId);
            }

            // Handle different message types
            if (data.type === 'operation' && data.notepadId) {
                console.log('Operation received from user:', userId);
                // Store operation in history
                if (!operationsHistory.has(data.notepadId)) {
                    operationsHistory.set(data.notepadId, []);
                }
                
                // Add server version to operation
                const history = operationsHistory.get(data.notepadId);
                const serverVersion = history.length;
                const operation = {
                    ...data.operation,
                    serverVersion
                };
                history.push(operation);

                // Keep only last 1000 operations
                if (history.length > 1000) {
                    history.splice(0, history.length - 1000);
                }

                // Send acknowledgment to the sender
                ws.send(JSON.stringify({
                    type: 'ack',
                    operationId: data.operation.id,
                    serverVersion
                }));

                // Broadcast to other clients
                clients.forEach((client, clientId) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        console.log('Broadcasting operation to user:', clientId);
                        client.send(JSON.stringify({
                            type: 'operation',
                            operation,
                            notepadId: data.notepadId,
                            userId: data.userId
                        }));
                    }
                });
            }
            else if (data.type === 'cursor' && data.notepadId) {
                console.log('Cursor update from user:', userId, 'position:', data.position);
                // Broadcast cursor updates
                clients.forEach((client, clientId) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        console.log('Broadcasting cursor update to user:', clientId);
                        client.send(JSON.stringify({
                            type: 'cursor',
                            userId: data.userId,
                            color: data.color,
                            position: data.position,
                            notepadId: data.notepadId
                        }));
                    }
                });
            }
            else if (data.type === 'notepad_rename') {
                console.log('Notepad rename from user:', userId, 'notepad:', data.notepadId);
                // Broadcast rename to all clients
                clients.forEach((client, clientId) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        console.log('Broadcasting notepad rename to user:', clientId);
                        client.send(JSON.stringify({
                            type: 'notepad_rename',
                            notepadId: data.notepadId,
                            newName: data.newName
                        }));
                    }
                });
            }
            else if (data.type === 'sync_request') {
                console.log('Sync request from user:', userId);
                // Send operation history for catch-up
                const history = operationsHistory.get(data.notepadId) || [];
                ws.send(JSON.stringify({
                    type: 'sync_response',
                    operations: history,
                    notepadId: data.notepadId
                }));
            }
            else {
                // Broadcast other types of messages
                console.log('Broadcasting other message type:', data.type);
                clients.forEach((client, clientId) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        if (userId) {
            console.log('User disconnected:', userId);
            clients.delete(userId);
            // Notify other clients about disconnection
            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'user_disconnected',
                        userId: userId
                    }));
                }
            });
        }
    });
});

const DATA_DIR = path.join(__dirname, 'data');
const NOTEPADS_FILE = path.join(DATA_DIR, 'notepads.json');
const PIN = process.env.DUMBPAD_PIN;
const COOKIE_NAME = 'dumbpad_auth';
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const PAGE_HISTORY_COOKIE = 'dumbpad_page_history';
const PAGE_HISTORY_COOKIE_AGE = 365 * 24 * 60 * 60 * 1000; // 1 Year
let notepads_cache = {
    notepads: [],
    index: null,
};

// Trust proxy - required for secure cookies behind a reverse proxy
app.set('trust proxy', 1);

// CORS configuration
const corsOptions = {
    origin: process.env.BASE_URL ? [process.env.BASE_URL] : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

// Brute force protection
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

// Reset attempts for an IP
function resetAttempts(ip) {
    loginAttempts.delete(ip);
}

// Check if an IP is locked out
function isLockedOut(ip) {
    const attempts = loginAttempts.get(ip);
    if (!attempts) return false;
    
    if (attempts.count >= MAX_ATTEMPTS) {
        const timeElapsed = Date.now() - attempts.lastAttempt;
        if (timeElapsed < LOCKOUT_TIME) {
            return true;
        }
        resetAttempts(ip);
    }
    return false;
}

// Record an attempt for an IP
function recordAttempt(ip) {
    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    attempts.count += 1;
    attempts.lastAttempt = Date.now();
    loginAttempts.set(ip, attempts);
}

// Cleanup old lockouts periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, attempts] of loginAttempts.entries()) {
        if (now - attempts.lastAttempt >= LOCKOUT_TIME) {
            loginAttempts.delete(ip);
        }
    }
}, 60000); // Clean up every minute

// Validate PIN format
function isValidPin(pin) {
    return typeof pin === 'string' && /^\d{4,10}$/.test(pin);
}

// Constant-time string comparison to prevent timing attacks
function secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    
    // Use Node's built-in constant-time comparison
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch (err) {
        return false;
    }
}

// Middleware setup
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public', {
    index: false
}));
// Serve the marked library to clients
app.use('/js/marked', express.static(
    path.join(__dirname, 'node_modules/marked/lib')
  ));

// Main app route with PIN check
app.get('/', (req, res) => {
    const pin = process.env.DUMBPAD_PIN;
    
    // Skip PIN if not configured
    if (!pin || !isValidPin(pin)) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }

    // Check PIN cookie
    const authCookie = req.cookies[COOKIE_NAME];
    if (!authCookie || !secureCompare(authCookie, pin)) {
        return res.redirect('/login');
    }

    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login page route
app.get('/login', (req, res) => {
    // If no PIN is required or user is already authenticated, redirect to main app
    const pin = process.env.DUMBPAD_PIN;
    if (!pin || !isValidPin(pin) || (req.cookies[COOKIE_NAME] && secureCompare(req.cookies[COOKIE_NAME], pin))) {
        return res.redirect('/');
    }
    
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Pin verification endpoint
app.post('/api/verify-pin', (req, res) => {
    const { pin } = req.body;
    
    // If no PIN is set in env, always return success
    if (!PIN) {
        return res.json({ success: true });
    }

    const ip = req.ip;
    
    // Check if IP is locked out
    if (isLockedOut(ip)) {
        const attempts = loginAttempts.get(ip);
        const timeLeft = Math.ceil((LOCKOUT_TIME - (Date.now() - attempts.lastAttempt)) / 1000 / 60);
        return res.status(429).json({ 
            error: `Too many attempts. Please try again in ${timeLeft} minutes.`
        });
    }

    // Validate PIN format
    if (!isValidPin(pin)) {
        recordAttempt(ip);
        return res.status(400).json({ success: false, error: 'Invalid PIN format' });
    }

    // Verify the PIN using constant-time comparison
    if (pin && secureCompare(pin, PIN)) {
        // Reset attempts on successful login
        resetAttempts(ip);

        // Set secure HTTP-only cookie
        res.cookie(COOKIE_NAME, pin, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: COOKIE_MAX_AGE
        });
        res.json({ success: true });
    } else {
        // Record failed attempt
        recordAttempt(ip);
        
        const attempts = loginAttempts.get(ip);
        const attemptsLeft = MAX_ATTEMPTS - attempts.count;
        
        res.status(401).json({ 
            success: false, 
            error: 'Invalid PIN',
            attemptsLeft: Math.max(0, attemptsLeft)
        });
    }
});

// Check if PIN is required
app.get('/api/pin-required', (req, res) => {
    res.json({ 
        required: !!PIN && isValidPin(PIN),
        length: PIN ? PIN.length : 0,
        locked: isLockedOut(req.ip)
    });
});

// Get site configuration
app.get('/api/config', (req, res) => {
    res.json({
        siteTitle: process.env.SITE_TITLE || 'DumbPad',
        baseUrl: BASE_URL
    });
});

// Pin protection middleware
const requirePin = (req, res, next) => {
    if (!PIN || !isValidPin(PIN)) {
        return next();
    }

    const authCookie = req.cookies[COOKIE_NAME];
    if (!authCookie || !secureCompare(authCookie, PIN)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Apply pin protection to all /api routes except pin verification
app.use('/api', (req, res, next) => {
    if (req.path === '/verify-pin' || req.path === '/pin-required' || req.path === '/config') {
        return next();
    }
    requirePin(req, res, next);
});

// Ensure data directory exists
async function ensureDataDir() {
    try {
        // Create data directory if it doesn't exist
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // Create notepads.json if it doesn't exist
        try {
            await fs.access(NOTEPADS_FILE);
            // If file exists, validate its structure
            const content = await fs.readFile(NOTEPADS_FILE, 'utf8');
            try {
                const data = JSON.parse(content);
                if (!data.notepads || !Array.isArray(data.notepads)) {
                    throw new Error('Invalid notepads structure');
                }
            } catch (err) {
                console.error('Invalid notepads.json, recreating:', err);
                await fs.writeFile(NOTEPADS_FILE, JSON.stringify({
                    notepads: [{ id: 'default', name: 'Default Notepad' }]
                }, null, 2));
            }
        } catch (err) {
            // File doesn't exist or can't be accessed, create it
            console.log('Creating new notepads.json');
            await fs.writeFile(NOTEPADS_FILE, JSON.stringify({
                notepads: [{ id: 'default', name: 'Default Notepad' }]
            }, null, 2));
        }

        // Ensure default notepad file exists
        const defaultNotePath = path.join(DATA_DIR, 'default.txt');
        try {
            await fs.access(defaultNotePath);
        } catch {
            await fs.writeFile(defaultNotePath, '');
        }
    } catch (err) {
        console.error('Error initializing data directory:', err);
        throw err;
    }
}

async function loadNotepadsList() {
    await ensureDataDir();
    const data = JSON.parse(await fs.readFile(NOTEPADS_FILE, 'utf8'));
    return data.notepads || [];
}

/* Notepad Search Functionality */
// Load and index text files
async function indexNotepads() {
    console.log("Indexing notepads...");
    notepads_cache.notepads = await loadNotepadsList();

    let items = await Promise.all(notepads_cache.notepads.map(async ({ id, name }) => {
        let content = "";
        // console.log("id: ", id, "name:", name);
        let filePath = path.join(DATA_DIR, `${id}.txt`);
        try {
            await fs.access(filePath); // Ensure file exists
            content = await fs.readFile(filePath, 'utf8');
        } catch (error) {
            console.warn(`Could not read file: ${filePath}`);
        }

        return { id, name, content };
    }));
    
    notepads_cache.index = new Fuse(items, { 
        keys: ["name", "content"], 
        threshold: 0.38,        // lower thresholds mean stricter matching
        minMatchCharLength: 3,  // Ensures partial words can be matched
        ignoreLocation: true,    // Allows searching across larger texts
        includeScore: true,      // Useful for debugging relevance 
        includeMatches: true
    });

    // console.log(notepads_cache); // uncomment to debug
}

// Search function using cache
function searchNotepads(query) {
    if (!notepads_cache.index) indexNotepads();
    
    const results = notepads_cache.index.search(query).map(({ item }) => {
        const isFilenameMatch = item.name.toLowerCase().includes(query.toLowerCase());
        let truncatedContent = item.content;
        
        if (!isFilenameMatch) {
            const lowerContent = item.content.toLowerCase();
            const matchIndex = lowerContent.indexOf(query.toLowerCase());

            if (matchIndex !== -1) {
                let start = matchIndex;
                let end = matchIndex + query.length;

                // Move start back up to 3 spaces before
                let spaceCount = 0;
                while (start > 0 && spaceCount < 3) {
                    if (lowerContent[start] === ' ') spaceCount++;
                    start--;
                }
                start = Math.max(0, start); // Ensure start doesn't go negative

                // Move end forward until at least 25 characters are reached
                while (end < lowerContent.length && (end - start) < 25) {
                    end++;
                }

                // Extract snippet
                truncatedContent = item.content.substring(start, end).trim();
                // Add ellipsis to beginning if we truncated from somewhere
                if (start > 0) truncatedContent = `...${truncatedContent}`;
                // Add ellipsis to end if there is more content after the snippet
                if (end < item.content.length) truncatedContent = `${truncatedContent}...`;
            } else {
                truncatedContent = item.content.substring(0, 20).trim() + "..."; // Fallback if no match is found
            }
        }

        let truncatedName = item.name.substring(0, 20).trim();
        if(item.name.length >= 20) {
            truncatedName += "...";
        }

        return {
            id: item.id,
            name: isFilenameMatch ? truncatedName : truncatedContent,
            match: isFilenameMatch ? "notepad" : `content in ${truncatedName}`
        };
    });

    return results;
}

// Watch for changes in notepads.json or .txt files
fs.watch(DATA_DIR, (eventType, filename) => {
    if (filename.endsWith(".txt")) indexNotepads();
});
fs.watch(NOTEPADS_FILE, () => indexNotepads());

// Initial indexing
indexNotepads();

/* API Endpoints */
// Get list of notepads
app.get('/api/notepads', async (req, res) => {
    try {
        const notepadsList = await loadNotepadsList();
        // Return the existing cookie value along with notes
        const note_history = req.cookies.dumbpad_page_history || 'default';
        res.json({'notepads_list': notepadsList, 'note_history': note_history});
    } catch (err) {
        res.status(500).json({ error: 'Error reading notepads list' });
    }
});

// Create new notepad
app.post('/api/notepads', async (req, res) => {
    try {
        const data = JSON.parse(await fs.readFile(NOTEPADS_FILE, 'utf8'));
        const id = Date.now().toString();
        const newNotepad = {
            id,
            name: `Notepad ${data.notepads.length + 1}`
        };
        data.notepads.push(newNotepad);

        // Set new notes as the current page in cookies.
        res.cookie(PAGE_HISTORY_COOKIE, id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: PAGE_HISTORY_COOKIE_AGE
        });

        await fs.writeFile(NOTEPADS_FILE, JSON.stringify(data));
        await fs.writeFile(path.join(DATA_DIR, `${id}.txt`), '');
        indexNotepads(); // update searching index
        res.json(newNotepad);
    } catch (err) {
        res.status(500).json({ error: 'Error creating new notepad' });
    }
});

// Rename notepad   
app.put('/api/notepads/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const data = JSON.parse(await fs.readFile(NOTEPADS_FILE, 'utf8'));
        const notepad = data.notepads.find(n => n.id === id);
        if (!notepad) {
            return res.status(404).json({ error: 'Notepad not found' });
        }
        notepad.name = name;
        await fs.writeFile(NOTEPADS_FILE, JSON.stringify(data));
        indexNotepads(); // update searching index
        res.json(notepad);
    } catch (err) {
        res.status(500).json({ error: 'Error renaming notepad' });
    }
});

// Get notes for a specific notepad
app.get('/api/notes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const notePath = path.join(DATA_DIR, `${id}.txt`);
        const notes = await fs.readFile(notePath, 'utf8').catch(() => '');
        
        // Set loaded notes as the current page in cookies.
        res.cookie(PAGE_HISTORY_COOKIE, id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: PAGE_HISTORY_COOKIE_AGE
        });

        res.json({ content: notes });
    } catch (err) {
        res.status(500).json({ error: 'Error reading notes' });
    }
});

// Save notes for a specific notepad
app.post('/api/notes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await ensureDataDir();
        await fs.writeFile(path.join(DATA_DIR, `${id}.txt`), req.body.content);
        indexNotepads(); // update searching index
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error saving notes' });
    }
});

// Delete notepad
app.delete('/api/notepads/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`Attempting to delete notepad with id: ${id}`);
        
        // Don't allow deletion of default notepad
        if (id === 'default') {
            console.log('Attempted to delete default notepad');
            return res.status(400).json({ error: 'Cannot delete default notepad' });
        }

        const data = JSON.parse(await fs.readFile(NOTEPADS_FILE, 'utf8'));
        console.log('Current notepads:', data.notepads);
        
        const notepadIndex = data.notepads.findIndex(n => n.id === id);
        
        if (notepadIndex === -1) {
            console.log(`Notepad with id ${id} not found`);
            return res.status(404).json({ error: 'Notepad not found' });
        }

        // Remove from notepads list
        const removedNotepad = data.notepads.splice(notepadIndex, 1)[0];
        console.log(`Removed notepad:`, removedNotepad);
        
        // Save updated notepads list
        await fs.writeFile(NOTEPADS_FILE, JSON.stringify(data, null, 2));
        console.log('Updated notepads list saved');

        // Delete the notepad file
        const notePath = path.join(DATA_DIR, `${id}.txt`);
        try {
            await fs.access(notePath);
            await fs.unlink(notePath);
            console.log(`Deleted notepad file: ${notePath}`);
        } catch (err) {
            console.error(`Error accessing or deleting notepad file: ${notePath}`, err);
            // Continue even if file deletion fails
        }

        indexNotepads(); // update searching index
        res.json({ success: true, message: 'Notepad deleted successfully' });
    } catch (err) {
        console.error('Error in delete notepad endpoint:', err);
        res.status(500).json({ error: 'Error deleting notepad' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
}); 

/* Search API Endpoints */
// Search
app.get('/api/search', (req, res) => {
    const query = req.query.query || '';
    const results = searchNotepads(query);
    
    // set up for pagination
    const page = parseInt(req.query.page) || 1;
    const pageSize = results.length; // defaults to all results for now
    const paginatedResults = results.slice((page - 1) * pageSize, page * pageSize);
    res.json({
        results: paginatedResults,
        totalPages: Math.ceil(results.length / pageSize),
        currentPage: page
    });
});