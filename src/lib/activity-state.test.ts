import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let store: typeof import('./store');

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.stubEnv('VITE_API_URL', '/api');
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  store = await import('./store');
  store.restoreParticipantId('participant_ana');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('activity state updates', () => {
  it('acknowledges large grouped activity in deduplicated batches of at most 100 keys', async () => {
    const requests: RequestInit[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init || {});
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const activityKeys = Array.from({ length: 201 }, (_, index) => `activity:${index}`);

    await store.updateActivityState([...activityKeys, activityKeys[0], activityKeys[100]], 'dismiss');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requests.map((init) => {
      const body = JSON.parse(init.body as string);
      return body.activityKeys;
    })).toEqual([activityKeys.slice(0, 100), activityKeys.slice(100, 200), activityKeys.slice(200)]);
  });

  it('stops and rejects when any acknowledgement batch fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Falhou.' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(store.updateActivityState(Array.from({ length: 201 }, (_, index) => `activity:${index}`), 'read'))
      .rejects.toThrow('Falhou.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
