import { expect, test, type Page } from '@playwright/test';

function futureEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-remediation',
    slug: 'remediation',
    mode: 'agora',
    title: 'Bora de teste',
    place: 'Praça',
    description: '',
    threshold: 2,
    startsAt: '2099-08-01T21:00:00.000Z',
    alternatives: [],
    days: [],
    createdByName: 'Ana',
    votingClosed: false,
    revision: 0,
    createdAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

async function tomorrowDate(page: Page) {
  return page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  });
}

test('home actions stay actionable and unknown routes have a Portuguese fallback', async ({ page }) => {
  await page.goto('/home');
  await expect(page.getByRole('link', { name: /Bora agora/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Bora essa semana/ })).toBeVisible();
  await expect(page.locator('.home-mode-card[role="listitem"]')).toHaveCount(0);

  await page.goto('/endereco-que-nao-existe');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar para o início' })).toBeVisible();
});

test('confirmation threshold controls stop at two and clamp direct numeric entry before creation', async ({ page }) => {
  await page.goto('/create?mode=agora');
  const threshold = page.getByRole('textbox', { name: 'Número mínimo de confirmações' });
  const decrease = page.getByRole('button', { name: 'Diminuir confirmações' });
  await decrease.click();
  await expect(threshold).toHaveValue('2');
  await expect(decrease).toBeDisabled();

  await threshold.fill('1');
  await expect(threshold).toHaveValue('2');
});

