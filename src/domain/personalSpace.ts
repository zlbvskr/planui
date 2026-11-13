import { PlanuiError } from '../i18n/errorsUk';
import { EntityId, InspirationItem, RecoverySnapshotRecord, Scale1To10, Scale1To5 } from './types';

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

/**
 * 10.4: Checks whether a media asset is still referenced by any live InspirationItem
 * or any retained RecoverySnapshotRecord before deleting its binary blob.
 */
export function isMediaReferencedByLiveOrSnapshots(
  mediaId: EntityId,
  liveInspirationItems: readonly InspirationItem[],
  retainedSnapshots: readonly RecoverySnapshotRecord[],
  excludeInspirationItemId?: EntityId,
  liveWishes: readonly import('./types').WishItem[] = [],
  excludeWishId?: EntityId
): boolean {
  for (const item of liveInspirationItems) {
    if (item.id === excludeInspirationItemId) continue;
    if (item.mediaId === mediaId) return true;
  }
  for (const wish of liveWishes) if (wish.id !== excludeWishId && wish.mediaId === mediaId) return true;
  for (const snap of retainedSnapshots) {
    for (const mm of snap.snapshot.mediaMeta) {
      if (mm.id === mediaId) return true;
    }
    for (const wish of snap.snapshot.wishes ?? []) if (wish.mediaId === mediaId) return true;
    for (const item of snap.snapshot.inspirationItems) {
      if (item.mediaId === mediaId) return true;
    }
  }
  return false;
}
