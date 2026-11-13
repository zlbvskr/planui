import React, { memo, useState } from "react";

import {
  areaName,
  itemColor,
  orbVars,
  shiftAreaColor,
  shiftColor,
} from "../../domain/modelHelpers";

import { sphereStates } from "../../domain/sphereInsights";

import { layoutTimelineOverlapLanes } from "../../domain/timelineLayout";

import type { DailyPlan } from "../../domain/types";

import { formatSegmentTimeRange } from "../../lib/format";

import { HeroArt } from "../../ui/art";

import { Checkbox } from "../../ui/Checkbox";

import { Icon } from "../../ui/icons";

import { Row } from "../../ui/rows";

import { Sheet } from "../../ui/sheets";

import { needsSphereStep, SphereStepMarker } from "../../ui/spheres";

import { SharedDayTimelineProps } from "./timelineTypes";

import { EMPTY } from "./timelineGeometry";

import { parseWallClockMinutes } from "./timelineGeometry";

import { HOUR_H } from "./timelineGeometry";

export const TimelineItem = memo(function TimelineItem({
  p,
  shared,
  plan,
  displayLane,
  totalLanes,
  overflowCount = 0,
  hiddenOverlaps = [],
}: {
  plan: DailyPlan;
  p: ReturnType<typeof layoutTimelineOverlapLanes>["positionedItems"][number];
  shared: React.RefObject<SharedDayTimelineProps>;
  displayLane: number;
  totalLanes: number;
  overflowCount?: number;
  hiddenOverlaps?: ReturnType<
    typeof layoutTimelineOverlapLanes
  >["positionedItems"];
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const props = shared.current;
  const { tasks, events, reservations } = props;
  const folders = props.folders ?? EMPTY;
  const projects = props.projects ?? EMPTY;
  const goals = props.goals ?? EMPTY;
  const lifeAreas = props.lifeAreas ?? EMPTY;
  const assessments = props.assessments ?? EMPTY;
  const item = p.item;
  const task = tasks.find((t) => t.id === item.taskId);
  const ev = events.find((e) => e.id === item.sourceId);

  const context = { folders, projects, goals, lifeAreas, assessments };
  const resolvedAreaName = areaName(task ?? ev, context);
  const sphereData = sphereStates(
    lifeAreas,
    assessments,
    new Date(props.nowMs).toISOString(),
  );
  const supportsArea = task && needsSphereStep(task, sphereData, context);

  const before = item.segment.continuesBeforeDayStart;
  const after = item.segment.continuesAfterDayEnd;
  const startMinutes = before
    ? 0
    : parseWallClockMinutes(item.segment.displayStartLocalTime, false);
  const endMinutes = after
    ? 1440
    : parseWallClockMinutes(item.segment.displayEndLocalTime, true);
  const durationMinutes = Math.max(5, endMinutes - startMinutes);

  const topPx = (startMinutes / 60) * HOUR_H;
  const rawHeight = (durationMinutes / 60) * HOUR_H;
  const cardHeight = Math.max(Math.round(rawHeight), 28);
  const layoutTier: "one-line" | "two-line" | "full" =
    cardHeight < 40 ? "one-line" : cardHeight <= 72 ? "two-line" : "full";

  const isShift = ev?.type === "work_shift" || item.sourceKind === "work_shift";
  const isNightShift =
    isShift &&
    ((ev?.schedule.kind === "timed" &&
      ev.schedule.interval.originStartLocalDate !==
        ev.schedule.interval.originEndLocalDate) ||
      before ||
      after ||
      item.segment.displayStartLocalTime >= "18:00" ||
      item.segment.displayStartLocalTime < "06:00");

  const hue =
    ev?.type === "sleep"
      ? "var(--color-sleep, var(--color-neutral-slate))"
      : itemColor(task ?? ev, context);

  const inspect = () => {
    const current = shared.current;
    if (task) current.onInspectTask?.(task, item.sourceId);
    else if (ev) current.onInspectEvent(ev);
  };

  const originInterval =
    ev?.schedule.kind === "timed" ? ev.schedule.interval : null;
  const timeRangeLabel = formatSegmentTimeRange(item.segment, originInterval);
  const shiftStickyLabel = before
    ? timeRangeLabel
    : `${isNightShift ? "Нічна" : "Денна"} ${timeRangeLabel}`;

  const leftCalc =
    totalLanes > 1
      ? displayLane === 0
        ? "52px"
        : "min(calc(100% - 154px), calc(52px + (100% - 56px + 6px) / 2))"
      : "52px";
  const widthCalc =
    totalLanes > 1
      ? "max(150px, calc((100% - 56px - 6px) / 2))"
      : "calc(100% - 56px)";

  const fullA11yLabel = `${item.title}${supportsArea ? ", підтягує сферу" : ""}, ${timeRangeLabel}${resolvedAreaName ? `, ${resolvedAreaName}` : ""}`;
  const isDoneTask = Boolean(task && task.state === "completed");

  const resolvedShiftColor = isShift
    ? shiftColor(ev ?? { kind: isNightShift ? "night" : "day" })
    : hue;
  const linkedShiftAreaColor = isShift ? shiftAreaColor(ev, context) : null;
  const shiftVars = orbVars(resolvedShiftColor);
  const shiftUseInkText = isShift && !isNightShift;
  const isRailShift = isShift && cardHeight > 120;

  return (
    <>
      <div
        data-source={item.sourceId}
        data-collision={p.hasConflict}
        data-lanes={totalLanes}
        data-lane={displayLane}
        data-continues-before={before}
        data-continues-after={after}
        data-layout-tier={layoutTier}
        className="timeline-item-positioned"
        style={{
          position: "absolute",
          top: `${topPx}px`,
          height: cardHeight,
          minHeight: 28,
          left: leftCalc,
          width: widthCalc,
          maxWidth: "calc(100% - 56px)",
          zIndex: isShift ? 9 : 10 + displayLane,
        }}
      >
        {task ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={fullA11yLabel}
            data-ui="row"
            data-done={isDoneTask ? "true" : undefined}
            data-glow={isDoneTask ? "true" : undefined}
            onClick={() => setDetailOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setDetailOpen(true);
              }
            }}
            className={`timeline-task-row ${
              layoutTier === "one-line" ? "timeline-row-compact" : ""
            } ${isDoneTask ? "ui-soft-row-glow task-completed" : ""}`}
            style={
              {
                "--c": orbVars(hue)["--c"],
                "--glow-c": orbVars(hue)["--c"],
              } as React.CSSProperties
            }
          >
            <span
              className="timeline-color-tab"
              style={{ backgroundColor: hue }}
              aria-hidden="true"
            />
            <div className="timeline-item-body">
              {layoutTier === "one-line" ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="timeline-title-compact truncate">
                    {supportsArea && <SphereStepMarker />}
                    {item.title}
                  </span>
                  <span className="timeline-time-compact shrink-0 tabular-nums">
                    {timeRangeLabel}
                  </span>
                </div>
              ) : (
                <>
                  <div className="timeline-title-standard truncate">
                    {supportsArea && <SphereStepMarker />}
                    {item.title}
                  </div>
                  <div className="timeline-meta-standard truncate tabular-nums">
                    {timeRangeLabel}
                    {resolvedAreaName ? ` · ${resolvedAreaName}` : ""}
                  </div>
                  {layoutTier === "full" && task.measure && (
                    <div className="timeline-measure-bar mt-1">
                      <div className="w-full bg-black/10 rounded-full h-1 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                0,
                                (task.measure.current /
                                  (task.measure.target || 1)) *
                                  100,
                              ),
                            )}%`,
                            backgroundColor: hue,
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
                        {task.measure.current} / {task.measure.target}{" "}
                        {task.measure.unit}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div
              className="flex items-center gap-1.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {overflowCount > 0 ? (
                <span className="ui-pill !min-h-[20px] h-5 text-[11px] font-bold bg-ink text-white px-1.5 py-0 rounded-full">
                  +{overflowCount}
                </span>
              ) : plan.focusTaskIds.includes(task.id) ? (
                <Icon name="star" size={13} className="text-amber-500" />
              ) : null}
              <Checkbox
                checked={isDoneTask}
                label={
                  isDoneTask
                    ? `Відкрити знову: ${item.title}`
                    : `Завершити: ${item.title}`
                }
                onChange={() => void shared.current.onToggleTaskState(task.id)}
                className="timeline-checkbox-22"
              />
            </div>
          </div>
        ) : isShift ? (
          isRailShift ? (
            <button
              type="button"
              aria-label={`${shiftStickyLabel}${resolvedAreaName ? `, ${resolvedAreaName}` : ""}`}
              data-ui="event-bar"
              data-shift={isNightShift ? "night" : "day"}
              data-shift-style="rail"
              onClick={() => setDetailOpen(true)}
              className={`timeline-shift-rail-bar ${
                isNightShift
                  ? "timeline-shift-rail-night"
                  : "timeline-shift-rail-day"
              }`}
              style={
                {
                  ...shiftVars,
                  "--shift-c": resolvedShiftColor,
                } as React.CSSProperties
              }
            >
              <span className="timeline-shift-left-rail" aria-hidden="true" />
              <div className="timeline-shift-rail-header">
                <span className="timeline-shift-rail-chip">
                  {isNightShift ? (
                    <HeroArt name="moon" size={28} />
                  ) : (
                    <Icon
                      name="sun"
                      size={16}
                      className="timeline-shift-rail-icon"
                      aria-hidden="true"
                    />
                  )}
                  <span className="timeline-shift-rail-title truncate">
                    {shiftStickyLabel}
                  </span>
                  {(linkedShiftAreaColor || resolvedAreaName) && (
                    <span
                      className="timeline-shift-rail-orb"
                      style={{
                        backgroundColor:
                          linkedShiftAreaColor ?? "var(--color-neutral-slate)",
                      }}
                      aria-hidden="true"
                    />
                  )}
                  {resolvedAreaName && (
                    <span className="timeline-shift-rail-area truncate">
                      {resolvedAreaName}
                    </span>
                  )}
                </span>
                {overflowCount > 0 && (
                  <span className="ui-pill !min-h-[20px] h-5 text-[11px] font-bold bg-ink text-white px-1.5 py-0 rounded-full ml-auto shrink-0">
                    +{overflowCount}
                  </span>
                )}
              </div>
            </button>
          ) : (
            <button
              type="button"
              aria-label={`${shiftStickyLabel}${resolvedAreaName ? `, ${resolvedAreaName}` : ""}`}
              data-ui="event-bar"
              data-shift={isNightShift ? "night" : "day"}
              data-shift-style="gel"
              data-yellow={shiftUseInkText ? "true" : undefined}
              onClick={() => setDetailOpen(true)}
              className={`timeline-shift-gel-bar ui-gel-bar ${
                shiftUseInkText
                  ? "ui-gel-bar-shift-day"
                  : "ui-gel-bar-shift-night"
              }`}
              style={{
                ...shiftVars,
                ...(linkedShiftAreaColor
                  ? { borderLeft: `3px solid ${linkedShiftAreaColor}` }
                  : {}),
              }}
            >
              <div className="timeline-shift-sticky-label">
                <span className="timeline-shift-icon" aria-hidden="true">
                  <Icon name={isNightShift ? "moon" : "sun"} size={14} />
                </span>
                {linkedShiftAreaColor && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: linkedShiftAreaColor }}
                    aria-hidden="true"
                  />
                )}
                <span className="timeline-shift-text truncate">
                  {shiftStickyLabel}
                  {resolvedAreaName ? ` · ${resolvedAreaName}` : ""}
                </span>
                {overflowCount > 0 && (
                  <span className="text-[11px] font-bold bg-white/30 px-1.5 py-0.5 rounded-full backdrop-blur-sm ml-auto shrink-0">
                    +{overflowCount}
                  </span>
                )}
              </div>
            </button>
          )
        ) : (
          <button
            type="button"
            aria-label={fullA11yLabel}
            data-ui="event-bar"
            onClick={() => setDetailOpen(true)}
            className={`timeline-event-row ${
              layoutTier === "one-line" ? "timeline-row-compact" : ""
            }`}
            style={
              {
                "--c": orbVars(hue)["--c"],
              } as React.CSSProperties
            }
          >
            <span
              className="timeline-color-tab"
              style={{ backgroundColor: hue }}
              aria-hidden="true"
            />
            <div className="timeline-item-body">
              {layoutTier === "one-line" ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="timeline-title-compact truncate">
                    {supportsArea && <SphereStepMarker />}
                    {item.title}
                  </span>
                  <span className="timeline-time-compact shrink-0 tabular-nums">
                    {timeRangeLabel}
                  </span>
                </div>
              ) : (
                <>
                  <div className="timeline-title-standard truncate">
                    {supportsArea && <SphereStepMarker />}
                    {item.title}
                  </div>
                  <div className="timeline-meta-standard truncate tabular-nums">
                    {timeRangeLabel}
                    {resolvedAreaName ? ` · ${resolvedAreaName}` : ""}
                  </div>
                </>
              )}
            </div>
            {overflowCount > 0 && (
              <span className="ui-pill !min-h-[20px] h-5 text-[11px] font-bold bg-ink text-white px-1.5 py-0 rounded-full shrink-0">
                +{overflowCount}
              </span>
            )}
          </button>
        )}
      </div>

      <Sheet
        title={item.title}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {hiddenOverlaps.length > 0 && (
          <section className="space-y-2" aria-label="Інші одночасні записи">
            <h3 className="font-extrabold">Інші одночасні записи</h3>
            {hiddenOverlaps.map(({ item: other }) => (
              <Row
                key={other.itemKey}
                title={other.title}
                meta={formatSegmentTimeRange(other.segment)}
                chevron
                onClick={() => {
                  const otherTask = tasks.find((t) => t.id === other.taskId);
                  const otherEvent = events.find(
                    (e) => e.id === other.sourceId,
                  );
                  setDetailOpen(false);
                  if (otherTask)
                    shared.current.onInspectTask?.(otherTask, other.sourceId);
                  else if (otherEvent)
                    shared.current.onInspectEvent(otherEvent);
                }}
              />
            ))}
          </section>
        )}
        <p className="ui-item-meta">
          {timeRangeLabel}
          {resolvedAreaName ? ` · ${resolvedAreaName}` : ""}
        </p>
        <button
          type="button"
          className="ui-disclosure"
          onClick={() => {
            setDetailOpen(false);
            inspect();
          }}
        >
          <Row title="Редагувати" />
        </button>
        {task && (
          <button
            type="button"
            className="ui-disclosure"
            onClick={() => {
              setDetailOpen(false);
              void shared.current.onToggleTaskState(task.id);
            }}
          >
            <Row
              title={
                task.state === "completed" ? "Відкрити знову" : "Завершити"
              }
            />
          </button>
        )}
        {ev && (
          <button
            type="button"
            className="ui-disclosure"
            onClick={() => {
              setDetailOpen(false);
              void shared.current.onCancelEvent(ev.id, ev.revision);
            }}
          >
            <Row title="Скасувати подію" />
          </button>
        )}
        {reservations.find((r) => r.id === item.sourceId)?.habitOccurrence && (
          <button
            type="button"
            className="ui-disclosure"
            onClick={() => {
              setDetailOpen(false);
              shared.current.onInspectHabitSession?.(
                reservations.find((r) => r.id === item.sourceId)!,
              );
            }}
          >
            <Row title="Запис звички" />
          </button>
        )}
      </Sheet>
    </>
  );
});