test('creation fields have names and Local remains usable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/create?mode=agora');

  await expect(page.getByRole('textbox', { name: 'Nome do evento' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Local' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Seu nome' })).toBeVisible();
  const localField = await page.locator('.place-field-row ion-item').first().boundingBox();
  expect(localField).not.toBeNull();
  expect(localField!.width).toBeGreaterThan(240);
  await expect(page.locator('ion-back-button')).toHaveAttribute('text', 'Voltar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('mais-tarde uses the shared time picker and keeps overnight alternatives', async ({ page }) => {
  await page.goto('/create?mode=mais-tarde');
  await expect(page.locator('.week-picker button[aria-pressed="true"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Escolher outra data' }).click();
  const dateInput = page.getByRole('textbox', { name: 'Data do Bora' });
  await dateInput.fill(await tomorrowDate(page));
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0);

  await expect(page.getByRole('button', { name: /Escolher horário\. Atual:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mostrar madrugada' })).toHaveCount(0);

  await page.getByRole('button', { name: /Escolher horário\. Atual:/ }).click();
  const desktopTime = page.getByRole('textbox', { name: 'Horário do Bora' });
  if (!(await desktopTime.isVisible())) {
    await expect(page.locator('ion-datetime[presentation="time"]')).toBeVisible();
    return;
  }
  await desktopTime.fill('23:00');
  await desktopTime.press('Enter');
  await expect(page.locator('.time-chip').filter({ hasText: '23:00' })).toBeVisible();
  await page.getByRole('button', { name: 'Daqui 1h' }).click();
  await expect(page.locator('.time-chip')).toHaveCount(2);
});

test('desktop time picker accepts arbitrary input and uses quarter-hour adjustments', async ({ page }) => {
  await page.goto('/create?mode=agora');
  test.skip(!(await page.evaluate(() => window.matchMedia('(pointer: fine)').matches)), 'The exact-time input is a desktop control.');
  await page.locator('.time-picker-trigger').click();
  const time = page.getByRole('textbox', { name: 'Horário do Bora' });
  await time.fill('13:33');
  await time.blur();
  await expect(time).toHaveValue('13:33');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByRole('button', { name: '+15 min' }).click();
  await expect(time).toHaveValue('13:45');
  await page.getByRole('button', { name: '-15 min' }).click();
  await expect(time).toHaveValue('13:30');
  await time.fill('23:50');
  await time.blur();
  await page.getByRole('button', { name: '+15 min' }).click();
  await expect(time).toHaveValue('00:00');
});

test('desktop relative time actions use the current time', async ({ page }) => {
  await page.goto('/create?mode=agora');
  test.skip(!(await page.evaluate(() => window.matchMedia('(pointer: fine)').matches)), 'Relative actions are rendered beside the desktop input.');
  await page.locator('.time-picker-trigger').click();
  const expected = await page.evaluate(() => {
    const time = new Date();
    time.setHours(time.getHours() + 2);
    return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
  });
  await page.getByRole('button', { name: 'Daqui 2h' }).click();
  await expect(page.getByRole('textbox', { name: 'Horário do Bora' })).toHaveValue(expected);
});

test('event loading distinguishes network, server, and missing-event failures', async ({ page }) => {
  let responseMode: 'network' | 'server' | 'missing' = 'network';
  await page.route('**/api/events/load-state', async (route) => {
    if (responseMode === 'network') await route.abort('failed');
    else if (responseMode === 'server') await route.fulfill({ status: 503, json: { error: 'Serviço indisponível.' } });
    else await route.fulfill({ status: 404, json: { error: 'Evento não encontrado.' } });
  });

  await page.goto('/e/load-state');
  await expect(page.getByRole('heading', { name: 'Não foi possível carregar este Bora' })).toBeVisible();
  responseMode = 'server';
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Este Bora está temporariamente indisponível' })).toBeVisible();
  responseMode = 'missing';
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Evento não encontrado' })).toBeVisible();
});

test('reopening confirmations persists through PATCH, refresh, and a new attendance response', async ({ page }) => {
  let event = futureEvent({
    id: 'reopen-lifecycle', slug: 'reopen-lifecycle', mode: 'marcar', startsAt: undefined,
    days: [{ id: 'terca', label: 'terça-feira', date: '2099-08-11', slots: ['20:00'] }],
    decidedOption: 'terca:20:00', votingClosed: true, revision: 4,
  });
  const votes: Array<Record<string, unknown>> = [];
  await page.route('**/api/events/reopen-lifecycle**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const vote = request.postDataJSON() as Record<string, unknown>;
      votes.push(vote);
      await route.fulfill({ json: { vote: { id: 'guest-vote', eventId: event.id, ...vote, createdAt: '2026-01-01T00:00:00.000Z', isOwn: true } } });
      return;
    }
    if (request.method() === 'PATCH') {
      const patch = request.postDataJSON() as typeof event;
      expect(patch.votingClosed).toBe(false);
      event = { ...event, ...patch, revision: event.revision + 1 };
      await route.fulfill({ json: { event } });
      return;
    }
    await route.fulfill({ json: { event, votes, isAdmin: request.headers().authorization === 'Bearer admin', ownVote: votes.at(-1), voteSummary: { total: votes.length, responses: { accept: votes.filter((vote) => vote.response === 'accept').length, maybe: 0, decline: 0 }, optionCounts: { 'terca:20:00': votes.length } } } });
  });
  await page.goto('/e/reopen-lifecycle?admin=admin');
  await page.getByRole('button', { name: 'Gerenciar' }).click();
  await expect(page.getByText('Confirmações encerradas', { exact: true })).toBeVisible();
  const reopened = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes('/api/events/reopen-lifecycle'));
  await page.getByRole('button', { name: 'Reabrir confirmações' }).click();
  expect((await reopened).ok()).toBeTruthy();
  await expect(page.getByText('Confirmações abertas', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Encerrar confirmações' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Gerenciar' }).click();
  await expect(page.getByText('Confirmações abertas', { exact: true })).toBeVisible();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('/e/reopen-lifecycle');
  await expect(page.getByText('Confirme sua presença')).toBeVisible();
  await page.getByRole('textbox', { name: 'Seu nome' }).fill('Bia');
  await page.getByRole('button', { name: 'Posso', exact: true }).click();
  await expect.poll(() => votes.length).toBe(1);
  expect(votes[0]).toMatchObject({ response: 'accept', availability: { terca: ['20:00'] } });
});

test('clipboard failure exposes only the clean public invitation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('clipboard denied'); } },
    });
  });
  await page.route('**/api/events/copy-safe', (route) => route.fulfill({ json: {
    event: futureEvent({ id: 'copy-safe', slug: 'copy-safe' }),
    votes: [],
    isAdmin: true,
  } }));

  await page.goto('/e/copy-safe?admin=segredo-do-organizador&created=1');
  await page.getByRole('button', { name: 'Copiar convite' }).click();
  await expect(page.getByText('Copiar convite seguro', { exact: true })).toBeVisible();
  const fallback = page.locator('ion-textarea textarea[aria-label="Texto do convite seguro"]');
  await expect(fallback).toBeVisible();
  const value = await fallback.inputValue();
  expect(value).toContain('/e/copy-safe');
  expect(value).not.toContain('admin=');
  expect(value).not.toContain('segredo-do-organizador');
});

