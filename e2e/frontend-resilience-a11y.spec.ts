import { expect, test, type Locator, type Page } from '@playwright/test';

function futureEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'resilience-event',
    slug: 'resilience-event',
    mode: 'agora',
    title: 'Bora acessível',
    place: 'Praça central',
    description: 'Uma descrição em português.',
    threshold: 3,
    startsAt: '2099-08-01T21:00:00.000Z',
    alternatives: [],
    days: [],
    createdByName: 'Ana',
    votingClosed: false,
    revision: 0,
    createdAt: '2026-01-01T12:00:00.000Z',
    ...overrides
  };
}

function adminEvents(count: number, oversized = false) {
  return Array.from({ length: count }, (_, index) => ({
    slug: oversized ? `${index}-${'s'.repeat(180)}` : `bora-${index}`,
    title: oversized ? `Bora ${index} ${'descrição-'.repeat(14)}`.slice(0, 120) : `Bora ${index}`,
    adminToken: oversized ? `admin-${index}-${'segredo'.repeat(26)}`.slice(0, 200) : `admin-${index}`
  }));
}

async function focused(locator: Locator) {
  return locator.evaluate((element) => element.getRootNode() instanceof Document
    ? document.activeElement === element
    : (element.getRootNode() as ShadowRoot).activeElement === element);
}

async function expectFocused(locator: Locator) {
  await expect.poll(() => focused(locator)).toBe(true);
}

async function tabTo(page: Page, locator: Locator, limit = 30) {
  for (let index = 0; index < limit; index += 1) {
    if (await focused(locator).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  expect(await focused(locator)).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(sizes.scrollWidth, `scrollWidth ${sizes.scrollWidth} exceeded viewport ${sizes.innerWidth}`).toBeLessThanOrEqual(sizes.innerWidth);
}

async function openRecoveryTransfer(page: Page, events: ReturnType<typeof adminEvents>, token: string) {
  await page.route('**/api/me/recovery-link', (route) => route.fulfill({ json: { recoveryToken: token } }));
  await page.goto('/home');
  await page.evaluate((savedEvents) => {
    localStorage.setItem('bora_admin_events', JSON.stringify(savedEvents));
    localStorage.setItem('bora_participant_name', 'Ana Maria');
  }, events);
  await page.goto('/recover');
  const createLink = page.getByRole('button', { name: 'Criar link de acesso' });
  await tabTo(page, createLink);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Link completo criado' })).toBeVisible();
}

test('keyboard flow enters creation and modal focus returns after Escape', async ({ page }, testInfo) => {
  await page.goto('/home');
  const agoraLink = page.getByRole('link', { name: /Bora agora/ });
  await tabTo(page, agoraLink);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/create\?mode=agora/);

  const timeOpener = page.getByRole('button', { name: /Escolher horário/ });
  await tabTo(page, timeOpener);
  await page.keyboard.press('Enter');
  const desktopTime = page.getByRole('textbox', { name: 'Horário do Bora' });
  const quickTime = page.getByRole('button', { name: 'Daqui 1h' });
  const timeControl = testInfo.project.name.includes('touch') ? quickTime : desktopTime;
  await expect(timeControl).toBeVisible();
  await expectFocused(timeControl);
  await page.keyboard.press('Escape');
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0);
  await expectFocused(timeOpener);

  const calendarOpener = page.getByRole('button', { name: 'Outra data' });
  await tabTo(page, calendarOpener);
  await page.keyboard.press('Enter');
  const calendarInput = page.getByRole('textbox', { name: 'Data do Bora' });
  await expect(calendarInput).toBeVisible();
  await expectFocused(calendarInput);
  await page.keyboard.press('Escape');
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0);
  await expectFocused(calendarOpener);
});

