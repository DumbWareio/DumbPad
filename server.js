require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');
const Fuse = require('fuse.js');
const { generatePWAManifest } = require("./scripts/pwa-manifest-generator")
const { originValidationMiddleware, getCorsOptions, validateOrigin } = require('./scripts/cors');
const { getHighlightLanguages } = require('./constants');
const { 
    sanitizeFilename, 
    getNotepadFilePath, 
    migrateAllNotepadsToNameBasedFiles, 
    migrateDefaultNotepad 
} = require('./scripts/notepad-migration');
const { TRUST_PROXY, TRUSTED_PROXY_IPS } = require('./config');
const { getClientIp } = require('./utils/ipExtractor');
const HIGHLIGHT_LANGUAGES = process.env.HIGHLIGHT_LANGUAGES
    ? process.env.HIGHLIGHT_LANGUAGES.split(',').map(lang => lang.trim())
    : getHighlightLanguages();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development'
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, "public");
const ASSETS_DIR = path.join(PUBLIC_DIR, "Assets");
const NOTEPADS_FILE = path.join(DATA_DIR, 'notepads.json');
const SITE_TITLE = process.env.SITE_TITLE || 'DumbPad';
const PIN = process.env.DUMBPAD_PIN;
const COOKIE_NAME = 'dumbpad_auth';
const COOKIE_MAX_AGE = process.env.COOKIE_MAX_AGE || 24; // default 24 in hours
const cookieMaxAge = COOKIE_MAX_AGE * 60 * 60 * 1000; // in hours
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const PAGE_HISTORY_COOKIE = 'dumbpad_page_history';
const PAGE_HISTORY_COOKIE_AGE = process.env.PAGE_HISTORY_COOKIE_AGE || 365; // defaults to 1 Year in days
const pageHistoryCookieAge = PAGE_HISTORY_COOKIE_AGE * 24 * 60 * 60 * 1000;
const MAX_FILENAME_COLLISION_ATTEMPTS = 100; // Maximum attempts to resolve filename collisions

