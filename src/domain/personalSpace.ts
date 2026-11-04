import { PlanuiError } from '../i18n/errorsUk';
import { sha256Hex } from '../storage/backup/zipCodec';
import {
  EntityId,
  InspirationItem,
  InspirationKind,
  IsoInstantString,
  LifeAreaAnswerItem,
  LifeAreaAssessment,
  LifeAreaQuestion,
  LocalDateString,
  MediaAssetMeta,
  PersonalRecord,
  RecoverySnapshotRecord,
  Scale1To10,
  Scale1To5,
  SupportedMediaMimeType,
} from './types';
import {
  MAX_MEDIA_DECODED_PIXELS,
  MAX_MEDIA_DIMENSION_PX,
  MAX_SINGLE_MEDIA_BYTES,
  sniffMediaMagicBytes,
  validateInspirationItemRecord,
  validateLifeAreaAssessment,
  validateLifeAreaQuestion,
  validatePersonalRecord,
} from './validation';

/**
 * 10.2 / C15: Natural Ukrainian questions and labeled 1-5 scales for Personal Records.
 * High stress (4-5) is explicitly high tension, never treated as a positive score.
 * No diagnosis, causation, or composite psychological score.
 */
export const PERSONAL_STATE_QUESTIONS_UK = {
  mood: 'Як ви почуваєтеся просто зараз?',
  energy: 'Скільки у вас зараз енергії?',
  stress: 'Який рівень напруги ви відчуваєте?',
  stressDirectionNotice:
    'Шкала напруги: 1 означає спокій і відсутність напруги, 5 — сильну напругу. Високе значення напруги не є позитивним показником.',
} as const;

export const MOOD_SCALE_LABELS_UK: Record<Scale1To5, string> = {
  1: '1 — Дуже важко',
  2: '2 — Непросто',
  3: '3 — Нейтрально',
  4: '4 — Добре',
  5: '5 — Спокійно й добре',
};

export const ENERGY_SCALE_LABELS_UK: Record<Scale1To5, string> = {
  1: '1 — Виснаження',
  2: '2 — Мало сил',
  3: '3 — Помірно',
  4: '4 — Достатньо сил',
  5: '5 — Бадьоро',
};

export const STRESS_SCALE_LABELS_UK: Record<Scale1To5, string> = {
  1: '1 — Спокійно (без напруги)',
  2: '2 — Легка напруга',
  3: '3 — Помірна напруга',
  4: '4 — Помітна напруга',
  5: '5 — Сильна напруга',
};

export const LIFE_AREA_SCALE_1_10_LABELS_UK: Record<Scale1To10, string> = {
  1: '1 — Дуже низько',
  2: '2 — Низько',
  3: '3 — Суттєво бракує',
  4: '4 — Нижче бажаного',
  5: '5 — Помірно',
  6: '6 — Прийнятно',
  7: '7 — Добре',
  8: '8 — Впевнено добре',
  9: '9 — Дуже добре',
  10: '10 — Повністю достатньо',
};

