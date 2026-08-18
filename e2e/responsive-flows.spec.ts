import { expect, test } from '@playwright/test';

async function installClipboard(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    let value = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (next: string) => { value = next; }, readText: async () => value }
    });
  });
}

async function expectNoHorizontalScroll(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectConsistentActionGroup(group: import('@playwright/test').Locator, stacked: boolean, expectedButtons = 2) {
  const buttons = group.locator('ion-button');
  await expect(buttons).toHaveCount(expectedButtons);
  const boxes = await Promise.all(Array.from({ length: expectedButtons }, (_, index) => buttons.nth(index).boundingBox()));
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(box!.width - boxes[0]!.width)).toBeLessThanOrEqual(2);
  }
  if (stacked) {
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index]!.y).toBeGreaterThanOrEqual(boxes[index - 1]!.y + boxes[index - 1]!.height + 8);
    }
  }
}

test('recados stay compact, usable and bounded on phone and desktop', async ({ page }) => {
  const messageCount = 12;
  const messages = Array.from({ length: messageCount }, (_, index) => ({
    id: `message-${index}`,
    authorName: index === messageCount - 1 ? 'Nome de participante muito comprido para testar o cabeçalho' : `Pessoa ${index + 1}`,
    body: index === messageCount - 1 ? 'M'.repeat(500) : `Recado ${index + 1}`,
    createdAt: `2099-08-${String(index + 1).padStart(2, '0')}T1${index % 10}:35:00.000Z`,
    isOwn: index === messageCount - 1
  }));
  const event = {
    id: 'recados-event', slug: 'recados-event', mode: 'agora', title: 'Recados compactos', place: 'Praça', threshold: 2,
    startsAt: '2099-08-20T21:00:00.000Z', alternatives: [], days: [], createdByName: 'Ana', votingClosed: false, revision: 0, createdAt: '2099-08-01T12:00:00.000Z'
  };
  const localEvent = { event, votes: [{ id: 'vote-1', eventId: event.id, participantId: 'recados-participant', voterName: 'Ana', response: 'accept', preferredOptions: [], availability: {}, createdAt: event.createdAt, isOwn: true }], ownVote: { id: 'vote-1', eventId: event.id, participantId: 'recados-participant', voterName: 'Ana', response: 'accept', preferredOptions: [], availability: {}, createdAt: event.createdAt, isOwn: true }, messages };

  await page.route('**/api/events/recados-event**', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: { message: { id: 'new-message', authorName: 'Ana', body: JSON.parse(route.request().postData() || '{}').body, createdAt: '2099-08-20T22:00:00.000Z', isOwn: true } } });
    }
    return route.fulfill({ json: { ...localEvent, messagesClosed: false, isAdmin: false } });
  });
  await page.goto('/');
  await page.evaluate(({ localEvent: savedEvent }) => {
    localStorage.setItem('bora_participant_id', 'recados-participant');
    localStorage.setItem('bora_participant_name', 'Ana');
    localStorage.setItem('bora_events_v2', JSON.stringify([savedEvent]));
  }, { localEvent });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/e/recados-event');
  await expect(page.locator('ion-card-title', { hasText: 'Recados 12' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  await expect(page.getByText('0/500')).toHaveCount(0);
  await expect(page.locator('.message-item')).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Ver todos os recados' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Excluir recado de Nome de participante/ })).toBeVisible();
  await expectNoHorizontalScroll(page);

  const composer = page.locator('ion-textarea textarea:not(.cloned-input)');
  const keyboardHint = page.getByText('Enter para enviar · Shift+Enter para quebrar linha');
  const finePointer = await keyboardHint.isVisible();
  if (finePointer) await expect(keyboardHint).toBeVisible();
  else await expect(keyboardHint).toHaveCount(0);
  const composerActions = page.locator('.message-composer-actions');
  const disabledSendBox = await page.getByRole('button', { name: 'Enviar' }).boundingBox();
  const disabledActionsBox = await composerActions.boundingBox();
  await composer.fill('Um recado novo');
  await expect(page.getByText('14/500')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  const enabledSendBox = await page.getByRole('button', { name: 'Enviar' }).boundingBox();
  const enabledActionsBox = await composerActions.boundingBox();
  expect(disabledSendBox).not.toBeNull();
  expect(disabledActionsBox).not.toBeNull();
  expect(enabledSendBox).not.toBeNull();
  expect(enabledActionsBox).not.toBeNull();
  expect(enabledSendBox!.x).toBe(disabledSendBox!.x);
  if (finePointer) expect(enabledSendBox!.y - enabledActionsBox!.y).toBe(disabledSendBox!.y - disabledActionsBox!.y);
  await composer.fill('Primeira linha');
  await composer.press('Shift+Enter');
  await composer.type('Segunda linha');
  await expect(composer).toHaveValue('Primeira linha\nSegunda linha');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('.message-list').getByText('Primeira linha')).toBeVisible();

  if (finePointer) {
    await composer.fill('Recado enviado com Enter');
    await composer.press('Enter');
    await expect(composer).toHaveValue('');
    await expect(page.getByText('Recado enviado com Enter')).toBeVisible();

    await composer.fill('Recado sem duplicar');
    await composer.press('Enter');
    await composer.press('Enter');
    await expect(page.getByText('Recado sem duplicar', { exact: true })).toHaveCount(1);

    await composer.fill('   ');
    await composer.press('Enter');
    await expect(composer).toHaveValue('   ');
    await composer.fill('');
    await composer.press('Enter');
    await expect(composer).toHaveValue('');
  } else {
    await composer.fill('Recado no celular');
    await composer.press('Enter');
    await expect(composer).toHaveValue('Recado no celular\n');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.locator('.message-list').getByText('Recado no celular', { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Ver todos os recados' }).click();
  await expect.poll(() => page.locator('.message-item').count()).toBeGreaterThanOrEqual(messageCount + 2);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectNoHorizontalScroll(page);
});

test('home toolbar gives greetings the remaining space before ellipsizing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cases = [
    { name: 'Ana', greeting: 'Bora, Ana?', fits: true },
    { name: 'Rodrigo', greeting: 'Bora, Rodrigo?', fits: true },
    { name: 'Franz Kafka de Campinas', greeting: 'Bora, Franz?', fits: true },
    { name: 'Supercalifragilisticexpialidociouswithanintentionallyverylongname', greeting: 'Bora, Supercalifragilisticexpialidociouswithanintentionallyverylongname?', fits: false }
  ];

  for (const entry of cases) {
    await page.goto('/');
    await page.evaluate((name) => localStorage.setItem('bora_participant_name', name), entry.name);
    await page.reload();

    const title = page.locator('ion-title.home-toolbar-title');
    const action = page.locator('ion-buttons.home-toolbar-actions');
    await expect(title).toHaveText(entry.greeting);
    await expect(title).toHaveAttribute('aria-label', entry.greeting);
    await expect(title).toHaveAttribute('title', entry.greeting);
    await expect(action.getByRole('link', { name: 'Meus Boras' })).toBeVisible();

    const dimensions = await title.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const fullTextWidth = range.getBoundingClientRect().width;
      const { width: titleWidth, right: titleRight } = element.getBoundingClientRect();
      const actionLeft = document.querySelector('ion-buttons.home-toolbar-actions')!.getBoundingClientRect().left;
      return { fullTextWidth, titleWidth, titleRight, actionLeft };
    });
    expect(dimensions.titleRight).toBeLessThanOrEqual(dimensions.actionLeft);
    if (entry.fits) {
      expect(dimensions.fullTextWidth).toBeLessThanOrEqual(dimensions.titleWidth);
    } else {
      expect(dimensions.fullTextWidth).toBeGreaterThan(dimensions.titleWidth);
    }
  }

  await expect(page.locator('.toolbar-secondary-action > span')).toBeHidden();
});

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
  if (await page.evaluate(() => window.matchMedia('(pointer: fine)').matches)) {
    await expect(page.getByRole('textbox', { name: 'Horário do Bora' })).toBeVisible();
  } else {
    await expect(page.locator('ion-datetime[presentation="time"]')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Pronto' }).click();
  await expect(page.getByRole('button', { name: 'Outra data' })).toBeVisible();
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

test('touch time picker is a reachable bottom sheet on common phone viewports', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('touch'), 'This layout is only used with a coarse pointer.');

  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/create?mode=agora');
    await page.locator('.time-picker-trigger').click();

    const wheel = page.locator('ion-datetime[aria-label="Horário do Bora"]');
    const quickActions = page.getByRole('group', { name: 'Horários rápidos' });
    const done = page.getByRole('button', { name: 'Pronto' });
    await expect(wheel).toBeVisible();
    await expect(quickActions).toBeVisible();
    await expect(done).toBeVisible();

    const [wheelBox, quickBox, doneBox] = await Promise.all([wheel.boundingBox(), quickActions.boundingBox(), done.boundingBox()]);
    expect(wheelBox).not.toBeNull();
    expect(quickBox).not.toBeNull();
    expect(doneBox).not.toBeNull();
    expect(wheelBox!.y + wheelBox!.height / 2).toBeGreaterThan(viewport.height / 2);
    // iOS WebKit can report a taller layout viewport than its visual viewport.
    // The wheel remains reachable by scrolling the modal content into view.
    await wheel.scrollIntoViewIfNeeded();
    const visibleWheelBox = await wheel.boundingBox();
    expect(visibleWheelBox).not.toBeNull();
    expect(visibleWheelBox!.y + visibleWheelBox!.height).toBeLessThanOrEqual(viewport.height - 8);
    expect(quickBox!.y + quickBox!.height).toBeLessThanOrEqual(wheelBox!.y + 16);
    expect(doneBox!.y + doneBox!.height).toBeLessThanOrEqual(viewport.height);
    await page.getByRole('button', { name: 'Pronto' }).click();
  }
});