let notepads_cache = {
    notepads: [],
    index: null,
};
const packageJson = require('./package.json');
const VERSION = packageJson.version || '1.0.0';

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Version: ${VERSION}`);
});

// Configure proxy trust for secure IP extraction and cookie handling
// Only enable trust proxy when TRUSTED_PROXY_IPS is properly configured
if (TRUST_PROXY) {
    if (!TRUSTED_PROXY_IPS || TRUSTED_PROXY_IPS.trim() === '') {
        // Critical security issue: TRUST_PROXY enabled without specifying trusted proxy IPs
        app.set('trust proxy', false);
        console.error('CRITICAL WARNING: TRUST_PROXY=true but TRUSTED_PROXY_IPS is not set or empty.');
        console.error('Trust proxy is disabled for security. Set TRUSTED_PROXY_IPS to enable proxy trust.');
        console.error('Example: TRUSTED_PROXY_IPS="127.0.0.1 # localhost, ::1 # IPv6 localhost, 10.0.0.0/8 # internal"');
    } else {
        // Parse and validate TRUSTED_PROXY_IPS (comma-separated list with optional inline comments)
        // Supports shell-style inline comments: "172.17.0.1 # Docker gateway, 10.0.0.0/8 # Internal"
        const trustedProxies = TRUSTED_PROXY_IPS
            .split(',')
            .map(entry => {
                // Strip inline comments (anything after '#')
                const withoutComment = entry.split('#')[0];
                return withoutComment.trim();
            })
            .filter(ip => ip.length > 0)
            .filter(ip => {
                // Basic validation for IP/CIDR format
                // IPv4: digits and dots, optionally with /prefix
                // IPv6: hex digits and colons, optionally with /prefix
                // Also accepts 'loopback', 'linklocal', 'uniquelocal' keywords
                const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
                const ipv6Pattern = /^([0-9a-fA-F:]+)(\/\d{1,3})?$/;
                const keywordPattern = /^(loopback|linklocal|uniquelocal)$/i;
                
                const isValid = ipv4Pattern.test(ip) || ipv6Pattern.test(ip) || keywordPattern.test(ip);
                
                if (!isValid) {
                    console.warn(`Ignoring invalid proxy IP/CIDR entry: "${ip}"`);
                }
                
                return isValid;
            });
        
        if (trustedProxies.length === 0) {
            app.set('trust proxy', false);
            console.error('CRITICAL WARNING: TRUSTED_PROXY_IPS provided but contains no valid entries after parsing.');
            console.error('Trust proxy is disabled for security.');
        } else {
            // Configure Express to trust only specified proxy IPs
            app.set('trust proxy', trustedProxies);
            console.log('Proxy trust enabled for the following IPs/CIDRs:');
            trustedProxies.forEach(ip => console.log(`  - ${ip}`));
        }
    }
} else {
    app.set('trust proxy', false);
    console.log('Proxy trust disabled (secure default)');
}

// CORS setup
const corsOptions = getCorsOptions(BASE_URL);

// Middleware setup
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Serve static files
app.use('/js/marked', express.static(
    path.join(__dirname, 'node_modules/marked/lib')
));
app.use('/js/marked-extended-tables', express.static(
    path.join(__dirname, 'node_modules/marked-extended-tables/src')
));
app.use('/js/marked-alert', express.static(
    path.join(__dirname, 'node_modules/marked-alert/dist')
));
app.use('/js/marked-highlight', express.static(
    path.join(__dirname, 'node_modules/marked-highlight/src')
));
app.use('/js/@highlightjs/highlight.min.js', express.static(
    path.join(__dirname, 'node_modules/@highlightjs/cdn-assets/es/highlight.min.js')
));
// Dynamically serve highlight.js languages
HIGHLIGHT_LANGUAGES.forEach(lang => {
    if (lang) {
        app.use(`/js/@highlightjs/languages/${lang}.min.js`, express.static(
            path.join(__dirname, 'node_modules/@highlightjs/cdn-assets/es/languages', `${lang}.min.js`)
        ));
    }
});
app.use('/css/@highlightjs/github-dark.min.css', express.static(
    path.join(__dirname, 'node_modules/@highlightjs/cdn-assets/styles/github-dark.min.css')
));
app.use('/css/@highlightjs/github.min.css', express.static(
    path.join(__dirname, 'node_modules/@highlightjs/cdn-assets/styles/github.min.css')
));

// Future enhancement: Support for all highlight.js themes
// Currently only serving light/dark GitHub themes for consistency
// To enable all themes, uncomment the following line and update theme selection logic:
// app.use('/css/@highlightjs', express.static(
//     path.join(__dirname, 'node_modules/@highlightjs/cdn-assets/styles')
// ));


generatePWAManifest(SITE_TITLE);

// Dynamic service worker with correct version (must be before static middleware)
app.get('/service-worker.js', async (req, res) => {
    // Set proper MIME type and cache headers to prevent caching
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    try {
        let swContent = await fs.readFile(path.join(PUBLIC_DIR, 'service-worker.js'), 'utf8');
        
        // Replace the version initialization with the actual version from package.json
        swContent = swContent.replace(
            /let APP_VERSION = ".*?";/,
            `let APP_VERSION = "${VERSION}";`
        );
        
        res.send(swContent);
    } catch (error) {
        console.error('Error reading service-worker.js:', error);
        res.status(500).send('Error loading service worker');
    }
});

app.use(express.static(path.join(__dirname, 'public'), {
    index: false
}));

// Set up WebSocket server
const wss = new WebSocket.Server({ server, verifyClient: (info, done) => {
    const origin = info.req.headers.origin;
    const isOriginValid = validateOrigin(origin);
    if (isOriginValid) done(true); // allow the connection
    else {
        console.warn("Blocked connection from origin:", {origin});
        done(false, 403, 'Forbidden'); // reject the connection
    }
}});

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
                
                if (clients.size > 1) {
                    console.log('Notifying other clients about new user:', userId);
                    clients.forEach((client, clientId) => {
                        if (client.readyState === WebSocket.OPEN) { 
                            client.send(JSON.stringify({
                                type: 'user_connected',
                                userId: userId,
                                notepadId: data.notepadId,
                                count: clients.size
                            }));
                        }
                    })
                }
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
                        userId: userId,
                        count: clients.size
                    }));
                }
            });
        }
    });
});

// Brute force protection
const loginAttempts = new Map();
const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 5; // default to 5
const LOCKOUT_TIME = process.env.LOCKOUT_TIME || 15; // default 15 minutes
const lockOutTime = LOCKOUT_TIME * 60 * 1000; // in milliseconds

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
        if (timeElapsed < lockOutTime) {
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
        if (now - attempts.lastAttempt >= lockOutTime) {
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

// Main app route with PIN & CORS check
app.get('/', originValidationMiddleware, (req, res) => {
    const pin = process.env.DUMBPAD_PIN;
    
    // Skip PIN if not configured
    if (!pin || !isValidPin(pin)) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }

    // Check PIN cookie
    const authCookie = req.cookies[COOKIE_NAME];
    if (!authCookie || !secureCompare(authCookie, pin)) {
        // Preserve the original URL with query parameters
        const originalUrl = req.originalUrl;
        const redirectParam = encodeURIComponent(originalUrl);
        return res.redirect(`/login?redirect=${redirectParam}`);
    }

    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the pwa/asset manifest
app.get("/asset-manifest.json", (req, res) => {
    // generated in pwa-manifest-generator and fetched from service-worker.js
    res.sendFile(path.join(ASSETS_DIR, "asset-manifest.json"));
});
app.get("/manifest.json", (req, res) => {
    res.sendFile(path.join(ASSETS_DIR, "manifest.json"));
});

// Helper function to validate redirect URLs for security
function isValidRedirectUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    
    // Must start with "/" (relative path)
    if (!url.startsWith('/')) {
        return false;
    }
    
    // Must not start with "//" (protocol-relative URL that could redirect externally)
    if (url.startsWith('//')) {
        return false;
    }
    
    // Must not contain backslashes (could be used for bypasses)
    if (url.includes('\\')) {
        return false;
    }
    
    // Must not contain encoded characters that could be used for bypasses
    if (url.includes('%2f') || url.includes('%2F') || url.includes('%5c') || url.includes('%5C')) {
        return false;
    }
    
    return true;
}

// Login page route
app.get('/login', (req, res) => {
    // If no PIN is required or user is already authenticated, redirect to main app
    const pin = process.env.DUMBPAD_PIN;
    if (!pin || !isValidPin(pin) || (req.cookies[COOKIE_NAME] && secureCompare(req.cookies[COOKIE_NAME], pin))) {
        // If user is already authenticated, redirect to the original URL if provided
        const redirectParam = req.query.redirect;
        if (redirectParam) {
            const decodedRedirect = decodeURIComponent(redirectParam);
            if (isValidRedirectUrl(decodedRedirect)) {
                return res.redirect(decodedRedirect);
            } else {
                console.warn('Invalid redirect parameter blocked:', redirectParam);
                return res.redirect('/');
            }
        }
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

    const ip = getClientIp(req);
    
    // Security: Validate that we have a valid client IP for rate-limiting
    // Reject requests with null IPs to prevent shared rate-limit counter exploitation
    if (!ip) {
        console.error('Unable to determine client IP address for rate-limiting');
        return res.status(500).json({ error: 'Unable to determine client IP address' });
    }
    
    // Check if IP is locked out
    if (isLockedOut(ip)) {
        const attempts = loginAttempts.get(ip);
        const timeLeft = Math.ceil((lockOutTime - (Date.now() - attempts.lastAttempt)) / 1000 / 60);
        return res.status(429).json({ 
            error: `Too many attempts. Please try again in ${timeLeft} minute(s).`
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
            secure: req.secure || (BASE_URL.startsWith("https") && NODE_ENV === 'production'),
            sameSite: 'strict',
            maxAge: cookieMaxAge
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
    const ip = getClientIp(req);
    
    // Security: Validate that we have a valid client IP for rate-limiting
    // If IP is null, fail-secure by treating the client as locked out
    if (!ip) {
        console.error('SECURITY: Unable to determine client IP address for /api/pin-required endpoint - treating as locked');
    }
    
    res.json({ 
        required: !!PIN && isValidPin(PIN),
        length: PIN ? PIN.length : 0,
        locked: ip ? isLockedOut(ip) : true
    });
});

// Get site configuration
app.get('/api/config', (req, res) => {
    res.json({
        siteTitle: SITE_TITLE,
        baseUrl: process.env.BASE_URL,
        version: VERSION,
        highlightLanguages: HIGHLIGHT_LANGUAGES,
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
        await migrateDefaultNotepad(DATA_DIR);
    } catch (err) {
        console.error('Error initializing data directory:', err);
        throw err;
    }
}

async function loadNotepadsList() {
    const notepadsList = await getNotepadsFromDir();
    return notepadsList || [];
}

async function getNotepadsFromDir() {
    await ensureDataDir();
    let notepadsData = { notepads: [] };
    try {
        const fileContent = await fs.readFile(NOTEPADS_FILE, 'utf8');
        notepadsData = JSON.parse(fileContent);
    } catch (readError) {
        // If notepads.json doesn't exist or is invalid, start with an empty array
        if (readError.code !== 'ENOENT') {
            console.error('Error reading notepads.json:', readError);
        }
    }

    const notepads = notepadsData.notepads || [];

    const dataFiles = await fs.readdir(DATA_DIR);
    const txtFiles = dataFiles
        .filter(file => file.endsWith('.txt'))
        .map(file => path.parse(file).name); // Extract filename without extension

    // Find new files that don't match existing notepad IDs or sanitized names
    const newNotepads = txtFiles.filter(txtFile => {
        // Check if this file matches any existing notepad by ID
        const matchesId = notepads.some(notepad => notepad.id === txtFile);
        
        // Check if this file matches any existing notepad by sanitized name
        const matchesSanitizedName = notepads.some(notepad => {
            const sanitizedName = sanitizeFilename(notepad.name);
            return sanitizedName === txtFile;
        });
        
        return !matchesId && !matchesSanitizedName;
    }).map(txtFile => {
        // Generate a unique name that doesn't conflict with existing notepads or default
        const uniqueName = generateUniqueName(txtFile, notepads);
        return { id: txtFile, name: uniqueName };
    });

    if (newNotepads.length > 0) {
        notepadsData.notepads = [...notepads, ...newNotepads];
        await fs.writeFile(NOTEPADS_FILE, JSON.stringify(notepadsData, null, 2), 'utf8');
        console.log(`Added new notepads: ${newNotepads.map(n => n.id).join(', ')}`);
    }

    return notepadsData.notepads;
}

/* Notepad Search Functionality */
// Load and index text files
async function indexNotepads() {
    console.log("Indexing notepads...");
    notepads_cache.notepads = await loadNotepadsList();

    let items = await Promise.all(notepads_cache.notepads.map(async (notepad) => {
        let content = "";
        // console.log("id: ", notepad.id, "name:", notepad.name);
        let filePath = await getNotepadFilePath(notepad, DATA_DIR);
        try {
            await fs.access(filePath); // Ensure file exists
            content = await fs.readFile(filePath, 'utf8');
        } catch (error) {
            console.warn(`Could not read file: ${filePath}`);
        }

        return { id: notepad.id, name: notepad.name, content };
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
    console.log("Indexing complete. Notepads indexed:", notepads_cache.notepads.length);
}

// Helper function to generate unique notepad name
function generateUniqueName(desiredName, existingNotepads) {
    let uniqueName = desiredName;
    let counter = 1;
    
    // Check if name already exists or if sanitized name would conflict with default.txt
    while (existingNotepads.some(notepad => notepad.name === uniqueName) || 
           sanitizeFilename(uniqueName).toLowerCase() === 'default') {
        uniqueName = `${desiredName}-${counter}`;
        counter++;
    }
    
    return uniqueName;
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

// Migrate existing ID-based files to name-based files
(async () => {
    console.log('Checking for notepad files to migrate...');
    const notepads = await loadNotepadsList();
    await migrateAllNotepadsToNameBasedFiles(notepads, DATA_DIR);
    
    // Initial indexing after migration is complete
    indexNotepads();
})();

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
        const desiredName = `Notepad ${data.notepads.length + 1}`;
        const uniqueName = generateUniqueName(desiredName, data.notepads);
        
        const newNotepad = {
            id,
            name: uniqueName
        };
        data.notepads.push(newNotepad);

        // Set new notes as the current page in cookies.
        res.cookie(PAGE_HISTORY_COOKIE, id, {
            httpOnly: true,
            secure: req.secure || (BASE_URL.startsWith("https") && NODE_ENV === 'production'),
            sameSite: 'strict',
            maxAge: pageHistoryCookieAge
        });

        await fs.writeFile(NOTEPADS_FILE, JSON.stringify(data));
        
        // Create file using sanitized name instead of ID
        const sanitizedName = sanitizeFilename(uniqueName);
        const filePath = path.join(DATA_DIR, `${sanitizedName}.txt`);
        await fs.writeFile(filePath, '');
        
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
        const { data, notepad } = await findNotepadById(id);
        if (!notepad) {
            return res.status(404).json({ error: 'Notepad not found' });
        }
        
        // Generate unique name (excluding current notepad from check)
        const otherNotepads = data.notepads.filter(n => n.id !== id);
        const uniqueName = generateUniqueName(name, otherNotepads);
        
        // Get current file path and prepare new file path
        const currentFilePath = await getNotepadFilePath(notepad, DATA_DIR);
        const sanitizedNewName = sanitizeFilename(uniqueName);
        let newFilePath = path.join(DATA_DIR, `${sanitizedNewName}.txt`);
        
        // Skip file renaming for default notepad - it should always remain default.txt
        const shouldRenameFile = id !== 'default' && notepad.name !== uniqueName && currentFilePath !== newFilePath;
        
        // Rename the file if needed (but skip for default notepad)
        if (shouldRenameFile) {
            try {
                // Check if new path already exists
                try {
                    await fs.access(newFilePath);
                    // File exists, we need to generate a different filename
                    let counter = 1;
                    let altPath;
                    let foundAvailablePath = false;
                    do {
                        const baseName = sanitizeFilename(`${uniqueName}-${counter}`);
                        altPath = path.join(DATA_DIR, `${baseName}.txt`);
                        counter++;
                        try {
                            await fs.access(altPath);
                            // File exists, try next number
                        } catch {
                            // File doesn't exist, we can use this path
                            foundAvailablePath = true;
                            break;
                        }
                    } while (counter < MAX_FILENAME_COLLISION_ATTEMPTS); // Safety limit
                    
                    if (!foundAvailablePath) {
                        throw new Error(`Unable to find available filename after ${MAX_FILENAME_COLLISION_ATTEMPTS} attempts`);
                    }
                    
                    newFilePath = altPath;
                } catch {
                    // New path doesn't exist, safe to use
                }
                
                await fs.rename(currentFilePath, newFilePath);
                console.log(`Renamed notepad file: ${currentFilePath} -> ${newFilePath}`);
            } catch (err) {
                console.warn(`Failed to rename file from ${currentFilePath} to ${newFilePath}:`, err);
                // File rename failed - do not update the notepad name to maintain consistency
                return res.status(500).json({ error: 'Failed to rename notepad file. Please try a different name.' });
            }
        }
        
        notepad.name = uniqueName;
        await fs.writeFile(NOTEPADS_FILE, JSON.stringify(data));
        indexNotepads(); // update searching index
        res.json({ ...notepad, nameChanged: uniqueName !== name });
    } catch (err) {
        res.status(500).json({ error: 'Error renaming notepad' });
    }
});

// Get notes for a specific notepad
app.get('/api/notes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Find the notepad to get its current name
        const { notepad } = await findNotepadById(id);
        
        let notePath;
        if (notepad) {
            // Use helper to find the correct file path
            notePath = await getNotepadFilePath(notepad, DATA_DIR);
        } else {
            // Fallback to ID-based path for backwards compatibility (sanitize id for security)
            const sanitizedId = sanitizeFilename(id);
            notePath = path.join(DATA_DIR, `${sanitizedId}.txt`);
        }
        
        const notes = await fs.readFile(notePath, 'utf8').catch(() => '');
        
        // Set loaded notes as the current page in cookies.
        res.cookie(PAGE_HISTORY_COOKIE, id, {
            httpOnly: true,
            secure: req.secure || (BASE_URL.startsWith("https") && NODE_ENV === 'production'),
            sameSite: 'strict',
            maxAge: pageHistoryCookieAge
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
        
        // Find the notepad to get its current name
        const { notepad } = await findNotepadById(id);
        
        let notePath;
        if (notepad) {
            // Use helper to find the correct file path
            notePath = await getNotepadFilePath(notepad, DATA_DIR);
        } else {
            // Fallback to ID-based path for backwards compatibility (sanitize id for security)
            const sanitizedId = sanitizeFilename(id);
            notePath = path.join(DATA_DIR, `${sanitizedId}.txt`);
        }
        
        await fs.writeFile(notePath, req.body.content);
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

        const { data, notepad } = await findNotepadById(id);
        console.log('Current notepads:', data.notepads);
        
        if (!notepad) {
            console.log(`Notepad with id ${id} not found`);
            return res.status(404).json({ error: 'Notepad not found' });
        }

        // Get the notepad before removing it
        const notepadToDelete = notepad;
        
        // Remove from notepads list
        const notepadIndex = data.notepads.findIndex(n => n.id === id);
        const removedNotepad = data.notepads.splice(notepadIndex, 1)[0];
        console.log(`Removed notepad:`, removedNotepad);
        
        // Save updated notepads list
        await fs.writeFile(NOTEPADS_FILE, JSON.stringify(data, null, 2));
        console.log('Updated notepads list saved');

        // Delete the notepad file using the helper to find correct path
        const notePath = await getNotepadFilePath(notepadToDelete, DATA_DIR);
        try {
            await fs.access(notePath);
            await fs.unlink(notePath);
            console.log(`Deleted notepad file: ${notePath}`);
        } catch (err) {
            console.error(`Error accessing or deleting notepad file: ${notePath}`, err);
            
            // Try to delete ID-based file as fallback (sanitize id for security)
            const sanitizedId = sanitizeFilename(id);
            const fallbackPath = path.join(DATA_DIR, `${sanitizedId}.txt`);
            try {
                await fs.access(fallbackPath);
                await fs.unlink(fallbackPath);
                console.log(`Deleted fallback notepad file: ${fallbackPath}`);
            } catch (fallbackErr) {
                console.error(`Error accessing or deleting fallback file: ${fallbackPath}`, fallbackErr);
            }
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

// Helper function to find a notepad by ID
async function findNotepadById(id) {
    try {
        const data = JSON.parse(await fs.readFile(NOTEPADS_FILE, 'utf8'));
        const notepad = data.notepads.find(n => n.id === id);
        return { data, notepad };
    } catch (err) {
        throw new Error(`Error reading notepads file: ${err.message}`);
    }
}