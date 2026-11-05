import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatDateRange, formatDayMonth, formatDeadline, formatDuration, formatInstant, formatMonthYear, formatShortDate, formatSubtitle, formatTime, formatTimeRange } from '../format';
describe('Ukrainian UI formatting',()=>{
  it('capitalizes only the first word of the subtitle, independent of process timezone',()=>{
    assert.equal(formatSubtitle('2026-11-05'),'Четвер, 5 листопада');
    assert.equal(formatShortDate('2026-11-05'),'чт, 5 листопада');
    assert.equal(formatDayMonth('2026-11-05'),'5 листопада');
    assert.equal(formatMonthYear('2026-11-05'),'листопад 2026 р.');
    assert.equal(formatDate('2026-02-29'),'—');
    assert.equal(formatDate('not-a-date'),'—');
  });
  it('formats same-month, cross-month and cross-year date ranges',()=>{
    assert.equal(formatDateRange('2026-11-02','2026-11-08'),'2-8 листопада');
    assert.equal(formatDateRange('2026-10-29','2026-11-04'),'29 жовтня – 4 листопада');
    assert.match(formatDateRange('2026-12-31','2027-01-02'),/2026.*2027/);
    assert.equal(formatDateRange('invalid','2026-11-08'),'—');
    assert.equal(formatDeadline('2026-11-09'),'9.11');
  });
  it('formats zoned instants without exposing the zone in the label',()=>{
    assert.equal(formatInstant('2026-11-05T03:41:00Z','Europe/Kyiv',{hour:'2-digit',minute:'2-digit'}),'05:41');
    assert.equal(formatInstant('2026-11-04T23:41:00Z','Europe/Kyiv',{day:'numeric',month:'long'}),'5 листопада');
    assert.equal(formatInstant('invalid','UTC'),'—');
  });
  it('keeps local clock times and midnight boundaries',()=>{
    assert.equal(formatTime('5:41'),'05:41');assert.equal(formatTime('24:00'),'24:00');
    assert.equal(formatTime('24:01'),'—');assert.equal(formatTime('12:65'),'—');
    assert.equal(formatTimeRange('20:00','08:00',true),'20:00–08:00 (+1 д.)');
  });
  it('formats durations with explicit units including zero and partial hours',()=>{
    for(const [n,label] of [[0,'0 хв'],[15,'15 хв'],[60,'1 год'],[90,'1 год 30 хв'],[1440,'24 год'],[-2,'0 хв'],[59.6,'1 год']] as const)assert.equal(formatDuration(n),label);
    assert.equal(formatDuration(NaN),'—');
  });
});
