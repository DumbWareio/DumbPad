/**
 * Configuration module for DumbPad
 * Centralizes environment variable access and configuration settings
 */

const TRUST_PROXY = process.env.TRUST_PROXY === 'true' || false;
const TRUSTED_PROXY_IPS = process.env.TRUSTED_PROXY_IPS || '';

module.exports = {
    TRUST_PROXY,
    TRUSTED_PROXY_IPS,
};

