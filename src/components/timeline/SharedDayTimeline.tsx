import React, { useMemo, useState } from 'react';
import { Clock, Layers, Plus, Trash2 } from 'lucide-react';
import {
  CalendarEvent,
  EntityId,
  IanaTimeZone,
  Task,
  TaskReservation,
} from '../../domain/types';
import {
  ProjectedDaySchedule,
  ProjectedTimelineItem,
  TimelineOverlapCluster,
  UnoccupiedTimeGap,
  buildDayTimelineHourRail,
  computeCurrentTimeIndicatorPosition,
  layoutTimelineOverlapLanes,
} from '../../domain/scheduling';
import { UK_STRINGS } from '../../i18n/uk';
import { Button, Card, EmptyStateCard, ModalSheet } from '../ui/primitives';

export interface SharedDayTimelineProps {
  testIdPrefix: string;
  projection: ProjectedDaySchedule;
  projectionWithReleased?: ProjectedDaySchedule;
  nowMs: number;
  events: readonly CalendarEvent[];
  tasks: readonly Task[];
  reservations: readonly TaskReservation[];
  onToggleTaskState: (taskId: EntityId) => Promise<void> | void;
  onCancelEvent: (eventId: EntityId, revision: number) => Promise<void> | void;
  onInspectEvent: (event: CalendarEvent) => void;
  onOpenGapPicker: (gap: UnoccupiedTimeGap) => void;
  onEmptyCreateAction?: () => void;
  emptyActionLabel?: string;
  compactMode?: boolean;
  onInspectHabitSession?: (reservation: TaskReservation) => void;
  onInspectTask?: (task: Task, reservationId?: string) => void;
}

const MINUTE_HEIGHT_PX = 1.05; // ~63px per hour -> ~1512px for a 24h day

export function paletteColorToken(color: string): {
  accentVar: string;
  tintVar: string;
  textVar: string;
} {
  switch (color) {
    case 'work':
      return {
        accentVar: 'var(--color-work)',
        tintVar: 'var(--color-work-tint, var(--bg-elevated))',
        textVar: 'var(--color-work-text)',
      };
    case 'dayoff':
      return {
        accentVar: 'var(--color-dayoff)',
        tintVar: 'var(--color-dayoff-tint, var(--bg-elevated))',
        textVar: 'var(--color-dayoff-text, var(--text-primary))',
      };
    case 'reservation':
      return {
        accentVar: 'var(--color-reservation)',
        tintVar: 'var(--color-reservation-tint, var(--bg-elevated))',
        textVar: 'var(--color-reservation)',
      };
    case 'rest':
      return {
        accentVar: 'var(--color-rest)',
        tintVar: 'var(--bg-elevated)',
        textVar: 'var(--text-secondary)',
      };
    case 'brand':
      return {
        accentVar: 'var(--color-brand)',
        tintVar: 'var(--color-brand-tint)',
        textVar: 'var(--color-brand-text)',
      };
    default:
      return {
        accentVar: 'var(--color-personal)',
        tintVar: 'var(--bg-elevated)',
        textVar: 'var(--color-personal)',
      };
  }
}

