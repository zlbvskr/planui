import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocalDateTimeToInstant } from '../../domain/temporal';
import { generateFinitePeriodRosterPreview } from '../../domain/roster';
import { isRuleScheduledOnWeekday } from '../../domain/habits';

describe('Cleanup baseline: calendar recurrence and timezone boundaries', () => {
  it('rejects a half-hour DST gap and disambiguates repeated time in Lord Howe', () => {
    assert.throws(() => resolveLocalDateTimeToInstant('2026-10-04', '02:15', 'Australia/Lord_Howe', 'reject'));
    const early = resolveLocalDateTimeToInstant('2026-04-05', '01:45', 'Australia/Lord_Howe', 'earlier');
    const late = resolveLocalDateTimeToInstant('2026-04-05', '01:45', 'Australia/Lord_Howe', 'later');
    assert.equal(early.status, 'repeated');
    assert.equal(early.instant, '2026-04-04T14:45:00.000Z');
    assert.equal(late.instant, '2026-04-04T15:15:00.000Z');
  });

  it('anchors finite recurring shifts to local dates across Kyiv DST', () => {
    const preview = generateFinitePeriodRosterPreview({
      startDate: '2026-03-28', endDate: '2026-04-01', cycleEveryDays: 2,
      action: { kind: 'custom_shift', title: 'Нічна', startLocalTime: '22:00', endLocalTime: '06:00', endDateOffsetDays: 1 },
      lockedZoneId: 'Europe/Kyiv', existingEvents: [], existingReservations: [], existingDayOffAnnotations: [],
      nowIso: '2026-03-01T00:00:00.000Z', idPrefix: 'regression',
    });
    assert.equal(preview.blockingErrorCount, 0);
    assert.deepEqual(preview.items.map(item => item.localDate), ['2026-03-28', '2026-03-30', '2026-04-01']);
    assert.deepEqual(preview.items.map(item => item.elapsedDurationMinutes), [420, 480, 480]);
    assert.deepEqual(preview.items.map(item => item.endLocalDate), ['2026-03-29', '2026-03-31', '2026-04-02']);
  });

  it('uses calendar weekdays across leap day and requires explicit days off', () => {
    const rule = { kind: 'selected_weekdays' as const, weekdaysIso: [4] };
    assert.equal(isRuleScheduledOnWeekday(rule, '2024-02-29'), true);
    assert.equal(isRuleScheduledOnWeekday(rule, '2024-03-01'), false);
    assert.equal(isRuleScheduledOnWeekday({ kind: 'days_off' }, '2024-02-29'), false);
    assert.equal(isRuleScheduledOnWeekday({ kind: 'days_off' }, '2024-02-29', ['2024-02-29']), true);
  });
});
