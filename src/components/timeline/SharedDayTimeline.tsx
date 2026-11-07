import {Icon} from '../../ui/icons';
import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowDown, ArrowUp, ChevronDown, Moon } from "../../ui/icons";
import type {
  CalendarEvent,
  DailyPlan,
  EntityId,
  Folder,
  IanaTimeZone,
  Project,
  Task,
  TaskReservation,
} from "../../domain/types";
import {
  buildDayTimelineHourRail,
  layoutTimelineOverlapLanes,
  projectScheduleForDate,
} from "../../domain/scheduling";
import type {
  ProjectedDaySchedule,
  UnoccupiedTimeGap,
} from "../../domain/scheduling";
import {
  addDaysToLocalDate,
  formatInstantInZone,
  getLocalDateBoundariesInZone,
  resolveLocalDateTimeToInstant,
} from "../../domain/temporal";
import { EMPTY_DAILY_PLAN } from "../../domain/today";
import {
  formatDeadline,
  formatDuration,
  formatInstant,
  formatShortDate,
  formatTime,
  formatTimeRange,
  sentenceCase,
} from "../../lib/format";
import { ActionMenu, ItemCard, Pill, Sheet, Row, EventBar, TintedCard, Orb } from "../../ui";
import { directionFor, Effort, itemColor } from "./itemPresentation";
import { dayOffset, futureGaps, minutePixels } from "./viewport";
import { resolveArea, areaColor, SHIFT_DAY_COLOR, SHIFT_NIGHT_COLOR } from "../../domain/modelHelpers";
export interface SharedDayTimelineProps {
  folders?: readonly Folder[];
  projects?: readonly Project[];
  plan?: DailyPlan;
  plans?: Record<string, DailyPlan>;
  onDayInView?: (date: string) => void;
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

const EMPTY: readonly never[] = [];

/** Minute ticks are isolated here: no schedule projection or day rerenders. */
function NowLine({
  date,
  zone,
  initialNow,
}: {
  date: string;
  zone: string;
  initialNow: number;
}) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const line = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const section = line.current?.closest(".timeline-day");
    const b = getLocalDateBoundariesInZone(date, zone);
    const y = minutePixels((now - b.startMs) / 60000);
    section?.querySelectorAll<HTMLElement>("[data-hour-y]").forEach((label) => {
      label.style.visibility =
        Math.abs(Number(label.dataset.hourY) - y) < 14 ? "hidden" : "";
    });
  }, [now, date, zone]);
  const b = getLocalDateBoundariesInZone(date, zone);
  if (now < b.startMs || now >= b.endMs) return null;
  const top = minutePixels((now - b.startMs) / 60000);
  return (
    <div
      ref={line}
      className="today-now-line"
      style={{ transform: `translateY(${top}px)` }}
      data-testid="today-current-time-indicator"
    >
      <span>
        {formatTime(
          formatInstantInZone(new Date(now).toISOString(), zone).localTime,
        )}
      </span>
      <i />
    </div>
  );
}

