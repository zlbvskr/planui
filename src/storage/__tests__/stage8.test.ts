import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthWorkSummary,
  generateFinitePeriodRosterPreview,
  instantiateWorkShiftFromTemplate,
  parseDeterministicRosterText,
  prepareMultiDateRosterBatch,
} from '../../domain/roster';
import { ShiftTemplate } from '../../domain/types';
import { InMemoryTransactionalEngine } from '../db';
import { PlanuiRepositories } from '../repositories';
import {
  executeAtomicBackupReplacement,
  exportFullBackupZip,
  validateBackupArchive,
} from '../backup/backupService';

const SAMPLE_DAY_TEMPLATE: ShiftTemplate = {
  id: 'tpl-day-1',
  name: 'Денна зміна (12 год)',
  code: 'Д1',
  startLocalTime: '08:00',
  endLocalTime: '20:00',
  endDateOffsetDays: 0,
  color: 'work',
  note: 'Чергування у відділенні',
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
  revision: 1,
};

const SAMPLE_NIGHT_TEMPLATE: ShiftTemplate = {
  id: 'tpl-night-1',
  name: 'Нічна зміна (22:00–06:00)',
  code: 'Н1',
  startLocalTime: '22:00',
  endLocalTime: '06:00',
  endDateOffsetDays: 1,
  color: 'work',
  note: 'Нічне чергування',
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
  revision: 1,
};