export function SharedDayTimeline({
  testIdPrefix,
  projection,
  projectionWithReleased,
  nowMs,
  events,
  tasks,
  reservations,
  onToggleTaskState,
  onCancelEvent,
  onInspectEvent,
  onOpenGapPicker,
  onEmptyCreateAction,
  emptyActionLabel,
  compactMode = false,
  onInspectTask, onInspectHabitSession,
}: SharedDayTimelineProps) {
  const [showReleasedHistory, setShowReleasedHistory] = useState(false);
  const [activeClusterModal, setActiveClusterModal] =
    useState<TimelineOverlapCluster | null>(null);

  const hasReleasedItemsOnDate = useMemo(() => {
    if (!projectionWithReleased) return false;
    return projectionWithReleased.timelineItems.some(
      (it) => it.state === 'released'
    );
  }, [projectionWithReleased]);

  const effectiveProjection =
    showReleasedHistory && projectionWithReleased
      ? projectionWithReleased
      : projection;

  const hourRail = useMemo(
    () =>
      buildDayTimelineHourRail(
        effectiveProjection.localDate,
        effectiveProjection.displayZone
      ),
    [effectiveProjection.localDate, effectiveProjection.displayZone]
  );

  const { positionedItems, clusters } = useMemo(
    () =>
      layoutTimelineOverlapLanes({
        items: effectiveProjection.timelineItems,
        dayDurationMinutes: effectiveProjection.dayDurationMinutes,
        nowMs,
      }),
    [
      effectiveProjection.timelineItems,
      effectiveProjection.dayDurationMinutes,
      nowMs,
    ]
  );

  const currentTimeIndicator = useMemo(
    () =>
      computeCurrentTimeIndicatorPosition({
        localDate: effectiveProjection.localDate,
        displayZone: effectiveProjection.displayZone,
        nowMs,
      }),
    [effectiveProjection.localDate, effectiveProjection.displayZone, nowMs]
  );

  const totalCanvasHeightPx = Math.round(
    effectiveProjection.dayDurationMinutes *
      (compactMode ? 0.8 : MINUTE_HEIGHT_PX)
  );

  const blockingAllDayItems = effectiveProjection.allDayItems.filter(
    (ad) => ad.isBlocking
  );
  const informationalAllDayItems = effectiveProjection.allDayItems.filter(
    (ad) => !ad.isBlocking
  );

  const handleTimelineItemPrimaryClick = (item: ProjectedTimelineItem) => {
    if (item.sourceKind === 'reservation') {
      const session = reservations.find(r => r.id === item.sourceId);
      if (session?.habitOccurrence) onInspectHabitSession?.(session);
    } else {
      const ev = events.find((e) => e.id === item.sourceId);
      if (ev) {
        onInspectEvent(ev);
      }
    }
  };

  return (
    <div className="space-y-4" data-testid={`${testIdPrefix}-shared-timeline-root`}>
      {/* Day-off annotations banner (retaining sourceZone & mixed-state overnight carryover note) */}
      {effectiveProjection.dayOffAnnotations.length > 0 && (
        <div
          className="p-3.5 rounded-2xl space-y-1"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
          data-testid={`${testIdPrefix}-dayoff-banner`}
        >
          {effectiveProjection.dayOffAnnotations.map((ann) => (
            <div key={ann.annotationId} className="space-y-0.5">
              <div
                className="text-[14px] font-semibold"
                style={{ color: 'var(--color-dayoff)' }}
              >
                {UK_STRINGS.timeline.dayOffBannerTitle}
                {ann.code ? ` (${ann.code})` : ''}
              </div>
              {ann.note && (
                <div className="text-[13px]">{ann.note}</div>
              )}
              {ann.zoneNoticeUk && (
                <div
                  className="text-[12px]"
                  style={{ color: 'var(--text-secondary)' }}
                  data-testid={`${testIdPrefix}-dayoff-zone-notice`}
                >
                  {ann.zoneNoticeUk}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* DST Skipped / Repeated Hours Banner (6.1) */}
      {effectiveProjection.dstKind !== 'normal' && (
        <div
          className="p-3 rounded-2xl text-[13px] font-medium"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          data-testid={`${testIdPrefix}-dst-banner`}
        >
          {effectiveProjection.dstKind === 'spring_forward_short'
            ? UK_STRINGS.timeline.dstSpringForwardBanner(
                effectiveProjection.dayDurationMinutes
              )
            : UK_STRINGS.timeline.dstFallBackBanner(
                effectiveProjection.dayDurationMinutes
              )}
        </div>
      )}

      {/* All-Day Events (Blocking & Informational) */}
      {effectiveProjection.allDayItems.length > 0 && (
        <Card
          title={testIdPrefix.startsWith('today') || testIdPrefix === 'calendar' ? 'Увесь день' : `Події на весь день (${effectiveProjection.localDate})`}
          data-testid={`${testIdPrefix}-allday-section`}
        >
          <div className="space-y-2">
            {blockingAllDayItems.map((ad) => {
              const ev = events.find((e) => e.id === ad.eventId);
              return (
                <div
                  key={ad.eventId}
                  data-testid={`${testIdPrefix}-allday-item-${ad.title}`}
                  className="p-3 rounded-xl flex items-start justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="space-y-1">
                    <div className="text-[14px] font-semibold">
                      {ad.title} · Увесь день · Блокує час
                    </div>
                    <div
                      className="text-[12px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Межі в поясі запису ({ad.originZone}): {ad.startLocalDate}{' '}
                      – {ad.endLocalDateExclusive}
                    </div>
                    {ad.travelBoundaryNoteUk && (
                      <div
                        className="text-[12px] font-medium"
                        style={{ color: 'var(--color-personal)' }}
                        data-testid={`${testIdPrefix}-allday-zone-note-${ad.title}`}
                      >
                        {ad.travelBoundaryNoteUk}
                      </div>
                    )}
                  </div>
                  {ev && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onInspectEvent(ev)}
                    >
                      {UK_STRINGS.timeline.inspectRecordButton}
                    </Button>
                  )}
                </div>
              );
            })}

            {informationalAllDayItems.map((ad) => {
              const ev = events.find((e) => e.id === ad.eventId);
              return (
                <div
                  key={ad.eventId}
                  data-testid={`${testIdPrefix}-info-allday-item-${ad.title}`}
                  className="p-3 rounded-xl flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="text-[14px] font-semibold">
                    {ad.title} · Увесь день · Інформаційна
                  </div>
                  {ev && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onInspectEvent(ev)}
                    >
                      {UK_STRINGS.timeline.inspectRecordButton}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Honest empty state notice when no timed or all-day items exist */}
      {effectiveProjection.timelineItems.length === 0 &&
        effectiveProjection.allDayItems.length === 0 &&
        onEmptyCreateAction &&
        !testIdPrefix.startsWith('today') && testIdPrefix !== 'calendar' && !compactMode && (
          <EmptyStateCard
            icon={<Clock className="w-5 h-5" />}
            title={UK_STRINGS.destinations.today.emptyTimelineTitle}
            description={UK_STRINGS.destinations.today.emptyTimelineDescription}
            actionLabel={
              emptyActionLabel ?? UK_STRINGS.creation.actions.task.label
            }
            onAction={onEmptyCreateAction}
          />
        )}

      {/* Main Proportional 24h Chronological Timeline Card (6.1 / 6.3 / 6.5) */}
      <Card
        title={testIdPrefix.startsWith('today') || testIdPrefix === 'calendar' ? undefined : `Розклад на ${effectiveProjection.localDate} (${effectiveProjection.displayZone})`}
        data-testid={`${testIdPrefix}-schedule-card`}
        headerRight={
          hasReleasedItemsOnDate ? (
            <label className="flex items-center gap-2 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={showReleasedHistory}
                onChange={(e) => setShowReleasedHistory(e.target.checked)}
                data-testid={`${testIdPrefix}-toggle-released-history`}
                className="w-4 h-4"
              />
              <span>{UK_STRINGS.timeline.showReleasedHistoryToggle}</span>
            </label>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {/* Accessible Summary List & Dense Cluster Controls */}
          {clusters.some((c) => c.totalLanes > 1) && (
            <div
              className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl text-[12px]"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
              data-testid={`${testIdPrefix}-overlap-clusters-bar`}
            >
              <Layers
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-brand)' }}
                aria-hidden="true"
              />
              <span>Виявлено паралельні смуги у часовій шкалі:</span>
              {clusters
                .filter((c) => c.totalLanes > 1)
                .map((cluster) => (
                  <Button
                    key={cluster.clusterId}
                    type="button"
                    variant="secondary"
                    size="sm"
                    data-testid={`${testIdPrefix}-cluster-details-btn-${cluster.clusterId}`}
                    onClick={() => setActiveClusterModal(cluster)}
                  >
                    {cluster.displayStartLocalTime}–{cluster.displayEndLocalTime}{' '}
                    · {UK_STRINGS.timeline.clusterDetailsButton(cluster.items.length)}
                  </Button>
                ))}
            </div>
          )}

          {/* Proportional Chronological Canvas with Time Rail */}
          <div
            className="relative rounded-2xl overflow-hidden select-none"
            style={{
              height: `${totalCanvasHeightPx}px`,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
            data-testid={`${testIdPrefix}-proportional-timeline`}
            data-day-duration-minutes={effectiveProjection.dayDurationMinutes}
          >
            {/* 1. Hour Rail & Horizontal Hour Hairlines */}
            {hourRail.map((slot) => (
              <div
                key={`rail-${slot.slotIndex}`}
                className="absolute inset-x-0 flex items-start pointer-events-none"
                style={{
                  top: `${slot.topPercent}%`,
                  height: `${slot.heightPercent}%`,
                  borderTop:
                    slot.slotIndex === 0
                      ? 'none'
                      : '1px solid var(--border-subtle)',
                }}
                data-testid={`${testIdPrefix}-hour-slot-${slot.slotIndex}`}
              >
                <div
                  className="w-16 sm:w-20 shrink-0 px-2 pt-1 text-[11px] font-mono tabular-nums leading-tight"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div>{slot.localTimeLabel}</div>
                  {slot.repeatedOccurrenceBadgeUk && (
                    <div
                      className="text-[10px] font-sans font-medium"
                      style={{ color: 'var(--color-work-text)' }}
                      data-testid={`${testIdPrefix}-dst-repeat-badge-${slot.slotIndex}`}
                    >
                      {slot.repeatedOccurrenceBadgeUk}
                    </div>
                  )}
                  {slot.skippedBeforeThisSlotUk && (
                    <div
                      className="text-[10px] font-sans font-medium"
                      style={{ color: 'var(--color-brand-text)' }}
                      data-testid={`${testIdPrefix}-dst-skipped-badge-${slot.slotIndex}`}
                    >
                      {slot.skippedBeforeThisSlotUk}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* 24:00 Bottom Rail Label */}
            <div
              className="absolute bottom-0.5 left-0 w-16 sm:w-20 px-2 text-[11px] font-mono tabular-nums pointer-events-none"
              style={{ color: 'var(--text-secondary)' }}
            >
              24:00
            </div>

            {/* 2. Events & Reservations Lane Layer */}
            <div className="absolute top-0 bottom-0 left-16 sm:left-20 right-2">
              {/* Unoccupied Gap Interactive Slots inside the Timeline */}
              {effectiveProjection.availability.unoccupiedGaps
                .filter((gap) => gap.durationMinutes >= 30)
                .map((gap, idx) => {
                  const dayBoundsStartMs = Date.parse(
                    effectiveProjection.availability.windowStartInstant
                  );
                  const gapOffsetStartMin = Math.max(
                    0,
                    Math.round((gap.startMs - dayBoundsStartMs) / 60_000)
                  );
                  const topPct =
                    (gapOffsetStartMin /
                      effectiveProjection.dayDurationMinutes) *
                    100;
                  const heightPct =
                    (gap.durationMinutes /
                      effectiveProjection.dayDurationMinutes) *
                    100;

                  return (
                    <div
                      key={`timeline-gap-${gap.startInstant}-${idx}`}
                      className="absolute inset-x-1 flex items-center justify-end pr-2 pointer-events-none"
                      style={{
                        top: `${topPct}%`,
                        height: `${heightPct}%`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenGapPicker(gap)}
                        aria-label={testIdPrefix.startsWith('today') || testIdPrefix === 'calendar' ? `${gap.startLocalTime}–${gap.endLocalTime} · ${UK_STRINGS.timeline.planInGapButton}` : UK_STRINGS.timeline.planInGapAria(`${gap.startLocalTime}–${gap.endLocalTime}`)}
                        data-testid={`${testIdPrefix}-timeline-gap-action-${idx}`}
                        className="pointer-events-auto min-h-[44px] px-2.5 py-1 rounded-xl text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-opacity opacity-80 hover:opacity-100"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-secondary)',
                          border: '1px dashed var(--border-subtle)',
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {gap.startLocalTime}–{gap.endLocalTime} ·{' '}
                          {UK_STRINGS.timeline.planInGapButton}
                        </span>
                      </button>
                    </div>
                  );
                })}

              {/* Positioned Timeline Items in Distinguishable Overlap Lanes */}
              {positionedItems.map((pos) => {
                const { item } = pos;
                const isReservation = item.sourceKind === 'reservation';
                const isShift = item.sourceKind === 'work_shift';
                const sourceEvent = !isReservation
                  ? events.find((ev) => ev.id === item.sourceId)
                  : null;
                const sourceTask =
                  isReservation && item.taskId
                    ? tasks.find((t) => t.id === item.taskId)
                    : null;

                const palette = paletteColorToken(item.color);
                const laneWidthPct = 100 / pos.totalLanes;
                const laneLeftPct = pos.laneIndex * laneWidthPct;

                const isDimmed =
                  pos.visualState === 'past' ||
                  pos.visualState === 'completed' ||
                  pos.visualState === 'released' ||
                  pos.visualState === 'canceled';

                return (
                  <div
                    key={item.itemKey}
                    data-testid={`${testIdPrefix}-timed-item-${item.title}`}
                    data-lane-index={pos.laneIndex}
                    data-total-lanes={pos.totalLanes}
                    data-visual-state={pos.visualState}
                    data-stored-duration-minutes={
                      item.segment.elapsedDurationMinutes
                    }
                    style={{
                      top: `${pos.topPercent}%`,
                      height: `${pos.heightPercent}%`,
                      left: `calc(${laneLeftPct}% + 2px)`,
                      width: `calc(${laneWidthPct}% - 4px)`,
                    }}
                    className="absolute z-10"
                  >
                    {/* Proportional visual block + guaranteed >=44px interactive touch target wrapper that does NOT alter stored duration */}
                    <div
                      onClick={() => handleTimelineItemPrimaryClick(item)}
                      className="w-full h-full min-h-[44px] rounded-xl p-2 flex flex-col justify-between gap-1 overflow-hidden shadow-xs transition-opacity"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: pos.hasConflict
                          ? '1.5px solid #b7791f'
                          : `1px solid ${palette.accentVar}`,
                        opacity:
                          pos.visualState === 'released'
                            ? 0.62
                            : isDimmed
                            ? 0.84
                            : 1,
                        cursor: !isReservation ? 'pointer' : 'default',
                      }}
                    >
                      <div className="flex items-start justify-between gap-1.5 min-w-0">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1 text-[12px] leading-tight">
                            <span className="font-mono tabular-nums font-semibold">
                              {item.segment.displayStartLocalTime} –{' '}
                              {item.segment.displayEndLocalTime}
                            </span>
                            <span
                              className={`text-[13px] font-semibold truncate ${
                                pos.visualState === 'completed' ||
                                pos.visualState === 'canceled'
                                  ? 'line-through'
                                  : ''
                              }`}
                            >
                              {item.title}
                            </span>
                            {isShift && (
                              <span
                                className="text-[11px] font-medium"
                                style={{ color: 'var(--color-work-text)' }}
                              >
                                · Робоча зміна
                              </span>
                            )}
                            {isReservation && (
                              <span
                                className="text-[11px] font-medium"
                                style={{ color: 'var(--color-reservation)' }}
                              >
                                · Сесія справи
                              </span>
                            )}
                          </div>

                          <div
                            className="text-[11px] flex flex-wrap items-center gap-1.5 leading-tight"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <span>
                              Частка на добу:{' '}
                              {item.segment.elapsedDurationMinutes} хв
                            </span>
                            <span>· {pos.statusBadgeUk}</span>
                            {pos.hasConflict && (
                              <span
                                className="font-semibold"
                                style={{ color: 'var(--color-brand-text)' }}
                                data-testid={`${testIdPrefix}-conflict-badge-${item.title}`}
                              >
                                · {UK_STRINGS.timeline.conflictBadge}
                              </span>
                            )}
                            {item.segment.continuesBeforeDayStart && (
                              <span
                                data-testid={`continuation-prev-${item.sourceId}`}
                              >
                                •{' '}
                                {
                                  UK_STRINGS.scheduling
                                    .continuationFromPrevDayBadge
                                }
                              </span>
                            )}
                            {item.segment.continuesAfterDayEnd && (
                              <span
                                data-testid={`continuation-next-${item.sourceId}`}
                              >
                                • {UK_STRINGS.scheduling.continuesNextDayBadge}
                              </span>
                            )}
                          </div>

                          {item.releaseNoteUk && (
                            <div
                              className="text-[11px] leading-snug"
                              style={{ color: 'var(--text-secondary)' }}
                              data-testid={`${testIdPrefix}-release-note-${item.title}`}
                            >
                              {item.releaseNoteUk}
                            </div>
                          )}

                          {item.originZoneNoteUk && (
                            <div
                              className="text-[11px] leading-snug"
                              style={{ color: 'var(--text-secondary)' }}
                              data-testid={`origin-zone-context-${item.sourceId}`}
                            >
                              {item.originZoneNoteUk}
                            </div>
                          )}
                        </div>

                        {/* Action Controls */}
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isReservation &&
                            sourceTask &&
                            item.state === 'active' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                aria-label={
                                  sourceTask.state === 'completed'
                                    ? `${UK_STRINGS.plansView.reopenTaskButton}: ${sourceTask.title}`
                                    : `${UK_STRINGS.plansView.completeTaskButton}: ${sourceTask.title}`
                                }
                                onClick={() =>
                                  void onToggleTaskState(sourceTask.id)
                                }
                                data-testid={`${testIdPrefix}-complete-reservation-task-${sourceTask.title}`}
                              >
                                {sourceTask.state === 'completed'
                                  ? UK_STRINGS.plansView.reopenTaskButton
                                  : UK_STRINGS.plansView.completeTaskButton}
                              </Button>
                            )}
                          {isReservation && onInspectHabitSession && reservations.find(r => r.id === item.sourceId)?.habitOccurrence && <Button size="sm" variant="subtle" onClick={() => onInspectHabitSession(reservations.find(r => r.id === item.sourceId)!)}>Звичка: запис і сеанси</Button>}
                          {isReservation && sourceTask && onInspectTask && <Button size="sm" variant="subtle" aria-label={`Планування справи: ${sourceTask.title}`} onClick={() => onInspectTask(sourceTask, item.sourceId)}>Дата й сеанси</Button>}
                          {!isReservation &&
                            sourceEvent &&
                            sourceEvent.state === 'active' && (
                              <>
                                <Button
                                  variant="subtle"
                                  size="sm"
                                  aria-label={`Редагувати подію: ${sourceEvent.title}`}
                                  data-testid={`${testIdPrefix}-edit-event-${sourceEvent.title}`}
                                  onClick={() => onInspectEvent(sourceEvent)}
                                >
                                  {UK_STRINGS.timeline.inspectRecordButton}
                                </Button>
                                <Button
                                  variant="subtle"
                                  size="icon"
                                  aria-label={`Скасувати подію: ${sourceEvent.title}`}
                                  data-testid={`${testIdPrefix}-cancel-event-${sourceEvent.title}`}
                                  onClick={() =>
                                    void onCancelEvent(
                                      sourceEvent.id,
                                      sourceEvent.revision
                                    )
                                  }
                                >
                                  <Trash2
                                    className="w-4 h-4"
                                    aria-hidden="true"
                                  />
                                </Button>
                              </>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 3. Current-Time Line (6.3 Appears ONLY in the date containing now) */}
              {currentTimeIndicator.isVisibleOnDate && (
                <div
                  className="absolute inset-x-0 z-20 flex items-center pointer-events-none"
                  style={{ top: `${currentTimeIndicator.topPercent}%` }}
                  data-testid={`${testIdPrefix}-current-time-indicator`}
                  aria-label={`${UK_STRINGS.timeline.currentTimeLabel}: ${currentTimeIndicator.currentLocalTimeLabel}`}
                >
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold -ml-14 sm:-ml-16 shadow-xs"
                    style={{
                      backgroundColor: 'var(--color-brand)',
                      color: '#FFFFFF',
                    }}
                  >
                    {currentTimeIndicator.currentLocalTimeLabel}
                  </span>
                  <div
                    className="flex-1 h-[2px]"
                    style={{ backgroundColor: 'var(--color-brand)' }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Availability & Unoccupied Windows Summary Card with Gap Picker Actions (C10 / 5.6 / 6.4) */}
      {!compactMode && !testIdPrefix.startsWith('today') && (
        <details className="calendar-time-details"><summary>Деталі часу та вільні проміжки</summary>
        <Card
          title={UK_STRINGS.scheduling.availabilityCardTitle}
          data-testid={`${testIdPrefix}-availability-card`}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[13px]">
              <div
                className="p-2.5 rounded-xl"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
                data-testid={`${testIdPrefix}-occupied-minutes`}
              >
                <div
                  className="text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.scheduling.occupiedTotalLabel}
                </div>
                <div className="font-semibold mt-0.5 tabular-nums">
                  {effectiveProjection.availability.totalOccupiedMinutes} хв
                </div>
              </div>

              <div
                className="p-2.5 rounded-xl"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
                data-testid={`${testIdPrefix}-unoccupied-minutes`}
              >
                <div
                  className="text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.scheduling.unoccupiedTotalLabel}
                </div>
                <div className="font-semibold mt-0.5 tabular-nums">
                  {effectiveProjection.availability.totalUnoccupiedMinutes} хв
                </div>
              </div>

              <div
                className="p-2.5 rounded-xl"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <div
                  className="text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.scheduling.categoryWorkLabel} /{' '}
                  {UK_STRINGS.scheduling.categoryReservationsLabel}
                </div>
                <div className="font-semibold mt-0.5 tabular-nums">
                  {effectiveProjection.availability.categoryTotalsMinutes.work}{' '}
                  хв /{' '}
                  {
                    effectiveProjection.availability.categoryTotalsMinutes
                      .reservations
                  }{' '}
                  хв
                </div>
              </div>

              <div
                className="p-2.5 rounded-xl"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <div
                  className="text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.scheduling.categoryPersonalLabel} /{' '}
                  {UK_STRINGS.scheduling.categoryRestLabel}
                </div>
                <div className="font-semibold mt-0.5 tabular-nums">
                  {
                    effectiveProjection.availability.categoryTotalsMinutes
                      .personalBlocking
                  }{' '}
                  хв /{' '}
                  {
                    effectiveProjection.availability.categoryTotalsMinutes
                      .restSleepTravel
                  }{' '}
                  хв
                </div>
              </div>
            </div>

            {effectiveProjection.availability.unoccupiedGaps.length > 0 && (
              <div className="space-y-1.5">
                <div
                  className="text-[12px] font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.scheduling.unoccupiedGapsHeading} (натисніть, щоб
                  запланувати існуючу справу):
                </div>
                <div className="flex flex-wrap gap-2">
                  {effectiveProjection.availability.unoccupiedGaps.map(
                    (gap, idx) => (
                      <button
                        key={`${gap.startInstant}-${idx}`}
                        type="button"
                        onClick={() => onOpenGapPicker(gap)}
                        data-testid={`${testIdPrefix}-gap-pill-${idx}`}
                        aria-label={UK_STRINGS.timeline.planInGapAria(
                          `${gap.startLocalTime}–${gap.endLocalTime} (${gap.durationMinutes} хв)`
                        )}
                        className="min-h-[44px] px-3 py-1.5 rounded-xl text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <span className="font-mono tabular-nums">
                          {gap.startLocalTime} – {gap.endLocalTime} (
                          {gap.durationMinutes} хв)
                        </span>
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: 'var(--color-reservation)' }}
                        >
                          · {UK_STRINGS.timeline.planInGapButton}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
        </details>
      )}

      {/* Accessible Overlap Cluster Modal Sheet (6.1 Provide readable accessible details for dense clusters) */}
      <ModalSheet
        isOpen={Boolean(activeClusterModal)}
        title={UK_STRINGS.timeline.clusterModalTitle}
        subtitle={
          activeClusterModal
            ? `${activeClusterModal.displayStartLocalTime}–${activeClusterModal.displayEndLocalTime} · ${UK_STRINGS.timeline.clusterModalSubtitle}`
            : undefined
        }
        onClose={() => setActiveClusterModal(null)}
      >
        {activeClusterModal && (
          <div
            className="space-y-2.5"
            data-testid={`${testIdPrefix}-cluster-modal-content`}
          >
            {activeClusterModal.items.map((pos) => {
              const { item } = pos;
              const isReservation = item.sourceKind === 'reservation';
              const sourceEvent = !isReservation
                ? events.find((ev) => ev.id === item.sourceId)
                : null;
              const sourceTask =
                isReservation && item.taskId
                  ? tasks.find((t) => t.id === item.taskId)
                  : null;

              return (
                <div
                  key={item.itemKey}
                  className="p-3 rounded-xl flex items-start justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="space-y-1">
                    <div className="text-[14px] font-semibold">
                      Смуга {pos.laneIndex + 1}/{pos.totalLanes}:{' '}
                      {item.segment.displayStartLocalTime}–
                      {item.segment.displayEndLocalTime} · {item.title}
                    </div>
                    <div
                      className="text-[12px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {pos.statusBadgeUk} ·{' '}
                      {item.segment.elapsedDurationMinutes} хв
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isReservation && onInspectHabitSession && reservations.find(r => r.id === item.sourceId)?.habitOccurrence && <Button onClick={() => { setActiveClusterModal(null); onInspectHabitSession(reservations.find(r => r.id === item.sourceId)!); }}>Звичка: запис і сеанси</Button>}
                    {isReservation && sourceTask && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          void onToggleTaskState(sourceTask.id);
                          setActiveClusterModal(null);
                        }}
                      >
                        {sourceTask.state === 'completed'
                          ? UK_STRINGS.plansView.reopenTaskButton
                          : UK_STRINGS.plansView.completeTaskButton}
                      </Button>
                    )}
                    {!isReservation && sourceEvent && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setActiveClusterModal(null);
                          onInspectEvent(sourceEvent);
                        }}
                      >
                        {UK_STRINGS.timeline.inspectRecordButton}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ModalSheet>
    </div>
  );
}
