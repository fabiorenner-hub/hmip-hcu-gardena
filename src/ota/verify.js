'use strict';

const crypto = require('crypto');

function sha256Hex(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Optional Ed25519 signature check. When no public key or signature is
 * present the bundle is accepted on SHA-256 integrity alone (this plugin
 * ships without signing keys — SHA-256 only).
 */
function verifySignature(bytes, signatureB64, publicKeyPem) {
    if (!publicKeyPem || !signatureB64) return true;
    try {
        return crypto.verify(null, bytes, publicKeyPem, Buffer.from(signatureB64, 'base64'));
    } catch (_) {
        return false;
    }
}

module.exports = { sha256Hex, verifySignature };
