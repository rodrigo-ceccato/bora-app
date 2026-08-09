import { expect, test } from '@playwright/test';

function localDay(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

test('agora time picker offers quick times that close the modal', async ({ page }) => {
  await page.goto('/create?mode=agora');
  await page.locator('.time-picker-trigger').click();
  await expect(page.getByRole('button', { name: 'Em 1h' })).toBeVisible();
  await page.getByRole('button', { name: 'Em 1h' }).click();
  await expect(page.getByText('Escolha o horário')).not.toBeVisible();
  await expect(page.locator('.agora-date-summary .schedule-summary')).toBeVisible();
});

test('agora edit: no waiting-for-date notice, and the day can be changed', async ({ page, request }, testInfo) => {
  const runId = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const participantId = `agora-edit-${runId}`;
  const title = `Editar ${runId}`;
  const created = await request.post('/api/events', {
    headers: { 'x-forwarded-for': `e2e-${runId}` },
    data: {
      participantId,
      event: { mode: 'agora', title, place: 'Praça', description: '', threshold: 2, startsAt: '2099-08-01T21:00:00.000Z', alternatives: [], createdByName: 'Ana', votingClosed: false, days: [] }
    }
  });
  expect(created.ok()).toBeTruthy();
  const body = await created.json();
  const slug = body.event.slug as string;
  const token = body.adminToken as string;
  try {
    // A Bora agora already has its date set, so it must not be flagged as waiting.
    await page.goto('/my-events');
    await page.evaluate(({ id, eventSlug, adminToken, eventTitle }) => {
      localStorage.setItem('bora_participant_id', id);
      localStorage.setItem('bora_admin_events', JSON.stringify([{ slug: eventSlug, title: eventTitle, adminToken }]));
    }, { id: participantId, eventSlug: slug, adminToken: token, eventTitle: title });
    await page.reload();
    await page.getByRole('button', { name: /Criados por mim/ }).click();
    await expect(page.getByText('Você tem Boras aguardando a escolha de uma data.')).toHaveCount(0);
    await expect(page.locator('em[aria-label="Há Boras aguardando escolha de data"]')).toHaveCount(0);

    // The organizer can still move the Bora to Amanhã from the editor.
    await page.getByText(title).first().click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await page.getByRole('button', { name: 'Gerenciar' }).click();
    await page.getByRole('button', { name: 'Editar detalhes' }).click();
    await expect(page.getByRole('heading', { name: 'Editar Bora' })).toBeVisible();
    const amanha = page.locator('.event-editor .agora-day-picker button:has-text("Amanhã")');
    await expect(amanha).toBeVisible();
    await amanha.click();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Evento atualizado!')).toBeVisible();

    const after = await request.get(`/api/events/${slug}`);
    expect(after.ok()).toBeTruthy();
    const { event } = await after.json();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(new Date(event.startsAt as string).toDateString()).toBe(tomorrow.toDateString());
  } finally {
    await request.delete(`/api/events/${slug}`, { headers: { 'x-forwarded-for': `e2e-${runId}`, authorization: `Bearer ${token}` } });
  }
});

test('marcar with confirmations still shows the waiting-for-date notice', async ({ page, request }, testInfo) => {
  const runId = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const participantId = `marcar-pending-${runId}`;
  const created = await request.post('/api/events', {
    headers: { 'x-forwarded-for': `e2e-${runId}` },
    data: {
      participantId,
      event: {
        mode: 'marcar', title: `Marcar ${runId}`, place: 'Praça', description: '', threshold: 2,
        startsAt: null, alternatives: [], createdByName: 'Ana', votingClosed: false,
        days: [{ id: 'sabado', label: 'sáb. 01', date: '2099-08-01', slots: ['18:00'] }]
      }
    }
  });
  expect(created.ok()).toBeTruthy();
  const body = await created.json();
  const slug = body.event.slug as string;
  const token = body.adminToken as string;
  try {
    await page.goto('/my-events');
    await page.evaluate((id) => localStorage.setItem('bora_participant_id', id), participantId);
    await page.reload();
    await page.getByRole('button', { name: /Criados por mim/ }).click();
    await expect(page.getByText('Você tem Boras aguardando a escolha de uma data.')).toBeVisible();
    await expect(page.locator('em[aria-label="Há Boras aguardando escolha de data"]')).toBeVisible();
  } finally {
    await request.delete(`/api/events/${slug}`, { headers: { 'x-forwarded-for': `e2e-${runId}`, authorization: `Bearer ${token}` } });
  }
});

test('mais tarde progress bars follow an edited confirmation target', async ({ page, request }, testInfo) => {
  const runId = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startsAt = '2099-08-01T21:00:00.000Z';
  const apiHeaders = { 'x-forwarded-for': `e2e-${runId}` };
  const created = await request.post('/api/events', {
    headers: apiHeaders,
    data: {
      participantId: `creator-${runId}`,
      creatorPreferredOptions: [startsAt],
      event: {
        mode: 'mais-tarde', title: `Meta ${runId}`, place: 'Praça', description: '', threshold: 2,
        startsAt, alternatives: ['2099-08-01T22:00:00.000Z'], createdByName: 'Ana', votingClosed: false, days: []
      }
    }
  });
  expect(created.ok()).toBeTruthy();
  const body = await created.json();
  const slug = body.event.slug as string;
  const token = body.adminToken as string;
  try {
    const vote = await request.post(`/api/events/${slug}/votes`, {
      headers: apiHeaders,
      data: { participantId: `guest-${runId}`, voterName: 'Bia', response: 'accept', preferredOptions: [startsAt], availability: {} }
    });
    expect(vote.ok()).toBeTruthy();

    await page.goto(`/e/${slug}?admin=${token}`);
    const primaryResult = page.locator('.result-row').filter({ hasText: 'Horário principal' });
    await expect(primaryResult.getByText('2 de 2')).toBeVisible();
    await expect(primaryResult.locator('.result-progress span')).toHaveAttribute('style', /width: 100%/);

    await page.getByRole('button', { name: 'Gerenciar' }).click();
    await page.getByRole('button', { name: 'Editar detalhes' }).click();
    await page.getByRole('button', { name: 'Aumentar confirmações' }).click();
    await page.getByRole('button', { name: 'Aumentar confirmações' }).click();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Evento atualizado!')).toBeVisible();
    await page.getByRole('button', { name: 'Resumo' }).click();

    await expect(primaryResult.getByText('2 de 4')).toBeVisible();
    await expect(primaryResult.locator('.result-progress span')).toHaveAttribute('style', /width: 50%/);
  } finally {
    await request.delete(`/api/events/${slug}`, { headers: { ...apiHeaders, authorization: `Bearer ${token}` } });
  }
});

test('agora invite lifecycle: day sticks, invite copies cleanly, invitee votes', async ({ page, context, browser, request }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const runId = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = `Rolê ${runId}`;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Pick Amanhã and confirm reopening the time picker does not flip the day back.
  await page.goto('/create?mode=agora');
  const amanha = page.locator('.agora-day-picker button:has-text("Amanhã")');
  await amanha.click();
  await expect(amanha).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.time-picker-trigger').click();
  await expect(page.getByText('Escolha o horário')).toBeVisible();
  await page.getByRole('button', { name: 'Pronto' }).click();
  await expect(page.locator('.agora-date-summary .schedule-summary')).toContainText('Amanhã');

  await page.locator('ion-item:has-text("Nome do evento") input').fill(title);
  await page.locator('ion-item:has-text("Local") input').fill(`Local ${runId}`);
  await page.locator('ion-item:has-text("Seu nome") input').fill('Ana');
  await page.getByRole('button', { name: 'Criar link do Bora' }).click();
  await page.waitForURL(/\/e\//);

  const slug = page.url().match(/\/e\/([^?]+)/)?.[1];
  expect(slug).toBeTruthy();
  const token = new URL(page.url()).searchParams.get('admin') || '';
  const origin = new URL(page.url()).origin;

  try {
    // The event must be stored for the chosen day, not today.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const response = await request.get(`/api/events/${slug}`);
    expect(response.ok()).toBe(true);
    const { event } = await response.json();
    expect(localDay(new Date(event.startsAt))).toBe(localDay(tomorrow));

    // The copied invite carries the full info on a clean, shareable URL.
    await expect(page.getByRole('button', { name: 'Copiar convite' })).toBeVisible();
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.getByRole('button', { name: 'Copiar convite' }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(`Bora? ${title}`);
    expect(copied).toContain('📅');
    expect(copied).toContain('📍');
    expect(copied).toContain('Confirma sua presença no Bora:');
    expect(copied).toContain(tomorrow.toLocaleDateString('pt-BR', { weekday: 'long' }));
    const inviteUrl = copied.trim().split('\n').pop()?.trim() ?? '';
    expect(inviteUrl).toMatch(/\/e\/[a-z0-9-]+$/);
    expect(inviteUrl).not.toContain('admin=');
    expect(inviteUrl).not.toContain('created=1');

    // A fresh invitee (no shared device state) can open the invite and vote.
    const inviteeContext = await browser.newContext();
    try {
      const inviteePage = await inviteeContext.newPage();
      const inviteeErrors: string[] = [];
      inviteePage.on('pageerror', (error) => inviteeErrors.push(error.message));
      await inviteePage.goto(`${origin}/e/${slug}`);
      await expect(inviteePage.getByRole('heading', { name: title })).toBeVisible();
      await inviteePage.locator('ion-item:has-text("Seu nome") input').fill('Bruno');
      await inviteePage.getByRole('button', { name: /Posso/ }).click();
      await expect(inviteePage.getByRole('heading', { name: 'Voto registrado' })).toBeVisible();
      expect(inviteeErrors).toEqual([]);
    } finally {
      await inviteeContext.close();
    }
  } finally {
    if (slug) await request.delete(`/api/events/${slug}`, { headers: { 'x-forwarded-for': `e2e-${runId}`, authorization: `Bearer ${token}` } });
  }
  expect(pageErrors).toEqual([]);
});
