import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Habit,
  HabitEntry,
  HabitRuleRevision,
  Project,
} from '../../domain/types';
import {
  computeHabitDeleteImpact,
  computeHabitMonthProgress,
  computeHabitStreakSummary,
  computeHabitWeekProgress,
  evaluateHabitOnDate,
  formatHabitRuleSummaryUk,
  getEffectiveHabitRuleRevisionForDate,
  getPreviousLocalDateForNightShift,
  selectHabitsForTodayBlock,
} from '../../domain/habits';
import { projectScheduleForDate } from '../../domain/scheduling';
import { InMemoryTransactionalEngine } from '../db';
import { PlanuiRepositories } from '../repositories';
import {
  executeAtomicBackupReplacement,
  exportFullBackupZip,
  validateBackupArchive,
} from '../backup/backupService';
import { PlanuiError } from '../../i18n/errorsUk';

function createTestRepos() {
  const engine = new InMemoryTransactionalEngine();
  const repos = new PlanuiRepositories(engine);
  return { engine, repos };
}

describe('Stage 9: Habits and Today Integration (C14, 9.1-9.5)', () => {
  it('9.1 & 9.2 Supports daily, selected-weekday, and weekly-frequency rules, binary uniqueness, numeric totals, partial/skip states, and previous-date recording after night work', async () => {
    const { repos } = createTestRepos();
    const nowIso = '2026-11-03T08:00:00.000Z';

    // 1. Binary selected-weekdays habit (Mon=1, Wed=3, Fri=5)
    const workoutHabit: Habit = {
      id: 'hab_workout',
      name: 'Ранкова розминка',
      description: 'Легка розминка після зміни або вранці',
      icon: 'activity',
      lifeAreaId: 'la_q_1',
      projectId: null,
      state: 'active',
      ruleRevisions: [
        {
          id: 'rev_workout_1',
          effectiveFromLocalDate: '2026-11-01',
          rule: { kind: 'selected_weekdays', weekdaysIso: [1, 3, 5] },
          target: { kind: 'binary' },
          createdAt: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repos.saveHabit(workoutHabit);

    // 2026-11-02 is Monday (ISO 1 -> scheduled)
    // 2026-11-03 is Tuesday (ISO 2 -> not scheduled)
    const evalTueBefore = evaluateHabitOnDate({
      habit: workoutHabit,
      entriesForHabit: [],
      localDate: '2026-11-03',
    });
    assert.equal(evalTueBefore.cellStatus, 'not_scheduled');
    assert.equal(evalTueBefore.isScheduledOpportunity, false);

    // Easy previous-date recording after night work (selectedDate = 2026-11-03 -> previousDate = 2026-11-02)
    const prevNightDate = getPreviousLocalDateForNightShift('2026-11-03');
    assert.equal(prevNightDate, '2026-11-02');

    const monEntry = await repos.recordHabitEntryForDateTransactionally({
      habitId: workoutHabit.id,
      localDate: prevNightDate,
      input: { kind: 'complete' },
      nowIso,
    });
    assert.ok(monEntry);
    assert.equal(monEntry.localDate, '2026-11-02');
    assert.equal(monEntry.status, 'completed');

    // Duplicate binary entry for same (habitId, localDate) via saveHabitEntry is rejected
    await assert.rejects(
      async () => {
        await repos.saveHabitEntry({
          id: 'hentry_dup_mon',
          habitId: workoutHabit.id,
          localDate: '2026-11-02',
          status: 'completed',
          numericValue: null,
          note: null,
          recordedAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        });
      },
      (err: unknown) =>
        err instanceof PlanuiError &&
        err.code === 'HABIT_DUPLICATE_BINARY_ENTRY'
    );

    // Intentional skip on Wednesday 2026-11-04: skip is NOT completion
    const wedSkip = await repos.recordHabitEntryForDateTransactionally({
      habitId: workoutHabit.id,
      localDate: '2026-11-04',
      input: { kind: 'skip' },
      nowIso,
    });
    assert.ok(wedSkip);
    assert.equal(wedSkip.status, 'skipped');

    const { snapshot: snapAfterWed } = await repos.captureCoherentSnapshot();
    const evalWed = evaluateHabitOnDate({
      habit: workoutHabit,
      entriesForHabit: snapAfterWed.habitEntries,
      localDate: '2026-11-04',
    });
    assert.equal(evalWed.cellStatus, 'skipped');
    assert.notEqual(evalWed.cellStatus, 'completed');

    // 2. Numeric daily habit (2000 мл води)
    const waterHabit: Habit = {
      id: 'hab_water',
      name: 'Водний баланс',
      description: null,
      icon: 'droplet',
      lifeAreaId: null,
      projectId: null,
      state: 'active',
      ruleRevisions: [
        {
          id: 'rev_water_1',
          effectiveFromLocalDate: '2026-11-01',
          rule: { kind: 'daily' },
          target: { kind: 'numeric', targetValue: 2000, unitUk: 'мл' },
          createdAt: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repos.saveHabit(waterHabit);

    // Record +750 мл -> partial (750/2000)
    const partialWater = await repos.recordHabitEntryForDateTransactionally({
      habitId: waterHabit.id,
      localDate: '2026-11-03',
      input: { kind: 'add_numeric_delta', delta: 750 },
      nowIso,
    });
    assert.ok(partialWater);
    assert.equal(partialWater.status, 'partial');
    assert.equal(partialWater.numericValue, 750);

    // Add +1250 мл -> completed (2000/2000), updating same entry without creating duplicate
    const completedWater = await repos.recordHabitEntryForDateTransactionally({
      habitId: waterHabit.id,
      localDate: '2026-11-03',
      input: { kind: 'add_numeric_delta', delta: 1250 },
      nowIso,
    });
    assert.ok(completedWater);
    assert.equal(completedWater.id, partialWater.id);
    assert.equal(completedWater.status, 'completed');
    assert.equal(completedWater.numericValue, 2000);

    const { snapshot: snapWater } = await repos.captureCoherentSnapshot();
    const waterEntriesOnTue = snapWater.habitEntries.filter(
      (e) => e.habitId === waterHabit.id && e.localDate === '2026-11-03'
    );
    assert.equal(waterEntriesOnTue.length, 1);
  });

  it('9.2 & 9.3 Preserves saved local dates across time zone changes and preserves historical interpretation across effective-dated rule revisions', async () => {
    const { repos } = createTestRepos();
    const nowIso = '2026-11-01T10:00:00.000Z';

    // Habit starts as Mon/Wed/Fri (weekdaysIso: [1, 3, 5]) effective from 2026-11-01
    const readingHabit: Habit = {
      id: 'hab_reading',
      name: 'Читання книги',
      description: '20 сторінок перед сном',
      icon: 'book',
      lifeAreaId: null,
      projectId: null,
      state: 'active',
      ruleRevisions: [
        {
          id: 'rev_read_1',
          effectiveFromLocalDate: '2026-11-01',
          rule: { kind: 'selected_weekdays', weekdaysIso: [1, 3, 5] },
          target: { kind: 'numeric', targetValue: 20, unitUk: 'стор.' },
          createdAt: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repos.saveHabit(readingHabit);

    // Record completion on Monday 2026-11-02 (20 стор.)
    await repos.recordHabitEntryForDateTransactionally({
      habitId: readingHabit.id,
      localDate: '2026-11-02',
      input: { kind: 'set_numeric', numericValue: 20 },
      nowIso,
    });

    // Change display/manual time zone from Europe/Kyiv to America/New_York and Asia/Tokyo
    const settings1 = await repos.getOrInitSettings(nowIso);
    await repos.saveSettings({
      ...settings1,
      timeZoneMode: 'manual',
      manualTimeZone: 'America/New_York',
      updatedAt: nowIso,
      revision: settings1.revision + 1,
    });
    const { snapshot: snapNY } = await repos.captureCoherentSnapshot();
    assert.equal(snapNY.habitEntries[0].localDate, '2026-11-02');

    // Now append a new effective-dated rule revision starting Monday 2026-11-09:
    // Changes to Tue/Thu (weekdaysIso: [2, 4]) and target 30 стор.
    const rev2: HabitRuleRevision = {
      id: 'rev_read_2',
      effectiveFromLocalDate: '2026-11-09',
      rule: { kind: 'selected_weekdays', weekdaysIso: [2, 4] },
      target: { kind: 'numeric', targetValue: 30, unitUk: 'стор.' },
      createdAt: '2026-11-08T12:00:00.000Z',
    };
    const updatedHabit = await repos.saveHabitRuleRevisionTransactionally(
      readingHabit.id,
      rev2,
      '2026-11-08T12:00:00.000Z'
    );

    // Historical week 1 (2026-11-02..2026-11-08) MUST still resolve to rev_read_1 (Mon/Wed/Fri, 20 стор.):
    // Tuesday 2026-11-03 in week 1 was NOT scheduled under rev_read_1
    const evalOldTue = evaluateHabitOnDate({
      habit: updatedHabit,
      entriesForHabit: snapNY.habitEntries,
      localDate: '2026-11-03',
    });
    assert.equal(evalOldTue.effectiveRevision.id, 'rev_read_1');
    assert.equal(evalOldTue.cellStatus, 'not_scheduled');

    // Old Monday 2026-11-02 with 20 стор. remains completed (20/20), not downgraded by the new 30 стор. target!
    const evalOldMon = evaluateHabitOnDate({
      habit: updatedHabit,
      entriesForHabit: snapNY.habitEntries,
      localDate: '2026-11-02',
    });
    assert.equal(evalOldMon.effectiveRevision.id, 'rev_read_1');
    assert.equal(evalOldMon.cellStatus, 'completed');
    assert.equal(evalOldMon.targetValue, 20);

    // Week 2 Tuesday 2026-11-10 uses rev_read_2 (scheduled on Tue/Thu, target 30 стор.)
    const evalNewTue = evaluateHabitOnDate({
      habit: updatedHabit,
      entriesForHabit: snapNY.habitEntries,
      localDate: '2026-11-10',
    });
    assert.equal(evalNewTue.effectiveRevision.id, 'rev_read_2');
    assert.equal(evalNewTue.cellStatus, 'no_entry');
    assert.equal(evalNewTue.isScheduledOpportunity, true);
    assert.equal(evalNewTue.targetValue, 30);
  });

  it('9.3 Computes transparent rule-appropriate streaks (no daily streak for weekly-frequency rules; unscheduled/paused/skipped dates do not break streaks)', async () => {
    const { repos } = createTestRepos();
    const nowIso = '2026-11-01T08:00:00.000Z';

    // 1. Selected weekdays habit (Mon=1, Wed=3, Fri=5)
    const weekdayHabit: Habit = {
      id: 'hab_weekday_streak',
      name: 'Дихальна вправа',
      description: null,
      icon: 'wind',
      lifeAreaId: null,
      projectId: null,
      state: 'active',
      ruleRevisions: [
        {
          id: 'rev_ws_1',
          effectiveFromLocalDate: '2026-11-02',
          rule: { kind: 'selected_weekdays', weekdaysIso: [1, 3, 5] },
          target: { kind: 'binary' },
          createdAt: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repos.saveHabit(weekdayHabit);

    // Complete Mon 2026-11-02, intentionally skip Wed 2026-11-04, complete Fri 2026-11-06.
    // Tue 2026-11-03, Thu 2026-11-05, Sat 2026-11-07, Sun 2026-11-08 are unscheduled.
    await repos.recordHabitEntryForDateTransactionally({
      habitId: weekdayHabit.id,
      localDate: '2026-11-02',
      input: { kind: 'complete' },
      nowIso,
    });
    await repos.recordHabitEntryForDateTransactionally({
      habitId: weekdayHabit.id,
      localDate: '2026-11-04',
      input: { kind: 'skip' },
      nowIso,
    });
    await repos.recordHabitEntryForDateTransactionally({
      habitId: weekdayHabit.id,
      localDate: '2026-11-06',
      input: { kind: 'complete' },
      nowIso,
    });

    const { snapshot: snap1 } = await repos.captureCoherentSnapshot();
    const weekdayStreak = computeHabitStreakSummary(
      weekdayHabit,
      snap1.habitEntries,
      '2026-11-08'
    );
    assert.equal(weekdayStreak.kind, 'scheduled_days_streak');
    // Mon (completed) + Fri (completed) = 2; Wed (skipped) neither breaks the streak nor increments completion count
    assert.equal(weekdayStreak.currentCount, 2);

    // 2. Weekly-frequency habit (2 times per week) -> MUST NOT report a daily streak
    const weeklyFreqHabit: Habit = {
      id: 'hab_weekly_freq',
      name: 'Басейн або плавання',
      description: null,
      icon: 'waves',
      lifeAreaId: null,
      projectId: null,
      state: 'active',
      ruleRevisions: [
        {
          id: 'rev_wf_1',
          effectiveFromLocalDate: '2026-10-19',
          rule: { kind: 'weekly_frequency', timesPerWeek: 2 },
          target: { kind: 'binary' },
          createdAt: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repos.saveHabit(weeklyFreqHabit);

    // Week 1 (2026-10-19..2026-10-25): completed 2 times (Tue Oct 20, Sat Oct 24)
    await repos.recordHabitEntryForDateTransactionally({
      habitId: weeklyFreqHabit.id,
      localDate: '2026-10-20',
      input: { kind: 'complete' },
      nowIso,
    });
    await repos.recordHabitEntryForDateTransactionally({
      habitId: weeklyFreqHabit.id,
      localDate: '2026-10-24',
      input: { kind: 'complete' },
      nowIso,
    });

    // Week 2 (2026-10-26..2026-11-01): completed 2 times (Wed Oct 28, Sun Nov 01)
    await repos.recordHabitEntryForDateTransactionally({
      habitId: weeklyFreqHabit.id,
      localDate: '2026-10-28',
      input: { kind: 'complete' },
      nowIso,
    });
    await repos.recordHabitEntryForDateTransactionally({
      habitId: weeklyFreqHabit.id,
      localDate: '2026-11-01',
      input: { kind: 'complete' },
      nowIso,
    });

    const { snapshot: snap2 } = await repos.captureCoherentSnapshot();
    const weeklyStreak = computeHabitStreakSummary(
      weeklyFreqHabit,
      snap2.habitEntries,
      '2026-11-03'
    );
    assert.equal(weeklyStreak.kind, 'weekly_target_streak');
    assert.equal(weeklyStreak.currentCount, 2);

    // Once 2 entries are completed in Week 2 (2026-10-26..2026-11-01), unrecorded days of Week 2 are 'not_scheduled'
    const evalOct30 = evaluateHabitOnDate({
      habit: weeklyFreqHabit,
      entriesForHabit: snap2.habitEntries,
      localDate: '2026-10-30',
    });
    assert.equal(evalOct30.cellStatus, 'not_scheduled');
  });

  it('9.3 & 9.4 Pause/archive preserve entries, deletion explains history impact, Today synchronizes with Habits, and Habits never occupy calendar time', async () => {
    const { repos } = createTestRepos();
    const nowIso = '2026-11-03T09:00:00.000Z';

    const proj: Project = {
      id: 'proj_music',
      title: 'Музичний альбом',
      description: null,
      desiredOutcome: 'Записати 5 треків',
      completionCriteria: null,
      targetDate: null,
      folderId: null,
      lifeAreaId: null,
      collaboratorText: null,
      state: 'active',
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };
    await repos.saveProject(proj);

    const guitarHabit: Habit = {
      id: 'hab_guitar',
      name: 'Практика гри на гітарі',
      description: '30 хвилин вправ',
      icon: 'music',
      lifeAreaId: null,
      projectId: proj.id,
      state: 'active',
      ruleRevisions: [
        {
          id: 'rev_guitar_1',
          effectiveFromLocalDate: '2026-11-01',
          rule: { kind: 'daily' },
          target: { kind: 'numeric', targetValue: 30, unitUk: 'хв' },
          createdAt: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repos.saveHabit(guitarHabit);

    // Record entry from Today on 2026-11-03
    await repos.recordHabitEntryForDateTransactionally({
      habitId: guitarHabit.id,
      localDate: '2026-11-03',
      input: { kind: 'complete' },
      nowIso,
    });

    const { snapshot: snapActive } = await repos.captureCoherentSnapshot();
    const todayBlockOnNov3 = selectHabitsForTodayBlock(
      snapActive.habits,
      snapActive.habitEntries,
      '2026-11-03'
    );
    assert.equal(todayBlockOnNov3.length, 1);
    assert.equal(todayBlockOnNov3[0].cellStatus, 'completed');
    assert.equal(todayBlockOnNov3[0].numericValue, 30);

    // Selected-date relevance: on 2026-11-04 (tomorrow), Today block shows 'no_entry' for that selected date
    const todayBlockOnNov4 = selectHabitsForTodayBlock(
      snapActive.habits,
      snapActive.habitEntries,
      '2026-11-04'
    );
    assert.equal(todayBlockOnNov4.length, 1);
    assert.equal(todayBlockOnNov4[0].cellStatus, 'no_entry');

    // Habits NEVER occupy calendar time or reduce unoccupied gaps (C10 / C14 / 9.4)
    const scheduleNov3 = projectScheduleForDate({
      localDate: '2026-11-03',
      displayZone: 'Europe/Kyiv',
      events: snapActive.events,
      reservations: snapActive.reservations,
      tasks: snapActive.tasks,
      dayOffAnnotations: snapActive.dayOffAnnotations,
    });
    assert.equal(scheduleNov3.availability.totalOccupiedMinutes, 0);
    assert.equal(scheduleNov3.availability.totalUnoccupiedMinutes, 1440);

    // Pause habit: preserves entry on 2026-11-03, marks unrecorded 2026-11-04 as 'paused', hides from active Today block
    const pausedHabit = await repos.updateHabitStateTransactionally(
      guitarHabit.id,
      'paused',
      nowIso
    );
    const { snapshot: snapPaused } = await repos.captureCoherentSnapshot();
    assert.equal(snapPaused.habitEntries.length, 1);

    const evalPausedNov3 = evaluateHabitOnDate({
      habit: pausedHabit,
      entriesForHabit: snapPaused.habitEntries,
      localDate: '2026-11-03',
    });
    assert.equal(evalPausedNov3.cellStatus, 'completed');

    const evalPausedNov4 = evaluateHabitOnDate({
      habit: pausedHabit,
      entriesForHabit: snapPaused.habitEntries,
      localDate: '2026-11-04',
    });
    assert.equal(evalPausedNov4.cellStatus, 'paused');

    assert.equal(
      selectHabitsForTodayBlock(
        snapPaused.habits,
        snapPaused.habitEntries,
        '2026-11-04'
      ).length,
      0
    );

    // Archive habit: preserves entry on 2026-11-03
    const archivedHabit = await repos.updateHabitStateTransactionally(
      guitarHabit.id,
      'archived',
      nowIso
    );
    assert.equal(archivedHabit.state, 'archived');

    // Delete impact inspection and deletion
    const impact = computeHabitDeleteImpact(
      archivedHabit,
      snapPaused.habitEntries
    );
    assert.equal(impact.totalEntriesCount, 1);
    assert.equal(impact.completedEntriesCount, 1);
    assert.equal(impact.ruleRevisionsCount, 1);

    const delRes = await repos.deleteHabitWithHistoryTransactionally(
      guitarHabit.id,
      nowIso
    );
    assert.equal(delRes.deletedEntriesCount, 1);

    const { snapshot: snapAfterDelete } = await repos.captureCoherentSnapshot();
    assert.equal(snapAfterDelete.habits.length, 0);
    assert.equal(snapAfterDelete.habitEntries.length, 0);
  });

  it('9.5 Survives full ZIP backup export, validation, and atomic replacement round-trip with multi-revision habits and entries', async () => {
    const { repos } = createTestRepos();
    const nowIso = '2026-11-03T10:00:00.000Z';

    const habit: Habit = {
      id: 'hab_backup_1',
      name: 'Вечірня прогулянка',
      description: 'Свіже повітря без екранів',
      icon: 'footprints',
      lifeAreaId: null,
      projectId: null,
      state: 'active',
      ruleRevisions: [
        {
          id: 'rev_walk_1',
          effectiveFromLocalDate: '2026-10-01',
          rule: { kind: 'selected_weekdays', weekdaysIso: [1, 3, 5] },
          target: { kind: 'numeric', targetValue: 30, unitUk: 'хв' },
          createdAt: nowIso,
        },
        {
          id: 'rev_walk_2',
          effectiveFromLocalDate: '2026-11-01',
          rule: { kind: 'daily' },
          target: { kind: 'numeric', targetValue: 45, unitUk: 'хв' },
          createdAt: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repos.saveHabit(habit);

    await repos.recordHabitEntryForDateTransactionally({
      habitId: habit.id,
      localDate: '2026-10-30',
      input: { kind: 'set_numeric', numericValue: 30, note: 'Осінній парк' },
      nowIso,
    });
    await repos.recordHabitEntryForDateTransactionally({
      habitId: habit.id,
      localDate: '2026-11-02',
      input: { kind: 'set_numeric', numericValue: 20, note: 'Коротка прогулянка' },
      nowIso,
    });
    await repos.recordHabitEntryForDateTransactionally({
      habitId: habit.id,
      localDate: '2026-11-03',
      input: { kind: 'set_numeric', numericValue: 45 },
      nowIso,
    });

    const { zipBytes } = await exportFullBackupZip(repos, nowIso);
    const validated = await validateBackupArchive(zipBytes);
    assert.equal(validated.manifest.entityCounts.habits, 1);
    assert.equal(validated.manifest.entityCounts.habitEntries, 3);

    const { repos: targetRepos } = createTestRepos();
    await executeAtomicBackupReplacement(targetRepos, validated, {
      explicitUserConfirmation: true,
      nowIso: '2026-11-03T11:00:00.000Z',
    });

    const { snapshot: restored } = await targetRepos.captureCoherentSnapshot();
    assert.equal(restored.habits.length, 1);
    assert.equal(restored.habits[0].ruleRevisions.length, 2);
    assert.equal(restored.habitEntries.length, 3);

    const monthOct = computeHabitMonthProgress(
      restored.habits[0],
      restored.habitEntries,
      2026,
      10
    );
    assert.equal(monthOct.completedCount, 1);

    const monthNov = computeHabitMonthProgress(
      restored.habits[0],
      restored.habitEntries,
      2026,
      11
    );
    assert.equal(monthNov.completedCount, 1);
    assert.equal(monthNov.partialCount, 1);
    assert.ok(
      formatHabitRuleSummaryUk(
        getEffectiveHabitRuleRevisionForDate(restored.habits[0], '2026-11-03')
          .rule,
        getEffectiveHabitRuleRevisionForDate(restored.habits[0], '2026-11-03')
          .target
      ).includes('Щодня')
    );
  });
});
