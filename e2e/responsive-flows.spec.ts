import { expect, test } from '@playwright/test';

async function expectNoHorizontalScroll(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('home and every creation mode are usable at this viewport', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('bora_participant_name', 'Ana'));
  await page.goto('/');
  await expect(page.locator('ion-title.home-toolbar-title')).toHaveText('Bora, Ana?');
  await expect(page.getByRole('heading', { name: 'Bora marcar?' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Símbolo de compartilhamento Bora' })).toBeVisible();
  await expect(page.locator('.home-mode-card')).toHaveCount(3);
  await expect(page.getByText('Bora agora', { exact: true })).toBeVisible();
  await expect(page.getByText('Bora essa semana', { exact: true })).toBeVisible();
  await expect(page.getByText('Bora marcar', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto('/create?mode=agora');
  await expect(page.getByRole('heading', { name: 'Bora agora' })).toBeVisible();
  const nameInput = page.locator('ion-item:has-text("Seu nome") input');
  await expect(nameInput).toHaveValue('Ana');
  await nameInput.fill('Bia');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bora_participant_name'))).toBe('Bia');
  const initialTime = await page.locator('.time-picker-trigger strong').innerText();
  const [hours, minutes] = initialTime.split(':').map(Number);
  const initialMinutes = hours * 60 + minutes;
  const current = new Date();
  const expectedMinutes = ((current.getHours() + 1) * 60 + current.getMinutes()) % (24 * 60);
  const minuteDifference = Math.abs(initialMinutes - expectedMinutes);
  expect(Math.min(minuteDifference, 24 * 60 - minuteDifference)).toBeLessThanOrEqual(1);
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

  await page.goto('/my-events');
  await page.getByRole('button', { name: 'Usar em outro dispositivo' }).click();
  await expect(page.getByText('Crie um link para acessar seus Boras em outro aparelho. Este aparelho continuará com acesso normalmente.')).toBeVisible();
  await expect(page.locator('ion-back-button[default-href="/my-events"]')).toHaveCount(1);
  await page.locator('ion-back-button[default-href="/my-events"]').click();
  await expect(page).toHaveURL(/\/my-events$/);
});

test('device-transfer links restore the saved participant name', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/me/recovery-link', (route) => route.fulfill({ json: { recoveryToken: 'name-transfer-token' } }));
  await page.route('**/api/recover', (route) => route.fulfill({ json: { participantId: 'name-transfer-participant' } }));
  await page.goto('/recover');
  await page.evaluate(() => localStorage.setItem('bora_participant_name', 'Bia'));
  await page.getByRole('button', { name: 'Criar link de acesso' }).click();
  await page.getByRole('button', { name: 'Copiar link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).hash).toContain('name=Bia');

  await page.evaluate(() => localStorage.clear());
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Pronto!' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bora_participant_name'))).toBe('Bia');
});

test('recovery confirms before replacing an existing Bora on this device', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const originalParticipant = `original-participant-${testInfo.project.name}-${Date.now()}`;
  const currentParticipant = `participant-on-this-device-${testInfo.project.name}-${Date.now()}`;
  await page.route('**/api/me/recovery-link', (route) => route.fulfill({ json: { recoveryToken: `confirm-token-${testInfo.project.name}` } }));
  await page.route('**/api/recover', (route) => route.fulfill({ json: { participantId: originalParticipant } }));
  await page.goto('/recover');
  await page.evaluate((participantId) => localStorage.setItem('bora_participant_id', participantId), originalParticipant);
  await page.getByRole('button', { name: 'Criar link de acesso' }).click();
  await page.getByRole('button', { name: 'Copiar link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());

  await page.evaluate((participantId) => localStorage.setItem('bora_participant_id', participantId), currentParticipant);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Usar este link de recuperação?' })).toBeVisible();
  await expect(page.getByText('Ele vai remover os Boras registrados neste aparelho e substituí-los pelos deste link.')).toBeVisible();
  await page.getByRole('button', { name: 'Usar link' }).click();
  await expect(page.getByRole('heading', { name: 'Pronto!' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bora_participant_id'))).toBe(originalParticipant);
});

test('device-transfer links can include organizer controls', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/me/recovery-link', (route) => route.fulfill({ json: { recoveryToken: 'organizer-transfer-token' } }));
  await page.goto('/recover');
  await page.evaluate(() => {
    localStorage.setItem('bora_participant_id', 'organizer-participant');
    localStorage.setItem('bora_admin_events', JSON.stringify([{ slug: 'meu-bora', title: 'Meu Bora', adminToken: 'admin-token' }]));
  });
  await expect(page.getByText('Quem receber este link poderá editar e excluir os eventos que você organizou.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar link de acesso' }).click();
  await page.getByRole('button', { name: 'Copiar link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).hash).toContain('admin=');
});

test('My Boras can remove this device access', async ({ page }) => {
  await page.goto('/my-events');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bora_participant_id'))).not.toBeNull();
  await page.getByRole('button', { name: 'Remover acesso deste aparelho' }).click();
  await expect(page.getByRole('heading', { name: 'Remover acesso deste aparelho?' })).toBeVisible();
  await expect(page.getByText('Este aparelho deixará de mostrar seus Boras e perderá os acessos de organizador salvos. Os eventos não serão excluídos e outros dispositivos continuarão funcionando.')).toBeVisible();
  await page.getByRole('button', { name: 'Remover acesso' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bora_participant_id'))).toBeNull();
});

test('Bora agora offers Google Calendar after it is created', async ({ page, request }, testInfo) => {
  const runId = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created = await request.post('/api/events', {
    headers: { 'x-forwarded-for': `e2e-${runId}` },
    data: {
      participantId: `criador-${runId}`,
      event: {
        mode: 'agora', title: `Agenda ${runId}`, place: 'Centro', description: '', threshold: 2,
        startsAt: '2099-08-01T21:00:00.000Z', alternatives: [], createdByName: 'Ana', votingClosed: false, days: []
      }
    }
  });
  expect(created.ok()).toBeTruthy();
  const body = await created.json();
  const slug = body.event.slug as string;
  const token = body.adminToken as string;

  try {
    await page.goto(`/e/${slug}`);
    await expect(page.getByText('Coloque na sua agenda')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Adicionar ao Google Agenda' })).toHaveAttribute('href', /calendar\.google\.com/);
  } finally {
    await request.delete(`/api/events/${slug}`, { headers: { 'x-forwarded-for': `e2e-${runId}`, authorization: `Bearer ${token}` } });
  }
});

test('My Boras highlights upcoming scheduled events and handles reminder availability', async ({ page, request }, testInfo) => {
  const runId = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const participantId = `upcoming-${runId}`;
  const created = await request.post('/api/events', {
    headers: { 'x-forwarded-for': `e2e-${runId}` },
    data: {
      participantId,
      event: {
        mode: 'agora', title: `Próximo ${runId}`, place: 'Praça', description: '', threshold: 2,
        startsAt: '2099-08-01T21:00:00.000Z', alternatives: [], createdByName: 'Ana', votingClosed: false, days: []
      }
    }
  });
  expect(created.ok()).toBeTruthy();
  const body = await created.json();
  try {
    await page.goto('/my-events');
    await page.evaluate((id) => localStorage.setItem('bora_participant_id', id), participantId);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Próximos Boras' })).toBeVisible();
    await expect(page.getByText(`Próximo ${runId}`).first()).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Ativar lembretes neste aparelho' })).toBeVisible();
    const createdDisclosure = page.getByRole('button', { name: /Criados por mim/ });
    await expect(createdDisclosure).toHaveAttribute('aria-expanded', 'false');
    await createdDisclosure.focus();
    await page.keyboard.press('Enter');
    await expect(createdDisclosure).toHaveAttribute('aria-expanded', 'true');
  } finally {
    await request.delete(`/api/events/${body.event.slug as string}`, { headers: { 'x-forwarded-for': `e2e-${runId}`, authorization: `Bearer ${body.adminToken as string}` } });
  }
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
    await expect(page.locator('.result-progress')).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'Escolher este horário' })).toHaveCount(4);
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
