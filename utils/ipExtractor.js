/**
 * Secure IP extraction utility
 * Ensures client IPs are properly validated for rate-limiting and authentication
 * Prevents IP spoofing via X-Forwarded-For headers
 */

const config = require('../config');

/**
 * Parse comma-separated list of trusted proxy IPs
 * @param {string} raw - Comma-separated proxy IPs
 * @returns {Array<string>} Array of trimmed proxy IPs
 */
function parseTrustedProxies(raw) {
    if (!raw) return [];
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Extract IP address from socket, removing IPv6 prefix if present
 * @param {Object} req - Express request object
 * @returns {string|null} Socket IP address
 */
function socketIpFromReq(req) {
    const addr = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : null;
    if (!addr) return null;
    // Strip IPv6 prefix (::ffff:) if present
    return addr.startsWith('::ffff:') ? addr.split('::ffff:')[1] : addr;
}

/**
 * Extract first IP from X-Forwarded-For header
 * @param {Object} req - Express request object
 * @returns {string|null} First IP from X-Forwarded-For or null
 */
function firstIpFromXForwardedFor(req) {
    const h = req.headers['x-forwarded-for'];
    if (!h) return null;
    const parts = String(h).split(',').map(p => p.trim()).filter(Boolean);
    return parts.length ? parts[0] : null;
}

/**
 * Check if the remote address is in the trusted proxy list
 * @param {string} remoteAddress - Remote address to check
 * @param {Array<string>} trustedList - List of trusted proxy IPs
 * @returns {boolean} True if proxy is trusted
 */
function isTrustedProxy(remoteAddress, trustedList) {
    if (!remoteAddress) return false;
    const normalized = remoteAddress.startsWith('::ffff:') ? remoteAddress.split('::ffff:')[1] : remoteAddress;
    return trustedList.includes(normalized);
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
    const socketIp = socketIpFromReq(req) || null;

    // Security default: If proxy trust is disabled, always use socket IP
    if (!config.TRUST_PROXY) {
        return socketIp;
    }

    // If proxy trust is enabled with explicit trusted proxy list
    const trustedProxies = parseTrustedProxies(config.TRUSTED_PROXY_IPS);
    if (trustedProxies.length > 0) {
        const remote = socketIp;
        if (!isTrustedProxy(remote, trustedProxies)) {
            console.warn('Untrusted proxy remote address; ignoring X-Forwarded-For.');
            return socketIp;
        }
        // Proxy is trusted, use X-Forwarded-For if available
        const xf = firstIpFromXForwardedFor(req);
        return xf || socketIp;
    }

    // TRUST_PROXY=true but no trusted list: fall back to Express-style trust
    // This is less secure but maintains backward compatibility
    console.warn('TRUST_PROXY=true but TRUSTED_PROXY_IPS not set. Verify deployment proxy settings.');
    const xf = firstIpFromXForwardedFor(req);
    return xf || socketIp;
}

module.exports = { getClientIp };

