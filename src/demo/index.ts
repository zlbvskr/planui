import { todayLocalDateInZone } from '../domain/temporal';
import { PlanuiDomainSnapshot, PlanuiSettings } from '../domain/types';
import { ALL_STORE_NAMES, STORE_NAMES, createDefaultSettings } from '../storage/db';
import { PlanuiRepositories } from '../storage/repositories';
import { applyDemoAreasAndMyLife, revertDemoAreasAndMyLife } from './areas';
import { isDemoRecord } from './common';
import { buildDemoEvents } from './events';
import { buildDemoFolders, buildDemoWishlistCategories } from './folders';
import { buildDemoGoalsAndStages } from './goals';
import { buildDemoHabits } from './habits';
import { buildDemoProjects } from './projects';
import { buildDemoDailyPlans, buildDemoReservations } from './reservations';
import { buildDemoShiftTemplates, buildDemoShiftsAndDaysOff } from './shifts';
import { buildDemoTasks } from './tasks';
import { buildDemoWishes } from './wishes';

export function isDemoLoaded(snapshot: PlanuiDomainSnapshot): boolean {
  if (snapshot.settings.demoBackup) return true;
  return (
    snapshot.tasks.some(isDemoRecord) ||
    snapshot.events.some(isDemoRecord) ||
    snapshot.folders.some(isDemoRecord) ||
    snapshot.habits.some(isDemoRecord) ||
    snapshot.wishes.some(isDemoRecord)
  );
}

export async function removeDemoData(repositories: PlanuiRepositories): Promise<void> {
  await repositories.runReplacementTransaction(ALL_STORE_NAMES, async (tx) => {
    const storesToClean = [
      STORE_NAMES.tasks,
      STORE_NAMES.reservations,
      STORE_NAMES.events,
      STORE_NAMES.shiftTemplates,
      STORE_NAMES.dayOffAnnotations,
      STORE_NAMES.folders,
      STORE_NAMES.goals,
      STORE_NAMES.projects,
      STORE_NAMES.stages,
      STORE_NAMES.habits,
      STORE_NAMES.habitEntries,
      STORE_NAMES.wishes,
      STORE_NAMES.wishlistCategories,
    ] as const;

    for (const store of storesToClean) {
      const items = await tx.getAll<{ id: string; isDemo?: boolean }>(store);
      for (const item of items) {
        if (isDemoRecord(item)) {
          await tx.delete(store, item.id);
        }
      }
    }

    const nowIso = new Date().toISOString();
    const questions = await tx.getAll(STORE_NAMES.lifeAreaQuestions);
    const settings =
      ((await tx.get(STORE_NAMES.settings, 'singleton')) as PlanuiSettings | undefined) ??
      createDefaultSettings(nowIso);

    const { updatedQuestions, updatedSettings } = revertDemoAreasAndMyLife(questions as any, settings, nowIso);
    for (const q of updatedQuestions) {
      await tx.put(STORE_NAMES.lifeAreaQuestions, q);
    }
    await tx.put(STORE_NAMES.settings, updatedSettings);
  });
}

export async function loadDemoData(repositories: PlanuiRepositories, zone: string): Promise<void> {
  await removeDemoData(repositories);

  await repositories.runReplacementTransaction(ALL_STORE_NAMES, async (tx) => {
    const nowIso = new Date().toISOString();
    const baseToday = todayLocalDateInZone(zone);

    const folders = buildDemoFolders(nowIso);
    for (const f of folders) await tx.put(STORE_NAMES.folders, f);

    const wishCats = buildDemoWishlistCategories(nowIso);
    for (const c of wishCats) await tx.put(STORE_NAMES.wishlistCategories, c);

    const templates = buildDemoShiftTemplates(nowIso);
    for (const t of templates) await tx.put(STORE_NAMES.shiftTemplates, t);

    const { shiftEvents, dayOffAnnotations } = buildDemoShiftsAndDaysOff(baseToday, zone, nowIso);
    for (const s of shiftEvents) await tx.put(STORE_NAMES.events, s);
    for (const d of dayOffAnnotations) await tx.put(STORE_NAMES.dayOffAnnotations, d);

    const events = buildDemoEvents(baseToday, zone, nowIso);
    for (const e of events) await tx.put(STORE_NAMES.events, e);

    const projects = buildDemoProjects(nowIso);
    for (const p of projects) await tx.put(STORE_NAMES.projects, p);

    const { goals, stages } = buildDemoGoalsAndStages(baseToday, nowIso);
    for (const g of goals) await tx.put(STORE_NAMES.goals, g);
    for (const s of stages) await tx.put(STORE_NAMES.stages, s);

    const tasks = buildDemoTasks(baseToday, nowIso);
    for (const t of tasks) await tx.put(STORE_NAMES.tasks, t);

    const reservations = buildDemoReservations(baseToday, zone, nowIso);
    for (const r of reservations) await tx.put(STORE_NAMES.reservations, r);

    const { habits, habitEntries } = buildDemoHabits(baseToday, nowIso);
    for (const h of habits) await tx.put(STORE_NAMES.habits, h);
    for (const he of habitEntries) await tx.put(STORE_NAMES.habitEntries, he);

    const wishes = buildDemoWishes(nowIso);
    for (const w of wishes) await tx.put(STORE_NAMES.wishes, w);

    const questions = await tx.getAll(STORE_NAMES.lifeAreaQuestions);
    const settings =
      ((await tx.get(STORE_NAMES.settings, 'singleton')) as PlanuiSettings | undefined) ??
      createDefaultSettings(nowIso);
    const demoDailyPlans = buildDemoDailyPlans(baseToday);

    const { updatedQuestions, updatedSettings } = applyDemoAreasAndMyLife(questions as any, settings, nowIso);
    const settingsWithDailyPlans = {
      ...updatedSettings,
      dailyPlans: { ...(updatedSettings.dailyPlans ?? {}), ...demoDailyPlans },
    };

    for (const q of updatedQuestions) {
      await tx.put(STORE_NAMES.lifeAreaQuestions, q);
    }
    await tx.put(STORE_NAMES.settings, settingsWithDailyPlans);
  });
}
