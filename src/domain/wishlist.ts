import { PlanuiError } from '../i18n/errorsUk';
import {
  EntityId,
  ExactPrice,
  IsoInstantString,
  SUPPORTED_CURRENCIES,
  SupportedCurrencyCode,
  WishFulfillmentState,
  WishItem,
  WishlistCategory,
  WishlistTimingGroup,
} from './types';

export { SUPPORTED_CURRENCIES };

export const WISHLIST_TIMING_LABELS_UK: Record<WishlistTimingGroup, string> = {
  now: 'Зараз',
  later: 'Пізніше',
  someday: 'Колись',
};

export const WISHLIST_TIMING_ORDER: readonly WishlistTimingGroup[] = [
  'now',
  'later',
  'someday',
] as const;

export type WishlistCategoryFilter = 'all' | 'uncategorized' | EntityId;
export type WishlistTimingFilter = 'all' | WishlistTimingGroup;
export type WishlistViewScope = 'active' | 'fulfilled' | 'archived';

export function isSupportedCurrencyCode(
  code: string
): code is SupportedCurrencyCode {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_CURRENCIES, code);
}

export function assertValidWishlistTiming(
  timing: string
): WishlistTimingGroup {
  if (timing !== 'now' && timing !== 'later' && timing !== 'someday') {
    throw new PlanuiError('WISHLIST_INVALID_TIMING', String(timing));
  }
  return timing;
}

export function assertValidWishFulfillmentState(
  state: string
): WishFulfillmentState {
  if (state !== 'active' && state !== 'fulfilled') {
    throw new PlanuiError('WISHLIST_INVALID_STATE', String(state));
  }
  return state;
}

/**
 * 10.7 / C15: Exact validated decimal and integer minor-unit representation.
 * Never uses binary floating-point monetary arithmetic.
 * Distinguishes missing price (null) from zero (0).
 * Rejects negative, malformed, non-finite, or unsupported-precision input.
 */
export function parseLocalizedPriceInput(
  rawInput: string | null | undefined,
  currencyCode: string | null | undefined
): ExactPrice | null {
  if (rawInput === null || rawInput === undefined) {
    return null;
  }
  const trimmed = rawInput.trim().replace(/[\s\u00A0]+/g, '');
  if (trimmed.length === 0) {
    return null;
  }

  if (!currencyCode || currencyCode.trim().length === 0) {
    throw new PlanuiError('WISHLIST_PRICE_MISSING_CURRENCY');
  }

  const normalizedCurrency = currencyCode.trim().toUpperCase();
  if (!isSupportedCurrencyCode(normalizedCurrency)) {
    throw new PlanuiError('WISHLIST_PRICE_UNSUPPORTED_CURRENCY', currencyCode);
  }

  const spec = SUPPORTED_CURRENCIES[normalizedCurrency];
  const normalizedDecimal = trimmed.replace(',', '.');

  if (!/^\d+(\.\d+)?$/.test(normalizedDecimal)) {
    throw new PlanuiError('WISHLIST_PRICE_INVALID_AMOUNT', rawInput);
  }

  const [wholePartRaw, fracPartRaw = ''] = normalizedDecimal.split('.');
  if (fracPartRaw.length > spec.minorUnits) {
    throw new PlanuiError('WISHLIST_PRICE_INVALID_AMOUNT', rawInput);
  }

  const paddedFrac = fracPartRaw.padEnd(spec.minorUnits, '0');
  const scaleFactor = 10 ** spec.minorUnits;

  const wholeInt = Number(wholePartRaw);
  const fracInt = paddedFrac.length > 0 ? Number(paddedFrac) : 0;

  if (!Number.isSafeInteger(wholeInt) || !Number.isSafeInteger(fracInt)) {
    throw new PlanuiError('WISHLIST_PRICE_INVALID_AMOUNT', rawInput);
  }

  const amountMinor = wholeInt * scaleFactor + fracInt;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new PlanuiError('WISHLIST_PRICE_INVALID_AMOUNT', rawInput);
  }

  const canonicalWhole = String(Math.trunc(amountMinor / scaleFactor));
  const canonicalDecimal =
    spec.minorUnits === 0
      ? canonicalWhole
      : `${canonicalWhole}.${String(amountMinor % scaleFactor).padStart(
          spec.minorUnits,
          '0'
        )}`;

  return {
    amountMinor,
    amountDecimal: canonicalDecimal,
    currency: normalizedCurrency,
  };
}

