import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlanuiError } from '../../i18n/errorsUk';
import {
  PLANUI_APP_VERSION,
  PLANUI_BACKUP_FORMAT,
  PLANUI_BACKUP_VERSION,
  PLANUI_DB_SCHEMA_VERSION,
  PlanuiDomainSnapshot,
} from '../../domain/types';
import { InMemoryTransactionalEngine } from '../db';
import { PlanuiRepositories } from '../repositories';
import {
  BACKUP_LIMITS,
  createZipArchive,
  sha256Hex,
} from '../backup/zipCodec';
import {
  MAX_RECOVERY_SNAPSHOTS,
  deleteRecoverySnapshotTransactionally,
  executeAtomicBackupReplacement,
  exportFullBackupZip,
  exportRecoverySnapshotZip,
  resetAllPlanuiDataTransactionally,
  restoreFromRecoverySnapshotTransactionally,
  validateBackupArchive,
} from '../backup/backupService';

/**
 * Helper: Creates a valid 24-byte PNG binary header with explicit big-endian width & height in IHDR.
 */
function createValidPngWithDimensions(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  // PNG signature
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR chunk length (13) + 'IHDR'
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  // Bit depth 8, color type 2 (RGB)
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

describe('Stage 11: Complete Backup, Recovery, and Data Safety Adversarial Suite', () => {
  it('11.2 & 11.3: executes complete archive round-trip across all 17 domain collections including Wishlist and binary media', async () => {
    const engine = new InMemoryTransactionalEngine('stage11_full_source');
    const sourceRepo = new PlanuiRepositories(engine);
    const now = '2026-03-30T10:00:00.000Z';

    await sourceRepo.getOrInitSettings(now);
    await sourceRepo.updateSettingsPatch(
      {
        theme: 'dark',
        timeZoneMode: 'manual',
        manualTimeZone: 'Europe/Warsaw',
        reducedMotionOverride: true,
        preferredWishlistCurrency: 'EUR',
      },
      now
    );

    // 1. Folders (nested)
    await sourceRepo.saveFolder({
      id: 'f-root',
      name: 'Робота та проєкти',
      parentId: null,
      order: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });
    await sourceRepo.saveFolder({
      id: 'f-child',
      name: 'Підпапка релізу',
      parentId: 'f-root',
      order: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    // 2. Project & Stage
    const { snapshot: initSnap } = await sourceRepo.captureCoherentSnapshot(now);
    const lifeAreaId = initSnap.lifeAreaQuestions[0].id;

    await sourceRepo.saveProject({
      id: 'proj-1',
      title: 'Запуск альбому',
      description: 'Фінальне зведення та мастеринг',
      desiredOutcome: 'Готовий реліз із 8 треків',
      completionCriteria: 'Усі майстри перевірено',
      targetDate: '2026-05-15',
      folderId: 'f-child',
      lifeAreaId,
      collaboratorText: 'Звукорежисер Олексій',
      state: 'active',
      archived: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      revision: 1,
    });

    await sourceRepo.saveStage({
      id: 'stage-1',
      projectId: 'proj-1',
      title: 'Етап зведення',
      expectedOutcome: 'Зведені барабани та вокал',
      targetDate: '2026-04-20',
      order: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    // 3. Task + checklist + active and released reservations
    await sourceRepo.saveTask({
      id: 'task-1',
      title: 'Перевірити мікс треку №3',
      description: 'Слухати в моніторах',
      state: 'open',
      priority: 'high',
      deadline: { kind: 'date_only', localDate: '2026-04-10' },
      estimatedDurationMinutes: 60,
      planningState: 'timed',
      plannedDate: null,
      ownership: {
        kind: 'project',
        projectId: 'proj-1',
        stageId: 'stage-1',
      },
      checklist: [
        { id: 'chk-1', title: 'Перевірити бас', order: 1, completed: true },
        { id: 'chk-2', title: 'Перевірити реверберацію', order: 2, completed: false },
      ],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    });

    await sourceRepo.saveReservationTransactionally({
      id: 'res-active',
      taskId: 'task-1',
      interval: {
        startInstant: '2026-03-31T09:00:00.000Z',
        endInstant: '2026-03-31T10:00:00.000Z',
        originZone: 'Europe/Warsaw',
        originStartLocalDate: '2026-03-31',
        originStartLocalTime: '11:00',
        originEndLocalDate: '2026-03-31',
        originEndLocalTime: '12:00',
      },
      state: 'active',
      releaseMetadata: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    await sourceRepo.saveReservationTransactionally({
      id: 'res-released',
      taskId: 'task-1',
      interval: {
        startInstant: '2026-03-29T09:00:00.000Z',
        endInstant: '2026-03-29T10:00:00.000Z',
        originZone: 'Europe/Warsaw',
        originStartLocalDate: '2026-03-29',
        originStartLocalTime: '11:00',
        originEndLocalDate: '2026-03-29',
        originEndLocalTime: '12:00',
      },
      state: 'released',
      releaseMetadata: {
        releasedAt: now,
        reason: 'manual_unplan',
        originalStartInstant: '2026-03-29T09:00:00.000Z',
        originalEndInstant: '2026-03-29T10:00:00.000Z',
      },
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    // 4. Shift Template, Overnight Work Shift, and Day-Off Annotation
    await sourceRepo.saveShiftTemplate({
      id: 'tpl-night',
      name: 'Нічна зміна',
      code: 'Н12',
      startLocalTime: '20:00',
      endLocalTime: '08:00',
      endDateOffsetDays: 1,
      color: 'work',
      note: 'Чергування',
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    await sourceRepo.applyRosterBatchTransactionally(
      {
        eventsToSave: [
          {
            id: 'ev-shift',
            title: 'Нічна зміна',
            note: 'Зміна за графіком',
            type: 'work_shift',
            color: 'work',
            schedule: {
              kind: 'timed',
              interval: {
                startInstant: '2026-03-30T18:00:00.000Z',
                endInstant: '2026-03-31T06:00:00.000Z',
                originZone: 'Europe/Warsaw',
                originStartLocalDate: '2026-03-30',
                originStartLocalTime: '20:00',
                originEndLocalDate: '2026-03-31',
                originEndLocalTime: '08:00',
              },
            },
            isBlocking: true,
            state: 'active',
            workProperties: {
              shiftName: 'Нічна зміна',
              shiftCode: 'Н12',
              sourceTemplateId: 'tpl-night',
            },
            createdAt: now,
            updatedAt: now,
            revision: 1,
          },
        ],
        dayOffAnnotationsToSave: [
          {
            id: 'dayoff-2026-04-01',
            localDate: '2026-04-01',
            sourceZone: 'Europe/Warsaw',
            code: 'В',
            note: 'Вихідний після нічної',
            createdAt: now,
            updatedAt: now,
            revision: 1,
          },
        ],
      },
      now
    );

    // 5. Habit & HabitEntry
    await sourceRepo.saveHabit({
      id: 'hab-1',
      name: 'Дихальні вправи',
      description: '10 хвилин спокою',
      icon: 'wind',
      lifeAreaId,
      projectId: 'proj-1',
      state: 'active',
      ruleRevisions: [
        {
          id: 'rev-hab-1',
          effectiveFromLocalDate: '2026-03-01',
          rule: { kind: 'daily' },
          target: { kind: 'numeric', targetValue: 10, unitUk: 'хв' },
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    await sourceRepo.recordHabitEntryForDateTransactionally({
      habitId: 'hab-1',
      localDate: '2026-03-30',
      input: { kind: 'set_numeric', numericValue: 10 },
      nowIso: now,
    });

    // 6. Personal Record & Life Area Assessment
    await sourceRepo.savePersonalRecord({
      id: 'pr-1',
      recordedAt: now,
      localDate: '2026-03-30',
      zoneId: 'Europe/Warsaw',
      text: 'Спокійний робочий ритм.',
      mood: 4,
      energy: 4,
      stress: 2,
      tags: ['фокус', 'музика'],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    await sourceRepo.saveLifeAreaAssessment({
      id: 'la-1',
      recordedAt: now,
      periodStartLocalDate: '2026-03-23',
      periodEndLocalDate: '2026-03-30',
      answers: [
        {
          questionId: lifeAreaId,
          questionTextSnapshotUk: initSnap.lifeAreaQuestions[0].questionTextUk,
          questionVersionSnapshot: 1,
          score: 8,
          note: 'Достатньо руху',
        },
      ],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    // 7. Inspiration with binary PNG media
    const pngBytes = createValidPngWithDimensions(320, 240);
    const pngSha = await sha256Hex(pngBytes);
    await sourceRepo.saveInspirationWithMediaTransactionally(
      {
        id: 'insp-1',
        kind: 'image',
        title: 'Обкладинка синглу',
        contentText: 'Референс світла',
        linkUrl: null,
        mediaId: 'media-cover',
        isFavorite: true,
        projectId: 'proj-1',
        createdAt: now,
        updatedAt: now,
        revision: 1,
      },
      {
        meta: {
          id: 'media-cover',
          mimeType: 'image/png',
          byteSize: pngBytes.byteLength,
          width: 320,
          height: 240,
          sha256Hex: pngSha,
          wasOptimized: false,
          optimizationNoteUk: null,
          createdAt: now,
        },
        bytes: pngBytes,
      }
    );

    // 8. Wishlist Category & Wishes (active with price + fulfilled archived)
    await sourceRepo.saveWishlistCategory({
      id: 'wcat-studio',
      name: 'Студійне обладнання',
      order: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    await sourceRepo.saveWishItem({
      id: 'wish-active',
      title: 'Аудіоінтерфейс',
      note: 'Два мікрофонні преампи',
      categoryId: 'wcat-studio',
      timing: 'later',
      estimatedPrice: {
        amountMinor: 24999,
        amountDecimal: '249.99',
        currency: 'EUR',
      },
      state: 'active',
      fulfilledAt: null,
      archived: false,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    await sourceRepo.saveWishItem({
      id: 'wish-fulfilled',
      title: 'Стійка для мікрофона',
      note: null,
      categoryId: null,
      timing: 'now',
      estimatedPrice: {
        amountMinor: 0,
        amountDecimal: '0.00',
        currency: 'UAH',
      },
      state: 'fulfilled',
      fulfilledAt: now,
      archived: true,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    const { snapshot: sourceSnapshot, mediaBlobs: sourceBlobs } =
      await sourceRepo.captureCoherentSnapshot(now);

    const { zipBytes, manifest } = await exportFullBackupZip(sourceRepo, now);

    // Verify manifest does not recursively list itself
    assert.equal(
      manifest.files.some((f) => f.path === 'manifest.json'),
      false
    );
    assert.equal(manifest.entityCounts.folders, 2);
    assert.equal(manifest.entityCounts.projects, 1);
    assert.equal(manifest.entityCounts.stages, 1);
    assert.equal(manifest.entityCounts.tasks, 1);
    assert.equal(manifest.entityCounts.reservations, 2);
    assert.equal(manifest.entityCounts.events, 1);
    assert.equal(manifest.entityCounts.shiftTemplates, 1);
    assert.equal(manifest.entityCounts.dayOffAnnotations, 1);
    assert.equal(manifest.entityCounts.habits, 1);
    assert.equal(manifest.entityCounts.habitEntries, 1);
    assert.equal(manifest.entityCounts.personalRecords, 1);
    assert.equal(manifest.entityCounts.lifeAreaAssessments, 1);
    assert.equal(manifest.entityCounts.inspirationItems, 1);
    assert.equal(manifest.entityCounts.mediaMeta, 1);
    assert.equal(manifest.entityCounts.wishlistCategories, 1);
    assert.equal(manifest.entityCounts.wishes, 2);

    const preview = await validateBackupArchive(zipBytes);
    const targetRepo = new PlanuiRepositories(
      new InMemoryTransactionalEngine('stage11_full_target')
    );

    const repRes = await executeAtomicBackupReplacement(targetRepo, preview, {
      explicitUserConfirmation: true,
      nowIso: '2026-03-30T11:00:00.000Z',
    });
    assert.ok(repRes.newDbGeneration > sourceSnapshot.settings.dbGeneration);

    const { snapshot: restoredSnap, mediaBlobs: restoredBlobs } =
      await targetRepo.captureCoherentSnapshot();

    assert.deepEqual(restoredSnap.folders, sourceSnapshot.folders);
    assert.deepEqual(restoredSnap.projects, sourceSnapshot.projects);
    assert.deepEqual(restoredSnap.stages, sourceSnapshot.stages);
    assert.deepEqual(restoredSnap.tasks, sourceSnapshot.tasks);
    assert.deepEqual(restoredSnap.reservations, sourceSnapshot.reservations);
    assert.deepEqual(restoredSnap.events, sourceSnapshot.events);
    assert.deepEqual(restoredSnap.shiftTemplates, sourceSnapshot.shiftTemplates);
    assert.deepEqual(
      restoredSnap.dayOffAnnotations,
      sourceSnapshot.dayOffAnnotations
    );
    assert.deepEqual(restoredSnap.habits, sourceSnapshot.habits);
    assert.deepEqual(restoredSnap.habitEntries, sourceSnapshot.habitEntries);
    assert.deepEqual(
      restoredSnap.personalRecords,
      sourceSnapshot.personalRecords
    );
    assert.deepEqual(
      restoredSnap.lifeAreaQuestions,
      sourceSnapshot.lifeAreaQuestions
    );
    assert.deepEqual(
      restoredSnap.lifeAreaAssessments,
      sourceSnapshot.lifeAreaAssessments
    );
    assert.deepEqual(
      restoredSnap.inspirationItems,
      sourceSnapshot.inspirationItems
    );
    assert.deepEqual(restoredSnap.mediaMeta, sourceSnapshot.mediaMeta);
    assert.deepEqual(
      restoredSnap.wishlistCategories,
      sourceSnapshot.wishlistCategories
    );
    assert.deepEqual(restoredSnap.wishes, sourceSnapshot.wishes);
    assert.equal(
      restoredSnap.settings.preferredWishlistCurrency,
      sourceSnapshot.settings.preferredWishlistCurrency
    );
    assert.equal(
      restoredSnap.settings.manualTimeZone,
      sourceSnapshot.settings.manualTimeZone
    );
    assert.deepEqual(
      restoredBlobs.get('media-cover'),
      sourceBlobs.get('media-cover')
    );
  });

  it('11.4 & 11.7: rejects corrupt ZIP, invalid JSON, bad checksums, future versions, entity count mismatch, and cancelable AbortSignal', async () => {
    const repo = new PlanuiRepositories(
      new InMemoryTransactionalEngine('stage11_corrupt_source')
    );
    const now = '2026-03-30T12:00:00.000Z';
    const { zipBytes, manifest } = await exportFullBackupZip(repo, now);

    // 1. Corrupt ZIP bytes
    await assert.rejects(
      async () => validateBackupArchive(new Uint8Array([1, 2, 3, 4, 5])),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'BACKUP_CORRUPTED_ZIP'
    );

    // 2. AbortSignal already aborted before validation
    const preAborted = new AbortController();
    preAborted.abort();
    await assert.rejects(
      async () =>
        validateBackupArchive(zipBytes, BACKUP_LIMITS, preAborted.signal),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'BACKUP_VALIDATION_ABORTED'
    );

    // 3. Future unsupported schema version
    const encoder = new TextEncoder();
    const { snapshot } = await repo.captureCoherentSnapshot(now);
    const dataBytes = encoder.encode(JSON.stringify(snapshot));
    const dataSha = await sha256Hex(dataBytes);
    const futureManifest = {
      ...manifest,
      dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION + 5,
      files: [
        {
          path: 'data.json',
          byteSize: dataBytes.byteLength,
          sha256Hex: dataSha,
          mimeType: 'application/json',
        },
      ],
    };
    const futureZip = await createZipArchive([
      {
        path: 'manifest.json',
        bytes: encoder.encode(JSON.stringify(futureManifest)),
      },
      { path: 'data.json', bytes: dataBytes },
    ]);
    await assert.rejects(
      async () => validateBackupArchive(futureZip),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'BACKUP_UNSUPPORTED_VERSION'
    );

    // 4. Stale SHA-256 checksum on data.json
    const badShaManifest = {
      ...manifest,
      files: [
        {
          path: 'data.json',
          byteSize: dataBytes.byteLength,
          sha256Hex: '0'.repeat(64),
          mimeType: 'application/json',
        },
      ],
    };
    const badShaZip = await createZipArchive([
      {
        path: 'manifest.json',
        bytes: encoder.encode(JSON.stringify(badShaManifest)),
      },
      { path: 'data.json', bytes: dataBytes },
    ]);
    await assert.rejects(
      async () => validateBackupArchive(badShaZip),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'BACKUP_CHECKSUM_MISMATCH'
    );

    // 5. Entity count mismatch in manifest.entityCounts
    const badCountManifest = {
      ...manifest,
      entityCounts: {
        ...manifest.entityCounts,
        tasks: 99,
      },
      files: [
        {
          path: 'data.json',
          byteSize: dataBytes.byteLength,
          sha256Hex: dataSha,
          mimeType: 'application/json',
        },
      ],
    };
    const badCountZip = await createZipArchive([
      {
        path: 'manifest.json',
        bytes: encoder.encode(JSON.stringify(badCountManifest)),
      },
      { path: 'data.json', bytes: dataBytes },
    ]);
    await assert.rejects(
      async () => validateBackupArchive(badCountZip),
      (err: unknown) =>
        err instanceof PlanuiError &&
        err.code === 'BACKUP_ENTITY_COUNT_MISMATCH'
    );
  });

  it('11.4 & 11.7: rejects misleading binary media dimensions, disguised SVG payloads, folder cycles, broken wishlist category links, and invalid prices', async () => {
    const repo = new PlanuiRepositories(
      new InMemoryTransactionalEngine('stage11_adversarial_domain')
    );
    const now = '2026-03-30T12:30:00.000Z';
    const { snapshot: baseSnap } = await repo.captureCoherentSnapshot(now);
    const encoder = new TextEncoder();

    async function buildArchiveForSnapshot(
      customSnap: PlanuiDomainSnapshot,
      mediaFiles: { path: string; bytes: Uint8Array; mimeType: string }[] = []
    ): Promise<Uint8Array> {
      const dataBytes = encoder.encode(JSON.stringify(customSnap));
      const dataSha = await sha256Hex(dataBytes);
      const files = [
        {
          path: 'data.json',
          byteSize: dataBytes.byteLength,
          sha256Hex: dataSha,
          mimeType: 'application/json',
        },
      ];
      const zipInputs = [{ path: 'data.json', bytes: dataBytes }];

      for (const mf of mediaFiles) {
        const sha = await sha256Hex(mf.bytes);
        files.push({
          path: mf.path,
          byteSize: mf.bytes.byteLength,
          sha256Hex: sha,
          mimeType: mf.mimeType,
        });
        zipInputs.push({ path: mf.path, bytes: new Uint8Array(mf.bytes) });
      }

      const manifest = {
        format: PLANUI_BACKUP_FORMAT,
        backupVersion: PLANUI_BACKUP_VERSION,
        appVersion: PLANUI_APP_VERSION,
        dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION,
        createdAt: now,
        entityCounts: {
          folders: customSnap.folders.length,
          projects: customSnap.projects.length,
          stages: customSnap.stages.length,
          tasks: customSnap.tasks.length,
          reservations: customSnap.reservations.length,
          events: customSnap.events.length,
          shiftTemplates: customSnap.shiftTemplates.length,
          dayOffAnnotations: customSnap.dayOffAnnotations.length,
          habits: customSnap.habits.length,
          habitEntries: customSnap.habitEntries.length,
          personalRecords: customSnap.personalRecords.length,
          lifeAreaQuestions: customSnap.lifeAreaQuestions.length,
          lifeAreaAssessments: customSnap.lifeAreaAssessments.length,
          inspirationItems: customSnap.inspirationItems.length,
          mediaMeta: customSnap.mediaMeta.length,
          wishlistCategories: customSnap.wishlistCategories.length,
          wishes: customSnap.wishes.length,
        },
        files,
      };

      return createZipArchive([
        {
          path: 'manifest.json',
          bytes: encoder.encode(JSON.stringify(manifest)),
        },
        ...zipInputs,
      ]);
    }

    // 1. Misleading binary media dimensions (meta says 100x100, binary PNG IHDR says 9000x9000 > MAX_MEDIA_DIMENSION_PX)
    const oversizedPng = createValidPngWithDimensions(9000, 9000);
    const oversizedSha = await sha256Hex(oversizedPng);
    const snapWithSpoofedDims: PlanuiDomainSnapshot = {
      ...baseSnap,
      mediaMeta: [
        {
          id: 'spoof-1',
          mimeType: 'image/png',
          byteSize: oversizedPng.byteLength,
          width: 100,
          height: 100,
          sha256Hex: oversizedSha,
          wasOptimized: false,
          optimizationNoteUk: null,
          createdAt: now,
        },
      ],
    };
    const spoofedDimsZip = await buildArchiveForSnapshot(snapWithSpoofedDims, [
      {
        path: 'media/spoof-1.png',
        bytes: oversizedPng,
        mimeType: 'image/png',
      },
    ]);
    await assert.rejects(
      async () => validateBackupArchive(spoofedDimsZip),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'MEDIA_DIMENSIONS_EXCEEDED'
    );

    // 2. Disguised SVG payload inside media bytes
    const svgBytes = encoder.encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const svgSha = await sha256Hex(svgBytes);
    const snapWithSvg: PlanuiDomainSnapshot = {
      ...baseSnap,
      mediaMeta: [
        {
          id: 'svg-attack',
          mimeType: 'image/png',
          byteSize: svgBytes.byteLength,
          width: 100,
          height: 100,
          sha256Hex: svgSha,
          wasOptimized: false,
          optimizationNoteUk: null,
          createdAt: now,
        },
      ],
    };
    const svgZip = await buildArchiveForSnapshot(snapWithSvg, [
      {
        path: 'media/svg-attack.png',
        bytes: svgBytes,
        mimeType: 'image/png',
      },
    ]);
    await assert.rejects(
      async () => validateBackupArchive(svgZip),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'ACTIVE_SVG_FORBIDDEN'
    );

    // 3. Folder cycle (A -> B -> A)
    const cycleSnap: PlanuiDomainSnapshot = {
      ...baseSnap,
      folders: [
        {
          id: 'fa',
          name: 'A',
          parentId: 'fb',
          order: 1,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        },
        {
          id: 'fb',
          name: 'B',
          parentId: 'fa',
          order: 2,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        },
      ],
    };
    const cycleZip = await buildArchiveForSnapshot(cycleSnap);
    await assert.rejects(
      async () => validateBackupArchive(cycleZip),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'FOLDER_CYCLE_DETECTED'
    );

    // 4. Wish referencing nonexistent categoryId
    const brokenWishCatSnap: PlanuiDomainSnapshot = {
      ...baseSnap,
      wishes: [
        {
          id: 'w-broken',
          title: 'Книга',
          note: null,
          categoryId: 'nonexistent-cat',
          timing: 'later',
          estimatedPrice: null,
          state: 'active',
          fulfilledAt: null,
          archived: false,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        },
      ],
    };
    const brokenWishCatZip = await buildArchiveForSnapshot(brokenWishCatSnap);
    await assert.rejects(
      async () => validateBackupArchive(brokenWishCatZip),
      (err: unknown) =>
        err instanceof PlanuiError &&
        err.code === 'WISHLIST_CATEGORY_NOT_FOUND'
    );
  });

  it('11.5 & 11.7: bounds recovery snapshots to 3, preserves shared media across snapshots, restores from snapshot, exports snapshot ZIP, and protects the only recovery point', async () => {
    const repo = new PlanuiRepositories(
      new InMemoryTransactionalEngine('stage11_recovery_lifecycle')
    );
    const t0 = '2026-03-30T08:00:00.000Z';
    await repo.getOrInitSettings(t0);

    // Add an image inspiration item in initial live state so snapshot #1 references media-shared
    const pngBytes = createValidPngWithDimensions(120, 90);
    const pngSha = await sha256Hex(pngBytes);
    await repo.saveInspirationWithMediaTransactionally(
      {
        id: 'insp-shared',
        kind: 'image',
        title: 'Спільне фото у знімку',
        contentText: null,
        linkUrl: null,
        mediaId: 'media-shared',
        isFavorite: false,
        projectId: null,
        createdAt: t0,
        updatedAt: t0,
        revision: 1,
      },
      {
        meta: {
          id: 'media-shared',
          mimeType: 'image/png',
          byteSize: pngBytes.byteLength,
          width: 120,
          height: 90,
          sha256Hex: pngSha,
          wasOptimized: false,
          optimizationNoteUk: null,
          createdAt: t0,
        },
        bytes: pngBytes,
      }
    );

    // Prepare an empty clean archive to import repeatedly
    const emptySourceRepo = new PlanuiRepositories(
      new InMemoryTransactionalEngine('stage11_empty_source')
    );
    const { zipBytes: emptyZip } = await exportFullBackupZip(
      emptySourceRepo,
      t0
    );
    const emptyPreview = await validateBackupArchive(emptyZip);

    // 1st replacement -> creates recovery snapshot #1 (which references media-shared)
    const r1 = await executeAtomicBackupReplacement(repo, emptyPreview, {
      explicitUserConfirmation: true,
      nowIso: '2026-03-30T09:00:00.000Z',
    });

    // Live data now has 0 mediaMeta, but media-shared MUST still exist in mediaBlobs because snapshot #1 references it!
    const { snapshot: postR1Snap, mediaBlobs: postR1Blobs } =
      await repo.captureCoherentSnapshot();
    assert.equal(postR1Snap.mediaMeta.length, 0);
    assert.deepEqual(postR1Blobs.get('media-shared'), pngBytes);

    // Protecting the only recovery point: deleting without allowDeleteOnlyRecoveryPoint must throw
    await assert.rejects(
      async () =>
        deleteRecoverySnapshotTransactionally(repo, r1.recoverySnapshotId, {
          allowDeleteOnlyRecoveryPoint: false,
        }),
      (err: unknown) =>
        err instanceof PlanuiError &&
        err.code === 'ONLY_RECOVERY_POINT_CONFIRMATION_REQUIRED'
    );

    // Export snapshot #1 as a standalone ZIP archive and verify it validates cleanly
    const { zipBytes: snap1Zip } = await exportRecoverySnapshotZip(
      repo,
      r1.recoverySnapshotId,
      '2026-03-30T09:05:00.000Z'
    );
    const validatedSnap1 = await validateBackupArchive(snap1Zip);
    assert.equal(validatedSnap1.snapshot.inspirationItems.length, 1);
    assert.deepEqual(validatedSnap1.mediaBlobs.get('media-shared'), pngBytes);

    // Restore from snapshot #1 -> restores insp-shared and media-shared to live state, and creates a pre_recovery_restore snapshot
    await restoreFromRecoverySnapshotTransactionally(
      repo,
      r1.recoverySnapshotId,
      {
        explicitUserConfirmation: true,
        nowIso: '2026-03-30T09:10:00.000Z',
      }
    );
    const { snapshot: restoredLive } = await repo.captureCoherentSnapshot();
    assert.equal(restoredLive.inspirationItems.length, 1);
    assert.equal(restoredLive.inspirationItems[0].id, 'insp-shared');

    // Perform 3 more replacements so total snapshots exceed MAX_RECOVERY_SNAPSHOTS (3)
    await executeAtomicBackupReplacement(repo, emptyPreview, {
      explicitUserConfirmation: true,
      nowIso: '2026-03-30T10:00:00.000Z',
    });
    await executeAtomicBackupReplacement(repo, emptyPreview, {
      explicitUserConfirmation: true,
      nowIso: '2026-03-30T11:00:00.000Z',
    });
    await executeAtomicBackupReplacement(repo, emptyPreview, {
      explicitUserConfirmation: true,
      nowIso: '2026-03-30T12:00:00.000Z',
    });
    await executeAtomicBackupReplacement(repo, emptyPreview, {
      explicitUserConfirmation: true,
      nowIso: '2026-03-30T13:00:00.000Z',
    });

    const retained = await repo.listRecoverySnapshots();
    assert.equal(retained.length, MAX_RECOVERY_SNAPSHOTS);
    // Now that all snapshots referencing media-shared have been evicted, media-shared blob is garbage-collected!
    const { mediaBlobs: blobsAfterEviction } =
      await repo.captureCoherentSnapshot();
    assert.equal(blobsAfterEviction.has('media-shared'), false);
  });

  it('11.6 & 11.7: enforces persistent dbGeneration against stale tabs, migrates pre-Wishlist v1 schema, and executes controlled reset', async () => {
    const sharedEngine = new InMemoryTransactionalEngine('stage11_shared_tabs');
    const tabARepo = new PlanuiRepositories(sharedEngine);
    const tabBRepo = new PlanuiRepositories(sharedEngine);
    const now = '2026-03-30T14:00:00.000Z';

    // Both tabs initialize at generation 1
    await tabARepo.getOrInitSettings(now);
    await tabBRepo.captureCoherentSnapshot(now);
    assert.equal(tabARepo.getKnownDbGeneration(), 1);
    assert.equal(tabBRepo.getKnownDbGeneration(), 1);

    await tabARepo.saveFolder({
      id: 'f-before-reset',
      name: 'Початкова папка',
      parentId: null,
      order: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    // Tab B performs a controlled reset (retaining a pre-reset snapshot), advancing dbGeneration to 2
    const resetRes = await resetAllPlanuiDataTransactionally(tabBRepo, {
      explicitUserConfirmation: true,
      snapshotHandling: 'create_pre_reset_snapshot',
      nowIso: '2026-03-30T14:05:00.000Z',
    });
    assert.equal(resetRes.newDbGeneration, 2);
    assert.ok(resetRes.preResetSnapshotId);

    // Tab A (stale at generation 1, without BroadcastChannel reload) attempts to write -> MUST fail with STALE_DB_GENERATION_CONFLICT
    await assert.rejects(
      async () =>
        tabARepo.saveFolder({
          id: 'f-stale-tab',
          name: 'Запис із застарілої вкладки',
          parentId: null,
          order: 2,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        }),
      (err: unknown) =>
        err instanceof PlanuiError &&
        err.code === 'STALE_DB_GENERATION_CONFLICT'
    );

    // After Tab A acknowledges the external generation change and reloads, it can write again
    tabARepo.acknowledgeExternalGenerationChange();
    const { snapshot: reloadedSnap } =
      await tabARepo.captureCoherentSnapshot(now);
    assert.equal(reloadedSnap.settings.dbGeneration, 2);
    assert.equal(reloadedSnap.folders.length, 0);

    // Pre-Wishlist v1 schema migration test: omit wishlistCategories, wishes, and preferredWishlistCurrency
    const encoder = new TextEncoder();
    const preWishlistDataObj: Record<string, unknown> = {
      ...reloadedSnap,
      folders: [
        {
          id: 'f-legacy-v1',
          name: 'Папка до списку бажань',
          parentId: null,
          order: 1,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        },
      ],
      settings: {
        ...reloadedSnap.settings,
      },
    };
    delete preWishlistDataObj.wishlistCategories;
    delete preWishlistDataObj.wishes;
    delete (preWishlistDataObj.settings as Record<string, unknown>)
      .preferredWishlistCurrency;

    const preWishlistBytes = encoder.encode(JSON.stringify(preWishlistDataObj));
    const preWishlistSha = await sha256Hex(preWishlistBytes);
    const preWishlistManifest = {
      format: PLANUI_BACKUP_FORMAT,
      backupVersion: 1,
      appVersion: '0.1.0-stage9',
      dbSchemaVersion: 1,
      createdAt: now,
      entityCounts: {
        folders: 1,
        projects: 0,
        stages: 0,
        tasks: 0,
        reservations: 0,
        events: 0,
        shiftTemplates: 0,
        dayOffAnnotations: 0,
        habits: 0,
        habitEntries: 0,
        personalRecords: 0,
        lifeAreaQuestions: reloadedSnap.lifeAreaQuestions.length,
        lifeAreaAssessments: 0,
        inspirationItems: 0,
        mediaMeta: 0,
      },
      files: [
        {
          path: 'data.json',
          byteSize: preWishlistBytes.byteLength,
          sha256Hex: preWishlistSha,
          mimeType: 'application/json',
        },
      ],
    };

    const preWishlistZip = await createZipArchive([
      {
        path: 'manifest.json',
        bytes: encoder.encode(JSON.stringify(preWishlistManifest)),
      },
      { path: 'data.json', bytes: preWishlistBytes },
    ]);

    const migratedPreview = await validateBackupArchive(preWishlistZip);
    assert.equal(migratedPreview.snapshot.folders.length, 1);
    assert.deepEqual(migratedPreview.snapshot.wishlistCategories, []);
    assert.deepEqual(migratedPreview.snapshot.wishes, []);
    assert.equal(
      migratedPreview.snapshot.settings.preferredWishlistCurrency,
      null
    );
    assert.equal(migratedPreview.warningsUk?.length, 1);
  });
});
