import { WishItem } from '../domain/types';
import { DEMO_AREA_KEYS, DEMO_PREFIX } from './common';
import { DEMO_WISH_CATEGORIES } from './folders';

export function buildDemoWishes(nowIso: string): WishItem[] {
  const w = (
    id: string,
    title: string,
    categoryId: string | null,
    timing: WishItem['timing'],
    status: WishItem['purchaseStatus'],
    priceAmount: number | null,
    extra: Partial<WishItem> = {}
  ): WishItem => {
    const icon = extra.icon ?? extra.iconKey ?? 'gift';
    const note = extra.note ?? extra.description ?? null;
    return {
      id: `${DEMO_PREFIX}wish-${id}`,
      title,
      note,
      description: note,
      categoryId,
      category: categoryId,
      group: categoryId,
      folderId: extra.folderId ?? null,
      timing,
      purchaseStatus: status,
      estimatedPrice:
        priceAmount !== null
          ? { amountMinor: priceAmount * 100, amountDecimal: `${priceAmount}.00`, currency: 'UAH' }
          : null,
      targetAmount: priceAmount,
      price: priceAmount,
      currency: 'UAH',
      measure: extra.measure ?? null,
      iconKey: icon,
      icon,
      glyph: icon,
      areaId: extra.areaId ?? null,
      state: status === 'purchased' ? 'fulfilled' : 'active',
      fulfilledAt: status === 'purchased' ? nowIso : null,
      purchasedAt: status === 'purchased' ? nowIso : null,
      archived: false,
      isDemo: true,
      order: extra.order ?? 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
  };

  return [
    w('headphones', 'Навушники для студії', DEMO_WISH_CATEGORIES.music, 'now', 'want', 3500, {
      note: 'Моніторні навушники закритого типу',
      iconKey: 'music',
      areaId: DEMO_AREA_KEYS.creativity,
      measure: { unit: 'грн', target: 3500, current: 1200, log: [{ ts: nowIso, delta: 1200 }] },
      order: 0,
    }),
    w('mic', 'Мікрофон', DEMO_WISH_CATEGORIES.music, 'later', 'want', 4800, {
      note: 'Конденсаторний вокальний мікрофон',
      areaId: DEMO_AREA_KEYS.creativity,
      order: 1,
    }),
    w('camera', 'Нова камера', DEMO_WISH_CATEGORIES.tech, 'someday', 'want', 24000, {
      note: 'Компактна камера для подорожей',
      iconKey: 'camera',
      order: 2,
    }),
    w('bali', 'Подорож на Балі', DEMO_WISH_CATEGORIES.travel, 'someday', 'want', 85000, {
      note: 'Два тижні відновлення серед природи',
      iconKey: 'palm',
      areaId: DEMO_AREA_KEYS.recovery,
      measure: { unit: 'грн', target: 85000, current: 12000, log: [{ ts: nowIso, delta: 12000 }] },
      order: 3,
    }),
    w('books', '10 книжок', DEMO_WISH_CATEGORIES.growth, 'now', 'want', null, {
      note: 'Список бажаних видань для читання',
      iconKey: 'books',
      areaId: DEMO_AREA_KEYS.learning,
      measure: { unit: 'книжок', target: 10, current: 3, log: [{ ts: nowIso, delta: 3 }] },
      order: 4,
    }),
    w('english-course', 'Курс англійської', DEMO_WISH_CATEGORIES.growth, 'now', 'purchased', 6000, {
      note: 'Інтенсивний розмовний курс',
      areaId: DEMO_AREA_KEYS.learning,
      order: 5,
    }),
    w('laptop-upgrade', 'Апгрейд ноутбука', DEMO_WISH_CATEGORIES.tech, 'someday', 'not_relevant', null, {
      note: 'Додатковий SSD та пам’ять',
      order: 6,
    }),
    w('mom-gift', 'Подарунок мамі', null, 'now', 'want', 1500, {
      note: 'Теплий плед та набір чаю',
      iconKey: 'gift',
      areaId: DEMO_AREA_KEYS.relationships,
      order: 7,
    }),
  ];
}
