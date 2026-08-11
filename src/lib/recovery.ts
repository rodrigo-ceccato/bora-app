import type { AdminEventAccess } from './store';

export type RecoveryLinkDetails = {
  adminEvents: AdminEventAccess[];
  hasAdminFragment: boolean;
  invalidAdminFragment: boolean;
  invalidNameFragment: boolean;
  fragmentTooLarge: boolean;
  invalidFragment: boolean;
  participantName: string;
};

// Keep enough capabilities for long-lived no-account use. A full link is
// still size-checked below, and the UI offers a participant-only QR fallback
// if a complete link cannot fit in a QR code.
const MAX_ADMIN_EVENTS = 200;
const MAX_FRAGMENT_LENGTH = 64 * 1024;
const MAX_SLUG_LENGTH = 200;
const MAX_TITLE_LENGTH = 120;
const MAX_ADMIN_TOKEN_LENGTH = 200;
const MAX_PARTICIPANT_NAME_LENGTH = 80;

function validAdminEvent(value: unknown): value is AdminEventAccess {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<AdminEventAccess>;
  return typeof event.slug === 'string' && event.slug.length > 0 && event.slug.length <= MAX_SLUG_LENGTH
    && typeof event.title === 'string' && event.title.length > 0 && event.title.length <= MAX_TITLE_LENGTH
    && typeof event.adminToken === 'string' && event.adminToken.length > 0 && event.adminToken.length <= MAX_ADMIN_TOKEN_LENGTH;
}

function rawFragment(value: string) {
  return value.includes('#') ? value.slice(value.indexOf('#') + 1) : value.replace(/^#/, '');
}

/**
 * Reads only the URL fragment, where organizer capabilities are intentionally
 * kept so browsers never include them in HTTP requests or server access logs.
 */
export function recoveryLinkDetails(value: string): RecoveryLinkDetails {
  const raw = rawFragment(value);
  if (raw.length > MAX_FRAGMENT_LENGTH) {
    return {
      adminEvents: [],
      hasAdminFragment: false,
      invalidAdminFragment: true,
      invalidNameFragment: false,
      fragmentTooLarge: true,
      invalidFragment: true,
      participantName: ''
    };
  }

  const fragment = new URLSearchParams(raw);
  const serializedAdminEvents = fragment.get('admin');
  let adminEvents: AdminEventAccess[] = [];
  let invalidAdminFragment = false;

  if (serializedAdminEvents !== null) {
    try {
      const parsed = JSON.parse(serializedAdminEvents) as unknown;
      if (!Array.isArray(parsed) || parsed.length > MAX_ADMIN_EVENTS || parsed.some((event) => !validAdminEvent(event))) {
        invalidAdminFragment = true;
      } else {
        const slugs = parsed.map((event) => event.slug);
        if (new Set(slugs).size !== slugs.length) invalidAdminFragment = true;
        else adminEvents = parsed;
      }
    } catch {
      invalidAdminFragment = true;
    }
  }

  const participantName = fragment.get('name') || '';
  const invalidNameFragment = participantName.length > MAX_PARTICIPANT_NAME_LENGTH;
  return {
    adminEvents,
    hasAdminFragment: serializedAdminEvents !== null,
    invalidAdminFragment,
    invalidNameFragment,
    fragmentTooLarge: false,
    invalidFragment: invalidAdminFragment || invalidNameFragment,
    participantName: invalidNameFragment ? '' : participantName
  };
}

/**
 * Returns a participant-only version of an existing recovery URL. It reuses
 * the recovery token and removes only the organizer-capability fragment.
 */
export function recoveryLinkWithoutAdminAccess(value: string) {
  const url = new URL(value);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  fragment.delete('admin');
  url.hash = fragment.toString();
  return url.toString();
}

/** The exact portion a browser sends over HTTP. Useful for regression tests. */
export function recoveryRequestTarget(value: string) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}${url.search}`;
}