test('edit, nested calendar, and copy fallback preserve modal focus', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('clipboard denied'); } }
    });
  });
  await page.route('**/api/events/focus-event', (route) => route.fulfill({ json: {
    event: futureEvent({ id: 'focus-event', slug: 'focus-event' }),
    votes: [],
    isAdmin: true
  } }));

  await page.goto('/e/focus-event?admin=organizer-secret&created=1');
  const copyOpener = page.getByRole('button', { name: 'Copiar convite' }).first();
  await copyOpener.focus();
  await page.keyboard.press('Enter');
  const copyTextarea = page.locator('ion-modal.copy-fallback-modal textarea[aria-label="Texto do convite seguro"]').first();
  await expect(copyTextarea).toBeVisible();
  await expectFocused(copyTextarea);
  await page.keyboard.press('Escape');
  await expect(page.locator('ion-modal.copy-fallback-modal.show-modal')).toHaveCount(0);
  await expectFocused(copyOpener);

  const manage = page.getByRole('button', { name: 'Gerenciar' });
  await manage.focus();
  await page.keyboard.press('Enter');
  const editOpener = page.getByRole('button', { name: 'Editar detalhes do evento' });
  await editOpener.focus();
  await page.keyboard.press('Enter');
  const titleInput = page.getByRole('textbox', { name: 'Nome do evento' });
  await expect(titleInput).toBeVisible();
  await expectFocused(titleInput);

  const nestedCalendarOpener = page.locator('ion-modal.event-editor-modal').getByRole('button', { name: 'Outra data' });
  await nestedCalendarOpener.focus();
  await page.keyboard.press('Enter');
  const nestedDateInput = page.getByRole('textbox', { name: 'Data do Bora' });
  await expect(nestedDateInput).toBeVisible();
  await expectFocused(nestedDateInput);
  await page.keyboard.press('Escape');
  await expectFocused(nestedCalendarOpener);

  await page.keyboard.press('Escape');
  await expect(page.locator('ion-modal.event-editor-modal.show-modal')).toHaveCount(0);
  await expectFocused(editOpener);
});

test('Talvez selections use exact option counts in every result bar', async ({ page }) => {
  const primary = '2099-08-01T21:00:00.000Z';
  const alternative = '2099-08-02T21:00:00.000Z';
  const event = futureEvent({
    id: 'maybe-options',
    slug: 'maybe-options',
    mode: 'mais-tarde',
    startsAt: primary,
    alternatives: [alternative],
    threshold: 3
  });
  await page.route('**/api/events/maybe-options', (route) => route.fulfill({ json: {
    event,
    votes: [{
      id: 'friend-maybe',
      eventId: event.id,
      voterName: 'Amiga',
      response: 'maybe',
      preferredOptions: [primary, alternative],
      availability: {},
      createdAt: '2026-01-01T12:00:00.000Z'
    }],
    voteSummary: {
      total: 3,
      responses: { accept: 2, maybe: 1, decline: 0 },
      optionCounts: { [primary]: 3, [alternative]: 1 }
    },
    votesTruncated: true,
    isAdmin: false
  } }));

  await page.goto('/e/maybe-options');
  const resultRows = page.locator('.result-row');
  await expect(resultRows).toHaveCount(2);
  await expect(resultRows.nth(0)).toContainText('3 de 3');
  await expect(resultRows.nth(1)).toContainText('1 de 3');
  const friend = page.locator('ion-item').filter({ hasText: 'Amiga' });
  await expect(friend).toContainText('Talvez');
  await expect(friend).toContainText('pode');
  await expect(page.getByText('Os totais e as barras incluem todas as respostas. A lista abaixo mostra apenas uma parte dos nomes mais recentes.')).toBeVisible();
});

test('a Talvez availability selection contributes to a marcar result bar', async ({ page }) => {
  const event = futureEvent({
    id: 'maybe-slot',
    slug: 'maybe-slot',
    mode: 'marcar',
    startsAt: undefined,
    alternatives: [],
    threshold: 3,
    days: [{ id: 'saturday', label: 'sábado', date: '2099-08-01', slots: ['18:00'] }]
  });
  await page.route('**/api/events/maybe-slot', (route) => route.fulfill({ json: {
    event,
    votes: [{
      id: 'friend-maybe-slot',
      eventId: event.id,
      voterName: 'Amiga',
      response: 'maybe',
      preferredOptions: [],
      availability: { saturday: ['18:00'] },
      createdAt: '2026-01-01T12:00:00.000Z'
    }],
    voteSummary: {
      total: 3,
      responses: { accept: 2, maybe: 1, decline: 0 },
      optionCounts: { 'saturday:18:00': 1 }
    },
    votesTruncated: true,
    isAdmin: false
  } }));

  await page.goto('/e/maybe-slot');
  const result = page.locator('.result-row').filter({ hasText: '18:00' });
  await expect(result).toContainText('1 de 3');
  await expect(page.getByText('Respostas “Posso” e “Talvez” entram na contagem dos horários selecionados.')).toBeVisible();
});

test('recovery with zero organizer controls produces a complete QR', async ({ page }) => {
  await openRecoveryTransfer(page, adminEvents(0), 'zero-organizers');
  await expect(page.getByText('Este aparelho não tem controles de organizador salvos para incluir.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code do link completo para abrir seus Boras em outro dispositivo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gerar QR sem controles de organizador' })).toHaveCount(0);
});