export function normalizeSimpleTags(rawTags: string | readonly string[]): string[] {
  const parts =
    typeof rawTags === 'string'
      ? rawTags.split(/[,;#]+/)
      : Array.from(rawTags);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const cleaned = part.trim().replace(/^#+/, '').trim();
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(cleaned);
    }
  }
  return result;
}

/**
 * 10.2: Quick state and journal feed one history.
 * Adding text or updating scales on an existing state record updates it in-place without duplicating it.
 */
export function updatePersonalRecordInPlace(
  existing: PersonalRecord,
  patch: {
    text?: string | null;
    mood?: Scale1To5 | null;
    energy?: Scale1To5 | null;
    stress?: Scale1To5 | null;
    tags?: readonly string[];
    localDate?: LocalDateString;
  },
  nowIso: IsoInstantString
): PersonalRecord {
  const nextText =
    patch.text !== undefined
      ? patch.text && patch.text.trim().length > 0
        ? patch.text.trim()
        : null
      : existing.text;

  const updated: PersonalRecord = {
    ...existing,
    localDate: patch.localDate ?? existing.localDate,
    text: nextText,
    mood: patch.mood !== undefined ? patch.mood : existing.mood,
    energy: patch.energy !== undefined ? patch.energy : existing.energy,
    stress: patch.stress !== undefined ? patch.stress : existing.stress,
    tags:
      patch.tags !== undefined
        ? normalizeSimpleTags(patch.tags)
        : existing.tags,
    updatedAt: nowIso,
    revision: existing.revision + 1,
  };

  return validatePersonalRecord(updated);
}

export function sortPersonalRecordsChronologically(
  records: readonly PersonalRecord[]
): PersonalRecord[] {
  return [...records].sort((a, b) => {
    const dateCmp = b.localDate.localeCompare(a.localDate);
    if (dateCmp !== 0) return dateCmp;
    return b.recordedAt.localeCompare(a.recordedAt);
  });
}

/**
 * 10.3: Editable Ukrainian life-area questions.
 * Editing a question increments its version so historical assessments retain their exact snapshot wording and version.
 */
export function updateLifeAreaQuestionWording(
  existing: LifeAreaQuestion,
  nextQuestionTextUk: string,
  nowIso: IsoInstantString
): LifeAreaQuestion {
  const trimmed = nextQuestionTextUk.trim();
  if (!trimmed) {
    throw new PlanuiError('REQUIRED_TITLE');
  }
  const changed = trimmed !== existing.questionTextUk;
  const updated: LifeAreaQuestion = {
    ...existing,
    questionTextUk: trimmed,
    version: changed ? existing.version + 1 : existing.version,
    updatedAt: nowIso,
    revision: existing.revision + 1,
  };
  return validateLifeAreaQuestion(updated);
}

/**
 * 10.3: Build a LifeAreaAssessment supporting partial answers and preserving
 * question wording and version snapshots at the moment of recording.
 * Never computes a total/overall life score.
 */
export function buildLifeAreaAssessmentSnapshot(params: {
  id: EntityId;
  periodStartLocalDate: LocalDateString;
  periodEndLocalDate: LocalDateString;
  questions: readonly LifeAreaQuestion[];
  scoresByQuestionId: Readonly<Record<EntityId, Scale1To10 | null | undefined>>;
  notesByQuestionId?: Readonly<Record<EntityId, string | null | undefined>>;
  nowIso: IsoInstantString;
}): LifeAreaAssessment {
  if (params.periodEndLocalDate < params.periodStartLocalDate) {
    throw new PlanuiError(
      'VALIDATION_FAILED',
      'Кінцева дата періоду оцінювання не може бути раніше за початкову'
    );
  }

  const orderedQuestions = [...params.questions].sort(
    (a, b) => a.order - b.order
  );

  const answers: LifeAreaAnswerItem[] = orderedQuestions.map((q) => {
    const rawScore = params.scoresByQuestionId[q.id] ?? null;
    const rawNote = params.notesByQuestionId?.[q.id];
    return {
      questionId: q.id,
      questionTextSnapshotUk: q.questionTextUk,
      questionVersionSnapshot: q.version,
      score: rawScore,
      note: rawNote && rawNote.trim().length > 0 ? rawNote.trim() : null,
    };
  });

  const assessment: LifeAreaAssessment = {
    id: params.id,
    recordedAt: params.nowIso,
    periodStartLocalDate: params.periodStartLocalDate,
    periodEndLocalDate: params.periodEndLocalDate,
    answers,
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
    revision: 1,
  };

  return validateLifeAreaAssessment(assessment);
}

/**
 * 10.4: Binary raster header dimension parser for JPEG, PNG, and WebP.
 * Validates actual binary structure and extracts exact pixel width & height
 * deterministically in both Node and browser environments.
 */
export function parseRasterImageDimensions(
  bytes: Uint8Array,
  mimeType: SupportedMediaMimeType
): { width: number; height: number } {
  if (mimeType === 'image/png') {
    // PNG IHDR chunk starts at byte 8 (length 4, 'IHDR' 4, width 4 big-endian at offset 16, height 4 big-endian at offset 20)
    if (bytes.byteLength < 24) {
      throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'PNG header too short');
    }
    const ihdrTag = String.fromCharCode(
      bytes[12],
      bytes[13],
      bytes[14],
      bytes[15]
    );
    if (ihdrTag !== 'IHDR') {
      throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Missing PNG IHDR');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    if (width <= 0 || height <= 0) {
      throw new PlanuiError('MEDIA_DIMENSIONS_EXCEEDED', `${width}x${height}`);
    }
    return { width, height };
  }

  if (mimeType === 'image/webp') {
    if (bytes.byteLength < 30) {
      throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'WebP header too short');
    }
    const chunkFourCC = String.fromCharCode(
      bytes[12],
      bytes[13],
      bytes[14],
      bytes[15]
    );
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (chunkFourCC === 'VP8X') {
      // Extended WebP: 24-bit width - 1 at offset 24, 24-bit height - 1 at offset 27
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }
    if (chunkFourCC === 'VP8 ') {
      // Lossy WebP: frame tag at 20..22, start code 0x9d 0x01 0x2a at 23..25, 16-bit LE width/height at 26..29
      if (
        bytes[23] !== 0x9d ||
        bytes[24] !== 0x01 ||
        bytes[25] !== 0x2a
      ) {
        throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Invalid VP8 frame');
      }
      const width = view.getUint16(26, true) & 0x3fff;
      const height = view.getUint16(28, true) & 0x3fff;
      return { width, height };
    }
    if (chunkFourCC === 'VP8L') {
      // Lossless WebP: signature 0x2f at offset 20, packed 14-bit width-1 and height-1 at 21..24
      if (bytes[20] !== 0x2f) {
        throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Invalid VP8L signature');
      }
      const b0 = bytes[21];
      const b1 = bytes[22];
      const b2 = bytes[23];
      const b3 = bytes[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Unsupported WebP chunk');
  }

  if (mimeType === 'image/jpeg') {
    if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Invalid JPEG SOI');
    }
    let offset = 2;
    while (offset + 4 <= bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (offset + 4 > bytes.byteLength) break;
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segmentLength < 2 || offset + 2 + segmentLength > bytes.byteLength) {
        break;
      }
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        if (offset + 9 > bytes.byteLength) {
          throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Truncated JPEG SOF');
        }
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        if (width <= 0 || height <= 0) {
          throw new PlanuiError('MEDIA_DIMENSIONS_EXCEEDED', `${width}x${height}`);
        }
        return { width, height };
      }
      offset += 2 + segmentLength;
    }
    throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'JPEG SOF marker not found');
  }

  throw new PlanuiError('UNSUPPORTED_MEDIA_TYPE', String(mimeType));
}

