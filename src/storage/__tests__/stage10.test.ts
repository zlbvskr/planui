import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENERGY_SCALE_LABELS_UK,
  LIFE_AREA_SCALE_1_10_LABELS_UK,
  MOOD_SCALE_LABELS_UK,
  MediaObjectUrlRegistry,
  PERSONAL_STATE_QUESTIONS_UK,
  STRESS_SCALE_LABELS_UK,
  buildInspirationItemRecord,
  buildLifeAreaAssessmentSnapshot,
  isMediaReferencedByLiveOrSnapshots,
  normalizeSimpleTags,
  parseRasterImageDimensions,
  sortPersonalRecordsChronologically,
  updateLifeAreaQuestionWording,
  updatePersonalRecordInPlace,
  validateAndPrepareRasterMedia,
  validateSafeHttpUrl,
} from '../../domain/personalSpace';
import {
  WISHLIST_TIMING_LABELS_UK,
  buildWishItemRecord,
  computeWishlistCategoryDeleteImpact,
  filterAndGroupWishes,
  formatExactPriceUk,
  fulfillWishItem,
  parseLocalizedPriceInput,
  reopenWishItem,
  setWishArchivedState,
  sortWishlistCategories,
} from '../../domain/wishlist';
import {
  buildInitialCreationContext,
  createInitialDestinationContextMap,
  getContextualCreationActions,
  updateDestinationContext,
} from '../../state/shellStore';
import { InMemoryTransactionalEngine } from '../db';
import { PlanuiRepositories } from '../repositories';
import {
  executeAtomicBackupReplacement,
  exportFullBackupZip,
  validateBackupArchive,
} from '../backup/backupService';

function createTestRepos() {
  const engine = new InMemoryTransactionalEngine();
  const repo = new PlanuiRepositories(engine);
  return { engine, repo };
}

/**
 * Helper to construct a valid minimal PNG byte array with specified width and height
 * in its IHDR chunk so binary header inspection works deterministically in Node tests.
 */
function createMinimalPngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR length: 13 (0x0000000D)
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  // 'IHDR'
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  // Width (big-endian uint32 at offset 16)
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  // Height (big-endian uint32 at offset 20)
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  // Bit depth 8, color type 6 (RGBA)
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

/**
 * Helper to construct a valid minimal JPEG byte array with SOF0 marker and dimensions.
 */
function createMinimalJpegBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x10, // APP0 length 16
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    0xc0, // SOF0 baseline
    0x00,
    0x0b, // length 11
    0x08, // precision
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xd9, // EOI
  ]);
}

/**
 * Helper to construct a valid minimal WebP VP8X byte array with dimensions.
 */
function createMinimalWebpBytes(width: number, height: number): Uint8Array {
  const wMinus1 = width - 1;
  const hMinus1 = height - 1;
  const bytes = new Uint8Array(30);
  // 'RIFF'
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x16, 0x00, 0x00, 0x00], 4);
  // 'WEBP'
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  // 'VP8X'
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  bytes.set([0x0a, 0x00, 0x00, 0x00], 16);
  // 24-bit little-endian width-1 at 24..26, height-1 at 27..29
  bytes[24] = wMinus1 & 0xff;
  bytes[25] = (wMinus1 >>> 8) & 0xff;
  bytes[26] = (wMinus1 >>> 16) & 0xff;
  bytes[27] = hMinus1 & 0xff;
  bytes[28] = (hMinus1 >>> 8) & 0xff;
  bytes[29] = (hMinus1 >>> 16) & 0xff;
  return bytes;
}

