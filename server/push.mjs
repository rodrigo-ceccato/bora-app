import webpush from 'web-push';
import { isIP } from 'node:net';

const publicKey = process.env.BORA_VAPID_PUBLIC_KEY || '';
const privateKey = process.env.BORA_VAPID_PRIVATE_KEY || '';
const subject = process.env.BORA_VAPID_SUBJECT || '';
const requestTimeoutMs = Math.max(1_000, Math.min(30_000, Number(process.env.BORA_PUSH_TIMEOUT_MS) || 10_000));

export const pushEnabled = Boolean(publicKey && privateKey && subject);

if (pushEnabled) webpush.setVapidDetails(subject, publicKey, privateKey);

export function vapidPublicKey() {
  return publicKey;
}

function privateIpv4(octets) {
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function privateLiteralHost(hostname) {
  let host = hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (isIP(host) === 4) return privateIpv4(host.split('.').map(Number));
  if (isIP(host) === 6) {
    const normalized = host.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
      const tail = normalized.slice(7);
      if (isIP(tail) === 4) return privateIpv4(tail.split('.').map(Number));
      const groups = tail.split(':');
      if (groups.length === 2) {
        const high = Number.parseInt(groups[0], 16);
        const low = Number.parseInt(groups[1], 16);
        if (Number.isInteger(high) && Number.isInteger(low)) {
          return privateIpv4([high >> 8, high & 255, low >> 8, low & 255]);
        }
      }
    }
    return normalized === '::' || normalized === '::1'
      || normalized.startsWith('fc') || normalized.startsWith('fd')
      || /^fe[89ab]/.test(normalized);
  }
  return false;
}

export function validSubscription(value) {
  if (!value || typeof value !== 'object' || typeof value.endpoint !== 'string' || value.endpoint.length > 2000) return false;
  try {
    const url = new URL(value.endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !privateLiteralHost(url.hostname)
      && typeof value.keys?.p256dh === 'string' && value.keys.p256dh.length > 0 && value.keys.p256dh.length <= 300
      && typeof value.keys?.auth === 'string' && value.keys.auth.length > 0 && value.keys.auth.length <= 100;
  } catch {
    return false;
  }
}

export async function sendPush(subscription, payload) {
  return webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
  }, JSON.stringify(payload), { TTL: 60 * 60 * 24, timeout: requestTimeoutMs });
}
