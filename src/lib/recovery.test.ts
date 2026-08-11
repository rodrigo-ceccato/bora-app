import { describe, expect, it } from 'vitest';
import { recoveryLinkDetails, recoveryLinkWithoutAdminAccess, recoveryRequestTarget } from './recovery';

function recoveryUrl(adminEvents?: Array<{ slug: string; title: string; adminToken: string }>) {
  const url = new URL('https://bora.example/recover?token=participant-recovery-token');
  const fragment = new URLSearchParams();
  if (adminEvents !== undefined) fragment.set('admin', JSON.stringify(adminEvents));
  fragment.set('name', 'Ana Maria');
  url.hash = fragment.toString();
  return url.toString();
}

describe('recovery link capabilities', () => {
  it('handles a link with zero saved organizer controls', () => {
    const link = recoveryUrl([]);
    expect(recoveryLinkDetails(link)).toMatchObject({
      adminEvents: [],
      hasAdminFragment: true,
      invalidAdminFragment: false,
      participantName: 'Ana Maria'
    });
  });

  it('keeps one organizer control in the fragment and out of the request target', () => {
    const link = recoveryUrl([{ slug: 'cafe', title: 'Café', adminToken: 'admin-secret' }]);
    expect(recoveryLinkDetails(link).adminEvents).toHaveLength(1);
    expect(recoveryLinkDetails(link).adminEvents[0].adminToken).toBe('admin-secret');
    expect(recoveryRequestTarget(link)).toBe('https://bora.example/recover?token=participant-recovery-token');
    expect(recoveryRequestTarget(link)).not.toContain('admin-secret');
  });

  it('preserves all 30 saved controls in the full link and removes them only by explicit conversion', () => {
    const events = Array.from({ length: 30 }, (_, index) => ({
      slug: `bora-${index}`,
      title: `Bora ${index}`,
      adminToken: `admin-secret-${index}`
    }));
    const fullLink = recoveryUrl(events);
    expect(recoveryLinkDetails(fullLink).adminEvents).toHaveLength(30);

    const participantOnly = recoveryLinkWithoutAdminAccess(fullLink);
    expect(recoveryLinkDetails(participantOnly)).toMatchObject({
      adminEvents: [],
      hasAdminFragment: false,
      invalidAdminFragment: false,
      participantName: 'Ana Maria'
    });
    expect(participantOnly).toContain('name=Ana+Maria');
    expect(participantOnly).not.toContain('admin-secret');
  });

  it('does not treat a malformed capability fragment as an empty valid list', () => {
    expect(recoveryLinkDetails('https://bora.example/recover?token=x#admin=not-json')).toMatchObject({
      adminEvents: [],
      hasAdminFragment: true,
      invalidAdminFragment: true,
      invalidFragment: true
    });
  });

  it('accepts 30 controls at the field limits without silently trimming them', () => {
    const events = Array.from({ length: 30 }, (_, index) => ({
      slug: `${String(index).padStart(2, '0')}-${'s'.repeat(197)}`.slice(0, 200),
      title: `${index}-${'t'.repeat(118)}`.slice(0, 120),
      adminToken: `${index}-${'a'.repeat(198)}`.slice(0, 200)
    }));
    const details = recoveryLinkDetails(recoveryUrl(events));
    expect(details.invalidFragment).toBe(false);
    expect(details.adminEvents).toHaveLength(30);
    expect(details.adminEvents[29]).toEqual(events[29]);
  });

  it('keeps more than 30 organizer controls instead of silently evicting the oldest one', () => {
    const events = Array.from({ length: 31 }, (_, index) => ({ slug: `bora-${index}`, title: `Bora ${index}`, adminToken: `admin-${index}` }));
    expect(recoveryLinkDetails(recoveryUrl(events))).toMatchObject({
      invalidAdminFragment: false,
      invalidFragment: false
    });
    expect(recoveryLinkDetails(recoveryUrl(events)).adminEvents).toHaveLength(31);
  });

  it('rejects the 201st organizer control rather than dropping it', () => {
    const events = Array.from({ length: 201 }, (_, index) => ({ slug: `bora-${index}`, title: `Bora ${index}`, adminToken: `admin-${index}` }));
    expect(recoveryLinkDetails(recoveryUrl(events))).toMatchObject({
      adminEvents: [],
      hasAdminFragment: true,
      invalidAdminFragment: true,
      invalidFragment: true
    });
  });

  it.each([
    { slug: 's'.repeat(201), title: 'Bora', adminToken: 'admin' },
    { slug: 'bora', title: 't'.repeat(121), adminToken: 'admin' },
    { slug: 'bora', title: 'Bora', adminToken: 'a'.repeat(201) }
  ])('rejects an overlong organizer capability field', (event) => {
    expect(recoveryLinkDetails(recoveryUrl([event]))).toMatchObject({
      adminEvents: [],
      invalidAdminFragment: true,
      invalidFragment: true
    });
  });

  it('rejects an overlong participant name instead of truncating it', () => {
    const fragment = new URLSearchParams({ name: 'n'.repeat(81) });
    expect(recoveryLinkDetails(`https://bora.example/recover?token=x#${fragment}`)).toMatchObject({
      participantName: '',
      invalidNameFragment: true,
      invalidFragment: true
    });
  });

  it('rejects an oversized fragment before parsing its contents', () => {
    expect(recoveryLinkDetails(`https://bora.example/recover?token=x#${'x'.repeat(64 * 1024 + 1)}`)).toMatchObject({
      adminEvents: [],
      fragmentTooLarge: true,
      invalidFragment: true
    });
  });
});