function looksLikeSvgOrActivePayload(bytes: Uint8Array, declaredMimeType?: string): boolean {
  if (declaredMimeType) {
    const lower = declaredMimeType.toLowerCase();
    if (lower.includes('svg') || lower.includes('xml') || lower.includes('html') || lower.includes('script')) {
      return true;
    }
  }
  const headLength = Math.min(bytes.byteLength, 512);
  const headText = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, headLength))
    .toLowerCase();
  return (
    headText.includes('<svg') ||
    headText.includes('<!doctype svg') ||
    headText.includes('<script') ||
    headText.includes('<html')
  );
}

export interface ValidatedMediaPreparationResult {
  meta: MediaAssetMeta;
  bytes: Uint8Array;
}

/**
 * 10.4: Validates actual raster content, magic bytes, dimensions, and decoded pixel budget
 * outside any IndexedDB write transaction. Rejects active SVG and unsupported formats.
 * Explains image optimization when applied.
 */
export async function validateAndPrepareRasterMedia(params: {
  id: EntityId;
  bytes: Uint8Array;
  declaredMimeType?: string;
  wasOptimized?: boolean;
  originalWidth?: number;
  originalHeight?: number;
  nowIso: IsoInstantString;
}): Promise<ValidatedMediaPreparationResult> {
  const { bytes, declaredMimeType, nowIso } = params;

  if (!bytes || bytes.byteLength === 0) {
    throw new PlanuiError('UNSUPPORTED_MEDIA_TYPE', 'Порожній файл зображення');
  }

  if (looksLikeSvgOrActivePayload(bytes, declaredMimeType)) {
    throw new PlanuiError('UNSUPPORTED_MEDIA_TYPE', 'SVG або активна розмітка заборонені');
  }

  if (bytes.byteLength > MAX_SINGLE_MEDIA_BYTES) {
    throw new PlanuiError(
      'MEDIA_DIMENSIONS_EXCEEDED',
      `Розмір файлу перевищує ліміт ${Math.round(MAX_SINGLE_MEDIA_BYTES / (1024 * 1024))} МБ`
    );
  }

  const detectedMime = sniffMediaMagicBytes(bytes);
  if (!detectedMime) {
    throw new PlanuiError('UNSUPPORTED_MEDIA_TYPE', declaredMimeType ?? 'Невідомий формат');
  }

  if (
    declaredMimeType &&
    declaredMimeType.trim().length > 0 &&
    declaredMimeType.toLowerCase() !== detectedMime
  ) {
    throw new PlanuiError(
      'MEDIA_SIGNATURE_MISMATCH',
      `Заявлено ${declaredMimeType}, але фактичний вміст є ${detectedMime}`
    );
  }

  const { width, height } = parseRasterImageDimensions(bytes, detectedMime);

  if (
    width <= 0 ||
    height <= 0 ||
    width > MAX_MEDIA_DIMENSION_PX ||
    height > MAX_MEDIA_DIMENSION_PX ||
    width * height > MAX_MEDIA_DECODED_PIXELS
  ) {
    throw new PlanuiError(
      'MEDIA_DIMENSIONS_EXCEEDED',
      `${width}×${height} пікселів (макс. ${MAX_MEDIA_DIMENSION_PX}px або 25 МП)`
    );
  }

  const hashHex = await sha256Hex(bytes);
  const wasOptimized = Boolean(params.wasOptimized);
  const optimizationNoteUk = wasOptimized
    ? params.originalWidth && params.originalHeight
      ? `Зображення оптимізовано локально з ${params.originalWidth}×${params.originalHeight} до ${width}×${height} пікселів для економії пам’яті пристрою.`
      : `Зображення оптимізовано локально (${width}×${height} пікселів) для економії пам’яті пристрою.`
    : null;

  const meta: MediaAssetMeta = {
    id: params.id,
    mimeType: detectedMime,
    byteSize: bytes.byteLength,
    width,
    height,
    sha256Hex: hashHex,
    wasOptimized,
    optimizationNoteUk,
    createdAt: nowIso,
  };

  return {
    meta,
    bytes: new Uint8Array(bytes),
  };
}

