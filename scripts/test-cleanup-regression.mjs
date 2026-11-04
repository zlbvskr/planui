// Real IndexedDB/localStorage in an isolated browser profile; no production/user DB access.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/icon.svg`);
  const result = await page.evaluate(async () => {
    const { IndexedDbStorageEngine, STORE_NAMES } = await import('/src/storage/db.ts');
    const { PlanuiRepositories } = await import('/src/storage/repositories.ts');
    const backup = await import('/src/storage/backup/backupService.ts');
    const { applyThemeAndAccessibilityToDocument } = await import('/src/state/shellStore.ts');
    const now = '2026-11-04T12:00:00.000Z';
    const open = name => new PlanuiRepositories(new IndexedDbStorageEngine(name));
    const close = repo => { repo.engine.close(); repo.tabSync.close(); };
    const folder = (id, name) => ({ id, name, parentId: null, order: 1, createdAt: now, updatedAt: now, revision: 1 });
    const source = open('cleanup-source');
    let target = open('cleanup-target');
    try {
      const original = folder('original', '  Мої дані\n🗓️  ');
      const incoming = folder('incoming', 'Імпорт');
      await source.saveFolder(incoming);
      await target.saveFolder(original);
      close(target);
      target = open('cleanup-target');
      const persisted = (await target.captureCoherentSnapshot(now)).snapshot.folders;
      const { zipBytes } = await backup.exportFullBackupZip(source, now);
      const preview = await backup.validateBackupArchive(zipBytes);
      const before = (await target.captureCoherentSnapshot(now)).snapshot;
      let failureCode;
      try {
        await backup.executeAtomicBackupReplacement(target, preview, {
          explicitUserConfirmation: true, nowIso: now, simulateReplacementWriteFailure: true,
        });
      } catch (error) { failureCode = error.code; }
      const afterFailure = (await target.captureCoherentSnapshot(now)).snapshot;
      const recoveriesAfterFailure = await target.listRecoverySnapshots();
      // Mutation of the displayed preview must not change the validated archive.
      preview.snapshot.folders[0].name = 'tampered preview';
      const replacement = await backup.executeAtomicBackupReplacement(target, preview, { explicitUserConfirmation: true, nowIso: now });
      const imported = (await target.captureCoherentSnapshot(now)).snapshot.folders;
      const recovery = await backup.exportRecoverySnapshotZip(target, replacement.recoverySnapshotId, now);
      const recoveryPreview = await backup.validateBackupArchive(recovery.zipBytes);
      await backup.restoreFromRecoverySnapshotTransactionally(target, replacement.recoverySnapshotId, {
        explicitUserConfirmation: true, nowIso: '2026-11-04T12:01:00.000Z',
      });
      close(target);
      target = open('cleanup-target');
      const restored = (await target.captureCoherentSnapshot(now)).snapshot.folders;
      // An aborted native multi-store transaction must leave both stores unchanged.
      let abortCode;
      try {
        await target.engine.runTransaction([STORE_NAMES.folders, STORE_NAMES.tasks], 'readwrite', async tx => {
          await tx.clear(STORE_NAMES.folders);
          await tx.put(STORE_NAMES.tasks, { id: 'uncommitted' });
          throw new Error('abort regression');
        });
      } catch (error) { abortCode = error.code; }
      const afterAbort = (await target.captureCoherentSnapshot(now)).snapshot;
      applyThemeAndAccessibilityToDocument('dark', true, true);
      return { original, incoming, persisted, failureCode, before, afterFailure, recoveriesAfterFailure,
        imported, recoveryFolders: recoveryPreview.snapshot.folders, restored, abortCode,
        afterAbortFolders: afterAbort.folders, afterAbortTasks: afterAbort.tasks,
        preferences: ['planui_theme_bootstrap', 'planui_reduced_motion', 'planui_reduced_transparency'].map(key => localStorage.getItem(key)) };
    } finally { close(source); close(target); }
  });
  assert.deepEqual(result.persisted, [result.original]);
  assert.ok(result.failureCode, 'simulated replacement must fail');
  assert.deepEqual(result.afterFailure, result.before, 'failed replacement must preserve all live records and generation');
  assert.deepEqual(result.recoveriesAfterFailure, [], 'failed import must not commit a recovery');
  assert.deepEqual(result.imported, [result.incoming], 'import uses trusted archive, not mutable preview');
  for (const records of [result.recoveryFolders, result.restored, result.afterAbortFolders]) assert.deepEqual(records, [result.original]);
  assert.deepEqual(result.afterAbortTasks, []);
  assert.equal(result.abortCode, 'DB_TRANSACTION_FAILED');
  assert.deepEqual(result.preferences, ['dark', 'true', 'true']);
  await page.reload();
  assert.equal(await page.evaluate(() => localStorage.getItem('planui_theme_bootstrap')), 'dark');
  console.log('PASS: native IndexedDB reopen/rollback, ZIP replacement/recovery/restore, trusted preview, localStorage reload');
} finally {
  await browser?.close();
  await server.close();
}
