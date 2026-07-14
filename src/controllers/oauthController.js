const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const jwtConfig = require('../config/jwt');
const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * OAuth (Google / GitHub) for the whole Nextura suite.
 *
 * Any app in the suite can start a login with ?returnTo=<receiver URL>.
 * The receiver must be on the exact-match allowlist below; it is carried
 * through the provider round-trip inside an HMAC-signed `state` (10-min
 * expiry), and re-validated on the way back. Tokens are handed to the
 * receiver in the URL *fragment* (#token=…) so they never reach server
 * logs, and the receiver is expected to call GET /auth/me for the profile
 * instead of trusting user data in the URL.
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

/** Default receiver — the HR app's OAuth callback route (legacy behaviour). */
const DEFAULT_RECEIVER = `${FRONTEND_URL}/auth/oauth-callback`;

/** Exact-match allowlist of OAuth receiver URLs across the suite. */
const ALLOWED_RECEIVERS = new Set([
  'https://nextura.my/auth/callback/',
  'https://www.nextura.my/auth/callback/',
  'https://hr.nextura.my/auth/oauth-callback',
  `${FRONTEND_URL}/auth/oauth-callback`,
  'http://localhost:5000/auth/callback/',   // Nextura Hub (local dev)
  'http://localhost:4200/auth/oauth-callback', // Nextura HR (local dev)
  ...(process.env.OAUTH_RETURN_URLS
    ? process.env.OAUTH_RETURN_URLS.split(',').map(u => u.trim()).filter(Boolean)
    : [])
]);

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const stateSig = (payload) =>
  crypto.createHmac('sha256', jwtConfig.secret).update(payload).digest('base64url');

/** Validate a returnTo value against the receiver allowlist. */
const resolveReceiver = (returnTo) => {
  if (typeof returnTo === 'string' && ALLOWED_RECEIVERS.has(returnTo)) return returnTo;
  return null;
};

/** In-app path the receiver should continue to. Reject absolute/protocol-relative URLs. */
const sanitizeNextPath = (next) => {
  if (typeof next === 'string' && /^\/(?!\/)/.test(next) && next.length <= 512) return next;
  return null;
};

/**
 * Build the signed state for an OAuth round-trip.
 * Carries the validated receiver URL and an optional in-app next path.
 */
const buildOAuthState = (req) => {
  const receiver = resolveReceiver(req.query.returnTo) || DEFAULT_RECEIVER;
  // Legacy HR param (?returnUrl=/leave/apply) — an in-app path, not a receiver
  const next = sanitizeNextPath(req.query.next || req.query.returnUrl);
  const payload = b64url(JSON.stringify({
    r: receiver,
    n: next,
    exp: Date.now() + STATE_TTL_MS,
    z: crypto.randomBytes(8).toString('hex')
  }));
  return `${payload}.${stateSig(payload)}`;
};

/** Verify + decode state. Returns { receiver, next } — falls back to defaults on any problem. */
const readOAuthState = (state) => {
  const fallback = { receiver: DEFAULT_RECEIVER, next: null };
  if (typeof state !== 'string') return fallback;
  const dot = state.lastIndexOf('.');
  if (dot < 1) return fallback;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = stateSig(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fallback;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return fallback;
    const receiver = resolveReceiver(data.r) || DEFAULT_RECEIVER;
    return { receiver, next: sanitizeNextPath(data.n) };
  } catch (e) {
    return fallback;
  }
};

/** Generate JWT token (same pattern as authController) */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      employee_id: user.employee_id || null,
      company_id: user.company_id || null,
      email_verified: user.email_verified || false
    },
    jwtConfig.secret,
    {
      expiresIn: jwtConfig.expiresIn,
      issuer: jwtConfig.options.issuer,
      audience: jwtConfig.options.audience
    }
  );
};

/**
 * Generate and persist a refresh token for a user (7-day, one-time use)
 * Same logic as authController.generateAndSaveRefreshToken
 */
const generateAndSaveRefreshToken = async (user) => {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await user.update({ refresh_token: refreshToken, refresh_token_expires_at: expiresAt });
  return refreshToken;
};

/**
 * Handle OAuth callback — issues tokens and hands them to the receiver
 * in the URL fragment. The receiver validates via GET /auth/me.
 */
const oauthCallback = async (req, res) => {
  const { receiver, next } = readOAuthState(req.query.state);

  try {
    const user = req.user;

    if (!user) {
      return res.redirect(`${receiver}#error=oauth_failed`);
    }

    const fullUser = await User.findByPk(user.id);
    const token = generateToken(fullUser);
    const refreshToken = await generateAndSaveRefreshToken(fullUser);

    logger.info(`OAuth login successful for ${fullUser.email}, redirecting to receiver`);

    const fragment =
      `#token=${encodeURIComponent(token)}` +
      `&refresh=${encodeURIComponent(refreshToken)}` +
      (next ? `&next=${encodeURIComponent(next)}` : '');

    res.redirect(`${receiver}${fragment}`);
  } catch (error) {
    logger.error(`OAuth callback error: ${error.message}`);
    res.redirect(`${receiver}#error=oauth_failed`);
  }
};

module.exports = { oauthCallback, buildOAuthState, readOAuthState };
