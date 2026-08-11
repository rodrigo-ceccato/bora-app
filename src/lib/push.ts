import { getParticipantId } from './store';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
export type PushReminderState = 'unsupported' | 'permission-required' | 'permission-denied' | 'permission-granted-but-not-subscribed' | 'subscribed';
export type PushReminderPreferences = { votes: boolean; changes: boolean; confirmed: boolean; threshold: boolean; upcoming: boolean; messages: boolean };
export const defaultPushReminderPreferences: PushReminderPreferences = { votes: true, changes: true, confirmed: true, threshold: true, upcoming: true, messages: false };

function supported() { return Boolean(API_BASE && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window); }
function base64UrlToUint8Array(value: string) { const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)); }
async function existingSubscription() { const registration = await navigator.serviceWorker.getRegistration('/sw.js'); return registration ? registration.pushManager.getSubscription() : null; }

async function subscriptionPreferences(subscription: PushSubscription, participantId = getParticipantId()) {
  if (!API_BASE) return { subscribed: false, preferences: defaultPushReminderPreferences };
  const response = await fetch(`${API_BASE}/push/subscriptions/preferences?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
    headers: { 'x-participant-id': participantId }
  });
  if (!response.ok) throw new Error('Não foi possível verificar os lembretes deste aparelho.');
  const body = await response.json() as { subscribed?: boolean; preferences?: Partial<PushReminderPreferences> };
  return {
    subscribed: body.subscribed === true,
    preferences: { ...defaultPushReminderPreferences, ...(body.preferences || {}) }
  };
}

async function registerSubscription(subscription: PushSubscription, participantId = getParticipantId()) {
  if (!API_BASE) throw new Error('Os lembretes ainda não foram configurados no Bora.');
  const response = await fetch(`${API_BASE}/push/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-participant-id': participantId },
    body: JSON.stringify(subscription)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || 'Não foi possível ativar os lembretes.');
  }
}

export async function pushReminderPreferences(): Promise<PushReminderPreferences> {
  const subscription = await existingSubscription();
  if (!API_BASE || !subscription) return defaultPushReminderPreferences;
  const result = await subscriptionPreferences(subscription);
  if (!result.subscribed) throw new Error('Ative novamente os lembretes neste aparelho.');
  return result.preferences;
}

export async function savePushReminderPreferences(preferences: PushReminderPreferences) {
  const subscription = await existingSubscription();
  if (!API_BASE || !subscription) throw new Error('Ative os lembretes neste aparelho antes de escolher os avisos.');
  const response = await fetch(`${API_BASE}/push/subscriptions/preferences`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-participant-id': getParticipantId() }, body: JSON.stringify({ endpoint: subscription.endpoint, preferences }) });
  if (!response.ok) throw new Error('Não foi possível salvar as preferências de lembretes.');
}

export async function pushReminderState(): Promise<PushReminderState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'permission-denied';
  if (Notification.permission !== 'granted') return 'permission-required';
  const subscription = await existingSubscription();
  if (!subscription) return 'permission-granted-but-not-subscribed';
  return (await subscriptionPreferences(subscription)).subscribed
    ? 'subscribed'
    : 'permission-granted-but-not-subscribed';
}

/** Reassigns this browser endpoint before a recovered identity replaces the current one. */
export async function rebindPushSubscription(participantId: string) {
  if (!supported()) return 'none' as const;
  const subscription = await existingSubscription();
  if (!subscription) return 'none' as const;
  await registerSubscription(subscription, participantId);
  return 'rebound' as const;
}

/** Removes both the API endpoint and browser subscription before device access is cleared. */
export async function removeDevicePushSubscription() {
  if (!supported()) return 'none' as const;
  const subscription = await existingSubscription();
  if (!subscription) return 'none' as const;
  const participantId = getParticipantId();
  const response = await fetch(`${API_BASE}/push/subscriptions`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', 'x-participant-id': participantId },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || 'Não foi possível remover os lembretes deste aparelho.');
  }
  if (!await subscription.unsubscribe()) {
    await registerSubscription(subscription, participantId);
    throw new Error('Não foi possível remover os lembretes deste navegador.');
  }
  return 'removed' as const;
}

export type DevicePushDetachResult = 'none' | 'removed' | 'browser-only' | 'server-only' | 'failed';

/**
 * Best-effort cleanup used when local access is being removed for security.
 * It never prevents local capability deletion merely because the API is down.
 */
export async function detachDevicePushSubscription(): Promise<DevicePushDetachResult> {
  if (!supported()) return 'none';
  let subscription: PushSubscription | null = null;
  try { subscription = await existingSubscription(); } catch { return 'failed'; }
  if (!subscription) return 'none';

  const participantId = getParticipantId();
  let browserRemoved = false;
  let serverRemoved = false;
  try { browserRemoved = await subscription.unsubscribe(); } catch { /* Continue with server cleanup. */ }
  try {
    const response = await fetch(`${API_BASE}/push/subscriptions`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-participant-id': participantId },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
    serverRemoved = response.ok;
  } catch { /* A stale server endpoint will be retired on its next failed send. */ }

  if (browserRemoved && serverRemoved) return 'removed';
  if (browserRemoved) return 'browser-only';
  if (serverRemoved) return 'server-only';
  return 'failed';
}

export async function enablePushReminders() {
  if (!supported()) throw new Error('Este navegador não oferece lembretes. Adicione o Bora à tela inicial ou use a agenda.');
  if (Notification.permission === 'denied') throw new Error('As notificações estão bloqueadas nas configurações do navegador ou aparelho.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permita as notificações para receber lembretes.');
  const keyResponse = await fetch(`${API_BASE}/push/public-key`);
  if (!keyResponse.ok) throw new Error('Os lembretes ainda não foram configurados no Bora.');
  const { publicKey } = await keyResponse.json() as { publicKey?: string };
  if (!publicKey) throw new Error('Os lembretes ainda não foram configurados no Bora.');
  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(publicKey) });
  await registerSubscription(subscription);
  return 'subscribed' as const;
}

export async function disablePushReminders() {
  if (!supported()) throw new Error('Este navegador não oferece lembretes.');
  await removeDevicePushSubscription();
  return 'permission-granted-but-not-subscribed' as const;
}
