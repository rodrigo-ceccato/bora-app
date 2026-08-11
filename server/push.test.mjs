import { describe, expect, it } from 'vitest';
import { validSubscription } from './push.mjs';

function subscription(endpoint) {
  return { endpoint, keys: { p256dh: 'public-key', auth: 'auth-secret' } };
}

describe('Push subscription validation', () => {
  it('accepts an HTTPS public Push endpoint', () => {
    expect(validSubscription(subscription('https://fcm.googleapis.com/fcm/send/example'))).toBe(true);
  });

  it.each([
    'https://localhost/push',
    'https://127.0.0.1/push',
    'https://10.1.2.3/push',
    'https://169.254.169.254/latest/meta-data',
    'https://192.168.1.10/push',
    'https://[::1]/push',
    'https://[fd00::1]/push',
    'https://[::ffff:172.16.0.1]/push'
  ])('rejects a private or local literal endpoint: %s', (endpoint) => {
    expect(validSubscription(subscription(endpoint))).toBe(false);
  });

  it('rejects credentials and missing encryption keys', () => {
    expect(validSubscription(subscription('https://user:secret@push.example.test/send'))).toBe(false);
    expect(validSubscription({ endpoint: 'https://push.example.test/send', keys: { p256dh: '', auth: '' } })).toBe(false);
  });
});