export function validateExactPriceObject(
  price: ExactPrice | null | undefined
): ExactPrice | null {
  if (price === null || price === undefined) {
    return null;
  }
  if (typeof price !== 'object') {
    throw new PlanuiError('WISHLIST_PRICE_INVALID_AMOUNT');
  }
  const reparsed = parseLocalizedPriceInput(
    price.amountDecimal,
    price.currency
  );
  if (!reparsed || reparsed.amountMinor !== price.amountMinor) {
    throw new PlanuiError(
      'WISHLIST_PRICE_INVALID_AMOUNT',
      JSON.stringify(price)
    );
  }
  return reparsed;
}

/**
 * 10.6 / 10.7: Formats an ExactPrice in Ukrainian locale (`uk-UA`) with its explicit currency code.
 * A missing price (`null`) returns `null` and is never formatted as zero.
 * Deterministic integer string formatting avoids binary float drift.
 */
export function formatExactPriceUk(price: ExactPrice | null): string | null {
  if (!price) return null;
  const spec = SUPPORTED_CURRENCIES[price.currency];
  const scaleFactor = 10 ** spec.minorUnits;
  const wholeInt = Math.trunc(price.amountMinor / scaleFactor);
  const wholeFormatted = new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: 0,
  }).format(wholeInt);

  if (spec.minorUnits === 0) {
    return `${wholeFormatted} ${price.currency}`;
  }

  const minorPart = String(price.amountMinor % scaleFactor).padStart(
    spec.minorUnits,
    '0'
  );
  return `${wholeFormatted},${minorPart} ${price.currency}`;
}

/**
 * 10.5 / 10.6: Builds a new or updated WishItem with default timing `'later'` ("Пізніше")
 * unless explicitly specified. Title-only creation is supported with zero price/currency prompt.
 */
export function buildWishItemRecord(params: {
  id: EntityId;
  title: string;
  note?: string | null;
  categoryId?: EntityId | null;
  timing?: WishlistTimingGroup;
  rawPriceAmount?: string | null;
  currencyCode?: string | null;
  preferredCurrency?: SupportedCurrencyCode | null;
  nowIso: IsoInstantString;
  existingWish?: WishItem;
}): {
  wish: WishItem;
  explicitCurrencySelected: SupportedCurrencyCode | null;
} {
  const trimmedTitle = params.title.trim();
  if (!trimmedTitle) {
    throw new PlanuiError('REQUIRED_TITLE');
  }

  const timing: WishlistTimingGroup = params.timing
    ? assertValidWishlistTiming(params.timing)
    : params.existingWish?.timing ?? 'later';

  const hasRawPrice =
    params.rawPriceAmount !== null &&
    params.rawPriceAmount !== undefined &&
    params.rawPriceAmount.trim().length > 0;

  let estimatedPrice: ExactPrice | null = null;
  let explicitCurrencySelected: SupportedCurrencyCode | null = null;

  if (hasRawPrice) {
    const effectiveCurrency =
      params.currencyCode && params.currencyCode.trim().length > 0
        ? params.currencyCode.trim().toUpperCase()
        : params.preferredCurrency ?? null;

    if (!effectiveCurrency) {
      throw new PlanuiError('WISHLIST_PRICE_MISSING_CURRENCY');
    }

    estimatedPrice = parseLocalizedPriceInput(
      params.rawPriceAmount,
      effectiveCurrency
    );
    if (estimatedPrice) {
      explicitCurrencySelected = estimatedPrice.currency;
    }
  }

  const existing = params.existingWish;
  const wish: WishItem = {
    id: params.id,
    title: trimmedTitle,
    note:
      params.note && params.note.trim().length > 0 ? params.note.trim() : null,
    categoryId: params.categoryId ? params.categoryId : null,
    timing,
    estimatedPrice,
    state: existing ? existing.state : 'active',
    fulfilledAt: existing ? existing.fulfilledAt : null,
    archived: existing ? existing.archived : false,
    createdAt: existing ? existing.createdAt : params.nowIso,
    updatedAt: params.nowIso,
    revision: existing ? existing.revision + 1 : 1,
  };

  return { wish, explicitCurrencySelected };
}