/**
 * 10.4: Validates HTTP/HTTPS links for Inspiration items.
 */
export function validateSafeHttpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new PlanuiError('UNSAFE_INSPIRATION_URL');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PlanuiError('UNSAFE_INSPIRATION_URL', trimmed);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PlanuiError('UNSAFE_INSPIRATION_URL', trimmed);
  }
  return parsed.toString();
}

export function buildInspirationItemRecord(params: {
  id: EntityId;
  kind: InspirationKind;
  title?: string | null;
  contentText?: string | null;
  linkUrl?: string | null;
  mediaId?: EntityId | null;
  isFavorite?: boolean;
  projectId?: EntityId | null;
  nowIso: IsoInstantString;
}): InspirationItem {
  const title =
    params.title && params.title.trim().length > 0 ? params.title.trim() : null;
  const contentText =
    params.contentText && params.contentText.trim().length > 0
      ? params.contentText.trim()
      : null;

  let linkUrl: string | null = null;
  if (params.linkUrl?.trim() || params.kind === 'link') {
    linkUrl = validateSafeHttpUrl(params.linkUrl ?? '');
  } else if (params.kind === 'text' || params.kind === 'quote') {
    if (!contentText && !title) {
      throw new PlanuiError('REQUIRED_TITLE');
    }
  } else if (params.kind === 'image') {
    if (!params.mediaId) {
      throw new PlanuiError('MISSING_REFERENCED_MEDIA', params.id);
    }
  }

  const item: InspirationItem = {
    id: params.id,
    kind: params.kind,
    title,
    contentText,
    linkUrl,
    mediaId: params.kind === 'image' ? params.mediaId ?? null : null,
    isFavorite: Boolean(params.isFavorite),
    projectId: params.projectId ?? null,
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
    revision: 1,
  };

  return validateInspirationItemRecord(item);
}

