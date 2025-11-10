/**
 * Secure IP extraction utility
 * Ensures client IPs are properly validated for rate-limiting and authentication
 * Prevents IP spoofing via X-Forwarded-For headers
 */

const config = require('../config');
const ipaddr = require('ipaddr.js');

/**
 * Parse comma-separated list of trusted proxy IPs with inline comment support
 * Supports shell-style comments: "10.0.0.0/8 # Internal network, 172.17.0.1 # Docker"
 * @param {string} raw - Comma-separated proxy IPs/CIDRs with optional inline comments
 * @returns {Array<string>} Array of trimmed, validated proxy IPs/CIDRs
 */
function parseTrustedProxies(raw) {
    // Handle null/undefined by returning empty array
    if (raw == null) return [];
    
    // Coerce non-string primitives to string (consistent with firstIpFromXForwardedFor)
    if (typeof raw !== 'string') {
        raw = String(raw);
    }
    
    return raw
        .split(',')
        .map(entry => {
            // Strip inline comments (anything after '#')
            const withoutComment = entry.split('#')[0];
            return withoutComment.trim();
        })
        .filter(Boolean);
}

/**
 * Normalize IP address by stripping IPv6 prefix if present
 * @param {string} ip - IP address to normalize
 * @returns {string|null} Normalized IP address or null if input is falsy
 */
function normalizeIp(ip) {
    // Return null for falsy input (null, undefined, empty string, etc.)
    if (!ip) return null;
    
    // Strip IPv6 prefix (::ffff:) if present
    return ip.startsWith('::ffff:') ? ip.split('::ffff:')[1] : ip;
}

/**
 * Extract IP address from socket, removing IPv6 prefix if present
 * @param {Object} req - Express request object
 * @returns {string|null} Socket IP address
 */
function socketIpFromReq(req) {
    // Validate req is a non-null object with socket property
    if (!req || typeof req !== 'object') {
        return null;
    }
    
    // Validate socket and remoteAddress exist
    if (!req.socket || typeof req.socket !== 'object' || !req.socket.remoteAddress) {
        return null;
    }
    
    // Use normalizeIp helper to strip IPv6 prefix
    return normalizeIp(req.socket.remoteAddress);
}

/**
 * Extract first IP from X-Forwarded-For header
 * @param {Object} req - Express request object
 * @returns {string|null} First IP from X-Forwarded-For or null
 */
function firstIpFromXForwardedFor(req) {
    // Guard: ensure req is a non-null object with headers property
    if (!req || typeof req !== 'object' || !req.headers) {
        return null;
    }
    
    const h = req.headers['x-forwarded-for'];
    if (!h) return null;
    const parts = String(h).split(',').map(p => p.trim()).filter(Boolean);
    return parts.length ? parts[0] : null;
}

/**
 * Check if the remote address is in the trusted proxy list (with CIDR support)
 * @param {string} remoteAddress - Remote address to check
 * @param {Array<string>} trustedList - List of trusted proxy IPs/CIDRs
 * @returns {boolean} True if proxy is trusted
 */
function isTrustedProxy(remoteAddress, trustedList) {
    // Guard: ensure trustedList is a valid array
    if (!Array.isArray(trustedList)) return false;
    
    // Use normalizeIp helper to strip IPv6 prefix and handle falsy input
    const normalized = normalizeIp(remoteAddress);
    if (!normalized) return false;
    
    // Parse the remote address using ipaddr.js
    let remoteAddr;
    try {
        remoteAddr = ipaddr.process(normalized);
    } catch (e) {
        // Invalid IP address format
        if (process.env.DEBUG === 'true') {
            console.warn(`Invalid IP address format: ${normalized}`);
        }
        return false;
    }
    
    // Check each trusted entry (can be individual IP or CIDR range)
    for (const trusted of trustedList) {
        try {
            // Check if trusted entry contains CIDR notation
            if (trusted.includes('/')) {
                // Parse CIDR range
                const [rangeAddr, prefixLength] = trusted.split('/');
                const parsedRange = ipaddr.process(rangeAddr);
                const prefix = parseInt(prefixLength, 10);
                
                // Check if IP is within CIDR range
                if (remoteAddr.kind() === parsedRange.kind() && remoteAddr.match(parsedRange, prefix)) {
                    return true;
                }
            } else {
                // Exact IP match
                const parsedTrusted = ipaddr.process(trusted);
                if (remoteAddr.toString() === parsedTrusted.toString()) {
                    return true;
                }
            }
        } catch (e) {
            // Invalid trusted proxy entry, skip it
            if (process.env.DEBUG === 'true') {
                console.warn(`Invalid trusted proxy entry: ${trusted}`);
            }
            continue;
        }
    }
    
    return false;
}

/**
 * Get the real client IP address with security validation
 * - If TRUST_PROXY=false: Always return socket IP (secure default)
 * - If TRUST_PROXY=true with TRUSTED_PROXY_IPS: Validate proxy before trusting X-Forwarded-For
 * - If TRUST_PROXY=true without TRUSTED_PROXY_IPS: Fall back to Express-style trust (with warning)
 * 
 * @param {Object} req - Express request object
 * @returns {string|null} Client IP address
 */
function getClientIp(req) {
    // Guard: Ensure req is a non-null object
    if (!req || typeof req !== 'object') {
        if (process.env.DEBUG === 'true') {
            console.warn('getClientIp called with invalid req object; returning null');
        }
        return null;
    }

    // Guard: Ensure config is a non-null object
    if (!config || typeof config !== 'object') {
        if (process.env.DEBUG === 'true') {
            console.warn('getClientIp: config is not a valid object; returning socket IP or null');
        }
        // Try to extract socket IP even if config is invalid
        return socketIpFromReq(req) || null;
    }

    // Guard: Validate req has necessary socket structure before extraction
    if (!req.socket || typeof req.socket !== 'object') {
        if (process.env.DEBUG === 'true') {
            console.warn('getClientIp: req.socket is not a valid object; returning null');
        }
        return null;
    }

    const socketIp = socketIpFromReq(req) || null;

    // Safe access to config.TRUST_PROXY with default to false
    const trustProxy = config.TRUST_PROXY === true;

    // Security default: If proxy trust is disabled, always use socket IP
    if (!trustProxy) {
        return socketIp;
    }

    // Safe access to config.TRUSTED_PROXY_IPS with default to undefined/null
    const trustedProxyIps = config.TRUSTED_PROXY_IPS !== undefined ? config.TRUSTED_PROXY_IPS : null;
    
    // If proxy trust is enabled with explicit trusted proxy list
    const trustedProxies = parseTrustedProxies(trustedProxyIps);
    if (trustedProxies.length > 0) {
        const remote = socketIp;
        if (!isTrustedProxy(remote, trustedProxies)) {
            if (process.env.DEBUG === 'true') {
                console.warn('Untrusted proxy remote address; ignoring X-Forwarded-For.');
            }
            return socketIp;
        }
        // Proxy is trusted, use X-Forwarded-For if available
        const xf = firstIpFromXForwardedFor(req);
        return xf || socketIp;
    }

    // TRUST_PROXY=true but no trusted list: fall back to Express-style trust
    // This is less secure but maintains backward compatibility
    if (process.env.DEBUG === 'true') {
        console.warn('TRUST_PROXY=true but TRUSTED_PROXY_IPS not set. Verify deployment proxy settings.');
    }
    const xf = firstIpFromXForwardedFor(req);
    return xf || socketIp;
}

module.exports = { getClientIp };

