import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
} from 'lucide-react';
import {
  CalendarEvent,
  DayOffAnnotation,
  EntityId,
  IanaTimeZone,
  LocalDateString,
  ShiftTemplate,
  Task,
  TaskReservation,
} from '../domain/types';
import {
  addDaysToLocalDate,
  addMonthsToLocalDate,
  formatUkrainianDateHeading,
} from '../domain/temporal';
import {
  CalendarSecondaryFilter,
  ProjectedDaySchedule,
  ProjectedMonthCell,
  ProjectedTimelineItem,
  UnoccupiedTimeGap,
  applyCalendarSecondaryFilter,
  layoutTimelineOverlapLanes,
  projectMonthCalendarGrid,
  projectScheduleForDate,
  projectWeekCalendarOverview,
  selectCalendarDateFromCell,
} from '../domain/scheduling';
import {
  CalendarViewMode,
  ImplementedCreationActionKind,
} from '../state/shellStore';
import { PlanuiRepositories } from '../storage/repositories';
import { UK_STRINGS } from '../i18n/uk';
import {
  Button,
  Card,
  EmptyStateCard,
  SegmentedControl,
} from '../components/ui/primitives';
import { SharedDayTimeline } from '../components/timeline/SharedDayTimeline';
import { WorkRosterSubview } from '../components/roster/WorkRosterSubview';

export interface CalendarWorkspaceViewProps {
  selectedDate: LocalDateString;
  actualTodayDate: LocalDateString;
  mode: CalendarViewMode;
  secondaryFilter: CalendarSecondaryFilter;
  displayZone: IanaTimeZone;
  nowMs: number;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  shiftTemplates: readonly ShiftTemplate[];
  repositories: PlanuiRepositories;
  onChangeMode: (nextMode: CalendarViewMode) => void;
  onChangeSecondaryFilter: (nextFilter: CalendarSecondaryFilter) => void;
  onSelectDate: (nextDate: LocalDateString) => void;
  onToggleTaskState: (taskId: EntityId) => Promise<void> | void;
  onCancelEvent: (eventId: EntityId, revision: number) => Promise<void> | void;
  onInspectEvent: (event: CalendarEvent) => void;
  onOpenGapPicker: (gap: UnoccupiedTimeGap) => void;
  onOpenGlobalCreation: (preferredAction?: ImplementedCreationActionKind) => void;
  onDataChanged: (feedbackMessage?: string) => Promise<void> | void;
  onModalStateChange?: (isOpen: boolean) => void;
}