const TimelineItem = memo(function TimelineItem({
  p,
  height,
  shared,
  presentationKey,
  plan,
  displayLane,
  totalLanes,
  overflowCount = 0,
}: {
  plan: DailyPlan;
  presentationKey: string;
  p: ReturnType<typeof layoutTimelineOverlapLanes>["positionedItems"][number];
  height: number;
  shared: React.RefObject<SharedDayTimelineProps>;
  displayLane: number;
  totalLanes: number;
  overflowCount?: number;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const props = shared.current;
  const { tasks, events, reservations } = props;
  const folders = props.folders ?? EMPTY,
    projects = props.projects ?? EMPTY;
  const item = p.item,
    task = tasks.find((t) => t.id === item.taskId),
    ev = events.find((e) => e.id === item.sourceId);

  const context = { folders, projects };
  const areaInfo = resolveArea(task ?? ev, context);
  const areaColorVal = areaColor(areaInfo?.rating);

  const cardHeight = Math.max(34, (p.heightPercent / 100) * height - (item.segment.continuesAfterDayEnd ? 0 : 4));
  const isCompact = cardHeight < 48;

  const isShift = ev?.type === "work_shift" || item.sourceKind === "work_shift";
  const isNightShift =
    isShift &&
    ev?.schedule.kind === "timed" &&
    ev.schedule.interval.originStartLocalDate !== ev.schedule.interval.originEndLocalDate;

  const hue = task
    ? (areaInfo ? areaColorVal : directionFor(task, folders, projects).hue)
    : isShift
    ? (areaInfo ? areaColorVal : (isNightShift ? SHIFT_NIGHT_COLOR : SHIFT_DAY_COLOR))
    : ev?.type === "sleep"
    ? "var(--color-sleep, var(--color-neutral-slate))"
    : (areaInfo ? areaColorVal : itemColor(ev, { folders, projects }));

  const inspect = () => {
    const current = shared.current;
    if (task) current.onInspectTask?.(task, item.sourceId);
    else if (ev) current.onInspectEvent(ev);
  };

  const before = item.segment.continuesBeforeDayStart,
    after = item.segment.continuesAfterDayEnd;

  const timeRangeLabel = formatTimeRange(
    item.segment.displayStartLocalTime,
    item.segment.displayEndLocalTime,
  );

  const leftCalc = `calc(52px + (100% - 52px) * ${displayLane / totalLanes})`;
  const widthCalc = `calc((100% - 52px) / ${totalLanes} - 4px)`;

  return (
    <>
      <div
        key={item.itemKey}
        data-source={item.sourceId}
        data-collision={p.hasConflict}
        data-continues-before={before}
        data-continues-after={after}
        className="timeline-item-positioned"
        style={{
          position: "absolute",
          top: `${p.topPercent}%`,
          height: cardHeight,
          left: leftCalc,
          width: widthCalc,
          zIndex: 10,
        }}
      >
        {task ? (
          <TintedCard
            color={hue}
            compact={isCompact}
            className="w-full h-full relative cursor-pointer select-none"
            onClick={() => setDetailOpen(true)}
            title={item.title}
            meta={
              !isCompact ? (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>{timeRangeLabel}</span>
                    {areaInfo?.name && (
                      <span className="inline-flex items-center gap-1 font-medium text-ink">
                        <Orb size={10} color={hue} />
                        {areaInfo.name}
                      </span>
                    )}
                    {task.effort && <Effort effort={task.effort} />}
                  </div>
                  {task.measure && (
                    <div className="timeline-measure-bar mt-1">
                      <div className="w-full bg-black/10 rounded-full h-1 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(0, (task.measure.current / (task.measure.target || 1)) * 100))}%`,
                            backgroundColor: hue,
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-secondary tabular-nums">
                        {task.measure.current} / {task.measure.target} {task.measure.unit}
                      </span>
                    </div>
                  )}
                </div>
              ) : undefined
            }
            trailing={
              overflowCount > 0 ? (
                <span className="ui-pill text-[11px] font-bold bg-ink text-white px-1.5 py-0.5 rounded-full">
                  +{overflowCount}
                </span>
              ) : plan.focusTaskIds.includes(task.id) ? (
                <Icon name="star" size={14} className="text-amber-500" />
              ) : undefined
            }
          />
        ) : (
          <EventBar
            color={hue}
            icon={isShift ? (isNightShift ? "moon" : "sun") : "calendar"}
            title={item.title}
            meta={!isCompact ? `${timeRangeLabel}${areaInfo?.name ? ` · ${areaInfo.name}` : ""}` : undefined}
            status={
              overflowCount > 0 ? (
                <span className="text-[11px] font-bold bg-white/30 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                  +{overflowCount}
                </span>
              ) : undefined
            }
            className="w-full h-full relative cursor-pointer select-none"
            onClick={() => setDetailOpen(true)}
          />
        )}
      </div>

      <Sheet title={item.title} isOpen={detailOpen} onClose={() => setDetailOpen(false)}>
        <p className="ui-item-meta">{timeRangeLabel}</p>
        <button type="button" className="ui-disclosure" onClick={() => { setDetailOpen(false); inspect(); }}>
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
            <Row title={task.state === "completed" ? "Відкрити знову" : "Завершити"} />
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

const TimelineDay = memo(
  function TimelineDay({
    projection,
    shared,
    today,
    initialNow,
    expanded,
    visibleStart,
    visibleEnd,
    presentationKey,
  }: {
    presentationKey: string;
    projection: ProjectedDaySchedule;
    shared: React.RefObject<SharedDayTimelineProps>;
    today: string;
    initialNow: number;
    expanded: boolean;
    visibleStart: number;
    visibleEnd: number;
  }) {
    const props = shared.current;
    const { events, tasks, reservations } = props;
    const folders = props.folders ?? EMPTY,
      projects = props.projects ?? EMPTY;
    const plan = props.plans ? props.plans[projection.localDate] ?? EMPTY_DAILY_PLAN : props.plan ?? EMPTY_DAILY_PLAN;
    const height = minutePixels(projection.dayDurationMinutes);
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
    const hours = useMemo(
      () =>
        buildDayTimelineHourRail(projection.localDate, projection.displayZone),
      [projection.localDate, projection.displayZone],
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
          dayDurationMinutes: projection.dayDurationMinutes,
          nowMs: initialNow,
        }).positionedItems,
      [projection, initialNow],
    );

    // Clamped overlap lanes to max 2 columns with +N on lane 1
    const clampedLanes = useMemo(() => {
      const overflowBuckets = new Map<number, number>();
      positions.forEach((pos) => {
        if (pos.laneIndex >= 2) {
          const key = Math.floor(pos.topPercent / 5);
          overflowBuckets.set(key, (overflowBuckets.get(key) ?? 0) + 1);
        }
      });

      return positions
        .filter((pos) => pos.laneIndex < 2)
        .map((pos) => {
          const key = Math.floor(pos.topPercent / 5);
          const overflow = pos.laneIndex === 1 ? overflowBuckets.get(key) ?? 0 : 0;
          return {
            pos,
            displayLane: pos.laneIndex,
            totalLanes: Math.min(2, Math.max(1, pos.totalLanes)),
            overflowCount: overflow,
          };
        });
    }, [positions]);

    // Categorized "Без часу" items for this date
    const untimedShifts = useMemo(
      () =>
        events.filter(
          (e) =>
            e.type === "work_shift" &&
            e.schedule.kind === "all_day" &&
            (e.schedule as any).startLocalDate <= projection.localDate &&
            projection.localDate < (e.schedule as any).endLocalDateExclusive,
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
            (e.schedule as any).startLocalDate <= projection.localDate &&
            projection.localDate < (e.schedule as any).endLocalDateExclusive,
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

    const gap = futureGaps(projection.availability.unoccupiedGaps, initialNow).at(-1);
    const rail = useMemo(
      () =>
        hours
          .filter((h) => h.topPercent < 100)
          .map((h) => (
            <div
              className="today-hour"
              key={h.slotIndex}
              data-past={
                bounds.startMs +
                  (h.topPercent / 100) * (bounds.endMs - bounds.startMs) <
                initialNow
              }
              style={{ top: `${h.topPercent}%`, height: 56 }}
            >
              <span
                aria-label={
                  h.repeatedOccurrenceBadgeUk
                    ? `${formatTime(h.localTimeLabel)} · ${h.repeatedOccurrenceBadgeUk}`
                    : undefined
                }
                data-hour-y={(h.topPercent / 100) * height}
                style={{
                  visibility:
                    projection.localDate === today &&
                    Math.abs(
                      (h.topPercent / 100) * height -
                        minutePixels((initialNow - bounds.startMs) / 60000),
                    ) < 14
                      ? "hidden"
                      : undefined,
                }}
              >
                {formatTime(h.localTimeLabel)}
              </span>
              <i />
            </div>
          )),
      [hours, height, bounds, initialNow, today, projection.localDate],
    );

    return (
      <section
        className="timeline-day"
        data-date={projection.localDate}
        style={{ height }}
        aria-label={dayLabel}
      >
        <div className="timeline-day-boundary">
          <span className="timeline-day-chip">{dayLabel}</span>
        </div>

        {hasUntimed && (
          <div className="timeline-untimed-section space-y-2 mb-3">
            <div className="timeline-untimed-title text-[12px] font-semibold text-secondary tracking-wider px-2">
              Без часу
            </div>
            {/* Category (2): Зміна */}
            {untimedShifts.map((ev) => {
              const areaInfo = resolveArea(ev, { folders, projects });
              const color = areaInfo ? areaColor(areaInfo.rating) : SHIFT_DAY_COLOR;
              return (
                <EventBar
                  key={ev.id}
                  color={color}
                  icon="sun"
                  title={ev.title}
                  meta={`Зміна${areaInfo?.name ? ` · ${areaInfo.name}` : ""}`}
                  onClick={() => shared.current.onInspectEvent(ev)}
                />
              );
            })}

            {/* Category (3): Події */}
            {untimedEvents.map((ev) => {
              const areaInfo = resolveArea(ev, { folders, projects });
              const color = areaInfo ? areaColor(areaInfo.rating) : itemColor(ev, { folders, projects });
              return (
                <EventBar
                  key={ev.id}
                  color={color}
                  icon="calendar"
                  title={ev.title}
                  meta={areaInfo?.name ?? "Подія"}
                  onClick={() => shared.current.onInspectEvent(ev)}
                />
              );
            })}

            {/* Legacy all-day items if not already rendered */}
            {projection.allDayItems
              .filter(
                (i) =>
                  !untimedShifts.some((s) => s.id === i.eventId) &&
                  !untimedEvents.some((e) => e.id === i.eventId),
              )
              .map((i) => {
                const e = events.find((ev) => ev.id === i.eventId);
                const areaInfo = resolveArea(e, { folders, projects });
                const color = areaInfo ? areaColor(areaInfo.rating) : "var(--color-brand)";
                return (
                  <EventBar
                    key={i.eventId}
                    color={color}
                    icon="calendar"
                    title={i.title}
                    meta="Увесь день"
                    onClick={() => {
                      if (e) shared.current.onInspectEvent(e);
                    }}
                  />
                );
              })}

            {/* Category (4): Завдання */}
            {untimedTasks.map((t) => {
              const areaInfo = resolveArea(t, { folders, projects });
              const color = areaInfo ? areaColor(areaInfo.rating) : directionFor(t, folders, projects).hue;
              return (
                <TintedCard
                  key={t.id}
                  color={color}
                  title={t.title}
                  meta={
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {areaInfo?.name && (
                        <span className="inline-flex items-center gap-1 font-medium text-ink">
                          <Orb size={10} color={color} />
                          {areaInfo.name}
                        </span>
                      )}
                      {t.estimatedDurationMinutes && (
                        <span>{formatDuration(t.estimatedDurationMinutes)}</span>
                      )}
                    </div>
                  }
                  onClick={() => shared.current.onInspectTask?.(t)}
                />
              );
            })}
          </div>
        )}

        {rail}
        {gap && (
          <button
            className="today-gap"
            style={{
              top: minutePixels((gap.startMs - bounds.startMs) / 60000),
            }}
            onClick={() =>
              shared.current.onOpenGapPicker({
                ...gap,
                startInstant: new Date(gap.startMs).toISOString(),
                startLocalTime: formatInstantInZone(
                  new Date(gap.startMs).toISOString(),
                  projection.displayZone,
                ).localTime,
              })
            }
          >
            +{" "}
            {formatTimeRange(
              formatInstantInZone(
                new Date(gap.startMs).toISOString(),
                projection.displayZone,
              ).localTime,
              gap.endLocalTime,
            )}{" "}
            · Запланувати справу
          </button>
        )}
        {clampedLanes
          .filter(
            ({ pos }) =>
              (pos.topPercent / 100) * height <= visibleEnd &&
              ((pos.topPercent + pos.heightPercent) / 100) * height >= visibleStart,
          )
          .filter(
            ({ pos }) =>
              !overnight ||
              projection.localDate !== today ||
              expanded ||
              (pos.item.itemKey !== overnight.itemKey &&
                pos.item.itemKey !== sleep?.itemKey),
          )
          .map(({ pos, displayLane, totalLanes, overflowCount }) => (
            <TimelineItem
              key={pos.item.itemKey}
              p={pos}
              height={height}
              shared={shared}
              presentationKey={presentationKey}
              plan={plan}
              displayLane={displayLane}
              totalLanes={totalLanes}
              overflowCount={overflowCount}
            />
          ))}
        {projection.localDate === today && (
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
    a.presentationKey === b.presentationKey &&
    a.projection === b.projection &&
    a.today === b.today &&
    a.expanded === b.expanded &&
    a.visibleStart === b.visibleStart &&
    a.visibleEnd === b.visibleEnd,
);


/** One scroll surface; offsets use elapsed zoned time, including 23/25-hour days.
 * Offscreen days remain geometry-only spacers. Prepending compensates before paint. */
export function SharedDayTimeline(props: SharedDayTimelineProps) {
  const { projection, events, tasks, reservations } = props;
  const zone = projection.displayZone;
  const initialNow = useRef(props.nowMs).current;
  const today = formatInstantInZone(
    new Date(initialNow).toISOString(),
    zone,
  ).localDate;
  const origin = useRef(projection.localDate).current;
  const ref = useRef<HTMLDivElement>(null),
    shared = useRef(props);
  shared.current = props;
  const [range, setRange] = useState({ first: -1, last: 1, view: 0 });
  const [scrollBucket, setScrollBucket] = useState(0);
  const geometry = useMemo(() => new Map<number, number>(), [origin, zone]);
  const offsetAt = (i: number) => {
    if (!geometry.has(i)) geometry.set(i, dayOffset(origin, i, zone));
    return geometry.get(i)!;
  };
  const [away, setAway] = useState<"up" | "down" | null>(null);
  const [released, setReleased] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const jump = useRef<string | null>(projection.localDate),
    anchor = useRef<{ date: string; top: number } | null>(null);
  const dateAt = (offset: number) => addDaysToLocalDate(origin, offset);
  const dateIndex = (date: string) =>
    Math.round(
      (Date.parse(date + "T12:00Z") - Date.parse(origin + "T12:00Z")) /
        86400000,
    );
  const cache = useMemo(
    () => new Map<number, ProjectedDaySchedule>(),
    [
      origin,
      zone,
      events,
      tasks,
      reservations,
      released,
      props.plan,
      projection,
      props.projectionWithReleased,
    props.plans,
    ],
  );
  const [, setProjectionVersion] = useState(0);
  const pending = useMemo(
    () => new Map<number, ProjectedDaySchedule>(),
    [cache],
  );
  const requested = useMemo(() => new Set<number>(), [cache]);
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    const worker = new Worker(
      new URL("./projection.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = ({
      data,
    }: {
      data: { index: number; projection: ProjectedDaySchedule };
    }) => {
      cache.set(data.index, data.projection);
      setProjectionVersion((v) => v + 1);
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [cache]);
  useEffect(() => {
    for (
      let i = Math.max(range.first, range.view - 3);
      i <= Math.min(range.last, range.view + 3);
      i++
    ) {
      if (cache.has(i) || requested.has(i)) continue;
      requested.add(i);
      workerRef.current?.postMessage({
        index: i,
        date: addDaysToLocalDate(origin, i),
        zone,
        events,
        tasks,
        reservations,
        released,
      });
    }
  }, [cache, range.first, range.last, range.view]);
  const projections = new Map<number, ProjectedDaySchedule>();
  for (
    let i = Math.max(range.first, range.view - 3);
    i <= Math.min(range.last, range.view + 3);
    i++
  ) {
    const date = addDaysToLocalDate(origin, i);
    if (date === projection.localDate)
      cache.set(
        i,
        released ? (props.projectionWithReleased ?? projection) : projection,
      );
    if (!cache.has(i) && !pending.has(i))
      pending.set(
        i,
        projectScheduleForDate({
          localDate: date,
          displayZone: zone,
          events: [],
          tasks: [],
          reservations: [],
          dayOffAnnotations: [],
        }),
      );
    projections.set(i, cache.get(i) ?? pending.get(i)!);
  }
  for (const key of cache.keys())
    if (Math.abs(key - range.view) > 3) {
      cache.delete(key);
      requested.delete(key);
      pending.delete(key);
    }
  const scrollToDate = (date: string, allowSmooth = false) => {
    const el = ref.current;
    if (!el) return;
    const b = getLocalDateBoundariesInZone(date, zone);
    const target =
      date === today
        ? shared.current.nowMs - 3600000
        : Date.parse(
            resolveLocalDateTimeToInstant(date, "07:00", zone).instant!,
          );
    const top =
      offsetAt(dateIndex(date)) -
      offsetAt(range.first) +
      Math.max(0, minutePixels((target - b.startMs) / 60000));
    el.scrollTo({
      top,
      behavior:
        allowSmooth && !matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "smooth"
          : "instant",
    });
  };
  useLayoutEffect(() => {
    if (anchor.current && ref.current) {
      const node = ref.current.querySelector<HTMLElement>(
        `[data-date="${anchor.current.date}"]`,
      );
      if (node)
        ref.current.scrollTop +=
          node.getBoundingClientRect().top - anchor.current.top;
      anchor.current = null;
    }
    if (jump.current) {
      const date = jump.current;
      jump.current = null;
      scrollToDate(date);
    }
  }, [range]);
  useEffect(() => {
    const idx = dateIndex(projection.localDate);
    jump.current = projection.localDate;
    setRange((r) => ({
      ...r,
      first: Math.min(r.first, idx - 1),
      last: Math.max(r.last, idx + 1),
      view: idx,
    }));
  }, [projection.localDate]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = el.getBoundingClientRect();
      setScrollBucket(Math.floor((el.scrollTop + offsetAt(range.first)) / 168));
      const nodes = Array.from(
        el.querySelectorAll<HTMLElement>(".timeline-day"),
      );
      const current =
        nodes.find(
          (n) => n.getBoundingClientRect().bottom > viewport.top + 44,
        ) ?? nodes.at(-1);
      if (!current) return;
      const date = current.dataset.date!,
        idx = dateIndex(date);
      shared.current.onDayInView?.(date);
      const line = el.querySelector<HTMLElement>(".today-now-line");
      const rect = line?.getBoundingClientRect();
      setAway(
        !rect ? (date>today?"up":"down") : rect.top > viewport.bottom
          ? "down"
          : rect.top < viewport.top + 44
            ? "up"
            : null,
      );
      const prepend = el.scrollTop < el.clientHeight,
        append =
          el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight;
      if (prepend) {
        anchor.current = { date, top: current.getBoundingClientRect().top };
      }
      setRange((r) =>
        r.view === idx && !prepend && !append
          ? r
          : {
              first: r.first - (prepend ? 1 : 0),
              last: r.last + (append ? 1 : 0),
              view: idx,
            },
      );
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [range.first, range.last, zone]);
  const indices = Array.from(
    {
      length:
        Math.min(range.last, range.view + 3) -
        Math.max(range.first, range.view - 3) +
        1,
    },
    (_, i) => Math.max(range.first, range.view - 3) + i,
  );
  const todayProjection = projections.get(dateIndex(today));
  const overnight = todayProjection?.timelineItems.find(
    (i) => i.sourceKind === "work_shift" && i.segment.continuesBeforeDayStart,
  );
  const sleep = todayProjection?.timelineItems.find(
    (i) => events.find((e) => e.id === i.sourceId)?.type === "sleep",
  );
  return (
    <section className="today-day-canvas" data-ui="content-start">
      {props.projectionWithReleased?.timelineItems.some(
        (i) => i.state === "released",
      ) && (
        <Pill selected={released} onClick={() => setReleased(!released)}>
          Показати зняті сеанси
        </Pill>
      )}
      {overnight && dateAt(range.view) === today && (
        <div className="today-continuity">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <Moon size={18} aria-hidden="true" />
            <span>
              <strong>
                {Date.parse(
                  events.find((e) => e.id === overnight.sourceId)?.schedule
                    .kind === "timed"
                    ? (
                        events.find((e) => e.id === overnight.sourceId)!
                          .schedule as { interval: { endInstant: string } }
                      ).interval.endInstant
                    : "",
                ) > initialNow
                  ? "Нічна зміна · до "
                  : "Нічна зміна завершилась о "}
                {formatTime(overnight.segment.displayEndLocalTime)}
              </strong>
              <small>
                {(() => {
                  const e = events.find((e) => e.id === overnight.sourceId);
                  return e?.schedule.kind === "timed"
                    ? `З ${formatInstant(e.schedule.interval.startInstant, zone, { day: "numeric", month: "long" })}, ${formatTime(e.schedule.interval.originStartLocalTime)}`
                    : "";
                })()}
                {sleep
                  ? ` · сон до ${formatTime(sleep.segment.displayEndLocalTime)}`
                  : ""}
              </small>
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      <div
        ref={ref}
        className="continuous-time-scroll"
        tabIndex={0}
        role="region"
        aria-label="Безперервний розклад"
      >
        <div style={{ height: offsetAt(indices[0]) - offsetAt(range.first) }} />
        {indices.map((i) => (
          <TimelineDay
            key={i}
            projection={projections.get(i)!}
            shared={shared}
            today={today}
            initialNow={initialNow}
            expanded={expanded}
            presentationKey={JSON.stringify(props.plans ? props.plans[dateAt(i)]??EMPTY_DAILY_PLAN : props.plan??EMPTY_DAILY_PLAN)}
            visibleStart={Math.max(0, scrollBucket * 168 - offsetAt(i) - 240)}
            visibleEnd={Math.min(
              offsetAt(i + 1) - offsetAt(i),
              scrollBucket * 168 - offsetAt(i) + 900,
            )}
          />
        ))}
        <div
          style={{
            height: offsetAt(range.last + 1) - offsetAt(indices.at(-1)! + 1),
          }}
        />
      </div>
      {away && (
        <button
          className="ui-pill today-now-jump"
          onClick={() => {
            const idx = dateIndex(today);
            jump.current = today;
            setRange((r) => ({
              ...r,
              first: Math.min(r.first, idx - 1),
              last: Math.max(r.last, idx + 1),
              view: idx,
            }));
          }}
        >
          {away === "up" ? (
            <ArrowUp size={16} aria-hidden="true" />
          ) : (
            <ArrowDown size={16} aria-hidden="true" />
          )}
          Зараз
        </button>
      )}
    </section>
  );
}
