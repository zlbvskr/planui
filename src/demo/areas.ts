import { DemoBackupAreaState, DemoBackupData, LifeAreaQuestion, PlanuiSettings } from '../domain/types';
import { DEMO_AREA_KEYS } from './common';

export const DEMO_MY_LIFE =
  'Я бачу себе людиною, яка працює над музикою щодня без поспіху, має передбачуваний графік і час на близьких. У моєму житті є простір для тиші, подорожей і навчання. Я хочу більше творчості й спокою та менше терміновості й втоми.';

interface DemoAreaTargetSpec {
  rating: number | null;
  focus?: boolean;
  goodEnoughUk?: string;
}

const DEMO_AREA_SPECS: Record<string, DemoAreaTargetSpec> = {
  [DEMO_AREA_KEYS.health]: { rating: 6 },
  [DEMO_AREA_KEYS.mental]: { rating: 4 },
  [DEMO_AREA_KEYS.recovery]: {
    rating: 3,
    focus: true,
    goodEnoughUk: 'Спати 7 годин після нічної зміни й мати один вільний вечір на тиждень',
  },
  [DEMO_AREA_KEYS.relationships]: { rating: 8 },
  [DEMO_AREA_KEYS.creativity]: {
    rating: 9,
    goodEnoughUk: 'Щотижня працювати над музикою хоча б 3 години',
  },
  [DEMO_AREA_KEYS.work]: { rating: 5, focus: true },
  [DEMO_AREA_KEYS.finance]: {
    rating: 2,
    goodEnoughUk: 'Мати запас на 3 місяці',
  },
  [DEMO_AREA_KEYS.learning]: { rating: 7 },
  [DEMO_AREA_KEYS.home]: { rating: 6 },
  [DEMO_AREA_KEYS.meaning]: { rating: null },
};

export function applyDemoAreasAndMyLife(
  questions: LifeAreaQuestion[],
  settings: PlanuiSettings,
  nowIso: string
): { updatedQuestions: LifeAreaQuestion[]; updatedSettings: PlanuiSettings } {
  const previousBackup: DemoBackupData = settings.demoBackup ?? {
    appliedAt: nowIso,
    areas: {},
    myLife: settings.myLife ?? null,
  };

  const updatedQuestions = questions.map((q) => {
    const spec = DEMO_AREA_SPECS[q.id];
    if (!spec) return q;

    if (!previousBackup.areas[q.id]) {
      previousBackup.areas[q.id] = {
        rating: q.rating ?? null,
        ratedAt: q.ratedAt ?? null,
        goodEnough: q.goodEnough ?? null,
        goodEnoughUk: q.goodEnoughUk ?? null,
        focus: q.focus ?? null,
      };
    }

    const wasUnrated = q.rating == null || q.rating === undefined;
    if (!wasUnrated) return q;

    return {
      ...q,
      rating: spec.rating,
      ratedAt: spec.rating !== null ? nowIso : q.ratedAt ?? null,
      focus: spec.focus ?? q.focus ?? null,
      goodEnough: spec.goodEnoughUk ?? q.goodEnough ?? null,
      goodEnoughUk: spec.goodEnoughUk ?? q.goodEnoughUk ?? null,
      updatedAt: nowIso,
      revision: (q.revision ?? 1) + 1,
    };
  });

  const shouldSetMyLife = !settings.myLife || settings.myLife.trim().length === 0;
  const updatedSettings: PlanuiSettings = {
    ...settings,
    myLife: shouldSetMyLife ? DEMO_MY_LIFE : settings.myLife,
    demoBackup: previousBackup,
    updatedAt: nowIso,
    revision: (settings.revision ?? 1) + 1,
  };

  return { updatedQuestions, updatedSettings };
}

export function revertDemoAreasAndMyLife(
  questions: LifeAreaQuestion[],
  settings: PlanuiSettings,
  nowIso: string
): { updatedQuestions: LifeAreaQuestion[]; updatedSettings: PlanuiSettings } {
  const backup = settings.demoBackup;
  const updatedQuestions = questions.map((q) => {
    const orig: DemoBackupAreaState | undefined = backup?.areas[q.id];
    if (!orig) return q;
    return {
      ...q,
      rating: orig.rating ?? null,
      ratedAt: orig.ratedAt ?? null,
      goodEnough: orig.goodEnough ?? null,
      goodEnoughUk: orig.goodEnoughUk ?? null,
      focus: orig.focus ?? null,
      updatedAt: nowIso,
      revision: (q.revision ?? 1) + 1,
    };
  });

  const updatedSettings: PlanuiSettings = {
    ...settings,
    myLife: backup ? backup.myLife : settings.myLife,
    demoBackup: null,
    updatedAt: nowIso,
    revision: (settings.revision ?? 1) + 1,
  };

  return { updatedQuestions, updatedSettings };
}