/**
 * 10.6: Marks a wish as fulfilled. Preserves estimatedPrice as an estimate
 * and never records an expense or modifies timing.
 */
export function fulfillWishItem(
  wish: WishItem,
  nowIso: IsoInstantString
): WishItem {
  return {
    ...wish,
    state: 'fulfilled',
    fulfilledAt: nowIso,
    updatedAt: nowIso,
    revision: wish.revision + 1,
  };
}

/**
 * 10.6: Reopens a fulfilled wish. Never moves timing group or alters estimatedPrice.
 */
export function reopenWishItem(
  wish: WishItem,
  nowIso: IsoInstantString
): WishItem {
  return {
    ...wish,
    state: 'active',
    fulfilledAt: null,
    updatedAt: nowIso,
    revision: wish.revision + 1,
  };
}

/**
 * 10.5 / 10.6: Archives or unarchives a wish while preserving its fulfillment state,
 * timing group, and estimatedPrice.
 */
export function setWishArchivedState(
  wish: WishItem,
  archived: boolean,
  nowIso: IsoInstantString
): WishItem {
  return {
    ...wish,
    archived,
    updatedAt: nowIso,
    revision: wish.revision + 1,
  };
}

export function sortWishlistCategories(
  categories: readonly WishlistCategory[]
): WishlistCategory[] {
  return [...categories].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name, 'uk-UA');
  });
}

export function computeWishlistCategoryDeleteImpact(
  categoryId: EntityId,
  wishes: readonly WishItem[]
): { affectedWishesCount: number } {
  const affectedWishesCount = wishes.filter(
    (w) => w.categoryId === categoryId
  ).length;
  return { affectedWishesCount };
}

export interface FilteredWishlistGroups {
  totalMatchingCount: number;
  wishes: WishItem[];
  byTiming: Record<WishlistTimingGroup, WishItem[]>;
}

/**
 * 10.5 / 10.6: Filters wishes by viewScope ('active' | 'fulfilled' | 'archived'),
 * categoryFilter ('all' | 'uncategorized' | categoryId), and timingFilter ('all' | 'now' | 'later' | 'someday').
 * Guarantees each matching wish appears once in `wishes` and once in its timing bucket.
 * Keeps fulfilled and archived wishes out of the 'active' view by default.
 */
export function filterAndGroupWishes(params: {
  wishes: readonly WishItem[];
  viewScope: WishlistViewScope;
  categoryFilter: WishlistCategoryFilter;
  timingFilter: WishlistTimingFilter;
}): FilteredWishlistGroups {
  const seenIds = new Set<EntityId>();
  const matching: WishItem[] = [];

  for (const w of params.wishes) {
    if (seenIds.has(w.id)) continue;

    // 1. Scope filter
    if (params.viewScope === 'active') {
      if (w.archived || w.state !== 'active') continue;
    } else if (params.viewScope === 'fulfilled') {
      if (w.archived || w.state !== 'fulfilled') continue;
    } else if (params.viewScope === 'archived') {
      if (!w.archived) continue;
    }

    // 2. Category filter (virtual 'all' and 'uncategorized', or real categoryId)
    if (params.categoryFilter === 'uncategorized') {
      if (w.categoryId !== null) continue;
    } else if (params.categoryFilter !== 'all') {
      if (w.categoryId !== params.categoryFilter) continue;
    }

    // 3. Timing filter
    if (params.timingFilter !== 'all') {
      if (w.timing !== params.timingFilter) continue;
    }

    seenIds.add(w.id);
    matching.push(w);
  }

  // Sort deterministically by createdAt descending within each group (no urgency auto-reordering)
  matching.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const byTiming: Record<WishlistTimingGroup, WishItem[]> = {
    now: [],
    later: [],
    someday: [],
  };

  for (const w of matching) {
    byTiming[w.timing].push(w);
  }

  return {
    totalMatchingCount: matching.length,
    wishes: matching,
    byTiming,
  };
}