test('device-transfer links restore the saved participant name', async ({ page }) => {
  await installClipboard(page);
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

test('participant name updated on one device is refreshed on another device sharing the same participant identity', async ({ browser }) => {
  let canonicalName = 'Rodrigo';
  let profileRequests = 0;
  const installProfileApi = async (page: import('@playwright/test').Page) => {
    await page.route('**/api/me/profile', async (route) => {
      profileRequests += 1;
      if (route.request().method() === 'PUT') {
        canonicalName = String(route.request().postDataJSON().name).trim();
      }
      await route.fulfill({ json: { name: canonicalName, updatedAt: '2099-01-01T00:00:00.000Z' } });
    });
    await page.route('**/api/me/events', (route) => route.fulfill({ json: { created: [], joined: [] } }));
  };
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();
  const pageA = await deviceA.newPage();
  const pageB = await deviceB.newPage();
  await installProfileApi(pageA);
  await installProfileApi(pageB);
  await pageA.addInitScript(() => {
    localStorage.setItem('bora_participant_id', 'participant_1');
    localStorage.setItem('bora_participant_name', 'Rodrigo');
  });
  await pageB.addInitScript(() => {
    localStorage.setItem('bora_participant_id', 'participant_1');
    localStorage.setItem('bora_participant_name', 'Rodrigo');
  });

  await pageA.goto('/my-events');
  await pageB.goto('/home');
  await expect(pageA.getByText('Rodrigo', { exact: true }).last()).toBeVisible();
  await expect(pageB.locator('ion-title.home-toolbar-title')).toHaveText('Bora, Rodrigo?');
  await pageA.getByRole('button', { name: /Seu nome/ }).click();
  await pageA.locator('ion-alert input').fill('Bia Ceccato');
  await pageA.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => canonicalName).toBe('Bia Ceccato');
  expect(await pageB.evaluate(() => localStorage.getItem('bora_participant_name'))).toBe('Rodrigo');

  await pageB.waitForTimeout(800);
  const beforeActivation = profileRequests;
  // Returning to this already-open device triggers a forced profile refresh.
  const refreshResponse = pageB.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/me/profile'));
  await pageB.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await refreshResponse).ok()).toBeTruthy();
  await expect(pageB.locator('ion-title.home-toolbar-title')).toHaveText('Bora, Bia?');
  await expect.poll(() => pageB.evaluate(() => localStorage.getItem('bora_participant_name'))).toBe('Bia Ceccato');
  expect(profileRequests - beforeActivation).toBe(1);
  await deviceA.close();
  await deviceB.close();
});

