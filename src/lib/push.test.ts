import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscription = {
  endpoint: 'https://push.example.test/subscription',
  keys: { p256dh: 'public-key', auth: 'auth-key' },
  unsubscribe: vi.fn(async () => true),
  toJSON() { return { endpoint: this.endpoint, keys: this.keys }; }
};

let push: typeof import('./push');

beforeEach(async () => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.stubEnv('VITE_API_URL', '/api');
  subscription.unsubscribe = vi.fn(async () => true);
  vi.stubGlobal('window', { PushManager: class PushManager {}, Notification: {} });
  vi.stubGlobal('PushManager', class PushManager {});
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() });
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: vi.fn(async () => ({
        pushManager: { getSubscription: vi.fn(async () => subscription) }
      }))
    }
  });
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => key === 'bora_participant_id' ? 'participant_old' : null),
    setItem: vi.fn(), removeItem: vi.fn()
  });
  vi.stubGlobal('sessionStorage', {
    getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn()
  });
  push = await import('./push');
});

describe('push subscription identity', () => {
  it('does not call a browser-only subscription server-subscribed', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ subscribed: false, preferences: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(push.pushReminderState()).resolves.toBe('permission-granted-but-not-subscribed');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/push/subscriptions/preferences?endpoint='),
      expect.objectContaining({ headers: { 'x-participant-id': 'participant_old' } })
    );
  });

  it('reports subscribed only when the endpoint belongs to the current participant', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ subscribed: true, preferences: {} }), { status: 200 })));

    await expect(push.pushReminderState()).resolves.toBe('subscribed');
  });

  it('rebinds the exact browser endpoint to a recovered participant', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'subscribed' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(push.rebindPushSubscription('participant_recovered')).resolves.toBe('rebound');
    expect(fetchMock).toHaveBeenCalledWith('/api/push/subscriptions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-participant-id': 'participant_recovered' })
    }));
  });

  it('deletes server ownership before unsubscribing during device removal', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(push.removeDevicePushSubscription()).resolves.toBe('removed');
    expect(fetchMock).toHaveBeenCalledWith('/api/push/subscriptions', expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ 'x-participant-id': 'participant_old' })
    }));
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('restores server ownership if browser unsubscribe fails', async () => {
    subscription.unsubscribe.mockResolvedValueOnce(false);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'subscribed' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(push.removeDevicePushSubscription()).rejects.toThrow('Não foi possível remover os lembretes deste navegador.');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/push/subscriptions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-participant-id': 'participant_old' })
    }));
  });

  it('detaches the browser locally even when server cleanup is offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));

    await expect(push.detachDevicePushSubscription()).resolves.toBe('browser-only');
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });
});