function formatMinutesCompactUk(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} год ${m} хв`;
  if (h > 0) return `${h} год`;
  return `${m} хв`;
}

export const CalendarWorkspaceView: React.FC<CalendarWorkspaceViewProps> = ({
  selectedDate,
  actualTodayDate,
  mode,
  secondaryFilter,
  displayZone,
  nowMs,
  events,
  reservations,
  tasks,
  dayOffAnnotations,
  shiftTemplates,
  repositories,
  onChangeMode,
  onChangeSecondaryFilter,
  onSelectDate,
  onToggleTaskState,
  onCancelEvent,
  onInspectEvent,
  onOpenGapPicker,
  onOpenGlobalCreation,
  onDataChanged,
  onModalStateChange,
}) => {
  const [wideWeekViewStyle, setWideWeekViewStyle] = useState<
    'overview' | 'columns'
  >('overview');

  // 8.1 Work Schedule subview is hosted inside Calendar alongside Month, Week, Day.
  const effectiveMode: CalendarViewMode =
    mode === 'week' || mode === 'day' || mode === 'work_schedule'
      ? mode
      : 'month';

  const eventsById = useMemo(
    () => new Map<EntityId, CalendarEvent>(events.map((e) => [e.id, e])),
    [events]
  );

  const monthGrid = useMemo(
    () =>
      projectMonthCalendarGrid({
        selectedDate,
        actualTodayDate,
        displayZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
        secondaryFilter,
        maxVisibleBadges: 2,
      }),
    [
      selectedDate,
      actualTodayDate,
      displayZone,
      events,
      reservations,
      tasks,
      dayOffAnnotations,
      secondaryFilter,
    ]
  );

  const weekOverview = useMemo(
    () =>
      projectWeekCalendarOverview({
        selectedDate,
        actualTodayDate,
        displayZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
        secondaryFilter,
        nowMs,
      }),
    [
      selectedDate,
      actualTodayDate,
      displayZone,
      events,
      reservations,
      tasks,
      dayOffAnnotations,
      secondaryFilter,
      nowMs,
    ]
  );

  const selectedDayFullProjection = useMemo(
    () =>
      projectScheduleForDate({
        localDate: selectedDate,
        displayZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
        includeReleasedReservations: false,
      }),
    [
      selectedDate,
      displayZone,
      events,
      reservations,
      tasks,
      dayOffAnnotations,
    ]
  );

  const selectedDayWithReleasedProjection = useMemo(
    () =>
      projectScheduleForDate({
        localDate: selectedDate,
        displayZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
        includeReleasedReservations: true,
      }),
    [
      selectedDate,
      displayZone,
      events,
      reservations,
      tasks,
      dayOffAnnotations,
    ]
  );

  const selectedDayFiltered = useMemo(
    () =>
      applyCalendarSecondaryFilter({
        dayProjection: selectedDayFullProjection,
        secondaryFilter,
      }),
    [selectedDayFullProjection, secondaryFilter]
  );

  const selectedDayWithReleasedFiltered = useMemo(
    () =>
      applyCalendarSecondaryFilter({
        dayProjection: selectedDayWithReleasedProjection,
        secondaryFilter,
      }),
    [selectedDayWithReleasedProjection, secondaryFilter]
  );

  const selectedDayFilteredProjection: ProjectedDaySchedule = useMemo(
    () => ({
      ...selectedDayFullProjection,
      timelineItems: selectedDayFiltered.filteredTimelineItems,
      allDayItems: selectedDayFiltered.filteredAllDayItems,
      untimedDateOnlyTasks: selectedDayFiltered.filteredUntimedTasks,
      dayOffAnnotations: selectedDayFiltered.filteredDayOffAnnotations,
    }),
    [selectedDayFullProjection, selectedDayFiltered]
  );

  const selectedDayWithReleasedFilteredProjection: ProjectedDaySchedule =
    useMemo(
      () => ({
        ...selectedDayWithReleasedProjection,
        timelineItems: selectedDayWithReleasedFiltered.filteredTimelineItems,
        allDayItems: selectedDayWithReleasedFiltered.filteredAllDayItems,
        untimedDateOnlyTasks:
          selectedDayWithReleasedFiltered.filteredUntimedTasks,
        dayOffAnnotations:
          selectedDayWithReleasedFiltered.filteredDayOffAnnotations,
      }),
      [selectedDayWithReleasedProjection, selectedDayWithReleasedFiltered]
    );

  const selectedDayPositionedLanes = useMemo(
    () =>
      layoutTimelineOverlapLanes({
        items: selectedDayFiltered.filteredTimelineItems,
        dayDurationMinutes: selectedDayFullProjection.dayDurationMinutes,
        nowMs,
      }),
    [
      selectedDayFiltered.filteredTimelineItems,
      selectedDayFullProjection.dayDurationMinutes,
      nowMs,
    ]
  );

  const handleCellSelect = (cell: ProjectedMonthCell) => {
    const res = selectCalendarDateFromCell({
      previousSelectedDate: selectedDate,
      clickedCellDate: cell.localDate,
    });
    onSelectDate(res.nextSelectedDate);
  };

  const handleStepPeriod = (direction: -1 | 1) => {
    if (effectiveMode === 'month' || effectiveMode === 'work_schedule') {
      onSelectDate(addMonthsToLocalDate(selectedDate, direction));
    } else if (effectiveMode === 'week') {
      onSelectDate(addDaysToLocalDate(selectedDate, direction * 7));
    } else {
      onSelectDate(addDaysToLocalDate(selectedDate, direction));
    }
  };

  const handleInspectProjectedItem = (item: ProjectedTimelineItem) => {
    if (item.sourceKind === 'work_shift' || item.sourceKind === 'event') {
      const ev = eventsById.get(item.sourceId);
      if (ev) {
        onInspectEvent(ev);
      }
    }
  };

  const periodHeadingUk =
    effectiveMode === 'month' || effectiveMode === 'work_schedule'
      ? monthGrid.monthHeadingUk
      : effectiveMode === 'week'
      ? weekOverview.weekRangeHeadingUk
      : formatUkrainianDateHeading(selectedDate);

  const prevPeriodAria =
    effectiveMode === 'month' || effectiveMode === 'work_schedule'
      ? UK_STRINGS.destinations.calendar.previousMonthAria
      : effectiveMode === 'week'
      ? UK_STRINGS.destinations.calendar.previousWeekAria
      : UK_STRINGS.app.previousDayAria;

  const nextPeriodAria =
    effectiveMode === 'month' || effectiveMode === 'work_schedule'
      ? UK_STRINGS.destinations.calendar.nextMonthAria
      : effectiveMode === 'week'
      ? UK_STRINGS.destinations.calendar.nextWeekAria
      : UK_STRINGS.app.nextDayAria;

  const renderSelectedDateDetailsCard = () => {
    const selectedCell = monthGrid.selectedCell;
    const availability = selectedDayFullProjection.availability;
    const positionedItems = selectedDayPositionedLanes.positionedItems;
    const allDayItems = selectedDayFiltered.filteredAllDayItems;
    const untimedTasks = selectedDayFiltered.filteredUntimedTasks;
    const dayOffInfos = selectedDayFullProjection.dayOffAnnotations;

    return (
      <Card
        data-testid="calendar-selected-date-details"
        className="space-y-4"
      >
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                {UK_STRINGS.destinations.calendar.selectedDateDetailsHeading}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h3
                  className="text-base font-bold capitalize sm:text-lg"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {formatUkrainianDateHeading(selectedDate)}
                </h3>
                {selectedDate === actualTodayDate && (
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--color-brand-tint)',
                      color: 'var(--color-brand-text)',
                    }}
                  >
                    {UK_STRINGS.app.todayBadge}
                  </span>
                )}
              </div>
              <p
                className="mt-0.5 text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                Дата: {selectedDate} • Пояс: {displayZone}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {effectiveMode !== 'day' && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onChangeMode('day')}
                  data-testid="open-selected-date-in-day-mode"
                >
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {UK_STRINGS.destinations.calendar.openInDayTimelineButton}
                  </span>
                </Button>
              )}
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => onOpenGlobalCreation('event')}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{UK_STRINGS.app.createButton}</span>
              </Button>
            </div>
          </div>

          {/* Explicit day-off / mixed overnight carryover banner */}
          {dayOffInfos.length > 0 && (
            <div
              data-testid="details-day-off-banner"
              className="rounded-xl px-3 py-2.5 text-xs"
              style={{
                backgroundColor: 'var(--color-dayoff-tint)',
                border: '1px solid var(--color-dayoff)',
                color: 'var(--text-primary)',
              }}
            >
              <div
                className="flex flex-wrap items-center gap-2 font-semibold"
                style={{ color: 'var(--color-dayoff-text)' }}
              >
                <span>○ {UK_STRINGS.timeline.dayOffBannerTitle}</span>
                {selectedCell.isMixedDayOffWithCarryover && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      backgroundColor: 'var(--color-work-tint)',
                      color: 'var(--color-work-text)',
                    }}
                  >
                    ◆ Перехід нічної зміни
                  </span>
                )}
              </div>
              <p
                className="mt-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                {selectedCell.isMixedDayOffWithCarryover
                  ? UK_STRINGS.destinations.calendar.dayOffMixedCarryoverNotice
                  : UK_STRINGS.destinations.calendar.dayOffExplicitNotice}
              </p>
              {dayOffInfos.map(
                (info) =>
                  info.zoneNoticeUk && (
                    <p
                      key={info.annotationId}
                      className="mt-1 text-[11px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {info.zoneNoticeUk}
                    </p>
                  )
              )}
            </div>
          )}

          {/* Local-clock work strip overview inside details when work shifts exist */}
          {selectedCell.workStripSegments.length > 0 && (
            <div
              className="rounded-xl p-2.5"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-1 text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span
                  className="font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  ◆ Покриття робочих змін (00:00 — 12:00 — 24:00)
                </span>
                <span>
                  Робота:{' '}
                  {formatMinutesCompactUk(
                    availability.categoryTotalsMinutes.work
                  )}
                </span>
              </div>
              <div
                className="relative mt-1.5 h-2.5 w-full overflow-hidden rounded-full"
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                }}
                aria-hidden="true"
              >
                <div
                  className="absolute inset-y-0 left-1/2 w-px"
                  style={{ backgroundColor: 'var(--border-strong)' }}
                />
                {selectedCell.workStripSegments.map((seg) => (
                  <div
                    key={seg.segmentKey}
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      backgroundColor: 'var(--color-work)',
                      left: `${seg.leftPercent}%`,
                      width: `${Math.max(4, seg.widthPercent)}%`,
                    }}
                  />
                ))}
              </div>
              <div
                className="mt-1 flex justify-between text-[10px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span>00:00</span>
                <span>12:00</span>
                <span>24:00</span>
              </div>
            </div>
          )}

          {/* Union-based occupancy & category summary */}
          <div
            className="grid grid-cols-2 gap-2 rounded-xl p-2.5 text-xs sm:grid-cols-4"
            style={{ backgroundColor: 'var(--bg-elevated)' }}
          >
            <div>
              <span
                className="block text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {UK_STRINGS.destinations.calendar.dayOccupiedPrefix}
              </span>
              <span
                className="font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {formatMinutesCompactUk(availability.totalOccupiedMinutes)}
              </span>
            </div>
            <div>
              <span
                className="block text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {UK_STRINGS.destinations.calendar.dayUnoccupiedPrefix}
              </span>
              <span
                className="font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {formatMinutesCompactUk(availability.totalUnoccupiedMinutes)}
              </span>
            </div>
            <div>
              <span
                className="block text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                ◆ {UK_STRINGS.scheduling.categoryWorkLabel}
              </span>
              <span
                className="font-semibold"
                style={{ color: 'var(--color-work-text)' }}
              >
                {formatMinutesCompactUk(availability.categoryTotalsMinutes.work)}
              </span>
            </div>
            <div>
              <span
                className="block text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                ■ {UK_STRINGS.scheduling.categoryReservationsLabel}
              </span>
              <span
                className="font-semibold"
                style={{ color: 'var(--color-reservation-text)' }}
              >
                {formatMinutesCompactUk(
                  availability.categoryTotalsMinutes.reservations
                )}
              </span>
            </div>
          </div>
        </div>

        {/* All-day events */}
        {allDayItems.length > 0 && (
          <div className="space-y-2">
            <h4
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              {UK_STRINGS.destinations.calendar.allDayEventsSection}
            </h4>
            <div className="space-y-1.5">
              {allDayItems.map((allDay) => {
                const ev = eventsById.get(allDay.eventId);
                return (
                  <div
                    key={allDay.eventId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="flex flex-wrap items-center gap-1.5 font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span style={{ color: 'var(--color-personal)' }}>
                          ●
                        </span>
                        <span className="truncate">{allDay.title}</span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-normal"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          Весь день ({allDay.startLocalDate} –{' '}
                          {allDay.endLocalDateExclusive})
                        </span>
                      </div>
                      {allDay.travelBoundaryNoteUk && (
                        <p
                          className="mt-1 text-[11px]"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {allDay.travelBoundaryNoteUk}
                        </p>
                      )}
                    </div>
                    {ev && (
                      <Button
                        type="button"
                        variant="subtle"
                        size="sm"
                        onClick={() => onInspectEvent(ev)}
                      >
                        {UK_STRINGS.app.editButton}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timed commitments (work shifts, personal/rest events, task reservations) */}
        <div className="space-y-2">
          <h4
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-secondary)' }}
          >
            {UK_STRINGS.destinations.calendar.timedCommitmentsSection} (
            {positionedItems.length})
          </h4>
          {positionedItems.length === 0 ? (
            <p
              className="rounded-xl border border-dashed px-3 py-3 text-xs"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {selectedCell.isNeutralUnknownDate
                ? UK_STRINGS.destinations.calendar.neutralDateNotice
                : 'На цю дату немає записів із точним часом за обраним фільтром.'}
            </p>
          ) : (
            <div className="space-y-2">
              {positionedItems.map((pos) => {
                const { item } = pos;
                const isWork = item.sourceKind === 'work_shift';
                const isRes = item.sourceKind === 'reservation';
                const symbol = isWork ? '◆' : isRes ? '■' : '●';
                const accentColor = isWork
                  ? 'var(--color-work)'
                  : isRes
                  ? 'var(--color-reservation)'
                  : 'var(--color-personal)';

                return (
                  <div
                    key={item.itemKey}
                    data-testid={`detail-timeline-item-${item.sourceId}`}
                    className="rounded-xl p-3 text-xs"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderLeft: `4px solid ${accentColor}`,
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="font-bold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {symbol} {item.segment.displayStartLocalTime}–
                            {item.segment.displayEndLocalTime}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px]"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {formatMinutesCompactUk(
                              item.segment.elapsedDurationMinutes
                            )}
                          </span>
                          {pos.hasConflict && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                              style={{
                                backgroundColor: 'var(--color-brand-tint)',
                                color: 'var(--color-brand-text)',
                              }}
                            >
                              ! {UK_STRINGS.timeline.conflictBadge}
                            </span>
                          )}
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px]"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {pos.statusBadgeUk}
                          </span>
                        </div>

                        <p
                          className="text-sm font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {item.title}
                        </p>

                        {/* Overnight continuation explicit details */}
                        {item.segment.continuesBeforeDayStart && (
                          <p
                            data-testid="detail-overnight-prev-note"
                            className="text-[11px] font-medium"
                            style={{ color: 'var(--color-work-text)' }}
                          >
                            ↪{' '}
                            {UK_STRINGS.destinations.calendar.overnightStartPrevDayNote(
                              item.segment.originClockRangeLabel
                            )}
                          </p>
                        )}
                        {item.segment.continuesAfterDayEnd && (
                          <p
                            data-testid="detail-overnight-next-note"
                            className="text-[11px] font-medium"
                            style={{ color: 'var(--color-work-text)' }}
                          >
                            ↪{' '}
                            {UK_STRINGS.destinations.calendar.overnightContinuesNextDayNote(
                              item.segment.originClockRangeLabel
                            )}
                          </p>
                        )}

                        {item.originZoneNoteUk && (
                          <p
                            className="text-[11px]"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {item.originZoneNoteUk}
                          </p>
                        )}
                        {item.releaseNoteUk && (
                          <p
                            className="text-[11px]"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {item.releaseNoteUk}
                          </p>
                        )}
                        {item.note && (
                          <p
                            className="line-clamp-2 text-xs"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {item.note}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {isRes && item.taskId ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => onToggleTaskState(item.taskId!)}
                            data-testid={`complete-detail-task-${item.taskId}`}
                          >
                            <CheckCircle2
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span>
                              {item.taskState === 'completed'
                                ? UK_STRINGS.plansView.reopenTaskButton
                                : UK_STRINGS.plansView.completeTaskButton}
                            </span>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="subtle"
                            size="sm"
                            onClick={() => handleInspectProjectedItem(item)}
                            data-testid={`edit-detail-item-${item.sourceId}`}
                          >
                            {UK_STRINGS.app.editButton}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Untimed date-planned tasks */}
        {untimedTasks.length > 0 && (
          <div className="space-y-2">
            <h4
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              □ {UK_STRINGS.destinations.calendar.untimedTasksSection} (
              {untimedTasks.length})
            </h4>
            <div className="space-y-1.5">
              {untimedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <span
                      className={`font-medium ${
                        task.state === 'completed' ? 'line-through' : ''
                      }`}
                      style={{
                        color:
                          task.state === 'completed'
                            ? 'var(--text-secondary)'
                            : 'var(--text-primary)',
                      }}
                    >
                      □ {task.title}
                    </span>
                    {task.estimatedDurationMinutes !== null && (
                      <span
                        className="ml-2 text-[11px]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        ({task.estimatedDurationMinutes} хв)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onToggleTaskState(task.id)}
                    >
                      {task.state === 'completed'
                        ? UK_STRINGS.plansView.reopenTaskButton
                        : UK_STRINGS.plansView.completeTaskButton}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unoccupied gaps for quick task scheduling */}
        {availability.unoccupiedGaps.length > 0 && (
          <div className="space-y-2 pt-1">
            <h4
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              {UK_STRINGS.destinations.calendar.unoccupiedGapsSection}
            </h4>
            <div className="flex flex-wrap gap-2">
              {availability.unoccupiedGaps.map((gap) => (
                <button
                  key={`${gap.startInstant}-${gap.endInstant}`}
                  type="button"
                  onClick={() => onOpenGapPicker(gap)}
                  aria-label={UK_STRINGS.timeline.planInGapAria(
                    `${gap.startLocalTime}–${gap.endLocalTime}`
                  )}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-dashed px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-canvas)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Plus
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--color-brand)' }}
                    aria-hidden="true"
                  />
                  <span>
                    {gap.startLocalTime}–{gap.endLocalTime} (
                    {formatMinutesCompactUk(gap.durationMinutes)})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Calendar Mode & Secondary Filter Bar */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-[260px] flex-1 sm:max-w-lg">
            <SegmentedControl<CalendarViewMode>
              ariaLabel="Режим календаря"
              value={effectiveMode}
              onChange={(nextMode) => onChangeMode(nextMode)}
              options={[
                {
                  value: 'month',
                  label: UK_STRINGS.destinations.calendar.modeMonth,
                },
                {
                  value: 'week',
                  label: UK_STRINGS.destinations.calendar.modeWeek,
                },
                {
                  value: 'day',
                  label: UK_STRINGS.destinations.calendar.modeDay,
                },
                {
                  value: 'work_schedule',
                  label: UK_STRINGS.destinations.calendar.workScheduleSubtab,
                },
              ]}
            />
          </div>

          {/* Period Navigation & One-Action Actual Today Return */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={prevPeriodAria}
              data-testid="calendar-prev-period-button"
              onClick={() => handleStepPeriod(-1)}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </Button>

            <span
              data-testid="calendar-period-heading"
              className="min-w-[140px] px-2 text-center text-sm font-bold sm:text-base"
              style={{ color: 'var(--text-primary)' }}
            >
              {periodHeadingUk}
            </span>

            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={nextPeriodAria}
              data-testid="calendar-next-period-button"
              onClick={() => handleStepPeriod(1)}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Button>

            {selectedDate !== actualTodayDate && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onSelectDate(actualTodayDate)}
                data-testid="calendar-return-to-today-button"
              >
                {UK_STRINGS.app.returnToToday}
              </Button>
            )}
          </div>
        </div>

        {/* Secondary filter pills (7.1) */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            role="group"
            aria-label={UK_STRINGS.destinations.calendar.secondaryFilterLabel}
            className="flex flex-wrap items-center gap-1.5"
          >
            {(
              [
                {
                  id: 'all',
                  label: UK_STRINGS.destinations.calendar.filterAll,
                },
                {
                  id: 'work',
                  label: UK_STRINGS.destinations.calendar.filterWork,
                },
                {
                  id: 'events_and_tasks',
                  label: UK_STRINGS.destinations.calendar.filterEventsAndTasks,
                },
              ] as const
            ).map((f) => {
              const active = secondaryFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChangeSecondaryFilter(f.id)}
                  data-testid={`calendar-filter-${f.id}`}
                  className="min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--color-brand)',
                          color: '#FFFFFF',
                        }
                      : {
                          backgroundColor: 'var(--bg-elevated)',
                          color: 'var(--text-secondary)',
                        }
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <span
            className="text-xs"
            style={{ color: 'var(--text-secondary)' }}
            data-testid="calendar-selected-date-display"
          >
            {UK_STRINGS.app.selectedDateLabel}:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {selectedDate}
            </strong>
          </span>
        </div>
      </Card>

      {/* =================================================================== */}
      {/* 8.1–8.6 WORK SCHEDULE SUBVIEW INSIDE CALENDAR                       */}
      {/* =================================================================== */}
      {effectiveMode === 'work_schedule' && (
        <WorkRosterSubview
          selectedDate={selectedDate}
          actualTodayDate={actualTodayDate}
          displayZone={displayZone}
          monthGrid={monthGrid}
          events={events}
          reservations={reservations}
          tasks={tasks}
          dayOffAnnotations={dayOffAnnotations}
          shiftTemplates={shiftTemplates}
          repositories={repositories}
          onSelectDate={onSelectDate}
          onInspectEvent={onInspectEvent}
          onCancelEvent={onCancelEvent}
          onOpenGlobalCreation={onOpenGlobalCreation}
          onDataChanged={onDataChanged}
          onModalStateChange={onModalStateChange}
        />
      )}

      {/* =================================================================== */}
      {/* 7.2 / 7.3 / 7.4 MONTH MODE: 7 COLUMNS × 6 ROWS, MONDAY-FIRST       */}
      {/* =================================================================== */}
      {effectiveMode === 'month' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)] xl:items-start">
          <Card className="!p-2 sm:!p-4 space-y-2.5">
            {/* Monday-first 7 equal weekday headers */}
            <div
              className="grid grid-cols-7 gap-1 text-center"
              aria-hidden="true"
            >
              {monthGrid.weekdayHeadersUk.map((dayLabel) => (
                <div
                  key={dayLabel}
                  className="py-1 text-xs font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {dayLabel}
                </div>
              ))}
            </div>

            {/* 42-cell stable 7x6 grid */}
            <div
              role="grid"
              aria-label={UK_STRINGS.destinations.calendar.monthGridAria}
              data-testid="calendar-month-grid"
              className="grid grid-cols-7 gap-1 sm:gap-1.5"
            >
              {monthGrid.cells.map((cell) => {
                const isSelected = cell.isSelected;
                const isToday = cell.isToday;
                const inMonth = cell.inActiveMonth;

                return (
                  <button
                    key={cell.localDate}
                    type="button"
                    onClick={() => handleCellSelect(cell)}
                    aria-label={cell.accessibleSummaryUk}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    data-testid={`month-cell-${cell.localDate}`}
                    data-in-active-month={inMonth ? 'true' : 'false'}
                    data-is-today={isToday ? 'true' : 'false'}
                    data-is-selected={isSelected ? 'true' : 'false'}
                    data-omits-personal-titles="true"
                    className="group relative flex min-h-[76px] sm:min-h-[88px] w-full min-w-0 flex-col justify-between rounded-xl p-1 sm:p-1.5 text-left transition-colors focus:outline-none"
                    style={{
                      backgroundColor: isSelected
                        ? 'var(--color-brand-tint)'
                        : isToday
                        ? 'var(--bg-elevated)'
                        : inMonth
                        ? 'var(--bg-canvas)'
                        : 'transparent',
                      border: isSelected
                        ? '2px solid var(--color-brand)'
                        : isToday
                        ? '1.5px solid var(--color-brand)'
                        : inMonth
                        ? '1px solid var(--border-subtle)'
                        : '1px dashed var(--border-subtle)',
                      opacity: inMonth || isSelected ? 1 : 0.72,
                    }}
                  >
                    {/* Top row: date number + overflow badge */}
                    <div className="flex w-full items-center justify-between gap-0.5">
                      <span
                        className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md px-1 text-xs font-bold leading-none sm:h-6 sm:min-w-[24px] sm:text-sm"
                        style={
                          isSelected
                            ? {
                                backgroundColor: 'var(--color-brand)',
                                color: '#FFFFFF',
                              }
                            : isToday
                            ? {
                                color: 'var(--color-brand-text)',
                              }
                            : {
                                color: inMonth
                                  ? 'var(--text-primary)'
                                  : 'var(--text-secondary)',
                              }
                        }
                      >
                        {cell.dayNumber}
                      </span>

                      {cell.overflowCount > 0 && (
                        <span
                          data-testid={`month-cell-overflow-${cell.localDate}`}
                          className="rounded px-1 py-0.5 text-[10px] font-bold leading-none"
                          style={{
                            backgroundColor: 'var(--bg-elevated)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          +{cell.overflowCount}
                        </span>
                      )}
                    </div>

                    {/* Middle area: bounded compact time & non-color type badges (no personal event titles) */}
                    <div className="my-0.5 flex w-full min-w-0 flex-col gap-0.5 overflow-hidden">
                      {cell.visibleBadges.map((badge) => {
                        const badgeStyle =
                          badge.semanticRole === 'work'
                            ? {
                                backgroundColor: 'var(--color-work-tint)',
                                color: 'var(--color-work-text)',
                              }
                            : badge.semanticRole === 'dayoff'
                            ? {
                                backgroundColor: 'var(--color-dayoff-tint)',
                                color: 'var(--color-dayoff-text)',
                              }
                            : badge.semanticRole === 'reservation'
                            ? {
                                backgroundColor:
                                  'var(--color-reservation-tint)',
                                color: 'var(--color-reservation-text)',
                              }
                            : {
                                backgroundColor: 'var(--color-personal-tint)',
                                color: 'var(--color-personal-text)',
                              };

                        const mobileShortLabel = badge.compactLabel.replace(/:00/g, '');

                        return (
                          <span
                            key={badge.id}
                            aria-hidden="true"
                            className="block w-full overflow-hidden whitespace-nowrap rounded px-0.5 sm:px-1 py-0.5 text-[10px] sm:text-[11px] font-semibold leading-tight tracking-tight"
                            style={badgeStyle}
                          >
                            <span className="sm:hidden">
                              {badge.nonColorSymbol}
                              {mobileShortLabel}
                            </span>
                            <span className="hidden sm:inline">
                              {badge.nonColorSymbol} {badge.compactLabel}
                            </span>
                          </span>
                        );
                      })}
                    </div>

                    {/* Bottom thin local-clock work strip: 00:00 left, 12:00 center, 24:00 right */}
                    <div
                      aria-hidden="true"
                      data-testid={`month-cell-work-strip-${cell.localDate}`}
                      className="relative mt-auto h-1.5 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: 'var(--bg-elevated)' }}
                    >
                      {/* Center 12:00 reference tick */}
                      <div
                        className="absolute inset-y-0 left-1/2 w-px"
                        style={{ backgroundColor: 'var(--border-strong)' }}
                      />
                      {cell.workStripSegments.map((seg) => (
                        <div
                          key={seg.segmentKey}
                          data-testid={`work-strip-seg-${cell.localDate}`}
                          className="absolute inset-y-0 rounded-full"
                          style={{
                            backgroundColor: 'var(--color-work)',
                            left: `${seg.leftPercent}%`,
                            width: `${Math.max(6, seg.widthPercent)}%`,
                          }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Compact Legend */}
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[11px]"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="font-medium"
                  style={{ color: 'var(--color-work-text)' }}
                >
                  {UK_STRINGS.destinations.calendar.markerLegendWork}
                </span>
                <span
                  className="font-medium"
                  style={{ color: 'var(--color-personal-text)' }}
                >
                  {UK_STRINGS.destinations.calendar.markerLegendPersonal}
                </span>
                <span
                  className="font-medium"
                  style={{ color: 'var(--color-reservation-text)' }}
                >
                  {UK_STRINGS.destinations.calendar.markerLegendTask}
                </span>
                <span
                  className="font-medium"
                  style={{ color: 'var(--color-dayoff-text)' }}
                >
                  {UK_STRINGS.destinations.calendar.markerLegendDayOff}
                </span>
              </div>
              <span>{UK_STRINGS.destinations.calendar.workStripLegend}</span>
            </div>
          </Card>

          {/* Selected Date Details Panel */}
          {renderSelectedDateDetailsCard()}
        </div>
      )}

      {/* =================================================================== */}
      {/* 7.5 WEEK MODE: READABLE PHONE 7-DAY OVERVIEW & WIDE TIMELINE       */}
      {/* =================================================================== */}
      {effectiveMode === 'week' && (
        <div className="space-y-4">
          {/* Week Summary & Wide-Screen Layout Toggle */}
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span
                  className="block text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.destinations.calendar.weekUnionOccupiedLabel}
                </span>
                <span
                  className="text-sm font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {formatMinutesCompactUk(
                    weekOverview.weekTotalUnionOccupiedMinutes
                  )}
                </span>
              </div>
              <div>
                <span
                  className="block text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  ◆ {UK_STRINGS.destinations.calendar.weekWorkTotalLabel}
                </span>
                <span
                  className="text-sm font-bold"
                  style={{ color: 'var(--color-work-text)' }}
                >
                  {formatMinutesCompactUk(weekOverview.weekWorkCategoryMinutes)}
                </span>
              </div>
            </div>

            {/* Wide-screen option to inspect 7-day proportional columns without ever forcing 7 columns on phones */}
            <div className="hidden lg:flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWideWeekViewStyle('overview')}
                className="min-h-[36px] rounded-xl px-3 py-1 text-xs font-semibold"
                style={
                  wideWeekViewStyle === 'overview'
                    ? {
                        backgroundColor: 'var(--color-brand)',
                        color: '#FFFFFF',
                      }
                    : {
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                      }
                }
              >
                {UK_STRINGS.destinations.calendar.weekWideLayoutList}
              </button>
              <button
                type="button"
                onClick={() => setWideWeekViewStyle('columns')}
                className="min-h-[36px] rounded-xl px-3 py-1 text-xs font-semibold"
                style={
                  wideWeekViewStyle === 'columns'
                    ? {
                        backgroundColor: 'var(--color-brand)',
                        color: '#FFFFFF',
                      }
                    : {
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                      }
                }
              >
                {UK_STRINGS.destinations.calendar.weekWideLayoutColumns}
              </button>
            </div>
          </Card>

          {/* Wide-screen 7-column proportional timeline (only on lg+ when selected; NEVER on phone viewports) */}
          {wideWeekViewStyle === 'columns' && (
            <Card
              data-testid="week-wide-columns-grid"
              className="hidden lg:block space-y-3"
            >
              <div className="grid grid-cols-7 gap-2">
                {weekOverview.days.map((day) => (
                  <div
                    key={day.localDate}
                    className="flex flex-col rounded-xl p-2"
                    style={{
                      backgroundColor: day.isSelected
                        ? 'var(--color-brand-tint)'
                        : 'var(--bg-canvas)',
                      border: day.isSelected
                        ? '1.5px solid var(--color-brand)'
                        : '1px solid var(--border-subtle)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDate(day.localDate)}
                      className="flex flex-col items-start text-left"
                    >
                      <div className="flex w-full items-center justify-between">
                        <span
                          className="text-xs font-bold uppercase"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {day.weekdayShortUk}
                        </span>
                        {day.isToday && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{
                              backgroundColor: 'var(--color-brand-tint)',
                              color: 'var(--color-brand-text)',
                            }}
                          >
                            {UK_STRINGS.app.todayBadge}
                          </span>
                        )}
                      </div>
                      <span
                        className="text-sm font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {day.shortDateLabelUk}
                      </span>
                    </button>

                    {/* Proportional mini column (00:00..24:00) */}
                    <div
                      className="relative mt-2 h-64 w-full overflow-hidden rounded-lg"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {[6, 12, 18].map((h) => (
                        <div
                          key={h}
                          style={{
                            top: `${(h / 24) * 100}%`,
                            borderColor: 'var(--border-subtle)',
                          }}
                          className="absolute inset-x-0 border-t border-dashed"
                        />
                      ))}
                      {day.positionedLaneLayout.positionedItems.map((pos) => {
                        const laneWidth = 100 / pos.totalLanes;
                        const laneLeft = pos.laneIndex * laneWidth;
                        const isWork = pos.item.sourceKind === 'work_shift';
                        const isRes = pos.item.sourceKind === 'reservation';

                        return (
                          <button
                            key={pos.item.itemKey}
                            type="button"
                            onClick={() => {
                              onSelectDate(day.localDate);
                              handleInspectProjectedItem(pos.item);
                            }}
                            style={{
                              top: `${pos.topPercent}%`,
                              height: `${Math.max(7, pos.heightPercent)}%`,
                              left: `${laneLeft}%`,
                              width: `${laneWidth}%`,
                              backgroundColor: isWork
                                ? 'var(--color-work-tint)'
                                : isRes
                                ? 'var(--color-reservation-tint)'
                                : 'var(--color-personal-tint)',
                              border: `1px solid ${
                                isWork
                                  ? 'var(--color-work)'
                                  : isRes
                                  ? 'var(--color-reservation)'
                                  : 'var(--color-personal)'
                              }`,
                            }}
                            className="absolute overflow-hidden rounded px-1 py-0.5 text-left text-[10px] leading-tight"
                          >
                            <span
                              className="block truncate font-semibold"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {pos.item.segment.displayStartLocalTime}{' '}
                              {pos.item.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Readable 7-Day Week Overview Cards (Always shown on mobile/tablet; also shown on desktop) */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,1fr)] xl:items-start">
            <div
              data-testid="calendar-week-overview-list"
              className="space-y-2.5"
            >
              {weekOverview.days.map((day) => {
                const isSelected = day.isSelected;
                const isToday = day.isToday;

                return (
                  <Card
                    key={day.localDate}
                    data-testid={`week-day-card-${day.localDate}`}
                    className={`!p-3 sm:!p-4 transition-colors ${
                      isSelected
                        ? 'ring-2 ring-[var(--color-brand)]'
                        : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectDate(day.localDate)}
                        className="flex flex-wrap items-center gap-2 text-left"
                      >
                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold uppercase"
                          style={
                            isSelected
                              ? {
                                  backgroundColor: 'var(--color-brand)',
                                  color: '#FFFFFF',
                                }
                              : isToday
                              ? {
                                  border: '1.5px solid var(--color-brand)',
                                  color: 'var(--color-brand-text)',
                                }
                              : {
                                  backgroundColor: 'var(--bg-elevated)',
                                  color: 'var(--text-primary)',
                                }
                          }
                        >
                          {day.weekdayShortUk}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className="text-sm font-bold"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {day.shortDateLabelUk}
                            </span>
                            {isToday && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                                style={{
                                  backgroundColor: 'var(--color-brand-tint)',
                                  color: 'var(--color-brand-text)',
                                }}
                              >
                                {UK_STRINGS.app.todayBadge}
                              </span>
                            )}
                            {day.hasExplicitDayOff && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                                style={{
                                  backgroundColor: 'var(--color-dayoff-tint)',
                                  color: 'var(--color-dayoff-text)',
                                }}
                              >
                                ○{' '}
                                {day.isMixedDayOffWithCarryover
                                  ? 'Вихідний + нічна зміна'
                                  : 'Вихідний'}
                              </span>
                            )}
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {UK_STRINGS.destinations.calendar.dayOccupiedPrefix}:{' '}
                            <strong style={{ color: 'var(--text-primary)' }}>
                              {formatMinutesCompactUk(day.unionOccupiedMinutes)}
                            </strong>{' '}
                            •{' '}
                            {
                              UK_STRINGS.destinations.calendar
                                .dayUnoccupiedPrefix
                            }
                            : {formatMinutesCompactUk(day.unionUnoccupiedMinutes)}
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="subtle"
                          size="sm"
                          onClick={() => {
                            onSelectDate(day.localDate);
                            onChangeMode('day');
                          }}
                        >
                          <CalendarIcon
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          <span>{UK_STRINGS.destinations.calendar.modeDay}</span>
                        </Button>
                      </div>
                    </div>

                    {/* Local-clock work strip for the day if work shifts exist */}
                    {day.workStripSegments.length > 0 && (
                      <div
                        className="relative mt-2.5 h-2 w-full overflow-hidden rounded-full"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                        aria-hidden="true"
                      >
                        <div
                          className="absolute inset-y-0 left-1/2 w-px"
                          style={{ backgroundColor: 'var(--border-strong)' }}
                        />
                        {day.workStripSegments.map((seg) => (
                          <div
                            key={seg.segmentKey}
                            className="absolute inset-y-0 rounded-full"
                            style={{
                              backgroundColor: 'var(--color-work)',
                              left: `${seg.leftPercent}%`,
                              width: `${Math.max(4, seg.widthPercent)}%`,
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Day's commitments */}
                    <div className="mt-2.5 space-y-1.5">
                      {day.filteredAllDayItems.map((allDay) => (
                        <div
                          key={allDay.eventId}
                          className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs"
                          style={{ backgroundColor: 'var(--bg-elevated)' }}
                        >
                          <span
                            className="font-medium"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            ● {allDay.title} (весь день)
                          </span>
                        </div>
                      ))}

                      {day.positionedLaneLayout.positionedItems.map((pos) => {
                        const { item } = pos;
                        const isWork = item.sourceKind === 'work_shift';
                        const isRes = item.sourceKind === 'reservation';
                        const symbol = isWork ? '◆' : isRes ? '■' : '●';

                        return (
                          <button
                            key={item.itemKey}
                            type="button"
                            onClick={() => {
                              onSelectDate(day.localDate);
                              handleInspectProjectedItem(item);
                            }}
                            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors"
                            style={{
                              backgroundColor: 'var(--bg-canvas)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <span
                                className="font-semibold"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {symbol} {item.segment.displayStartLocalTime}–
                                {item.segment.displayEndLocalTime}
                              </span>{' '}
                              <span
                                className="font-medium"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {item.title}
                              </span>
                              {(item.segment.continuesBeforeDayStart ||
                                item.segment.continuesAfterDayEnd) && (
                                <span
                                  className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                  style={{
                                    backgroundColor: 'var(--color-work-tint)',
                                    color: 'var(--color-work-text)',
                                  }}
                                >
                                  {item.segment.continuesBeforeDayStart
                                    ? '↪ з попередньої доби'
                                    : '↪ на наступну добу'}
                                </span>
                              )}
                              {pos.hasConflict && (
                                <span
                                  className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                  style={{
                                    backgroundColor: 'var(--color-brand-tint)',
                                    color: 'var(--color-brand-text)',
                                  }}
                                >
                                  ! Перетин
                                </span>
                              )}
                            </div>
                            <span
                              className="text-[11px]"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {formatMinutesCompactUk(
                                item.segment.elapsedDurationMinutes
                              )}
                            </span>
                          </button>
                        );
                      })}

                      {day.filteredUntimedTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs"
                          style={{ backgroundColor: 'var(--bg-elevated)' }}
                        >
                          <span
                            className="truncate font-medium"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            □ {task.title}
                          </span>
                          <span
                            className="text-[11px]"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Без часу
                          </span>
                        </div>
                      ))}

                      {day.filteredAllDayItems.length === 0 &&
                        day.positionedLaneLayout.positionedItems.length === 0 &&
                        day.filteredUntimedTasks.length === 0 && (
                          <p
                            className="text-xs"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {day.isNeutralUnknownDate
                              ? 'Немає записів (нейтральна дата)'
                              : 'Немає записів за обраним фільтром'}
                          </p>
                        )}
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Selected Day Details Panel alongside Week overview */}
            {renderSelectedDateDetailsCard()}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 7.1 / 7.5 DAY MODE: REUSES SHARED DAY TIMELINE FROM STAGE 6         */}
      {/* =================================================================== */}
      {effectiveMode === 'day' && (
        <div className="space-y-4">
          {selectedDayFiltered.filteredUntimedTasks.length > 0 && (
            <Card className="space-y-2">
              <h3
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-secondary)' }}
              >
                □ {UK_STRINGS.destinations.calendar.untimedTasksSection} (
                {selectedDayFiltered.filteredUntimedTasks.length})
              </h3>
              <div className="space-y-1.5">
                {selectedDayFiltered.filteredUntimedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span
                      className="font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      □ {task.title}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onToggleTaskState(task.id)}
                      >
                        {task.state === 'completed'
                          ? UK_STRINGS.plansView.reopenTaskButton
                          : UK_STRINGS.plansView.completeTaskButton}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <SharedDayTimeline
            testIdPrefix="calendar"
            projection={selectedDayFilteredProjection}
            projectionWithReleased={selectedDayWithReleasedFilteredProjection}
            nowMs={nowMs}
            events={events}
            tasks={tasks}
            reservations={reservations}
            onToggleTaskState={onToggleTaskState}
            onCancelEvent={onCancelEvent}
            onInspectEvent={onInspectEvent}
            onOpenGapPicker={onOpenGapPicker}
            onEmptyCreateAction={() => onOpenGlobalCreation('event')}
            emptyActionLabel={UK_STRINGS.creation.actions.event.label}
          />
        </div>
      )}
    </div>
  );
};
