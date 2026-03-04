/**
 * In-memory token blacklist for logout invalidation.
 *
 * Stores a SHA-256 hash of each revoked token mapped to its expiry time.
 * Tokens are automatically removed once they expire to prevent unbounded growth.
 *
 * Note: This resets on server restart. Acceptable for current scale;
 * can be migrated to Redis later if needed.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Map<tokenHash, expiryMs>
const blacklist = new Map();

/**
 * Hash a token for storage (avoids storing raw tokens in memory)
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Add a token to the blacklist until its natural expiry.
 */
function add(token) {
  try {
    const payload = jwt.decode(token);
    if (!payload || !payload.exp) return;

    const expiryMs = payload.exp * 1000;
    if (Date.now() >= expiryMs) return; // already expired, no need to track

    blacklist.set(hashToken(token), expiryMs);
  } catch {
    // Ignore decode errors
  }
}

/**
 * Check if a token has been blacklisted.
 */
function has(token) {
  const key = hashToken(token);
  const expiry = blacklist.get(key);
  if (expiry === undefined) return false;

  // Auto-evict expired entries
  if (Date.now() >= expiry) {
    blacklist.delete(key);
    return false;
  }
  return true;
}

/**
 * Periodically clean up expired entries (runs every 15 minutes).
 */
function cleanup() {
  const now = Date.now();
  for (const [key, expiry] of blacklist.entries()) {
    if (now >= expiry) {
      blacklist.delete(key);
    }
  }
}

const CLEANUP_INTERVAL = 15 * 60 * 1000;
const cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL);

// Allow Node.js to exit cleanly even if the interval is active
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

module.exports = { add, has };
