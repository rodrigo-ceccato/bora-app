import { getParticipantId } from './store';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

function supported() {
  return Boolean(API_BASE && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
}

function base64UrlToUint8Array(value: string) {
  const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = atob(padded);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export function pushAvailability() {
  if (!supported()) return 'unsupported' as const;
  return Notification.permission as NotificationPermission;
}

export async function enablePushReminders() {
  if (!supported()) throw new Error('Este navegador não oferece lembretes. Adicione o Bora à tela inicial ou use a agenda.');
  const keyResponse = await fetch(`${API_BASE}/push/public-key`);
  if (!keyResponse.ok) throw new Error('Os lembretes ainda não foram configurados no Bora.');
  const { publicKey } = await keyResponse.json() as { publicKey?: string };
  if (!publicKey) throw new Error('Os lembretes ainda não foram configurados no Bora.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permita as notificações para receber lembretes.');
  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey)
  });
  const response = await fetch(`${API_BASE}/push/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-participant-id': getParticipantId() },
    body: JSON.stringify(subscription)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || 'Não foi possível ativar os lembretes.');
  }
}