describe('Stage 10: Me, Wishlist, Reflection, and Local Media Tests', () => {
  it('10.1 Contextual creation in Me and Wishlist prioritizes wish and wishlist_category appropriately', () => {
    let ctxMap = createInitialDestinationContextMap('2026-04-05');
    assert.equal(ctxMap.me.subView, 'overview');

    const overviewActions = getContextualCreationActions('me', ctxMap);
    assert.equal(overviewActions[0].kind, 'personal_record');
    assert.ok(overviewActions.some((a) => a.kind === 'inspiration'));
    assert.ok(overviewActions.some((a) => a.kind === 'wish'));

    // Switching to wishlist subview prioritizes wish and wishlist_category
    ctxMap = updateDestinationContext(ctxMap, 'me', {
      subView: 'wishlist',
      activeWishlistCategoryId: 'cat-music',
    });
    const wishlistActions = getContextualCreationActions('me', ctxMap);
    assert.equal(wishlistActions[0].kind, 'wish');
    assert.equal(wishlistActions[1].kind, 'wishlist_category');

    const creationCtx = buildInitialCreationContext('me', ctxMap);
    assert.equal(creationCtx.wishlistCategoryId, 'cat-music');
  });

  it('10.2 Personal records: labeled 1-5 scales, explicit stress direction, and in-place text addition without duplication', async () => {
    const { repo } = createTestRepos();

    assert.equal(
      PERSONAL_STATE_QUESTIONS_UK.mood,
      'Як ви почуваєтеся просто зараз?'
    );
    assert.equal(
      PERSONAL_STATE_QUESTIONS_UK.energy,
      'Скільки у вас зараз енергії?'
    );
    assert.equal(
      PERSONAL_STATE_QUESTIONS_UK.stress,
      'Який рівень напруги ви відчуваєте?'
    );
    assert.ok(MOOD_SCALE_LABELS_UK[5].includes('5'));
    assert.ok(ENERGY_SCALE_LABELS_UK[5].includes('5'));
    // High stress (5) is tension, not a positive score
    assert.ok(STRESS_SCALE_LABELS_UK[1].includes('Спокійно'));
    assert.ok(STRESS_SCALE_LABELS_UK[5].includes('напруга'));

    // 1. Save quick state record (mood/energy/stress only, no text yet)
    const stateRecord = await repo.savePersonalRecord({
      id: 'rec-1',
      recordedAt: '2026-04-05T08:30:00.000Z',
      localDate: '2026-04-05',
      zoneId: 'Europe/Kyiv',
      text: null,
      mood: 4,
      energy: 3,
      stress: 2,
      tags: normalizeSimpleTags(['ранок', 'Ранок', ' #зміна ']),
      createdAt: '2026-04-05T08:30:00.000Z',
      updatedAt: '2026-04-05T08:30:00.000Z',
      revision: 1,
    });
    assert.deepEqual(stateRecord.tags, ['ранок', 'зміна']);

    // 2. Add journal text to the existing state record in-place — must NOT duplicate it
    const updatedWithText = updatePersonalRecordInPlace(
      stateRecord,
      {
        text: 'Спокійний ранок після зміни, додав нотатку до цього ж запису.',
      },
      '2026-04-05T09:00:00.000Z'
    );
    await repo.savePersonalRecord(updatedWithText);

    // 3. Add a second record on the same day (multiple daily records supported)
    await repo.savePersonalRecord({
      id: 'rec-2',
      recordedAt: '2026-04-05T20:15:00.000Z',
      localDate: '2026-04-05',
      zoneId: 'Europe/Kyiv',
      text: 'Вечірній запис у щоденник.',
      mood: null,
      energy: null,
      stress: null,
      tags: ['вечір'],
      createdAt: '2026-04-05T20:15:00.000Z',
      updatedAt: '2026-04-05T20:15:00.000Z',
      revision: 1,
    });

    const { snapshot: snap1 } = await repo.captureCoherentSnapshot();
    assert.equal(snap1.personalRecords.length, 2);
    const sorted = sortPersonalRecordsChronologically(snap1.personalRecords);
    assert.equal(sorted[0].id, 'rec-2');
    assert.equal(sorted[1].id, 'rec-1');
    assert.equal(
      sorted[1].text,
      'Спокійний ранок після зміни, додав нотатку до цього ж запису.'
    );
    assert.equal(sorted[1].mood, 4);
    assert.equal(sorted[1].revision, 2);

    // 4. Delete one record transactionally
    await repo.deletePersonalRecordTransactionally('rec-2');
    const { snapshot: snap2 } = await repo.captureCoherentSnapshot();
    assert.equal(snap2.personalRecords.length, 1);
    assert.equal(snap2.personalRecords[0].id, 'rec-1');
  });

  it('10.3 Life areas: 8 Ukrainian questions, partial assessments, and question wording edits preserving historical snapshots', async () => {
    const { repo } = createTestRepos();

    const { snapshot: initSnap } = await repo.captureCoherentSnapshot();
    const questions = initSnap.lifeAreaQuestions;
    assert.equal(questions.length, 8);
    assert.ok(LIFE_AREA_SCALE_1_10_LABELS_UK[10].includes('10'));

    const firstQ = questions[0];
    const originalWording = firstQ.questionTextUk;
    assert.equal(firstQ.version, 1);

    // 1. Create a partial assessment (only 3 of 8 questions scored, others null)
    const assessment1 = buildLifeAreaAssessmentSnapshot({
      id: 'assess-1',
      periodStartLocalDate: '2026-03-30',
      periodEndLocalDate: '2026-04-05',
      questions,
      scoresByQuestionId: {
        [questions[0].id]: 8,
        [questions[2].id]: 6,
        [questions[5].id]: 7,
      },
      notesByQuestionId: {
        [questions[0].id]: 'Часткова оцінка тижня',
      },
      nowIso: '2026-04-05T18:00:00.000Z',
    });
    await repo.saveLifeAreaAssessment(assessment1);

    assert.equal(assessment1.answers.length, 8);
    assert.equal(assessment1.answers[0].score, 8);
    assert.equal(assessment1.answers[1].score, null);
    assert.equal(assessment1.answers[0].questionTextSnapshotUk, originalWording);
    assert.equal(assessment1.answers[0].questionVersionSnapshot, 1);

    // 2. Edit wording of question 0 -> increments version to 2
    const updatedQ0 = updateLifeAreaQuestionWording(
      firstQ,
      'Оновлене формулювання про фізичне самопочуття за тиждень?',
      '2026-04-06T10:00:00.000Z'
    );
    assert.equal(updatedQ0.version, 2);
    await repo.saveLifeAreaQuestion(updatedQ0);

    // 3. Verify historical assessment1 still preserves v1 wording and score
    const { snapshot: afterEditSnap } = await repo.captureCoherentSnapshot();
    const savedAssessments = afterEditSnap.lifeAreaAssessments;
    assert.equal(savedAssessments.length, 1);
    assert.equal(
      savedAssessments[0].answers[0].questionTextSnapshotUk,
      originalWording
    );
    assert.equal(savedAssessments[0].answers[0].questionVersionSnapshot, 1);

    // 4. New assessment captures v2 wording
    const updatedQuestions = afterEditSnap.lifeAreaQuestions;
    const assessment2 = buildLifeAreaAssessmentSnapshot({
      id: 'assess-2',
      periodStartLocalDate: '2026-04-06',
      periodEndLocalDate: '2026-04-12',
      questions: updatedQuestions,
      scoresByQuestionId: { [questions[0].id]: 9 },
      nowIso: '2026-04-12T18:00:00.000Z',
    });
    assert.equal(
      assessment2.answers[0].questionTextSnapshotUk,
      'Оновлене формулювання про фізичне самопочуття за тиждень?'
    );
    assert.equal(assessment2.answers[0].questionVersionSnapshot, 2);
  });

  it('10.4 Inspiration & Media: validates safe HTTP/HTTPS links, parses PNG/JPEG/WebP binary headers, rejects SVG/oversized media, unlinks on project delete, and respects snapshot media references', async () => {
    const { repo } = createTestRepos();

    // 1. Safe HTTP/HTTPS URL validation
    assert.equal(
      validateSafeHttpUrl('https://example.com/article?id=1'),
      'https://example.com/article?id=1'
    );
    assert.throws(
      () => validateSafeHttpUrl('javascript:alert(1)'),
      /HTTP або HTTPS/
    );
    assert.throws(
      () => validateSafeHttpUrl('data:text/html,<script>alert(1)</script>'),
      /HTTP або HTTPS/
    );

    // 2. Reject active SVG payloads (both by MIME and by XML/SVG content)
    const svgBytes = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    );
    await assert.rejects(
      () =>
        validateAndPrepareRasterMedia({
          id: 'svg-1',
          bytes: svgBytes,
          declaredMimeType: 'image/svg+xml',
          nowIso: '2026-04-05T10:00:00.000Z',
        }),
      /SVG/
    );
    await assert.rejects(
      () =>
        validateAndPrepareRasterMedia({
          id: 'svg-disguised',
          bytes: svgBytes,
          declaredMimeType: 'image/png',
          nowIso: '2026-04-05T10:00:00.000Z',
        }),
      /SVG/
    );

    // 3. Validate PNG, JPEG, and WebP binary headers and dimensions
    const pngBytes = createMinimalPngBytes(640, 480);
    const pngInfo = parseRasterImageDimensions(pngBytes, 'image/png');
    assert.deepEqual(pngInfo, {
      width: 640,
      height: 480,
    });

    const jpegBytes = createMinimalJpegBytes(800, 600);
    const jpegInfo = parseRasterImageDimensions(jpegBytes, 'image/jpeg');
    assert.deepEqual(jpegInfo, {
      width: 800,
      height: 600,
    });

    const webpBytes = createMinimalWebpBytes(1024, 768);
    const webpInfo = parseRasterImageDimensions(webpBytes, 'image/webp');
    assert.deepEqual(webpInfo, {
      width: 1024,
      height: 768,
    });

    // Reject oversized dimensions (> 8192 px)
    const hugePng = createMinimalPngBytes(9000, 1000);
    await assert.rejects(
      () =>
        validateAndPrepareRasterMedia({
          id: 'huge-png',
          bytes: hugePng,
          declaredMimeType: 'image/png',
          nowIso: '2026-04-05T10:00:00.000Z',
        }),
      /перевищують безпечні ліміти/
    );

    // 4. Temporary Object URL registry creates and revokes URLs cleanly
    const revokedUrls: string[] = [];
    const registry = new MediaObjectUrlRegistry(
      () => `blob:test-${Math.random().toString(36).slice(2, 7)}`,
      (url) => revokedUrls.push(url)
    );
    const url1 = registry.getOrCreateUrl('m1', pngBytes, 'image/png');
    const url1Again = registry.getOrCreateUrl('m1', pngBytes, 'image/png');
    assert.equal(url1, url1Again);
    assert.equal(registry.activeCount, 1);
    registry.revokeAll();
    assert.equal(registry.activeCount, 0);
    assert.equal(revokedUrls.length, 1);

    // 5. Save project, media asset, and linked inspiration item
    await repo.saveProject({
      id: 'proj-insp',
      title: 'Альбом',
      description: null,
      desiredOutcome: 'Записати демо',
      completionCriteria: null,
      targetDate: null,
      folderId: null,
      lifeAreaId: null,
      collaboratorText: null,
      state: 'active',
      archived: false,
      createdAt: '2026-04-05T10:00:00.000Z',
      updatedAt: '2026-04-05T10:00:00.000Z',
      completedAt: null,
      revision: 1,
    });

    const preparedPng = await validateAndPrepareRasterMedia({
      id: 'media-png-1',
      bytes: pngBytes,
      declaredMimeType: 'image/png',
      wasOptimized: true,
      originalWidth: 1280,
      originalHeight: 960,
      nowIso: '2026-04-05T10:00:00.000Z',
    });
    assert.equal(preparedPng.meta.wasOptimized, true);
    assert.ok(preparedPng.meta.optimizationNoteUk?.includes('оптимізовано'));

    const inspItem = buildInspirationItemRecord({
      id: 'insp-1',
      kind: 'image',
      title: 'Обкладинка',
      contentText: 'Ідея кольорів',
      linkUrl: null,
      mediaId: 'media-png-1',
      isFavorite: true,
      projectId: 'proj-insp',
      nowIso: '2026-04-05T10:05:00.000Z',
    });
    await repo.saveInspirationWithMediaTransactionally(inspItem, preparedPng);

    // 6. Deleting the project unlinks inspiration item instead of deleting it
    const delProjRes = await repo.deleteProjectTransactionally(
      'proj-insp',
      'delete_tasks',
      '2026-04-05T10:10:00.000Z'
    );
    assert.equal(delProjRes.unlinkedInspirationCount, 1);

    const { snapshot: afterProjDelSnap } = await repo.captureCoherentSnapshot();
    assert.equal(afterProjDelSnap.inspirationItems.length, 1);
    assert.equal(afterProjDelSnap.inspirationItems[0].projectId, null);

    // 7. Verify media reference retention across recovery snapshots:
    // Export and re-import so a recovery snapshot referencing media-png-1 is created
    const { zipBytes } = await exportFullBackupZip(repo);
    const preview = await validateBackupArchive(zipBytes);
    await executeAtomicBackupReplacement(repo, preview, {
      explicitUserConfirmation: true,
    });

    const recoverySnaps = await repo.listRecoverySnapshots();
    assert.equal(recoverySnaps.length, 1);
    assert.equal(
      isMediaReferencedByLiveOrSnapshots('media-png-1', [], recoverySnaps),
      true
    );

    // Deleting the live inspiration item must keep media-png-1 because the recovery snapshot still references it!
    const delRes = await repo.deleteInspirationItemTransactionally('insp-1');
    assert.equal(delRes.deletedMediaAsset, false);

    const { snapshot: afterInspDelSnap } = await repo.captureCoherentSnapshot();
    assert.equal(afterInspDelSnap.inspirationItems.length, 0);
    assert.equal(afterInspDelSnap.mediaMeta.length, 1);
  });

  it('10.5 - 10.7 Wishlist, Flat Categories, and Exact Price Handling', async () => {
    const { repo } = createTestRepos();

    // Verify Ukrainian timing labels
    assert.deepEqual(WISHLIST_TIMING_LABELS_UK, {
      now: 'Зараз',
      later: 'Пізніше',
      someday: 'Колись',
    });

    // 1. Exact price parsing & formatting (missing vs zero vs localized decimal, currency precision)
    assert.equal(formatExactPriceUk(null), null);

    const zeroUah = parseLocalizedPriceInput('0', 'UAH');
    assert.deepEqual(zeroUah, {
      amountMinor: 0,
      currency: 'UAH',
      amountDecimal: '0.00',
    });
    assert.ok(formatExactPriceUk(zeroUah)?.includes('0,00'));
    assert.ok(formatExactPriceUk(zeroUah)?.includes('UAH'));

    const decimalUah = parseLocalizedPriceInput('1 250,50', 'UAH');
    assert.deepEqual(decimalUah, {
      amountMinor: 125050,
      currency: 'UAH',
      amountDecimal: '1250.50',
    });
    assert.ok(formatExactPriceUk(decimalUah)?.includes('250,50'));

    // JPY has 0 decimals
    const jpyPrice = parseLocalizedPriceInput('15000', 'JPY');
    assert.deepEqual(jpyPrice, {
      amountMinor: 15000,
      currency: 'JPY',
      amountDecimal: '15000',
    });
    assert.throws(() => parseLocalizedPriceInput('150,50', 'JPY'));

    // Reject negative, malformed, or >2 decimal inputs
    assert.throws(() => parseLocalizedPriceInput('-10', 'UAH'));
    assert.throws(() => parseLocalizedPriceInput('12,345', 'UAH'));
    assert.throws(() => parseLocalizedPriceInput('abc', 'UAH'));

    // 2. Title-only wish creation requires NO currency onboarding and defaults to 'later' ("Пізніше")
    const titleOnlyBuilt = buildWishItemRecord({
      id: 'wish-title-only',
      title: 'Вініловий програвач',
      nowIso: '2026-04-05T11:00:00.000Z',
    });
    assert.equal(titleOnlyBuilt.wish.timing, 'later');
    assert.equal(titleOnlyBuilt.wish.estimatedPrice, null);
    assert.equal(titleOnlyBuilt.explicitCurrencySelected, null);
    await repo.saveWishItem(titleOnlyBuilt.wish);

    // 3. Entering a price when no preferred currency exists requires explicit currency selection
    assert.throws(
      () =>
        buildWishItemRecord({
          id: 'wish-missing-curr',
          title: 'Синтезатор',
          rawPriceAmount: '24500',
          currencyCode: null,
          preferredCurrency: null,
          nowIso: '2026-04-05T11:05:00.000Z',
        }),
      /необхідно вказати код валюти/
    );

    // Providing explicit currency when no preference exists signals saving preferredWishlistCurrency
    const pricedUahBuilt = buildWishItemRecord({
      id: 'wish-synth',
      title: 'Синтезатор',
      rawPriceAmount: '24 500,00',
      currencyCode: 'UAH',
      preferredCurrency: null,
      timing: 'now',
      nowIso: '2026-04-05T11:05:00.000Z',
    });
    assert.equal(pricedUahBuilt.explicitCurrencySelected, 'UAH');
    await repo.saveWishItem(pricedUahBuilt.wish);
    await repo.updateSettingsPatch({
      preferredWishlistCurrency: pricedUahBuilt.explicitCurrencySelected,
    });

    // 4. Changing preferredWishlistCurrency later affects future defaults ONLY and never relabels existing wishes
    await repo.updateSettingsPatch({ preferredWishlistCurrency: 'EUR' });
    const futureWishBuilt = buildWishItemRecord({
      id: 'wish-eur-default',
      title: 'Квитки на концерт',
      rawPriceAmount: '85,50',
      currencyCode: null,
      preferredCurrency: 'EUR',
      timing: 'someday',
      nowIso: '2026-04-05T11:10:00.000Z',
    });
    assert.equal(futureWishBuilt.wish.estimatedPrice?.currency, 'EUR');
    await repo.saveWishItem(futureWishBuilt.wish);

    const { snapshot: snapCurr } = await repo.captureCoherentSnapshot();
    const synthWish = snapCurr.wishes.find((w) => w.id === 'wish-synth')!;
    assert.equal(synthWish.estimatedPrice?.currency, 'UAH');
    assert.equal(synthWish.estimatedPrice?.amountMinor, 2450000);

    // 5. Flat categories: create, rename, reorder, and delete (defaulting wishes to uncategorized)
    await repo.saveWishlistCategory({
      id: 'cat-music',
      name: 'Музика',
      order: 0,
      createdAt: '2026-04-05T11:15:00.000Z',
      updatedAt: '2026-04-05T11:15:00.000Z',
      revision: 1,
    });
    await repo.saveWishlistCategory({
      id: 'cat-travel',
      name: 'Подорожі',
      order: 1,
      createdAt: '2026-04-05T11:16:00.000Z',
      updatedAt: '2026-04-05T11:16:00.000Z',
      revision: 1,
    });

    // Assign wish-synth to cat-music
    await repo.saveWishItem({
      ...synthWish,
      categoryId: 'cat-music',
      updatedAt: '2026-04-05T11:17:00.000Z',
      revision: synthWish.revision + 1,
    });

    // Reorder categories
    await repo.reorderWishlistCategoriesTransactionally(
      ['cat-travel', 'cat-music'],
      '2026-04-05T11:18:00.000Z'
    );
    const { snapshot: snapCats } = await repo.captureCoherentSnapshot();
    const reorderedCats = sortWishlistCategories(snapCats.wishlistCategories);
    assert.deepEqual(
      reorderedCats.map((c) => c.id),
      ['cat-travel', 'cat-music']
    );

    // Filtering: virtual 'all', 'uncategorized', and specific category without duplicates
    const allWishesNow = snapCats.wishes;
    const allGrouped = filterAndGroupWishes({
      wishes: allWishesNow,
      categoryFilter: 'all',
      timingFilter: 'all',
      viewScope: 'active',
    });
    assert.equal(allGrouped.totalMatchingCount, 3);
    assert.equal(allGrouped.byTiming.now.length, 1);
    assert.equal(allGrouped.byTiming.later.length, 1);
    assert.equal(allGrouped.byTiming.someday.length, 1);

    const uncatGrouped = filterAndGroupWishes({
      wishes: allWishesNow,
      categoryFilter: 'uncategorized',
      timingFilter: 'all',
      viewScope: 'active',
    });
    assert.equal(uncatGrouped.totalMatchingCount, 2);

    // Delete cat-music -> wish-synth becomes uncategorized, never deleted
    const impact = computeWishlistCategoryDeleteImpact(
      'cat-music',
      allWishesNow
    );
    assert.equal(impact.affectedWishesCount, 1);

    const delCatRes = await repo.deleteWishlistCategoryTransactionally(
      'cat-music',
      '2026-04-05T11:20:00.000Z'
    );
    assert.equal(delCatRes.reassignedWishesCount, 1);

    const { snapshot: snapAfterCatDel } = await repo.captureCoherentSnapshot();
    const wishesAfterCatDelete = snapAfterCatDel.wishes;
    assert.equal(wishesAfterCatDelete.length, 3);
    assert.equal(
      wishesAfterCatDelete.find((w) => w.id === 'wish-synth')?.categoryId,
      null
    );

    // 6. Fulfill, reopen, and archive preserve price and timing without creating tasks/events
    const latestSynth = wishesAfterCatDelete.find(
      (w) => w.id === 'wish-synth'
    )!;
    const fulfilledSynth = fulfillWishItem(
      latestSynth,
      '2026-04-05T12:00:00.000Z'
    );
    assert.equal(fulfilledSynth.state, 'fulfilled');
    assert.equal(fulfilledSynth.fulfilledAt, '2026-04-05T12:00:00.000Z');
    assert.deepEqual(fulfilledSynth.estimatedPrice, latestSynth.estimatedPrice);
    await repo.saveWishItem(fulfilledSynth);

    // Active scope excludes fulfilled wish
    const { snapshot: snapAfterFulfill } = await repo.captureCoherentSnapshot();
    const activeAfterFulfill = filterAndGroupWishes({
      wishes: snapAfterFulfill.wishes,
      categoryFilter: 'all',
      timingFilter: 'all',
      viewScope: 'active',
    });
    assert.equal(activeAfterFulfill.totalMatchingCount, 2);

    // Reopen restores active state without changing timing or price
    const reopenedSynth = reopenWishItem(
      fulfilledSynth,
      '2026-04-05T12:05:00.000Z'
    );
    assert.equal(reopenedSynth.state, 'active');
    assert.equal(reopenedSynth.fulfilledAt, null);
    assert.equal(reopenedSynth.timing, 'now');
    assert.deepEqual(reopenedSynth.estimatedPrice, latestSynth.estimatedPrice);

    // Archive preserves state and content
    const archivedSynth = setWishArchivedState(
      reopenedSynth,
      true,
      '2026-04-05T12:10:00.000Z'
    );
    await repo.saveWishItem(archivedSynth);
    const { snapshot: snapAfterArchive } = await repo.captureCoherentSnapshot();
    const archivedGroup = filterAndGroupWishes({
      wishes: snapAfterArchive.wishes,
      categoryFilter: 'all',
      timingFilter: 'all',
      viewScope: 'archived',
    });
    assert.equal(archivedGroup.totalMatchingCount, 1);

    // Verify zero tasks, reservations, or calendar events were created by Wishlist operations
    assert.equal(snapAfterArchive.tasks.length, 0);
    assert.equal(snapAfterArchive.reservations.length, 0);
    assert.equal(snapAfterArchive.events.length, 0);
  });

  it('10.9 Full ZIP backup round-trip preserves personal records, life areas, inspiration, binary raster media, wishlist categories, wishes, exact prices, and preferred currency', async () => {
    const { repo: sourceRepo } = createTestRepos();
    const { repo: targetRepo } = createTestRepos();

    const nowIso = '2026-04-05T14:00:00.000Z';

    // 1. Populate source database with Stage 10 entities + binary raster media
    await sourceRepo.updateSettingsPatch({
      preferredWishlistCurrency: 'UAH',
    });

    await sourceRepo.savePersonalRecord({
      id: 'rec-zip-1',
      recordedAt: nowIso,
      localDate: '2026-04-05',
      zoneId: 'Europe/Kyiv',
      text: 'Запис для перевірки резервної копії',
      mood: 5,
      energy: 4,
      stress: 1,
      tags: ['бекап'],
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    });

    const { snapshot: srcInitSnap } =
      await sourceRepo.captureCoherentSnapshot();
    const questions = srcInitSnap.lifeAreaQuestions;
    const editedQ = updateLifeAreaQuestionWording(
      questions[0],
      'Власне формулювання питання сфери життя?',
      nowIso
    );
    await sourceRepo.saveLifeAreaQuestion(editedQ);

    const { snapshot: srcAfterQSnap } =
      await sourceRepo.captureCoherentSnapshot();
    const updatedQuestions = srcAfterQSnap.lifeAreaQuestions;
    const assessment = buildLifeAreaAssessmentSnapshot({
      id: 'assess-zip-1',
      periodStartLocalDate: '2026-03-30',
      periodEndLocalDate: '2026-04-05',
      questions: updatedQuestions,
      scoresByQuestionId: { [editedQ.id]: 9 },
      notesByQuestionId: { [editedQ.id]: 'Огляд збережено в архів' },
      nowIso,
    });
    await sourceRepo.saveLifeAreaAssessment(assessment);

    const pngBytes = createMinimalPngBytes(320, 240);
    const preparedMedia = await validateAndPrepareRasterMedia({
      id: 'media-zip-png',
      bytes: pngBytes,
      declaredMimeType: 'image/png',
      nowIso,
    });

    const inspItem = buildInspirationItemRecord({
      id: 'insp-zip-1',
      kind: 'image',
      title: 'Візуальний референс',
      contentText: 'Збережено разом із бінарним PNG',
      linkUrl: null,
      mediaId: 'media-zip-png',
      isFavorite: true,
      projectId: null,
      nowIso,
    });
    await sourceRepo.saveInspirationWithMediaTransactionally(
      inspItem,
      preparedMedia
    );

    await sourceRepo.saveWishlistCategory({
      id: 'wcat-zip-1',
      name: 'Студія',
      order: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    });

    const builtWish = buildWishItemRecord({
      id: 'wish-zip-1',
      title: 'Аудіоінтерфейс',
      note: '2 канали, USB-C',
      categoryId: 'wcat-zip-1',
      timing: 'now',
      rawPriceAmount: '8 999,95',
      currencyCode: 'UAH',
      preferredCurrency: 'UAH',
      nowIso,
    });
    const fulfilledWish = fulfillWishItem(builtWish.wish, nowIso);
    await sourceRepo.saveWishItem(fulfilledWish);

    // 2. Export full ZIP archive
    const { zipBytes, manifest } = await exportFullBackupZip(sourceRepo);
    assert.equal(manifest.entityCounts.personalRecords, 1);
    assert.equal(manifest.entityCounts.lifeAreaAssessments, 1);
    assert.equal(manifest.entityCounts.inspirationItems, 1);
    assert.equal(manifest.entityCounts.mediaMeta, 1);
    assert.equal(manifest.entityCounts.wishlistCategories, 1);
    assert.equal(manifest.entityCounts.wishes, 1);

    // 3. Validate archive and replace into targetRepo
    const preview = await validateBackupArchive(zipBytes);
    await executeAtomicBackupReplacement(targetRepo, preview, {
      explicitUserConfirmation: true,
    });

    // 4. Verify restored data and binary media bytes
    const { snapshot: restored, mediaBlobs: restoredBlobs } =
      await targetRepo.captureCoherentSnapshot();

    assert.equal(restored.settings.preferredWishlistCurrency, 'UAH');
    assert.equal(restored.personalRecords.length, 1);
    assert.equal(restored.personalRecords[0].mood, 5);
    assert.equal(restored.personalRecords[0].stress, 1);

    assert.equal(restored.lifeAreaAssessments.length, 1);
    assert.equal(
      restored.lifeAreaAssessments[0].answers[0].questionTextSnapshotUk,
      'Власне формулювання питання сфери життя?'
    );
    assert.equal(
      restored.lifeAreaAssessments[0].answers[0].questionVersionSnapshot,
      2
    );

    assert.equal(restored.inspirationItems.length, 1);
    assert.equal(restored.mediaMeta.length, 1);
    assert.equal(restored.mediaMeta[0].width, 320);
    assert.equal(restored.mediaMeta[0].height, 240);
    const restoredPng = restoredBlobs.get('media-zip-png');
    assert.ok(restoredPng);
    assert.deepEqual(Array.from(restoredPng), Array.from(pngBytes));

    assert.equal(restored.wishlistCategories.length, 1);
    assert.equal(restored.wishlistCategories[0].name, 'Студія');

    assert.equal(restored.wishes.length, 1);
    assert.equal(restored.wishes[0].title, 'Аудіоінтерфейс');
    assert.equal(restored.wishes[0].state, 'fulfilled');
    assert.equal(restored.wishes[0].timing, 'now');
    assert.deepEqual(restored.wishes[0].estimatedPrice, {
      amountMinor: 899995,
      currency: 'UAH',
      amountDecimal: '8999.95',
    });
  });
});