/**
 * 10.4: Checks whether a media asset is still referenced by any live InspirationItem
 * or any retained RecoverySnapshotRecord before deleting its binary blob.
 */
export function isMediaReferencedByLiveOrSnapshots(
  mediaId: EntityId,
  liveInspirationItems: readonly InspirationItem[],
  retainedSnapshots: readonly RecoverySnapshotRecord[],
  excludeInspirationItemId?: EntityId
): boolean {
  for (const item of liveInspirationItems) {
    if (item.id === excludeInspirationItemId) continue;
    if (item.mediaId === mediaId) return true;
  }
  for (const snap of retainedSnapshots) {
    for (const mm of snap.snapshot.mediaMeta) {
      if (mm.id === mediaId) return true;
    }
    for (const item of snap.snapshot.inspirationItems) {
      if (item.mediaId === mediaId) return true;
    }
  }
  return false;
}

/**
 * 10.4: Manages temporary Object URLs for local media blobs and guarantees
 * deterministic revocation when items are unmounted or closed.
 */
export class MediaObjectUrlRegistry {
  private readonly urlByMediaId = new Map<EntityId, string>();
  private readonly createUrlFn: (blob: Blob) => string;
  private readonly revokeUrlFn: (url: string) => void;

  constructor(
    createUrlFn?: (blob: Blob) => string,
    revokeUrlFn?: (url: string) => void
  ) {
    this.createUrlFn =
      createUrlFn ??
      ((blob: Blob) =>
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(blob)
          : `blob:planui-local-${blob.size}-${Date.now()}`);
    this.revokeUrlFn =
      revokeUrlFn ??
      ((url: string) => {
        if (
          typeof URL !== 'undefined' &&
          typeof URL.revokeObjectURL === 'function' &&
          url.startsWith('blob:')
        ) {
          URL.revokeObjectURL(url);
        }
      });
  }

  public getOrCreateUrl(
    mediaId: EntityId,
    bytes: Uint8Array,
    mimeType: SupportedMediaMimeType
  ): string {
    const existing = this.urlByMediaId.get(mediaId);
    if (existing) return existing;
    const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
    const url = this.createUrlFn(blob);
    this.urlByMediaId.set(mediaId, url);
    return url;
  }

  public revokeMediaUrl(mediaId: EntityId): boolean {
    const existing = this.urlByMediaId.get(mediaId);
    if (!existing) return false;
    this.revokeUrlFn(existing);
    this.urlByMediaId.delete(mediaId);
    return true;
  }

  public revokeAll(): number {
    let count = 0;
    for (const url of this.urlByMediaId.values()) {
      this.revokeUrlFn(url);
      count++;
    }
    this.urlByMediaId.clear();
    return count;
  }

  public get activeCount(): number {
    return this.urlByMediaId.size;
  }
}
