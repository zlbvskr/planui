import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlanuiError } from '../../i18n/errorsUk';
import {
  formatExactPriceUk,
  parseLocalizedPriceInput,
} from '../../domain/wishlist';
import {
  addDaysToLocalDate,
  assertValidHalfOpenInstants,
  assertValidLocalDate,
} from '../../domain/temporal';
import { InMemoryTransactionalEngine } from '../db';
import { PlanuiRepositories } from '../repositories';
import {
  createZipArchive,
  sha256Hex,
} from '../backup/zipCodec';
import {
  executeAtomicBackupReplacement,
  exportFullBackupZip,
  validateBackupArchive,
} from '../backup/backupService';

function createSamplePngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
}

describe('Stage 2: Local Data Model and Early Backup Acceptance Suite', () => {
  it('validates schema, temporal half-open intervals, and leap dates', () => {
    assert.equal(assertValidLocalDate('2024-02-29'), '2024-02-29');
    assert.throws(
      () => assertValidLocalDate('2025-02-29'),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'INVALID_LOCAL_DATE'
    );
    assert.equal(addDaysToLocalDate('2026-03-31', 1), '2026-04-01');
    assert.throws(
      () =>
        assertValidHalfOpenInstants(
          '2026-03-29T10:00:00.000Z',
          '2026-03-29T10:00:00.000Z'
        ),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'INVALID_HALF_OPEN_INTERVAL'
    );
  });

  it('prevents folder self-parenting and deep cycles while allowing arbitrary valid depth', async () => {
    const repo = new PlanuiRepositories(new InMemoryTransactionalEngine());
    const now = '2026-03-29T10:00:00.000Z';

    for (let i = 1; i <= 15; i++) {
      await repo.saveFolder({
        id: `f-${i}`,
        name: `Рівень ${i}`,
        parentId: i === 1 ? null : `f-${i - 1}`,
        order: i,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      });
    }

    await assert.rejects(
      async () => {
        await repo.saveFolder({
          id: 'f-self',
          name: 'Сам у собі',
          parentId: 'f-self',
          order: 1,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        });
      },
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'FOLDER_SELF_PARENT'
    );

    await assert.rejects(
      async () => {
        await repo.saveFolder(
          {
            id: 'f-1',
            name: 'Рівень 1',
            parentId: 'f-15',
            order: 1,
            createdAt: now,
            updatedAt: now,
            revision: 1,
          },
          1
        );
      },
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'FOLDER_CYCLE_DETECTED'
    );
  });

  it('validates wishlist exact decimal price representation, distinguishes null vs zero, and formats in uk-UA', () => {
    const noPrice = parseLocalizedPriceInput('', null);
    assert.equal(noPrice, null);

    const zeroPrice = parseLocalizedPriceInput('0', 'UAH');
    assert.deepEqual(zeroPrice, {
      amountMinor: 0,
      amountDecimal: '0.00',
      currency: 'UAH',
    });
    assert.notEqual(noPrice, zeroPrice);

    const decimalComma = parseLocalizedPriceInput('1 250,5', 'EUR');
    assert.deepEqual(decimalComma, {
      amountMinor: 125050,
      amountDecimal: '1250.50',
      currency: 'EUR',
    });
    assert.ok(formatExactPriceUk(decimalComma)?.includes('EUR'));

    const jpyPrice = parseLocalizedPriceInput('3500', 'JPY');
    assert.deepEqual(jpyPrice, {
      amountMinor: 3500,
      amountDecimal: '3500',
      currency: 'JPY',
    });
  });

  it('reassigns wishes to uncategorized (null) when deleting a wishlist category without deleting wishes', async () => {
    const repo = new PlanuiRepositories(new InMemoryTransactionalEngine());
    const now = '2026-03-29T12:00:00.000Z';

    await repo.saveWishlistCategory({
      id: 'wcat-audio',
      name: 'Музичне обладнання',
      order: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    await repo.saveWishItem({
      id: 'wish-synth',
      title: 'Аналоговий синтезатор',
      note: 'Для домашньої студії',
      categoryId: 'wcat-audio',
      timing: 'later',
      estimatedPrice: parseLocalizedPriceInput('18500,00', 'UAH'),
      state: 'active',
      fulfilledAt: null,
      archived: false,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    const res = await repo.deleteWishlistCategoryTransactionally(
      'wcat-audio',
      '2026-03-29T12:05:00.000Z'
    );
    assert.equal(res.reassignedWishesCount, 1);

    const { snapshot } = await repo.captureCoherentSnapshot();
    assert.equal(snapshot.wishlistCategories.length, 0);
    assert.equal(snapshot.wishes.length, 1);
    assert.equal(snapshot.wishes[0].categoryId, null);
    assert.equal(snapshot.wishes[0].revision, 2);
  });

  it('executes complete backup round-trip and preserves live data on failed replacement', async () => {
    const sourceRepo = new PlanuiRepositories(
      new InMemoryTransactionalEngine('source_db')
    );
    const now = '2026-03-29T14:00:00.000Z';

    await sourceRepo.savePreferredWishlistCurrency('UAH', now);
    await sourceRepo.saveFolder({
      id: 'folder-1',
      name: 'Особисте',
      parentId: null,
      order: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    const pngBytes = createSamplePngBytes();
    const pngSha = await sha256Hex(pngBytes);
    await sourceRepo.saveInspirationWithMediaTransactionally(
      {
        id: 'insp-img',
        kind: 'image',
        title: 'Світлина',
        contentText: null,
        linkUrl: null,
        mediaId: 'media-1',
        isFavorite: true,
        projectId: null,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      },
      {
        meta: {
          id: 'media-1',
          mimeType: 'image/png',
          byteSize: pngBytes.byteLength,
          width: 400,
          height: 300,
          sha256Hex: pngSha,
          wasOptimized: false,
          optimizationNoteUk: null,
          createdAt: now,
        },
        bytes: pngBytes,
      }
    );

    const { zipBytes } = await exportFullBackupZip(sourceRepo, now);
    const validatedPreview = await validateBackupArchive(zipBytes);

    const targetRepo = new PlanuiRepositories(
      new InMemoryTransactionalEngine('target_db')
    );
    await targetRepo.saveFolder({
      id: 'live-folder-before-import',
      name: 'Поточні дані до імпорту',
      parentId: null,
      order: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    await assert.rejects(
      async () =>
        executeAtomicBackupReplacement(targetRepo, validatedPreview, {
          explicitUserConfirmation: true,
          simulateRecoverySnapshotFailure: true,
        }),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'RECOVERY_SNAPSHOT_FAILED'
    );

    const replaceResult = await executeAtomicBackupReplacement(
      targetRepo,
      validatedPreview,
      {
        explicitUserConfirmation: true,
        nowIso: '2026-03-29T15:00:00.000Z',
      }
    );
    assert.ok(replaceResult.recoverySnapshotId.startsWith('recovery-'));

    const { snapshot: restoredSnap, mediaBlobs: restoredBlobs } =
      await targetRepo.captureCoherentSnapshot();
    assert.equal(restoredSnap.folders[0].id, 'folder-1');
    assert.deepEqual(restoredBlobs.get('media-1'), pngBytes);
  });

  it('rejects path traversal in backup archives', async () => {
    const encoder = new TextEncoder();
    await assert.rejects(
      async () => {
        await createZipArchive([
          { path: '../evil.json', bytes: encoder.encode('{}') },
        ]);
      },
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'BACKUP_UNSAFE_PATH'
    );
  });
});
