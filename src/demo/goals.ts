import { Goal, ProjectStage } from '../domain/types';
import { DEMO_AREA_KEYS, DEMO_PREFIX } from './common';

export const DEMO_GOAL_IDS = {
  album: `${DEMO_PREFIX}goal-album`,
  coursework: `${DEMO_PREFIX}goal-coursework`,
  english: `${DEMO_PREFIX}goal-english`,
  job: `${DEMO_PREFIX}goal-job`,
  finance: `${DEMO_PREFIX}goal-finance`,
  seaTrip: `${DEMO_PREFIX}goal-sea-trip`,
} as const;

export function buildDemoGoalsAndStages(
  baseToday: string,
  nowIso: string
): { goals: Goal[]; stages: ProjectStage[] } {
  const year = Number(baseToday.slice(0, 4));
  const month = Number(baseToday.slice(5, 7));

  const formatYearMonth = (y: number, m: number) => {
    const adjustedMonth = ((m - 1) % 12) + 1;
    const adjustedYear = y + Math.floor((m - 1) / 12);
    return `${adjustedYear}-${String(adjustedMonth).padStart(2, '0')}`;
  };

  const startOfMonth = `${formatYearMonth(year, month)}-01`;
  const plusMonthsEnd = (addM: number) => `${formatYearMonth(year, month + addM)}-28`;

  const g = (
    id: string,
    title: string,
    desc: string,
    purpose: string,
    criteria: string,
    targetM: number | null,
    areaId: string,
    extra: Partial<Goal> = {}
  ): Goal => {
    const why = extra.whyUk ?? purpose;
    const dod = extra.definitionOfDoneUk ?? criteria;
    const ifThen = extra.ifThenPlanUk ?? extra.implementationIntentionUk ?? null;
    const icon = extra.icon ?? extra.iconKey ?? 'target';
    const targetDate = targetM !== null ? plusMonthsEnd(targetM) : null;
    const horizon = extra.horizon ?? (targetDate ? targetDate.slice(0, 7) : null);

    return {
      id,
      title,
      description: desc,
      purposeUk: why,
      whyUk: why,
      completionCriteriaUk: dod,
      definitionOfDoneUk: dod,
      nextActionTaskId: extra.nextActionTaskId ?? null,
      nextStepUk: extra.nextStepUk ?? null,
      timing: targetM !== null ? { targetDate, targetPeriodUk: `${targetM} міс.` } : null,
      termStart: targetM !== null ? (extra.termStart ?? startOfMonth) : null,
      termEnd: targetDate,
      horizon,
      folderId: null,
      areaId,
      lifeAreaId: areaId,
      implementationIntentionUk: ifThen,
      ifThenPlanUk: ifThen,
      iconKey: icon,
      icon,
      measure: extra.measure ?? null,
      state: 'active',
      archived: false,
      isDemo: true,
      order: extra.order ?? 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };
  };

  const goals: Goal[] = [
    g(DEMO_GOAL_IDS.album, 'Випустити альбом', 'Записати, звести та опублікувати альбом', 'Поділитися музикою зі світом та реалізувати творчий потенціал', 'Реліз альбому з 8 треків на стрімінгах', 4, DEMO_AREA_KEYS.creativity, {
      whyUk: 'Поділитися музикою зі світом та реалізувати творчий потенціал',
      definitionOfDoneUk: 'Реліз альбому з 8 треків на стрімінгах',
      nextStepUk: 'Записати вокал для треку 4',
      ifThenPlanUk: 'Якщо є сили ввечері — відкрию сесію в DAW',
      implementationIntentionUk: 'Якщо є сили ввечері — відкрию сесію в DAW',
      horizon: 'Березень 2027',
      iconKey: 'music',
      icon: 'music',
      measure: { unit: 'треків', target: 8, current: 3, log: [{ ts: nowIso, delta: 3 }] },
      order: 0,
    }),
    g(DEMO_GOAL_IDS.coursework, 'Захистити курсову', 'Успішний захист дослідження', 'Отримати відмінну оцінку та завершити семестр', 'Захист перед комісією на 95+ балів', 2, DEMO_AREA_KEYS.learning, {
      whyUk: 'Отримати відмінну оцінку та завершити семестр',
      definitionOfDoneUk: 'Захист перед комісією на 95+ балів',
      nextStepUk: 'Узгодити план із науковим керівником',
      ifThenPlanUk: 'Якщо ранок суботи вільний — працюю в бібліотеці',
      horizon: 'Січень 2027',
      iconKey: 'books',
      icon: 'books',
      order: 1,
    }),
    g(DEMO_GOAL_IDS.english, 'Рівень англійської B2', 'Впевнене володіння мовою для роботи', 'Вільне спілкування з колегами та подорожі без бар’єрів', 'Скласти сертифікаційний тест B2', 9, DEMO_AREA_KEYS.learning, {
      whyUk: 'Вільне спілкування з колегами та подорожі без бар’єрів',
      definitionOfDoneUk: 'Скласти сертифікаційний тест B2',
      nextStepUk: 'Пройти тренувальний тест на аудіювання',
      ifThenPlanUk: 'Якщо їду в дорозі — вмикаю англомовний подкаст',
      horizon: 'Серпень 2027',
      iconKey: 'book',
      icon: 'book',
      measure: { unit: 'уроків', target: 30, current: 12, log: [{ ts: nowIso, delta: 12 }] },
      order: 2,
    }),
    g(DEMO_GOAL_IDS.job, 'Перейти на нову роботу', 'Знайти роль із кращими умовами', 'Більше балансу в житті та робота над якісними продуктами', 'Прийнятий офер у продуктової компанії', 10, DEMO_AREA_KEYS.work, {
      whyUk: 'Більше балансу в житті та робота над якісними продуктами',
      definitionOfDoneUk: 'Прийнятий офер у продуктової компанії',
      nextStepUk: 'Надіслати відгуки на 3 перевірені вакансії',
      ifThenPlanUk: 'Якщо бачу релевантну позицію — надсилаю CV одразу',
      horizon: 'Вересень 2027',
      iconKey: 'rocket',
      icon: 'rocket',
      termStart: `${formatYearMonth(year, month + 1)}-01`,
      order: 3,
    }),
    g(DEMO_GOAL_IDS.finance, 'Фінансова подушка', 'Накопичити резерв на 3 місяці', 'Відчуття внутрішньої безпеки та стабільності', '60 000 грн на окремому рахунку', 11, DEMO_AREA_KEYS.finance, {
      whyUk: 'Відчуття внутрішньої безпеки та стабільності',
      definitionOfDoneUk: '60 000 грн на окремому рахунку',
      nextStepUk: 'Перерахувати 5000 грн з найближчого авансу',
      ifThenPlanUk: 'Якщо отримую дохід — одразу відкладаю 15%',
      horizon: 'Жовтень 2027',
      iconKey: 'target',
      icon: 'target',
      measure: { unit: 'грн', target: 60000, current: 18000, log: [{ ts: nowIso, delta: 18000 }] },
      order: 4,
    }),
    g(DEMO_GOAL_IDS.seaTrip, 'Подорож до моря', 'Відпочинок на узбережжі', 'Глибоке перезавантаження серед природи та хвиль', 'Тиждень повного відпочинку біля моря', null, DEMO_AREA_KEYS.recovery, {
      whyUk: 'Глибоке перезавантаження серед природи та хвиль',
      definitionOfDoneUk: 'Тиждень повного відпочинку біля моря',
      nextStepUk: 'Обрати напрямок та погодити дати відпустки',
      ifThenPlanUk: 'Якщо затвердять графік змін — бронюю квитки',
      horizon: 'Літо 2027',
      iconKey: 'palm',
      icon: 'palm',
      order: 5,
    }),
  ];

  const s = (id: string, goalId: string, title: string, outcome: string, targetM: number, order: number, dependsOn?: string[]): ProjectStage =>
    ({ id: `${DEMO_PREFIX}stage-${id}`, goalId, projectId: null, title, expectedOutcome: outcome, targetDate: plusMonthsEnd(targetM), dependsOnStageIds: dependsOn, isDemo: true, order, createdAt: nowIso, updatedAt: nowIso, revision: 1 });

  const stages: ProjectStage[] = [
    s('demo', DEMO_GOAL_IDS.album, 'Демо', 'Драфти треків', 0, 0),
    s('recording', DEMO_GOAL_IDS.album, 'Запис', 'Чистовий вокал та інструменти', 2, 1),
    s('mixing', DEMO_GOAL_IDS.album, 'Зведення', 'Фінальні мікси', 3, 2),
    s('release', DEMO_GOAL_IDS.album, 'Реліз', 'Публікація', 4, 3),

    s('role', DEMO_GOAL_IDS.job, 'Визначити роль', 'Список цільових позицій', 1, 0),
    s('skills', DEMO_GOAL_IDS.job, 'Перелік навичок', 'Групування вимог', 2, 1, [`${DEMO_PREFIX}stage-role`]),
    s('learning', DEMO_GOAL_IDS.job, 'Навчання', 'Заповнені прогалини', 5, 2, [`${DEMO_PREFIX}stage-skills`]),
    s('portfolio', DEMO_GOAL_IDS.job, 'Портфоліо', 'Оформлені кейси', 7, 3, [`${DEMO_PREFIX}stage-learning`]),
    s('resume', DEMO_GOAL_IDS.job, 'Резюме', 'Оновлене CV', 8, 4, [`${DEMO_PREFIX}stage-portfolio`]),
    s('interviews', DEMO_GOAL_IDS.job, 'Співбесіди', 'Пройдені інтерв’ю', 10, 5, [`${DEMO_PREFIX}stage-resume`]),
  ];

  return { goals, stages };
}