test('native sharing sends the clean URL only once', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => { (window as typeof window & { sharedInvite?: ShareData }).sharedInvite = data; },
    });
  });
  await page.route('**/api/events/share-clean', (route) => route.fulfill({ json: {
    event: futureEvent({ id: 'share-clean', slug: 'share-clean' }),
    votes: [],
    isAdmin: true,
  } }));

  await page.goto('/e/share-clean?admin=segredo&created=1');
  await page.getByRole('button', { name: 'Mais opções' }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { sharedInvite?: ShareData }).sharedInvite)).not.toBeUndefined();
  const payload = await page.evaluate(() => (window as typeof window & { sharedInvite?: ShareData }).sharedInvite!);
  expect(payload.url).toBe(`${new URL(page.url()).origin}/e/share-clean`);
  expect(payload.text).not.toContain('/e/share-clean');
  expect(payload.text).not.toContain('admin=');
});

test('progress values stay within ARIA bounds after the target is exceeded', async ({ page }) => {
  const event = futureEvent({ id: 'progress-bounds', slug: 'progress-bounds', threshold: 2 });
  const votes = ['Ana', 'Bia', 'Caio'].map((voterName, index) => ({
    id: `vote-${index}`,
    eventId: event.id,
    voterName,
    response: 'accept',
    preferredOptions: [],
    availability: {},
    createdAt: '2026-01-01T12:00:00.000Z',
  }));
  await page.route('**/api/events/progress-bounds', (route) => route.fulfill({ json: { event, votes, isAdmin: false } }));

  await page.goto('/e/progress-bounds');
  const progress = page.getByRole('progressbar', { name: 'Progresso das confirmações' });
  await expect(progress).toHaveAttribute('aria-valuemax', '2');
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await expect(progress).toHaveAttribute('aria-valuetext', '3 de 2 confirmações');
});

test('schedule editor rejects an empty marcar schedule before PATCH', async ({ page }) => {
  const event = futureEvent({
    id: 'edit-validation',
    slug: 'edit-validation',
    mode: 'marcar',
    startsAt: undefined,
    days: [{ id: 'tomorrow', label: 'amanhã', date: '2099-08-01', slots: ['18:00'] }],
  });
  let patchCount = 0;
  await page.route('**/api/events/edit-validation', (route) => {
    if (route.request().method() === 'PATCH') {
      patchCount += 1;
      return route.fulfill({ json: { event } });
    }
    return route.fulfill({ json: { event, votes: [], isAdmin: true } });
  });

  await page.goto('/e/edit-validation?admin=admin-token');
  await page.getByRole('button', { name: 'Gerenciar' }).click();
  await page.getByRole('button', { name: 'Editar detalhes do evento' }).click();
  await page.getByRole('button', { name: 'Remover dia' }).click();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText(/Revise as datas e os horários/)).toBeVisible();
  expect(patchCount).toBe(0);
});

test('marcar creation sends its IANA zone and warns when organizer access is temporary', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('quota denied', 'QuotaExceededError'); };
  });
  let createdDraft: Record<string, unknown> | undefined;
  const createdEvent = futureEvent({ id: 'temporary-admin', slug: 'temporary-admin', mode: 'marcar', startsAt: undefined, days: [] });
  await page.route('**/api/events', async (route) => {
    const body = route.request().postDataJSON() as { event: Record<string, unknown> };
    createdDraft = body.event;
    const event = { ...createdEvent, ...body.event, id: 'temporary-admin', slug: 'temporary-admin', revision: 0 };
    await route.fulfill({ status: 201, json: { event, votes: [], isAdmin: true, adminToken: 'temporary-token' } });
  });
  await page.route('**/api/events/temporary-admin', (route) => route.fulfill({ json: { event: { ...createdEvent, ...(createdDraft || {}) }, votes: [], isAdmin: true } }));

  await page.goto('/create?mode=marcar');
  await page.getByRole('textbox', { name: 'Nome do evento' }).fill('Fuso e armazenamento');
  await page.getByRole('textbox', { name: 'Local' }).fill('Praça');
  await page.getByRole('textbox', { name: 'Seu nome' }).fill('Ana');
  await page.locator('.day-accordion input[type="date"]').fill(await tomorrowDate(page));
  await page.locator('.day-accordion .time-chip-grid').getByRole('button', { name: '18:00' }).click();
  await page.getByRole('button', { name: 'Criar link do Bora' }).click();

  await expect(page).toHaveURL(/\/e\/temporary-admin\?.*adminAccess=temporary/);
  await expect(page.getByText('Acesso de organizador temporário')).toBeVisible();
  const browserZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(createdDraft?.timeZone).toBe(browserZone);
  expect(createdDraft?.mode).toBe('marcar');
});