test('recovery confirms before replacing an existing Bora on this device', async ({ page }, testInfo) => {
  await installClipboard(page);
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

test('back after accepting a recovery link does not return to the acceptance page', async ({ page }) => {
  await page.route('**/api/recover', (route) => route.fulfill({ json: { participantId: 'restored-participant' } }));
  await page.route('**/me/events', (route) => route.fulfill({ json: { created: [], joined: [] } }));
  const link = '/recover?token=back-stack-token';
  await page.goto('/home');
  await page.evaluate(() => localStorage.setItem('bora_participant_id', 'participant-on-this-device'));
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Usar este link de recuperação?' })).toBeVisible();
  await page.evaluate((url) => history.pushState({}, '', url), link);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Usar este link de recuperação?' })).toBeVisible();
  await page.getByRole('button', { name: 'Usar link' }).click();
  await expect(page.getByRole('heading', { name: 'Pronto!' })).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByText('Ver meus Boras').click();
  await expect(page).toHaveURL(/\/my-events$/);
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Usar este link de recuperação?' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'Bora marcar?' })).toBeVisible();
});

test('device-transfer links can include organizer controls', async ({ page }) => {
  await installClipboard(page);
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
    await expect(page.getByRole('button', { name: 'Próximos Boras' })).toBeVisible();
    await expect(page.getByText(`Próximo ${runId}`).first()).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Ativar lembretes neste aparelho' })).toBeVisible();
  await page.getByText('Lembretes', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quais avisos receber' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Boras passados' })).toBeVisible();
    const createdDisclosure = page.getByRole('button', { name: /Criados por mim/ });
    await expect(createdDisclosure).toHaveAttribute('aria-expanded', 'false');
    await createdDisclosure.focus();
    await page.keyboard.press('Enter');
    await expect(createdDisclosure).toHaveAttribute('aria-expanded', 'true');
  } finally {
    await request.delete(`/api/events/${body.event.slug as string}`, { headers: { 'x-forwarded-for': `e2e-${runId}`, authorization: `Bearer ${body.adminToken as string}` } });
  }
});

