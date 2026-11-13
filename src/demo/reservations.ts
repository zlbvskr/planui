import { DailyPlan, TaskReservation } from '../domain/types';
import { atDate, buildInterval, DEMO_PREFIX } from './common';
import { DEMO_TASK_IDS } from './tasks';

export function buildDemoReservations(
  baseToday: string,
  zone: string,
  nowIso: string
): TaskReservation[] {
  return [
    {
      id: `${DEMO_PREFIX}res-lesson-12`,
      taskId: DEMO_TASK_IDS.lesson12,
      interval: buildInterval(baseToday, zone, 0, '16:00', 0, '17:00'),
      state: 'active',
      releaseMetadata: null,
      isDemo: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
    {
      id: `${DEMO_PREFIX}res-arranging`,
      taskId: DEMO_TASK_IDS.arranging,
      interval: buildInterval(baseToday, zone, 0, '17:30', 0, '19:00'),
      state: 'active',
      releaseMetadata: null,
      isDemo: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
    {
      id: `${DEMO_PREFIX}res-call-mom`,
      taskId: DEMO_TASK_IDS.callMom,
      interval: buildInterval(baseToday, zone, 0, '19:30', 0, '19:45'),
      state: 'active',
      releaseMetadata: null,
      isDemo: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
    {
      id: `${DEMO_PREFIX}res-thesis-1`,
      taskId: DEMO_TASK_IDS.thesis,
      interval: buildInterval(baseToday, zone, 1, '14:00', 1, '15:30'),
      state: 'active',
      releaseMetadata: null,
      isDemo: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
    {
      id: `${DEMO_PREFIX}res-thesis-2`,
      taskId: DEMO_TASK_IDS.thesis,
      interval: buildInterval(baseToday, zone, 2, '10:00', 2, '11:30'),
      state: 'active',
      releaseMetadata: null,
      isDemo: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
    {
      id: `${DEMO_PREFIX}res-park-walk`,
      taskId: DEMO_TASK_IDS.parkWalk,
      interval: buildInterval(baseToday, zone, 2, '11:00', 2, '12:00'),
      state: 'active',
      releaseMetadata: null,
      isDemo: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
    {
      id: `${DEMO_PREFIX}res-run-5k`,
      taskId: DEMO_TASK_IDS.run5k,
      interval: buildInterval(baseToday, zone, 5, '09:00', 5, '10:00'),
      state: 'active',
      releaseMetadata: null,
      isDemo: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
    {
      id: `${DEMO_PREFIX}res-deep-cleaning`,
      taskId: DEMO_TASK_IDS.deepCleaning,
      interval: buildInterval(baseToday, zone, 5, '12:00', 5, '14:00'),
      state: 'active',
      releaseMetadata: null,
      isDemo: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
    {
      id: `${DEMO_PREFIX}res-update-resume`,
      taskId: DEMO_TASK_IDS.updateResume,
      interval: buildInterval(baseToday, zone, 6, '15:00', 6, '16:00'),
      state: 'active',
      releaseMetadata: null,
      isDemo: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
  ];
}

export function buildDemoDailyPlans(baseToday: string): Record<string, DailyPlan> {
  const d0 = atDate(0, baseToday);
  const d1 = atDate(1, baseToday);
  return {
    [d0]: {
      focusTaskIds: [DEMO_TASK_IDS.arranging],
      focusNoteUk: 'Зробити драфт аранжування',
      minimalDay: false,
    },
    [d1]: {
      focusTaskIds: [DEMO_TASK_IDS.thesis],
      focusNoteUk: 'Підготувати тези виступу',
      minimalDay: false,
    },
  };
}
