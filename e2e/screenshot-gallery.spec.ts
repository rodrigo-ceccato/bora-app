import { expect, test } from '@playwright/test';

test('captures the UI screen gallery', async ({ page, request }, testInfo) => {
  const capture = async (name: string) => {
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  };

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bora marcar?' })).toBeVisible();
  await capture('home');

  const createModes = {
    agora: 'Bora agora',
    'mais-tarde': 'Bora essa semana',
    marcar: 'Bora marcar'
  } as const;
  for (const [mode, heading] of Object.entries(createModes)) {
    await page.goto(`/create?mode=${mode}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await capture(`create-${mode}`);
  }

  const runId = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const apiHeaders = { 'x-forwarded-for': `screenshots-${runId}` };
  const created = await request.post('/api/events', {
    headers: apiHeaders,
    data: {
      participantId: `creator-${runId}`,
      event: {
        mode: 'marcar', title: 'Escolha do horário', place: 'Centro', description: 'Escolha o horário que funciona melhor para você.', threshold: 3,
        startsAt: null, alternatives: [], timeZone: 'America/Sao_Paulo', createdByName: 'Ana', votingClosed: false,
        days: [
          { id: 'friday', label: 'sex. 01', date: '2099-08-01', slots: ['18:00', '19:00'] },
          { id: 'saturday', label: 'sáb. 02', date: '2099-08-02', slots: ['16:00', '17:00'] }
        ]
      }
    }
  });
  expect(created.ok()).toBeTruthy();
  const event = await created.json();

  try {
    for (const participant of ['Bia', 'Caio']) {
      const vote = await request.post(`/api/events/${event.event.slug as string}/votes`, {
        headers: apiHeaders,
        data: {
          participantId: `${participant.toLowerCase()}-${runId}`,
          voterName: participant,
          response: 'accept',
          preferredOptions: [],
          availability: { friday: ['18:00'], saturday: ['16:00'] }
        }
      });
      expect(vote.ok()).toBeTruthy();
    }

    await page.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => undefined }));
    await page.goto(`/e/${event.event.slug as string}?admin=${event.adminToken as string}&created=1`);
    await expect(page.getByText('Seu Bora está pronto!')).toBeVisible();
    await capture('event-created');

    await page.goto(`/e/${event.event.slug as string}?admin=${event.adminToken as string}`);
    await expect(page.getByRole('heading', { name: 'Melhores horários' })).toBeVisible();
    await capture('event-results');

    await page.getByRole('button', { name: 'Gerenciar' }).click();
    await expect(page.getByRole('heading', { name: 'Gerenciar evento' })).toBeVisible();
    await capture('event-manage-open');

    const decided = await request.patch(`/api/events/${event.event.slug as string}`, {
      headers: { ...apiHeaders, authorization: `Bearer ${event.adminToken as string}` },
      data: { ...event.event, decidedOption: 'friday:18:00', votingClosed: true }
    });
    expect(decided.ok()).toBeTruthy();

    await page.goto(`/e/${event.event.slug as string}?admin=${event.adminToken as string}`);
    await expect(page.getByText('Coloque na sua agenda')).toBeVisible();
    await capture('event-confirmed');
    await page.getByRole('button', { name: 'Gerenciar' }).click();
    await expect(page.getByRole('button', { name: 'Reabrir confirmações' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remover decisão' })).toBeVisible();
    await capture('event-manage-decided');
  } finally {
    await request.delete(`/api/events/${event.event.slug as string}`, {
      headers: { ...apiHeaders, authorization: `Bearer ${event.adminToken as string}` }
    });
  }
});
