const admin = require('firebase-admin');
const { Op } = require('sequelize');
const DeviceToken = require('../models/DeviceToken');
const logger = require('../utils/logger');

let firebaseApp = null;
let initAttempted = false;

/**
 * Lazy-initialize the Firebase Admin SDK using FIREBASE_SERVICE_ACCOUNT
 * (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (path to key file).
 * Returns the app, or null if credentials are unavailable.
 */
function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  if (initAttempted) return null;
  initAttempted = true;

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      const creds = JSON.parse(serviceAccountJson);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(creds)
      });
      logger.info('Firebase Admin initialized (inline service account)');
      return firebaseApp;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      logger.info('Firebase Admin initialized (application default credentials)');
      return firebaseApp;
    }

    logger.warn('Firebase credentials not configured — push notifications disabled');
    return null;
  } catch (error) {
    logger.error('Firebase Admin init failed:', error.message);
    return null;
  }
}

/**
 * Map notification type → deep-link path the mobile shell should route to.
 */
function buildLink(type, data = {}) {
  switch (type) {
    case 'leave_approved':
    case 'leave_rejected':
      return '/m/leave';
    case 'claim_approved':
    case 'claim_rejected':
    case 'claim_finance_approved':
    case 'claim_finance_rejected':
      return '/m/claims';
    case 'wfh_approved':
    case 'wfh_rejected':
      return '/m/wfh';
    case 'announcement_published':
      return data.memo_id ? `/m/announcements/${data.memo_id}` : '/m/announcements';
    case 'policy_published':
      return '/m/documents';
    case 'payslip_ready':
      return '/m/payslip';
    case 'invoice_submitted':
    case 'invoice_validated':
    case 'invoice_rejected':
    case 'invoice_cancelled':
      return '/m/invoices';
    default:
      return '/m/notifications';
  }
}

/**
 * Send a push to every active device token for the given user.
 * Non-blocking failures: dead tokens are removed; the caller never throws.
 */
async function sendToUser(userId, { type, title, body, data = {} }) {
  const app = getFirebaseApp();
  if (!app) return { sent: 0, skipped: true };

  try {
    const tokens = await DeviceToken.findAll({
      where: { user_id: userId, is_active: true },
      attributes: ['id', 'token']
    });

    if (tokens.length === 0) return { sent: 0 };

    const messaging = admin.messaging(app);
    const link = buildLink(type, data);

    const payload = {
      tokens: tokens.map(t => t.token),
      notification: { title, body },
      data: {
        type,
        link,
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, v == null ? '' : String(v)])
        )
      },
      android: {
        priority: 'high',
        notification: { channelId: 'default' }
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } }
      }
    };

    const response = await messaging.sendEachForMulticast(payload);

    // Clean up dead tokens
    const deadTokenIds = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          deadTokenIds.push(tokens[i].id);
        }
      }
    });

    if (deadTokenIds.length > 0) {
      await DeviceToken.destroy({ where: { id: { [Op.in]: deadTokenIds } } });
      logger.info(`Cleaned ${deadTokenIds.length} dead device tokens`);
    }

    logger.info(
      `Push sent: type=${type}, user=${userId}, success=${response.successCount}/${tokens.length}`
    );
    return { sent: response.successCount, failed: response.failureCount };
  } catch (error) {
    logger.error('pushSender.sendToUser error:', error.message);
    return { sent: 0, error: error.message };
  }
}

/**
 * Send the same push to many users. Fire-and-forget per user.
 */
async function sendToUsers(userIds, payload) {
  const app = getFirebaseApp();
  if (!app) return { sent: 0, skipped: true };

  const results = await Promise.allSettled(
    userIds.map(id => sendToUser(id, payload))
  );
  const sent = results.reduce(
    (n, r) => n + (r.status === 'fulfilled' ? (r.value.sent || 0) : 0),
    0
  );
  return { sent };
}

module.exports = {
  sendToUser,
  sendToUsers,
  _getFirebaseApp: getFirebaseApp
};
