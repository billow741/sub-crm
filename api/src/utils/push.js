import { generatePushHTTPRequest, ApplicationServerKeys } from 'webpush-webcrypto';

// VAPID keys generated via web-push
const VAPID_PUBLIC = 'BOA2LGHT-fbTvPMpNOahcwDtsDJRMebMSXGf99sGONyOO7sE3_CkPPvl4sQxsP_dQK3rxt8feaJ4Ryfjt_e1hyo';
const VAPID_PRIVATE = 'fyNeo-8kq8PiAI1cvDtwHpczBPb0ByWue5wURVj1ANc';
const VAPID_SUBJECT = 'mailto:admin@sunnybridge.com';

let cachedAppKeys = null;
async function getAppKeys() {
  if (!cachedAppKeys) {
    cachedAppKeys = await ApplicationServerKeys.fromJSON({
      publicKey: VAPID_PUBLIC,
      privateKey: VAPID_PRIVATE,
    });
  }
  return cachedAppKeys;
}

export async function triggerPushNotification(DB, userType, userId, actionType, title, body, relatedClassId) {
  try {
    // 1. Insert into notification history
    await DB.prepare(
      "INSERT INTO notification_history (user_type, user_id, action_type, related_class_id, title, body, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    ).bind(userType, userId, actionType, relatedClassId, title, body).run();

    // 2. Fetch push subscriptions
    const subs = await DB.prepare('SELECT * FROM push_subscriptions WHERE user_type = ? AND user_id = ?').bind(userType, userId).all();
    if (subs && subs.results && subs.results.length > 0) {
      const payload = JSON.stringify({
        title,
        body,
        url: userType === 'teacher' ? '/' : '/'
      });

      const appKeys = await getAppKeys();

      // Loop over subs.results and call Web Push API
      for (const sub of subs.results) {
        try {
          const subscription = typeof sub.subscription_data === 'string' 
            ? JSON.parse(sub.subscription_data) 
            : sub.subscription_data;
            
          const pushReq = await generatePushHTTPRequest({
            target: subscription,
            payload,
            applicationServerKeys: appKeys,
            adminContact: VAPID_SUBJECT,
            ttl: 86400,
          });

          const resp = await fetch(pushReq.endpoint, {
            method: 'POST',
            headers: pushReq.headers,
            body: pushReq.body,
          });

          if (resp.status === 410 || resp.status === 404) {
            // Subscription expired or invalid
            await DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
          }
          console.log(`Push notification sent to ${userType} ${userId}, response: ${resp.status}`);
        } catch (e) {
          console.error(`Failed to send push to subscription ${sub.id}:`, e);
        }
      }
    }
  } catch (err) {
    console.error('Failed to trigger push notification:', err);
  }
}

