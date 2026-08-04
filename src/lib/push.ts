import { getParticipantId } from './store';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
const registeredEndpointKey = 'bora_push_registered_endpoint';
export type PushReminderState = 'unsupported' | 'permission-required' | 'permission-denied' | 'permission-granted-but-not-subscribed' | 'subscribed';

function supported() { return Boolean(API_BASE && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window); }
function base64UrlToUint8Array(value: string) { const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)); }
async function existingSubscription() { const registration = await navigator.serviceWorker.getRegistration('/sw.js'); return registration ? registration.pushManager.getSubscription() : null; }

export async function pushReminderState(): Promise<PushReminderState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'permission-denied';
  if (Notification.permission !== 'granted') return 'permission-required';
  return (await existingSubscription()) ? 'subscribed' : 'permission-granted-but-not-subscribed';
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
  if (localStorage.getItem(registeredEndpointKey) !== subscription.endpoint) {
    const response = await fetch(`${API_BASE}/push/subscriptions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-participant-id': getParticipantId() }, body: JSON.stringify(subscription) });
    if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || 'Não foi possível ativar os lembretes.'); }
    localStorage.setItem(registeredEndpointKey, subscription.endpoint);
  }
  return 'subscribed' as const;
}