test('recovery with one organizer control keeps it in a fragment and in the complete QR', async ({ page }) => {
  await openRecoveryTransfer(page, adminEvents(1), 'one-organizer');
  await expect(page.getByText('O link inclui os controles de organizador de 1 Bora. Eles não serão omitidos ao copiar ou compartilhar.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code do link completo para abrir seus Boras em outro dispositivo' })).toBeVisible();

  const value = await page.locator('textarea[aria-label="Link completo de recuperação"]').inputValue();
  const url = new URL(value);
  expect(url.hash).toContain('admin=');
  expect(decodeURIComponent(url.hash)).toContain('admin-0');
  expect(`${url.pathname}${url.search}`).not.toContain('admin-0');
});

test('oversized full recovery link exposes an explicit participant-only QR choice', async ({ page }) => {
  await openRecoveryTransfer(page, adminEvents(30, true), 'max-organizers');
  await expect(page.getByText(/O link inclui os controles de organizador de 30 Boras/)).toBeVisible();
  await expect(page.getByText(/Não foi possível transformar o link completo em QR code/)).toBeVisible();

  const fullLinkField = page.locator('textarea[aria-label="Link completo de recuperação"]');
  const fullLink = await fullLinkField.inputValue();
  expect(new URL(fullLink).hash).toContain('admin=');
  expect(decodeURIComponent(new URL(fullLink).hash)).toContain('admin-29');
  expect(`${new URL(fullLink).pathname}${new URL(fullLink).search}`).not.toContain('admin-29');

  await page.getByRole('button', { name: 'Gerar QR sem controles de organizador' }).click();
  await expect(page.getByRole('img', { name: 'QR code sem controles de organizador para abrir seus Boras em outro dispositivo' })).toBeVisible();
  await expect(page.getByText(/não transfere controles de organizador/)).toBeVisible();
  expect(await fullLinkField.inputValue()).toBe(fullLink);
});

test('critical pages reflow in narrow, landscape, safe-area, keyboard, and 200% text scenarios', async ({ page }) => {
  const longWord = 'hipermegaconfraternização'.repeat(20);
  await page.route('**/api/events/long-content', (route) => route.fulfill({ json: {
    event: futureEvent({
      id: 'long-content',
      slug: 'long-content',
      title: `Encontro de planejamento comunitário com um título longo ${longWord}`,
      place: `Centro cultural municipal ${longWord}`,
      description: `Uma explicação extensa em português para validar a quebra de linhas, a leitura ampliada e a orientação da tela. ${longWord}`
    }),
    votes: [],
    isAdmin: false
  } }));
  async function applySafeAreas() {
    await page.evaluate(() => {
    document.documentElement.style.setProperty('--bora-safe-area-left', '24px');
    document.documentElement.style.setProperty('--bora-safe-area-right', '24px');
    document.documentElement.style.setProperty('--bora-safe-area-bottom', '30px');
    });
  }

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/home');
  await applySafeAreas();
  const hero = await page.locator('.hero').boundingBox();
  expect(hero).not.toBeNull();
  expect(hero!.x).toBeGreaterThanOrEqual(24);
  expect(hero!.x + hero!.width).toBeLessThanOrEqual(320 - 24);
  await expectNoHorizontalOverflow(page);

  await page.goto('/create?mode=marcar');
  await applySafeAreas();
  await page.addStyleTag({ content: ':root { font-size: 200% !important; }' });
  await expect(page.getByRole('heading', { name: 'Bora marcar' })).toBeVisible();
  const createCard = await page.locator('.create-card').first().boundingBox();
  expect(createCard).not.toBeNull();
  expect(createCard!.x).toBeGreaterThanOrEqual(24);
  expect(createCard!.x + createCard!.width).toBeLessThanOrEqual(320 - 24);
  await expect(page.locator('ion-content.form-page')).toHaveCSS('--padding-bottom', 'calc(32px + 30px)');
  await expectNoHorizontalOverflow(page);

  await page.goto('/e/long-content');
  await applySafeAreas();
  const eventSummary = await page.locator('.event-summary').boundingBox();
  expect(eventSummary).not.toBeNull();
  expect(eventSummary!.x).toBeGreaterThanOrEqual(24);
  expect(eventSummary!.x + eventSummary!.width).toBeLessThanOrEqual(320 - 24);

  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/e/long-content');
  await expect(page.getByRole('heading', { name: /Encontro de planejamento comunitário/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 360 });
  await page.goto('/create?mode=agora');
  const place = page.getByRole('textbox', { name: 'Local' }).first();
  await place.focus();
  await place.fill('Um local com conteúdo longo para simular o teclado virtual aberto');
  await place.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(place).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto('/e/long-content');
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  await expectNoHorizontalOverflow(page);
});
