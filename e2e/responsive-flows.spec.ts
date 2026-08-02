import { expect, test } from '@playwright/test';

async function expectNoHorizontalScroll(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('home and every creation mode are usable at this viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bora marcar?' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Símbolo de compartilhamento Bora' })).toBeVisible();
  await expect(page.locator('.home-mode-button')).toHaveCount(3);
  await expect(page.getByText('BORA AGORA! 🧑‍🤝‍🧑')).toBeVisible();
  await expect(page.getByText('Bora essa semana? 🗓️')).toBeVisible();
  await expect(page.getByText('Bora marcar 📅')).toBeVisible();
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

test('results stay compact and explain availability', async ({ page, request }) => {
  const title = `Teste visual ${Date.now()}`;
  const created = await request.post('/api/events', {
    data: {
      participantId: `criador-${Date.now()}`,
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
    for (const participantId of ['bia', 'caio']) {
      const vote = await request.post(`/api/events/${slug}/votes`, {
        data: { participantId: `${participantId}-${Date.now()}`, voterName: participantId, response: 'accept', preferredOptions: [], availability: { sabado: ['18:00', '19:00'] } }
      });
      expect(vote.ok()).toBeTruthy();
    }

    await page.goto(`/e/${slug}?admin=${token}`);
    await expect(page.getByRole('heading', { name: 'Melhores horários' })).toBeVisible();
    await expect(page.getByText('3 de 3')).toHaveCount(2);
    await expect(page.locator('.result-progress')).toHaveCount(3);
    await expect(page.getByRole('button', { name: /Ver mais horários/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Escolher este horário' })).toHaveCount(3);
    await expectNoHorizontalScroll(page);
  } finally {
    await request.delete(`/api/events/${slug}`, { headers: { authorization: `Bearer ${token}` } });
  }
});
