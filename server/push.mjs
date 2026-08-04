import webpush from 'web-push';

const publicKey = process.env.BORA_VAPID_PUBLIC_KEY || '';
const privateKey = process.env.BORA_VAPID_PRIVATE_KEY || '';
const subject = process.env.BORA_VAPID_SUBJECT || '';

export const pushEnabled = Boolean(publicKey && privateKey && subject);

if (pushEnabled) webpush.setVapidDetails(subject, publicKey, privateKey);

export function vapidPublicKey() {
  return publicKey;
}

export function validSubscription(value) {
  if (!value || typeof value !== 'object' || typeof value.endpoint !== 'string' || value.endpoint.length > 2000) return false;
  try {
    const url = new URL(value.endpoint);
    return url.protocol === 'https:' && typeof value.keys?.p256dh === 'string' && value.keys.p256dh.length <= 300
      && typeof value.keys?.auth === 'string' && value.keys.auth.length <= 100;
  } catch {
    return false;
  }
}

export async function sendPush(subscription, payload) {
  return webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
  }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
}