test('upcoming cards do not call a Talvez response confirmed', async ({ page }) => {
  const event = futureEvent({
    id: 'maybe-upcoming', slug: 'maybe-upcoming', title: 'Talvez eu vá',
    confirmedCount: 0, participantResponse: 'maybe'
  });
  await page.route('**/api/me/events', (route) => route.fulfill({ json: { created: [], joined: [event] } }));
  await page.route('**/api/events/maybe-upcoming', (route) => route.fulfill({ json: {
    event,
    votes: [{ id: 'own-maybe', eventId: event.id, voterName: 'Bia', response: 'maybe', preferredOptions: [], availability: {}, createdAt: '2026-01-01T12:00:00.000Z', isOwn: true }],
    isAdmin: false,
  } }));

  await page.goto('/my-events');
  const card = page.locator('.my-event-card').filter({ hasText: 'Talvez eu vá' }).first();
  await expect(card).toContainText('Você respondeu talvez');
  await expect(card).not.toContainText('Você confirmou');
});

test('recovery keeps the current identity when Push rebinding fails', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} });
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted' } });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      getRegistration: async () => ({ pushManager: { getSubscription: async () => ({
        endpoint: 'https://push.example.test/recovery',
        toJSON: () => ({ endpoint: 'https://push.example.test/recovery', keys: {} }),
        unsubscribe: async () => true,
      }) } }),
    } });
  });
  await page.route('**/api/recover', (route) => route.fulfill({ json: { participantId: 'recovered-identity' } }));
  await page.route('**/api/push/subscriptions', (route) => route.fulfill({ status: 503, json: { error: 'Não foi possível transferir os lembretes.' } }));

  await page.goto('/home');
  await page.evaluate(() => localStorage.setItem('bora_participant_id', 'current-identity'));
  await page.goto('/recover?token=push-rebind-failure');
  await page.getByRole('button', { name: 'Usar link' }).click();
  await expect(page.getByRole('heading', { name: 'Não foi possível recuperar' })).toBeVisible();
  await expect(page.getByText('Não foi possível transferir os lembretes.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bora_participant_id'))).toBe('current-identity');
});

test('remove-device clears local access even when Push server cleanup fails', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} });
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted' } });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      getRegistration: async () => ({ pushManager: { getSubscription: async () => ({
        endpoint: 'https://push.example.test/removal',
        toJSON: () => ({ endpoint: 'https://push.example.test/removal', keys: {} }),
        unsubscribe: async () => true,
      }) } }),
    } });
  });
  await page.route('**/api/me/events', (route) => route.fulfill({ json: { created: [], joined: [] } }));
  await page.route('**/api/push/subscriptions/preferences**', (route) => route.fulfill({ json: { subscribed: true, preferences: {} } }));
  await page.route('**/api/push/subscriptions', (route) => route.fulfill({ status: 503, json: { error: 'Não foi possível remover os lembretes.' } }));

  await page.goto('/home');
  await page.evaluate(() => localStorage.setItem('bora_participant_id', 'identity-to-remove'));
  await page.goto('/my-events');
  await page.getByRole('button', { name: 'Remover acesso deste aparelho' }).click();
  await page.getByRole('button', { name: 'Remover acesso', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText(/O acesso local foi removido/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bora_participant_id'))).toBeNull();
});

test('metrics polling marks retained data stale after a later failure', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => nativeSetInterval(handler, 50, ...args)) as typeof window.setInterval;
  });
  let requestCount = 0;
  await page.route('**/api/metrics', (route) => {
    requestCount += 1;
    if (requestCount === 1) return route.fulfill({ json: { onlineNow: 1, totalEvents: 4, openEvents: 2, uniqueParticipants: 3, onlineWindowMinutes: 5, generatedAt: '2026-01-01T12:00:00.000Z' } });
    return route.fulfill({ status: 503, json: { error: 'unavailable' } });
  });

  await page.goto('/metrics');
  await expect(page.getByText('Total de Boras')).toBeVisible();
  await expect(page.getByText(/dados possivelmente desatualizados/)).toBeVisible();
  await expect(page.getByText('Métricas indisponíveis no momento.')).toHaveCount(0);
});
