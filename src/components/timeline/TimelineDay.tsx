import React, { memo, useMemo } from "react";

import type { UnoccupiedTimeGap } from "../../domain/availability";

import {
  areaName,
  itemColor,
  orbVars,
  shiftAreaColor,
  shiftColor,
} from "../../domain/modelHelpers";

import type { ProjectedDaySchedule } from "../../domain/scheduling";

import { sphereStates } from "../../domain/sphereInsights";

import {
  formatInstantInZone,
  getLocalDateBoundariesInZone,
} from "../../domain/temporal";

import { layoutTimelineOverlapLanes } from "../../domain/timelineLayout";

import { EMPTY_DAILY_PLAN } from "../../domain/today";

import {
  formatDuration,
  formatShortDate,
  formatTime,
  sentenceCase,
} from "../../lib/format";

import { HeroArt } from "../../ui/art";

import { EventBar } from "../../ui/GelBar";

import { Row } from "../../ui/rows";

import { needsSphereStep, SphereStepMarker } from "../../ui/spheres";

import { SharedDayTimelineProps } from "./timelineTypes";

import { EMPTY } from "./timelineGeometry";

import { HOUR_H } from "./timelineGeometry";

import { parseWallClockMinutes } from "./timelineGeometry";

import { FIXED_HOURS } from "./timelineGeometry";

import { DAY_H } from "./timelineGeometry";

import { TimelineItem } from "./TimelineItem";

import { NowLine } from "./NowLine";

function futureGaps(
  gaps: readonly UnoccupiedTimeGap[],
  nowMs: number,
  minimum = 30,
) {
  return gaps
    .filter(
      (gap) =>
        !(gap.startLocalTime === "00:00" && gap.endLocalTime === "24:00"),
    )
    .map((gap) => {
      const startMs = Math.max(gap.startMs, Math.ceil(nowMs / 60000) * 60000);
      return {
        ...gap,
        startMs,
        durationMinutes: (gap.endMs - startMs) / 60000,
      };
    })
    .filter((g) => g.durationMinutes >= minimum && g.durationMinutes < 1440);
}

