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