test('reminder preferences open for an active device subscription', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: class PushManager {}
    });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'granted' }
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => ({
          pushManager: {
            getSubscription: async () => ({ endpoint: 'https://push.example.test/bora-e2e' })
          }
        })
      }
    });
  });
  await page.route('**/api/push/subscriptions/preferences**', (route) =>
    route.fulfill({ json: { subscribed: true, preferences: {} } })
  );

  await page.goto('/my-events');
  const preferencesButton = page.getByRole('button', { name: 'Quais avisos receber' });
  await expect(preferencesButton).toBeVisible();
  await preferencesButton.click();

  const modal = page.locator('ion-modal.reminder-preferences-modal');
  await expect(modal).toHaveClass(/show-modal/);
  await expect(modal.getByText('Novos votos nos meus Boras')).toBeVisible();
  await expect(modal.getByText('Lembrete antes de começar')).toBeVisible();
});

test('past events are archived outside the active My Boras lists', async ({ page, request }, testInfo) => {
  const runId = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const participantId = `past-${runId}`;
  const title = `Passado ${runId}`;
  const startsAt = new Date(Date.now() + 2_000).toISOString();
  const created = await request.post('/api/events', {
    headers: { 'x-forwarded-for': `e2e-${runId}` },
    data: { participantId, event: { mode: 'agora', title, place: 'Praça', description: '', threshold: 2, startsAt, alternatives: [], createdByName: 'Ana', votingClosed: false, days: [] } }
  });
  expect(created.ok()).toBeTruthy();
  const body = await created.json();
  try {
    await expect.poll(() => Date.now(), { timeout: 5_000 }).toBeGreaterThan(new Date(startsAt).getTime());
    await page.goto('/my-events');
    await page.evaluate((id) => localStorage.setItem('bora_participant_id', id), participantId);
    await page.reload();
    await expect(page.getByText(title)).toHaveCount(0);
    await page.getByRole('button', { name: 'Boras passados' }).click();
    await expect(page).toHaveURL(/\/past-events$/);
    await expect(page.getByText(title)).toBeVisible();
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
        startsAt: null, alternatives: [], timeZone: 'America/Sao_Paulo', createdByName: 'Ana', votingClosed: false,
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
    expect(page.url()).toMatch(/\/home$/);

    for (const participantId of ['bia', 'caio']) {
      const vote = await request.post(`/api/events/${slug}/votes`, {
        headers: apiHeaders,
        data: { participantId: `${participantId}-${runId}`, voterName: participantId, response: 'accept', preferredOptions: [], availability: { sabado: ['18:00', '19:00'] } }
      });
      expect(vote.ok()).toBeTruthy();
    }

    await page.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => undefined }));
    await page.goto(`/e/${slug}?admin=${token}&created=1`);
    await expect(page.getByText('Seu Bora está pronto!')).toBeVisible();
    const readyActions = page.locator('.ready-card-actions');
    await expectConsistentActionGroup(readyActions, Boolean(testInfo.project.use.isMobile), 3);
    await expect(readyActions.locator('ion-button').filter({ hasText: 'Compartilhar no WhatsApp' })).toHaveClass(/action-button-primary/);
    await expect(readyActions.locator('ion-button').filter({ hasText: 'Copiar convite' })).toHaveClass(/action-button-secondary/);
    await expect(readyActions.locator('ion-button').filter({ hasText: 'Mais opções' })).toHaveClass(/action-button-ghost/);
    await expectNoHorizontalScroll(page);

    await page.goto(`/e/${slug}?admin=${token}`);
    await expect(page.getByRole('heading', { name: 'Melhores horários' })).toBeVisible();
    await expect(page.getByText('3 de 3')).toHaveCount(3);
    await expect(page.locator('.result-progress')).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'Escolher este horário' })).toHaveCount(4);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Gerenciar' }).click();
    await page.getByRole('button', { name: 'Editar detalhes' }).click();
    await expect(page.getByRole('heading', { name: 'Editar Bora' })).toBeVisible();
    await expect(page.locator('.event-editor-card.create-card')).toBeVisible();
    await page.getByRole('button', { name: 'Fechar' }).click();

    const decided = await request.patch(`/api/events/${slug}`, {
      headers: { ...apiHeaders, authorization: `Bearer ${token}` },
      data: { ...body.event, decidedOption: 'sabado:18:00', votingClosed: true }
    });
    expect(decided.ok()).toBeTruthy();

    await page.goto(`/e/${slug}?admin=${token}`);
    await expectConsistentActionGroup(page.locator('.calendar-actions'), Boolean(testInfo.project.use.isMobile));
    await page.getByRole('button', { name: 'Gerenciar' }).click();
    await expect(page.locator('.decision-summary')).toContainText('Horário definido');
    await expectConsistentActionGroup(page.locator('.response-actions'), Boolean(testInfo.project.use.isMobile));
    await expectNoHorizontalScroll(page);

    for (const url of [`/e/${slug}?admin=${token}`, `/e/${slug}`]) {
      await page.goto(url);
      await expect(page.getByText('Coloque na sua agenda')).toBeVisible();
      await expect(page.locator('a[href*="calendar.google.com"]')).toHaveCount(1);
    }
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar arquivo .ics' }).click();
    await expect((await download).suggestedFilename()).toBe(`${slug}.ics`);
  } finally {
    await request.delete(`/api/events/${slug}`, { headers: { ...apiHeaders, authorization: `Bearer ${token}` } });
  }
});
