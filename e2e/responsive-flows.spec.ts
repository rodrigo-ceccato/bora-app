import { expect, test } from '@playwright/test';

async function expectNoHorizontalScroll(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('home and every creation mode are usable at this viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bora marcar?' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Símbolo de compartilhamento Bora' })).toBeVisible();
  await expect(page.locator('.home-mode-card')).toHaveCount(3);
  await expect(page.getByText('Bora agora', { exact: true })).toBeVisible();
  await expect(page.getByText('Bora essa semana', { exact: true })).toBeVisible();
  await expect(page.getByText('Bora marcar', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto('/create?mode=agora');
  await expect(page.getByRole('heading', { name: 'Bora agora' })).toBeVisible();
  await page.locator('.time-picker-trigger').click();
  await expect(page.getByText('Escolha o horário')).toBeVisible();
  await expect(page.locator('ion-datetime[presentation="time"]')).toBeVisible();
  await page.getByRole('button', { name: 'Pronto' }).click();
  await expect(page.getByRole('button', { name: 'Alterar data' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto('/create?mode=mais-tarde');
  await expect(page.getByRole('heading', { name: 'Bora essa semana' })).toBeVisible();
  await expect(page.locator('.week-picker button')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Escolher outra data' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto('/create?mode=marcar');
  await expect(page.getByRole('heading', { name: 'Bora marcar' })).toBeVisible();
  await expect(page.locator('.day-accordion')).toHaveCount(1);
  await expect(page.locator('.time-chip-grid button').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Adicionar dia/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('results stay compact and explain availability', async ({ page, request }, testInfo) => {
  const runId = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = `Teste visual ${runId}`;
  const apiHeaders = { 'x-forwarded-for': `e2e-${runId}` };
  const creatorParticipantId = `criador-${runId}`;
  const created = await request.post('/api/events', {
    headers: apiHeaders,
    data: {
      participantId: creatorParticipantId,
      event: {
        mode: 'marcar', title, place: 'Centro', description: '', threshold: 3,
        startsAt: null, alternatives: [], createdByName: 'Ana', votingClosed: false,
        days: [{ id: 'sabado', label: 'sáb. 01', date: '2099-08-01', slots: ['18:00', '19:00', '20:00', '21:00'] }]
      }
    }
  });
  expect(created.ok()).toBeTruthy();
  const body = await created.json();
  const slug = body.event.slug as string;
  const token = body.adminToken as string;

  try {
    const recoveryLink = await request.post('/api/me/recovery-link', {
      headers: { ...apiHeaders, 'x-participant-id': creatorParticipantId }
    });
    expect(recoveryLink.ok()).toBeTruthy();
    const recovery = await recoveryLink.json();
    await page.goto(`/recover?token=${encodeURIComponent(recovery.recoveryToken as string)}`);
    await expect(page.getByRole('heading', { name: 'Pronto!' })).toBeVisible();
    expect(page.url()).toMatch(/\/recover$/);

    for (const participantId of ['bia', 'caio']) {
      const vote = await request.post(`/api/events/${slug}/votes`, {
        headers: apiHeaders,
        data: { participantId: `${participantId}-${runId}`, voterName: participantId, response: 'accept', preferredOptions: [], availability: { sabado: ['18:00', '19:00'] } }
      });
      expect(vote.ok()).toBeTruthy();
    }

    await page.goto(`/e/${slug}?admin=${token}`);
    await expect(page.getByRole('heading', { name: 'Melhores horários' })).toBeVisible();
    await expect(page.getByText('3 de 3')).toHaveCount(3);
    await expect(page.locator('.result-progress')).toHaveCount(3);
    await expect(page.getByRole('button', { name: /Ver mais horários/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Escolher este horário' })).toHaveCount(3);
    await expectNoHorizontalScroll(page);

    const decided = await request.patch(`/api/events/${slug}`, {
      headers: { ...apiHeaders, authorization: `Bearer ${token}` },
      data: { ...body.event, decidedOption: 'sabado:18:00', votingClosed: true }
    });
    expect(decided.ok()).toBeTruthy();

    for (const url of [`/e/${slug}?admin=${token}`, `/e/${slug}`]) {
      await page.goto(url);
      await expect(page.getByText('Coloque na sua agenda')).toBeVisible();
      await expect(page.locator('a[href*="calendar.google.com"]')).toHaveCount(1);
    }
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar arquivo de agenda' }).click();
    await expect((await download).suggestedFilename()).toBe(`${slug}.ics`);
  } finally {
    await request.delete(`/api/events/${slug}`, { headers: { ...apiHeaders, authorization: `Bearer ${token}` } });
  }
});
