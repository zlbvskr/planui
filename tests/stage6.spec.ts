import assert from 'node:assert/strict';
import { startUiRuntime, installUiFixture, UI_CONTEXT } from './ui-runtime';

const runtime = await startUiRuntime();
try {
  const context = await runtime.browser.newContext({
    ...UI_CONTEXT,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await installUiFixture(page, 'filled', 'dark');

  const snapshot = () =>
    page.evaluate(async () => {
      const path = '/src/storage/repositories.ts';
      const { PlanuiRepositories } = await import(path);
      return (
        await new PlanuiRepositories(
          (globalThis as any).__planuiUiFixtureEngine
        ).captureCoherentSnapshot(new Date().toISOString())
      ).snapshot;
    });

  // 1. Моє бажане життя: 2-column bento, guiding questions in InfoSheet, detail sheet links to goal/area, no task creation
  await page.goto(`${runtime.url}/#/me`);
  await page.getByTestId('me-drilldown-inspiration').click();
  await page.getByTestId('me-subview-inspiration').waitFor();
  await page.getByRole('button', { name: 'Інформація: Моє бажане життя', exact: true }).click();
  assert.match(await page.getByRole('dialog').innerText(), /звичайний бажаний день/i);
  await page.getByTestId('modal-close-button').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });

  await page.locator('[data-testid^="open-inspiration-detail-"]').first().click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').getByText(/завдання/i).count(), 0);
  await page.getByTestId('modal-close-button').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });

  // 2. Список бажань: status pill menu without counters, approx price, linking to project never creates a task or deadline
  await page.goto(`${runtime.url}/#/wishlist`);
  await page.getByTestId('me-subview-wishlist').waitFor();
  assert.match(await page.getByTestId('wish-price-headphones').innerText(), /≈ 3\s*500 грн/);
  const beforeWish = await snapshot();
  await page.getByTestId('open-add-wish-button').click();
  await page.getByTestId('wishlist-quick-title-input').fill('Лампа для столу');
  await page.getByRole('button', { name: 'Проєкт', exact: true }).click();
  await page.getByTestId('wish-project-select').selectOption('album-project');
  await page.getByTestId('wishlist-quick-submit-button').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const afterWish = await snapshot();
  assert.equal(afterWish.wishes.some((w: any) => w.title === 'Лампа для столу' && w.projectId === 'album-project'), true);
  assert.deepEqual(afterWish.tasks, beforeWish.tasks, 'Linking wish to project never creates a task or deadline');

  // 3. Налаштування: Disabling modules hides every entry point without breaking layout and keeps data
  await page.goto(`${runtime.url}/#/settings`);
  await page.getByTestId('basic-settings-view').waitFor();
  const dataBeforeDisable = await snapshot();

  for (const mod of ['habits', 'state-check-ins', 'desired-life', 'wishlist']) {
    const toggle = page.getByTestId(`toggle-module-${mod}`);
    assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
  }

  // Settings quick links for disabled modules are hidden
  assert.equal(await page.getByTestId('settings-open-habits').count(), 0);
  assert.equal(await page.getByTestId('settings-open-wishlist-categories').count(), 0);

  // Me hub hides Стан, Моє бажане життя, Список бажань
  await page.goto(`${runtime.url}/#/me`);
  await page.getByTestId('me-subview-overview').waitFor();
  assert.equal(await page.getByTestId('me-drilldown-records').count(), 0);
  assert.equal(await page.getByTestId('me-drilldown-inspiration').count(), 0);
  assert.equal(await page.getByTestId('me-drilldown-wishlist').count(), 0);
  assert.equal(await page.getByTestId('me-drilldown-life-areas').count(), 1);
  assert.equal(await page.getByTestId('me-drilldown-settings').count(), 1);

  // Today hides Звички segment and Quick Add hides disabled module pills
  await page.goto(`${runtime.url}/#/today`);
  await page.getByTestId('destination-view-today').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Звички', exact: true }).count(), 0);
  await page.getByTestId('mobile-global-create-button').click();
  await page.getByRole('dialog').waitFor();
  for (const kind of ['habit', 'personal_record', 'inspiration', 'wish']) {
    assert.equal(await page.getByTestId(`create-action-tab-${kind}`).count(), 0);
  }
  await page.getByTestId('modal-close-button').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });

  // Stored data is completely preserved while modules are disabled
  const dataWhileDisabled = await snapshot();
  assert.deepEqual(dataWhileDisabled.habits, dataBeforeDisable.habits);
  assert.deepEqual(dataWhileDisabled.personalRecords, dataBeforeDisable.personalRecords);
  assert.deepEqual(dataWhileDisabled.inspirationItems, dataBeforeDisable.inspirationItems);
  assert.deepEqual(dataWhileDisabled.wishes, dataBeforeDisable.wishes);

  // Re-enable modules
  await page.goto(`${runtime.url}/#/settings`);
  for (const mod of ['habits', 'state-check-ins', 'desired-life', 'wishlist']) {
    await page.getByTestId(`toggle-module-${mod}`).click();
  }

  // 4. Backup export/restore from Settings Backup sheet works
  await page.getByTestId('open-backup-sheet-button').click();
  await page.getByRole('dialog').waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-backup-zip-button').click();
  const download = await downloadPromise;
  const zipPath = await download.path();
  assert.ok(zipPath);

  await page.getByTestId('import-backup-file-input').setInputFiles(zipPath);
  await page.getByTestId('import-replacement-preview').waitFor();
  await page.getByTestId('confirm-import-replacement-button').click();
  await page.getByTestId('import-replacement-preview').waitFor({ state: 'hidden' });

  // 5. Wipe requires explicit confirmation
  await page.getByTestId('open-reset-confirm-button').click();
  await page.getByTestId('reset-confirmation-dialog').waitFor();
  const confirmResetBtn = page.getByTestId('confirm-reset-all-data-button');
  assert.equal(await confirmResetBtn.isDisabled(), true);
  await page.getByTestId('reset-explicit-confirm-checkbox').click();
  assert.equal(await confirmResetBtn.isDisabled(), false);
  await confirmResetBtn.click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });

  const afterWipe = await snapshot();
  assert.equal(afterWipe.tasks.length, 0);
  assert.equal(afterWipe.wishes.length, 0);
  assert.equal(afterWipe.inspirationItems.length, 0);

  assert.deepEqual(errors, []);
  console.log('PASS Stage 6 WebKit: inspiration, wishlist, settings, disabled modules hide entry points and preserve data, backup export/restore, wipe confirmation');
  await context.close();
} finally {
  await runtime.close();
}