describe('Stage 8: Irregular Work Roster Tools (C09, C13, 8.1-8.7)', () => {
  it('8.2 Templates copy values into independent events; editing or deleting a template never rewrites applied shifts', async () => {
    const engine = new InMemoryTransactionalEngine();
    const repos = new PlanuiRepositories(engine);
    await repos.getOrInitSettings('2026-11-01T08:00:00.000Z');

    const savedTpl = await repos.saveShiftTemplate(SAMPLE_NIGHT_TEMPLATE);
    assert.equal(savedTpl.code, 'Н1');

    // Duplicate template code is rejected
    await assert.rejects(
      async () => {
        await repos.saveShiftTemplate({
          ...SAMPLE_DAY_TEMPLATE,
          id: 'tpl-dup',
          code: 'н1',
        });
      },
      (err: Error) => err.message.includes('кодом уже існує')
    );

    // Apply shift from template on 2026-11-05
    const instantiated = instantiateWorkShiftFromTemplate({
      id: 'shift-from-tpl-1',
      template: savedTpl,
      startLocalDate: '2026-11-05',
      zoneId: 'Europe/Kyiv',
      nowIso: '2026-11-01T09:00:00.000Z',
    });

    await repos.applyRosterBatchTransactionally(
      {
        eventsToSave: [instantiated.event],
        dayOffAnnotationsToSave: [],
      },
      '2026-11-01T09:00:00.000Z'
    );

    // Edit the template to completely different hours and name
    await repos.saveShiftTemplate(
      {
        ...savedTpl,
        name: 'Оновлена нічна зміна',
        startLocalTime: '21:00',
        endLocalTime: '07:00',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
      savedTpl.revision
    );

    // Delete the template
    await repos.deleteShiftTemplateTransactionally(
      savedTpl.id,
      '2026-11-01T11:00:00.000Z'
    );

    const { snapshot } = await repos.captureCoherentSnapshot();
    assert.equal(snapshot.shiftTemplates.length, 0);
    assert.equal(snapshot.events.length, 1);

    const persistedShift = snapshot.events[0];
    assert.equal(persistedShift.title, 'Нічна зміна (22:00–06:00)');
    assert.equal(persistedShift.workProperties?.shiftCode, 'Н1');
    assert.equal(
      persistedShift.workProperties?.sourceTemplateId,
      'tpl-night-1'
    );
    assert.equal(persistedShift.schedule.kind, 'timed');
    if (persistedShift.schedule.kind === 'timed') {
      assert.equal(
        persistedShift.schedule.interval.originStartLocalTime,
        '22:00'
      );
      assert.equal(
        persistedShift.schedule.interval.originEndLocalTime,
        '06:00'
      );
      assert.equal(
        persistedShift.schedule.interval.originEndLocalDate,
        '2026-11-06'
      );
    }
  });

  it('8.3 & 8.7 Multi-date batch selection, atomic rollback on invalid record, and revision-safe undo preserving later edits', async () => {
    const engine = new InMemoryTransactionalEngine();
    const repos = new PlanuiRepositories(engine);
    await repos.getOrInitSettings('2026-11-01T08:00:00.000Z');

    // Prepare nonconsecutive dates: 2026-11-03, 2026-11-07, 2026-11-12
    const preview = prepareMultiDateRosterBatch({
      selectedDates: ['2026-11-07', '2026-11-03', '2026-11-12'],
      action: {
        kind: 'template_shift',
        template: SAMPLE_DAY_TEMPLATE,
      },
      lockedZoneId: 'Europe/Kyiv',
      existingEvents: [],
      existingReservations: [],
      existingDayOffAnnotations: [],
      nowIso: '2026-11-01T09:00:00.000Z',
      idPrefix: 'batch-1',
    });

    assert.equal(preview.canCommit, true);
    assert.equal(preview.totalShiftsToSave, 3);
    assert.equal(preview.totalDayOffsToSave, 0);
    assert.equal(preview.totalElapsedMinutes, 3 * 720);

    // Commit batch
    const commitRes = await repos.applyRosterBatchTransactionally(
      {
        eventsToSave: preview.eventsToSave,
        dayOffAnnotationsToSave: preview.dayOffAnnotationsToSave,
      },
      '2026-11-01T09:00:00.000Z'
    );
    assert.equal(commitRes.savedEvents, 3);

    // Unselected dates remain completely neutral (0 day-off annotations)
    let snap = (await repos.captureCoherentSnapshot()).snapshot;
    assert.equal(snap.dayOffAnnotations.length, 0);
    assert.equal(snap.events.length, 3);

    // Simulate a later manual edit on the 2026-11-07 shift (advancing its revision from 1 to 2)
    const editedShift = snap.events.find(
      (e) =>
        e.schedule.kind === 'timed' &&
        e.schedule.interval.originStartLocalDate === '2026-11-07'
    )!;
    await repos.saveCalendarEvent(
      {
        ...editedShift,
        title: 'Денна зміна (відредаговано вручну)',
        updatedAt: '2026-11-01T09:30:00.000Z',
      },
      editedShift.revision
    );

    // Trigger revision-safe undo: should remove the 2 unmodified shifts (Nov 3 & Nov 12) and preserve the manually edited Nov 7 shift!
    const undoRes = await repos.undoRosterBatchTransactionally(
      commitRes.undoToken,
      '2026-11-01T09:35:00.000Z'
    );
    assert.equal(undoRes.restoredEventsCount, 2);
    assert.equal(undoRes.preservedLaterEditsCount, 1);

    snap = (await repos.captureCoherentSnapshot()).snapshot;
    assert.equal(snap.events.length, 1);
    assert.equal(snap.events[0].title, 'Денна зміна (відредаговано вручну)');

    // Atomic rollback test: if a batch contains an invalid event, zero records from the batch are written
    const firstBatchEvent = preview.eventsToSave[0];
    assert.equal(firstBatchEvent.schedule.kind, 'timed');
    const badEvent = {
      ...firstBatchEvent,
      id: 'bad-shift-equal-clocks',
      schedule: {
        kind: 'timed' as const,
        interval: {
          ...firstBatchEvent.schedule.interval,
          originStartLocalDate: '2026-11-20',
          originStartLocalTime: '08:00',
          originEndLocalDate: '2026-11-20',
          originEndLocalTime: '08:00',
        },
      },
    };
    await assert.rejects(async () => {
      await repos.applyRosterBatchTransactionally({
        eventsToSave: [preview.eventsToSave[0], badEvent],
        dayOffAnnotationsToSave: [],
      });
    });

    snap = (await repos.captureCoherentSnapshot()).snapshot;
    assert.equal(snap.events.length, 1);
  });

  it('8.4 Finite period generation produces independent shifts for selected weekdays locked to the preview zone', () => {
    // 2026-11-02 (Monday) .. 2026-11-15 (Sunday) = 2 weeks
    // Select Monday (0), Wednesday (2), Friday (4) -> 6 shifts
    const genPreview = generateFinitePeriodRosterPreview({
      startDate: '2026-11-02',
      endDate: '2026-11-15',
      selectedWeekdaysMondayFirst: [0, 2, 4],
      action: {
        kind: 'template_shift',
        template: SAMPLE_NIGHT_TEMPLATE,
      },
      lockedZoneId: 'Europe/Kyiv',
      existingEvents: [],
      existingReservations: [],
      existingDayOffAnnotations: [],
      nowIso: '2026-11-01T10:00:00.000Z',
    });

    assert.equal(genPreview.lockedZoneId, 'Europe/Kyiv');
    assert.equal(genPreview.totalShiftsToSave, 6);
    const startDates = genPreview.eventsToSave.map((e) =>
      e.schedule.kind === 'timed'
        ? e.schedule.interval.originStartLocalDate
        : ''
    );
    assert.deepEqual(startDates, [
      '2026-11-02',
      '2026-11-04',
      '2026-11-06',
      '2026-11-09',
      '2026-11-11',
      '2026-11-13',
    ]);
    // Every generated shift has a distinct ID and no recurrence series coupling
    const uniqueIds = new Set(genPreview.eventsToSave.map((e) => e.id));
    assert.equal(uniqueIds.size, 6);
  });

  it('8.5 Deterministic local text parser handles templates, manual ranges, overnight carryover mixed state, DST, and error exclusion', () => {
    const rawRosterText = [
      '# Графік на листопад 2026',
      '3 Н1 | Нічне чергування',
      '4 В | Відпочинок після ночі', // Valid mixed state: overnight carryover 00:00-06:00 from Nov 3 onto off-day Nov 4
      '6 08:00-20:00 Денна',
      '8 22:00-06:00', // Earlier end clock suggests next day (+1 доба)
      '10 08:00-08:00 +1', // Explicit +1 offset allows 24h shift
      '12 08:00-08:00', // Equal clocks without +1 -> blocking error
      '31 Д1', // Nov 31 does not exist -> blocking error
      '15 Z99', // Unknown template code -> blocking error
      '6 08:00-20:00', // Duplicate identical shift -> blocking error
    ].join('\n');

    const initialParse = parseDeterministicRosterText({
      rawText: rawRosterText,
      targetYear: 2026,
      targetMonth1To12: 11,
      lockedZoneId: 'Europe/Kyiv',
      templates: [SAMPLE_DAY_TEMPLATE, SAMPLE_NIGHT_TEMPLATE],
      existingEvents: [],
      existingReservations: [],
      existingDayOffAnnotations: [],
      nowIso: '2026-11-01T12:00:00.000Z',
    });

    // Cannot commit while 4 blocking errors remain (lines 7, 8, 9, 10)
    assert.equal(initialParse.canCommit, false);
    assert.equal(initialParse.blockingErrorCount, 4);

    // Check line 3 (`4 В`) is recognized as a valid mixed state with overnight carryover, NOT a blocking error!
    const dayOffNov4Item = initialParse.items.find(
      (i) => i.localDate === '2026-11-04' && i.kind === 'day_off'
    )!;
    assert.ok(dayOffNov4Item);
    assert.equal(dayOffNov4Item.hasBlockingError, false);
    assert.equal(dayOffNov4Item.isMixedDayOffCarryover, true);

    // Check line 5 (`8 22:00-06:00`) suggested next day (`2026-11-09`)
    const autoOvernightItem = initialParse.items.find(
      (i) => i.localDate === '2026-11-08'
    )!;
    assert.equal(autoOvernightItem.hasBlockingError, false);
    assert.equal(autoOvernightItem.isAutoNextDaySuggested, true);
    assert.equal(autoOvernightItem.endLocalDate, '2026-11-09');
    assert.equal(autoOvernightItem.elapsedDurationMinutes, 480);

    // Check line 6 (`10 08:00-08:00 +1`) resolved to 24h (1440m)
    const twentyFourHourItem = initialParse.items.find(
      (i) => i.localDate === '2026-11-10'
    )!;
    assert.equal(twentyFourHourItem.hasBlockingError, false);
    assert.equal(twentyFourHourItem.elapsedDurationMinutes, 1440);

    // Exclude the 4 invalid lines (lines 7, 8, 9, 10) and verify the batch becomes committable
    const errorLineNumbers = new Set(
      initialParse.items
        .filter((i) => i.hasBlockingError && i.sourceLineNumber !== undefined)
        .map((i) => i.sourceLineNumber!)
    );
    assert.deepEqual(Array.from(errorLineNumbers), [7, 8, 9, 10]);

    const cleanedParse = parseDeterministicRosterText({
      rawText: rawRosterText,
      targetYear: 2026,
      targetMonth1To12: 11,
      lockedZoneId: 'Europe/Kyiv',
      templates: [SAMPLE_DAY_TEMPLATE, SAMPLE_NIGHT_TEMPLATE],
      existingEvents: [],
      existingReservations: [],
      existingDayOffAnnotations: [],
      excludedLineNumbers: errorLineNumbers,
      nowIso: '2026-11-01T12:00:00.000Z',
    });

    assert.equal(cleanedParse.canCommit, true);
    assert.equal(cleanedParse.blockingErrorCount, 0);
    assert.equal(cleanedParse.totalShiftsToSave, 4);
    assert.equal(cleanedParse.totalDayOffsToSave, 1);

    // DST check: March 29, 2026 in Europe/Kyiv (03:00 -> 04:00 spring-forward gap)
    const dstSpringParse = parseDeterministicRosterText({
      rawText: '29 03:30-12:00\n28 22:00-06:00',
      targetYear: 2026,
      targetMonth1To12: 3,
      lockedZoneId: 'Europe/Kyiv',
      templates: [],
      existingEvents: [],
      existingReservations: [],
      existingDayOffAnnotations: [],
      nowIso: '2026-03-01T12:00:00.000Z',
    });
    // 29 03:30 is nonexistent in Europe/Kyiv -> flagged as DST_GAP_NONEXISTENT_TIME
    const gapRow = dstSpringParse.items.find(
      (i) => i.localDate === '2026-03-29'
    )!;
    assert.equal(gapRow.hasBlockingError, true);
    assert.ok(
      gapRow.diagnostics.some((d) => d.code === 'DST_GAP_NONEXISTENT_TIME')
    );
    // 28 22:00-06:00 crosses the spring-forward transition -> elapsed duration is 7 hours (420 min), not 8 hours!
    const springOvernightRow = dstSpringParse.items.find(
      (i) => i.localDate === '2026-03-28'
    )!;
    assert.equal(springOvernightRow.hasBlockingError, false);
    assert.equal(springOvernightRow.elapsedDurationMinutes, 420);
  });

  it('8.6 & 8.7 Month work summary counts distinct shifts (never segments), clips month-boundary shifts, and survives full ZIP backup round-trip', async () => {
    const engine = new InMemoryTransactionalEngine();
    const repos = new PlanuiRepositories(engine);
    await repos.getOrInitSettings('2026-11-01T08:00:00.000Z');

    await repos.saveShiftTemplate(SAMPLE_DAY_TEMPLATE);
    await repos.saveShiftTemplate(SAMPLE_NIGHT_TEMPLATE);

    // Parse a November 2026 schedule that includes:
    // 1) Nov 3 22:00 - Nov 4 06:00 (8h entirely inside Nov, spans 2 display days)
    // 2) Nov 4 В (explicit day off with overnight carryover from Nov 3)
    // 3) Nov 15 08:00 - 20:00 (12h inside Nov)
    // 4) Nov 30 22:00 - Dec 1 06:00 (8h full shift: 2h inside Nov, 6h inside Dec)
    const parsed = parseDeterministicRosterText({
      rawText: ['3 Н1', '4 В', '15 Д1', '30 Н1'].join('\n'),
      targetYear: 2026,
      targetMonth1To12: 11,
      lockedZoneId: 'Europe/Kyiv',
      templates: [SAMPLE_DAY_TEMPLATE, SAMPLE_NIGHT_TEMPLATE],
      existingEvents: [],
      existingReservations: [],
      existingDayOffAnnotations: [],
      nowIso: '2026-11-01T12:00:00.000Z',
    });

    assert.equal(parsed.canCommit, true);
    await repos.applyRosterBatchTransactionally({
      eventsToSave: parsed.eventsToSave,
      dayOffAnnotationsToSave: parsed.dayOffAnnotationsToSave,
    });

    const { snapshot } = await repos.captureCoherentSnapshot();
    const novSummary = calculateMonthWorkSummary({
      referenceDateInMonth: '2026-11-15',
      displayZone: 'Europe/Kyiv',
      events: snapshot.events,
      dayOffAnnotations: snapshot.dayOffAnnotations,
    });

    // 3 shifts total (Nov 3 night shift is counted as 1 shift, NOT 2 segments!)
    assert.equal(novSummary.intersectingShiftCount, 3);
    // Exact duration inside November: 8h (480m) + 12h (720m) + 2h (120m from Nov 30 22:00..24:00) = 22h (1320m)
    assert.equal(novSummary.intersectingWorkMinutes, 1320);
    // Full shift duration of those 3 shifts: 8h + 12h + 8h = 28h (1680m)
    assert.equal(novSummary.fullShiftsTotalMinutes, 1680);
    assert.equal(novSummary.boundaryCrossingShiftCount, 1);
    assert.equal(novSummary.explicitDayOffCount, 1);
    assert.equal(novSummary.mixedDayOffCarryoverCount, 1);

    // December 2026 summary should include the 6h (360m) carryover from Nov 30 -> Dec 1
    const decSummary = calculateMonthWorkSummary({
      referenceDateInMonth: '2026-12-01',
      displayZone: 'Europe/Kyiv',
      events: snapshot.events,
      dayOffAnnotations: snapshot.dayOffAnnotations,
    });
    assert.equal(decSummary.intersectingShiftCount, 1);
    assert.equal(decSummary.intersectingWorkMinutes, 360);
    assert.equal(decSummary.fullShiftsTotalMinutes, 480);

    // Verify full ZIP backup export & restore preserves templates, shifts, and day-off annotations
    const { zipBytes } = await exportFullBackupZip(
      repos,
      '2026-11-01T13:00:00.000Z'
    );
    const targetEngine = new InMemoryTransactionalEngine();
    const targetRepos = new PlanuiRepositories(targetEngine);

    const validated = await validateBackupArchive(zipBytes);
    assert.equal(validated.manifest.entityCounts.shiftTemplates, 2);
    assert.equal(validated.manifest.entityCounts.events, 3);
    assert.equal(validated.manifest.entityCounts.dayOffAnnotations, 1);

    await executeAtomicBackupReplacement(targetRepos, validated, {
      explicitUserConfirmation: true,
      nowIso: '2026-11-01T14:00:00.000Z',
    });

    const restoredSnap = (await targetRepos.captureCoherentSnapshot()).snapshot;
    assert.equal(restoredSnap.shiftTemplates.length, 2);
    assert.equal(restoredSnap.events.length, 3);
    assert.equal(restoredSnap.dayOffAnnotations.length, 1);
  });
});