export const TimelineDay = memo(
  function TimelineDay({
    index,
    projection,
    shared,
    today,
    initialNow,
    nowMinutes,
    expanded,
  }: {
    index: number;
    presentationKey: string;
    projection: ProjectedDaySchedule;
    shared: React.RefObject<SharedDayTimelineProps>;
    today: string;
    initialNow: number;
    nowMinutes: number;
    expanded: boolean;
  }) {
    const props = shared.current;
    const { events, tasks, reservations } = props;
    const folders = props.folders ?? EMPTY;
    const projects = props.projects ?? EMPTY;
    const goals = props.goals ?? EMPTY;
    const lifeAreas = props.lifeAreas ?? EMPTY;
    const assessments = props.assessments ?? EMPTY;
    const context = useMemo(
      () => ({ folders, projects, goals, lifeAreas, assessments }),
      [folders, projects, goals, lifeAreas, assessments],
    );
    const sphereData = useMemo(
      () =>
        sphereStates(
          lifeAreas,
          assessments,
          new Date(props.nowMs).toISOString(),
        ),
      [lifeAreas, assessments, props.nowMs],
    );
    const plan = props.plans
      ? (props.plans[projection.localDate] ?? EMPTY_DAILY_PLAN)
      : (props.plan ?? EMPTY_DAILY_PLAN);

    const bounds = useMemo(
      () =>
        getLocalDateBoundariesInZone(
          projection.localDate,
          projection.displayZone,
        ),
      [projection.localDate, projection.displayZone],
    );
    const dayLabel = useMemo(
      () => sentenceCase(formatShortDate(projection.localDate)),
      [projection.localDate],
    );

    const overnight = projection.timelineItems.find(
      (i) => i.sourceKind === "work_shift" && i.segment.continuesBeforeDayStart,
    );
    const sleep = projection.timelineItems.find(
      (i) => events.find((e) => e.id === i.sourceId)?.type === "sleep",
    );
    const positions = useMemo(
      () =>
        layoutTimelineOverlapLanes({
          items: projection.timelineItems,
          dayDurationMinutes: 1440,
          nowMs: initialNow,
          minVisualDurationMinutes: (28 / HOUR_H) * 60,
        }).positionedItems,
      [projection, initialNow],
    );

    const clampedLanes = useMemo(() => {
      const overflowBuckets = new Map<string, number>();
      positions.forEach((pos) => {
        if (pos.laneIndex >= 2) {
          overflowBuckets.set(
            pos.clusterId,
            (overflowBuckets.get(pos.clusterId) ?? 0) + 1,
          );
        }
      });

      return positions
        .filter((pos) => pos.laneIndex < 2)
        .map((pos) => {
          const overflow =
            pos.laneIndex === 1 ? (overflowBuckets.get(pos.clusterId) ?? 0) : 0;
          return {
            pos,
            displayLane: pos.laneIndex,
            totalLanes: Math.min(2, Math.max(1, pos.totalLanes)),
            overflowCount: overflow,
          };
        });
    }, [positions]);

    const visibleItems = useMemo(
      () =>
        clampedLanes.filter(
          ({ pos }) =>
            !overnight ||
            projection.localDate !== today ||
            expanded ||
            pos.item.itemKey !== sleep?.itemKey,
        ),
      [clampedLanes, overnight, projection.localDate, today, expanded, sleep],
    );

    const untimedShifts = useMemo(
      () =>
        events.filter(
          (e) =>
            e.type === "work_shift" &&
            e.schedule.kind === "all_day" &&
            e.schedule.startLocalDate <= projection.localDate &&
            projection.localDate < e.schedule.endLocalDateExclusive,
        ),
      [events, projection.localDate],
    );

    const untimedEvents = useMemo(
      () =>
        events.filter(
          (e) =>
            e.type !== "work_shift" &&
            e.type !== "sleep" &&
            e.schedule.kind === "all_day" &&
            e.schedule.startLocalDate <= projection.localDate &&
            projection.localDate < e.schedule.endLocalDateExclusive,
        ),
      [events, projection.localDate],
    );

    const untimedTasks = useMemo(
      () =>
        tasks.filter(
          (t) =>
            t.state === "open" &&
            t.plannedDate === projection.localDate &&
            !reservations.some(
              (r) => r.taskId === t.id && r.state === "active",
            ),
        ),
      [tasks, reservations, projection.localDate],
    );

    const hasUntimed =
      untimedShifts.length > 0 ||
      untimedEvents.length > 0 ||
      untimedTasks.length > 0 ||
      projection.allDayItems.length > 0;

    const nowY = (nowMinutes / 60) * HOUR_H;
    const isPastDay = projection.localDate < today;
    const isToday = projection.localDate === today;
    const visualGapInfo = useMemo(() => {
      const candidates = futureGaps(
        projection.availability.unoccupiedGaps,
        initialNow,
      ).filter((g) => g.durationMinutes >= 30 && g.startMs > initialNow);
      if (candidates.length === 0) return null;

      const occupiedRangesPx = visibleItems.map(({ pos }) => {
        const item = pos.item;
        const startMin = item.segment.continuesBeforeDayStart
          ? 0
          : parseWallClockMinutes(item.segment.displayStartLocalTime, false);
        const endMin = item.segment.continuesAfterDayEnd
          ? 1440
          : parseWallClockMinutes(item.segment.displayEndLocalTime, true);
        const durMin = Math.max(5, endMin - startMin);
        const tPx = (startMin / 60) * HOUR_H;
        const hPx = Math.max(Math.round((durMin / 60) * HOUR_H), 28);
        return { top: tPx, bottom: tPx + hPx };
      });

      for (let idx = candidates.length - 1; idx >= 0; idx--) {
        const g = candidates[idx];
        const rawStartMin = Math.max(
          (g.startMs - bounds.startMs) / 60000,
          isToday ? nowMinutes : 0,
        );
        const rawEndMin = Math.min(1440, (g.endMs - bounds.startMs) / 60000);
        if (rawEndMin - rawStartMin < (44 / HOUR_H) * 60) continue;

        let visualStartPx = (rawStartMin / 60) * HOUR_H;
        let visualEndPx = (rawEndMin / 60) * HOUR_H;

        for (const r of occupiedRangesPx) {
          if (r.top <= visualStartPx && r.bottom > visualStartPx) {
            visualStartPx = Math.max(visualStartPx, r.bottom + 4);
          }
          if (r.top > visualStartPx && r.top < visualEndPx) {
            visualEndPx = Math.min(visualEndPx, r.top - 4);
          }
        }

        const overlapsAny = occupiedRangesPx.some(
          (r) =>
            Math.max(r.top, visualStartPx) < Math.min(r.bottom, visualEndPx),
        );
        const visualHeightPx = visualEndPx - visualStartPx;

        if (!overlapsAny && visualHeightPx >= 44) {
          const startHm = formatTime(
            formatInstantInZone(
              new Date(g.startMs).toISOString(),
              projection.displayZone,
            ).localTime,
          );
          const endHm = formatTime(g.endLocalTime);
          return {
            gap: g,
            topPx: Math.round(visualStartPx + 4),
            label: `+ ${startHm}-${endHm} · Запланувати`,
          };
        }
      }
      return null;
    }, [
      projection.availability.unoccupiedGaps,
      projection.displayZone,
      initialNow,
      visibleItems,
      bounds.startMs,
      isToday,
      nowMinutes,
    ]);

    const rail = useMemo(
      () =>
        FIXED_HOURS.map((h) => (
          <div
            className="today-hour"
            key={h.hour}
            data-past={isPastDay || (isToday && h.hour * 60 < nowMinutes)}
            style={{ top: `${h.topPx}px`, height: HOUR_H }}
          >
            <span
              data-hour-y={h.topPx}
              style={{
                transform: h.hour === 0 ? "translateY(2px)" : undefined,
                visibility:
                  isToday && Math.abs(h.topPx - nowY) < 14
                    ? "hidden"
                    : undefined,
              }}
            >
              {formatTime(h.label)}
            </span>
            <i />
          </div>
        )),
      [isPastDay, isToday, nowMinutes, nowY],
    );

    return (
      <section
        className="timeline-day"
        data-date={projection.localDate}
        style={{
          position: "absolute",
          top: index * DAY_H,
          left: 0,
          right: 0,
          height: DAY_H,
        }}
        aria-label={dayLabel}
      >
        <div className="timeline-day-boundary">
          <span className="timeline-day-chip">{dayLabel}</span>
        </div>

        {hasUntimed && (
          <div className="timeline-untimed-section relative z-[12] pl-[52px] pr-1 space-y-2 mb-3">
            <div className="timeline-untimed-title text-[12px] font-semibold text-secondary tracking-wider px-2">
              Без часу
            </div>
            {untimedShifts.map((ev) => {
              const resolvedName = areaName(ev, context);
              const color = shiftColor(ev);
              const linkedAreaColor = shiftAreaColor(ev, context);
              return (
                <EventBar
                  key={ev.id}
                  color={color}
                  icon="sun"
                  title={ev.title}
                  meta={`Зміна${resolvedName ? ` · ${resolvedName}` : ""}`}
                  style={
                    linkedAreaColor
                      ? { borderLeft: `3px solid ${linkedAreaColor}` }
                      : undefined
                  }
                  onClick={() => shared.current.onInspectEvent(ev)}
                />
              );
            })}

            {untimedEvents.map((ev) => {
              const resolvedName = areaName(ev, context);
              const color = itemColor(ev, context);
              return (
                <EventBar
                  key={ev.id}
                  color={color}
                  icon="calendar"
                  title={ev.title}
                  meta={resolvedName || "Подія"}
                  onClick={() => shared.current.onInspectEvent(ev)}
                />
              );
            })}

            {projection.allDayItems
              .filter(
                (i) =>
                  !untimedShifts.some((s) => s.id === i.eventId) &&
                  !untimedEvents.some((e) => e.id === i.eventId),
              )
              .map((i) => {
                const e = events.find((ev) => ev.id === i.eventId);
                const resolvedName = areaName(e, context);
                const color = itemColor(e, context);
                return (
                  <EventBar
                    key={i.eventId}
                    color={color}
                    icon="calendar"
                    title={i.title}
                    meta={
                      resolvedName
                        ? `Увесь день · ${resolvedName}`
                        : "Увесь день"
                    }
                    onClick={() => {
                      if (e) shared.current.onInspectEvent(e);
                    }}
                  />
                );
              })}

            {untimedTasks.map((t) => {
              const resolvedName = areaName(t, context);
              const color = itemColor(t, context);
              return (
                <div
                  key={t.id}
                  style={
                    { "--glow-c": orbVars(color)["--c"] } as React.CSSProperties
                  }
                >
                  <Row
                    orbColor={color}
                    orbSize={26}
                    title={
                      <>
                        {needsSphereStep(t, sphereData, context) && (
                          <SphereStepMarker />
                        )}
                        {t.title}
                      </>
                    }
                    meta={
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {resolvedName && <span>{resolvedName}</span>}
                        {t.estimatedDurationMinutes && (
                          <span>
                            {resolvedName ? "· " : ""}
                            {formatDuration(t.estimatedDurationMinutes)}
                          </span>
                        )}
                      </div>
                    }
                    checked={t.state === "completed"}
                    done={t.state === "completed"}
                    onCheckedChange={() =>
                      void shared.current.onToggleTaskState(t.id)
                    }
                    onClick={() => shared.current.onInspectTask?.(t)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {rail}
        {!visibleItems.length && !hasUntimed && (
          <div
            className="timeline-empty-cue"
            data-testid="timeline-empty-cue"
            style={{
              top:
                Math.min(20, isToday ? Math.floor(nowMinutes / 60) : 9) *
                  HOUR_H +
                28,
            }}
          >
            <HeroArt name="moon" size={64} />
            <strong>Вільний час</strong>
            <span>Залиши місце для себе або додай запис.</span>
            {shared.current.onEmptyCreateAction && (
              <button
                type="button"
                className="ui-pill"
                onClick={() => shared.current.onEmptyCreateAction?.()}
              >
                {shared.current.emptyActionLabel || "Додати запис"}
              </button>
            )}
          </div>
        )}
        {visualGapInfo && (visibleItems.length > 0 || hasUntimed) && (
          <button
            type="button"
            className="today-gap"
            style={{
              position: "absolute",
              left: 52,
              right: 4,
              height: 28,
              minHeight: 28,
              maxHeight: 28,
              zIndex: 8,
              top: visualGapInfo.topPx,
            }}
            onClick={() =>
              shared.current.onOpenGapPicker({
                ...visualGapInfo.gap,
                startInstant: new Date(visualGapInfo.gap.startMs).toISOString(),
                startLocalTime: formatInstantInZone(
                  new Date(visualGapInfo.gap.startMs).toISOString(),
                  projection.displayZone,
                ).localTime,
              })
            }
          >
            {visualGapInfo.label}
          </button>
        )}
        {visibleItems.map(({ pos, displayLane, totalLanes, overflowCount }) => (
          <TimelineItem
            key={pos.item.itemKey}
            p={pos}
            shared={shared}
            plan={plan}
            displayLane={displayLane}
            totalLanes={totalLanes}
            overflowCount={overflowCount}
            hiddenOverlaps={
              overflowCount
                ? positions.filter(
                    (other) =>
                      other.clusterId === pos.clusterId && other.laneIndex >= 2,
                  )
                : undefined
            }
          />
        ))}
        {isToday && (
          <NowLine
            date={today}
            zone={projection.displayZone}
            initialNow={initialNow}
          />
        )}
      </section>
    );
  },
  (a, b) =>
    a.index === b.index &&
    a.presentationKey === b.presentationKey &&
    a.projection === b.projection &&
    a.today === b.today &&
    a.nowMinutes === b.nowMinutes &&
    a.expanded === b.expanded,
);
