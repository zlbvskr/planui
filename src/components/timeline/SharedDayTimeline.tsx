import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowDown, ArrowUp, ChevronDown, Moon } from "lucide-react";
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
  formatInstant,
  formatShortDate,
  formatTime,
  formatTimeRange,
  sentenceCase,
} from "../../lib/format";
import { ActionMenu, ItemCard, Pill } from "../ui/design";
import { directionFor, Effort } from "./itemPresentation";
import { dayOffset, futureGaps, minutePixels } from "./viewport";
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
}: {
  plan: DailyPlan;
  presentationKey: string;
  p: ReturnType<typeof layoutTimelineOverlapLanes>["positionedItems"][number];
  height: number;
  shared: React.RefObject<SharedDayTimelineProps>;
}) {
  const props = shared.current;
  const { tasks, events, reservations } = props;
  const folders = props.folders ?? EMPTY,
    projects = props.projects ?? EMPTY;
  const item = p.item,
    task = tasks.find((t) => t.id === item.taskId),
    ev = events.find((e) => e.id === item.sourceId),
    dir = directionFor(task, folders, projects);
  const reminder = item.segment.elapsedDurationMinutes < 10;
  const hue = task
    ? dir.hue
    : ev?.type === "work_shift"
      ? "#e4b86d"
      : ev?.type === "sleep"
        ? "#8aabdb"
        : "#8ed4a6";
  const inspect = () => {
    const current = shared.current;
    if (task) current.onInspectTask?.(task, item.sourceId);
    else if (ev) current.onInspectEvent(ev);
  };
  const before = item.segment.continuesBeforeDayStart,
    after = item.segment.continuesAfterDayEnd;
  return (
    <ItemCard
      key={item.itemKey}
      hue={hue}
      data-source={item.sourceId}
      data-continues-before={before}
      data-continues-after={after}
      className={`today-time-item ${reminder ? "today-reminder" : ""}`}
      style={{
        top: `${p.topPercent}%`,
        height: Math.max(
          44,
          (p.heightPercent / 100) * height - (after ? 0 : 4),
        ),
        left: `calc(52px + (100% - 52px) * ${p.laneIndex / p.totalLanes})`,
        width: `calc((100% - 52px) / ${p.totalLanes} - 2px)`,
        borderTopLeftRadius: before ? 0 : undefined,
        borderTopRightRadius: before ? 0 : undefined,
        borderBottomLeftRadius: after ? 0 : undefined,
        borderBottomRightRadius: after ? 0 : undefined,
      }}
    >
      <button
        className="today-item-open"
        onClick={inspect}
        aria-label={`Відкрити: ${item.title}`}
      >
        <h3>{item.title}</h3>
        {!reminder && task?.description && <p>{task.description}</p>}
        {!reminder && (
          <div className="ui-item-meta">
            {formatTimeRange(
              item.segment.displayStartLocalTime,
              item.segment.displayEndLocalTime,
            )}{" "}
            · {task ? dir.name : item.title}{" "}
            {task?.effort && (
              <>
                · <Effort effort={task.effort} />
              </>
            )}
          </div>
        )}
        {reminder && (
          <span className="ui-item-meta">
            {formatTime(item.segment.displayStartLocalTime)}
          </span>
        )}
      </button>
      {!reminder && plan.focusTaskIds.includes(task?.id ?? "") && (
        <span className="today-star" aria-label="Фокус дня">
          ★
        </span>
      )}
      {task?.deadline?.kind === "date_only" && (
        <span className="today-deadline">
          до {formatDeadline(task.deadline.localDate)}
        </span>
      )}
      <div className="timeline-item-actions">
        <ActionMenu
          label={`Дії: ${item.title}`}
          items={[
            { label: "Редагувати", onSelect: inspect },
            ...(task
              ? [
                  {
                    label:
                      task.state === "completed"
                        ? "Відкрити знову"
                        : "Завершити",
                    onSelect: () =>
                      void shared.current.onToggleTaskState(task.id),
                  },
                ]
              : []),
            ...(ev
              ? [
                  {
                    label: "Скасувати подію",
                    onSelect: () =>
                      void shared.current.onCancelEvent(ev.id, ev.revision),
                  },
                ]
              : []),
            ...(reservations.find((r) => r.id === item.sourceId)
              ?.habitOccurrence
              ? [
                  {
                    label: "Запис звички",
                    onSelect: () =>
                      shared.current.onInspectHabitSession?.(
                        reservations.find((r) => r.id === item.sourceId)!,
                      ),
                  },
                ]
              : []),
          ]}
        />
      </div>
    </ItemCard>
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
    const { events } = props;
    const plan = props.plans ? props.plans[projection.localDate]??EMPTY_DAILY_PLAN : props.plan??EMPTY_DAILY_PLAN;
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
    const gap = plan.minimalDay
      ? undefined
      : futureGaps(projection.availability.unoccupiedGaps, initialNow).at(-1);
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
          <span>{dayLabel}</span>
        </div>
        {projection.allDayItems.length > 0 && (
          <div className="timeline-all-day">
            {projection.allDayItems.map((i) => (
              <button
                key={i.eventId}
                onClick={() => {
                  const e = events.find((e) => e.id === i.eventId);
                  if (e) shared.current.onInspectEvent(e);
                }}
              >
                {i.title} · Увесь день
              </button>
            ))}
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
        {positions
          .filter(
            (p) =>
              (p.topPercent / 100) * height <= visibleEnd &&
              ((p.topPercent + p.heightPercent) / 100) * height >= visibleStart,
          )
          .filter(
            (p) =>
              !overnight ||
              projection.localDate !== today ||
              expanded ||
              (p.item.itemKey !== overnight.itemKey &&
                p.item.itemKey !== sleep?.itemKey),
          )
          .map((p) => (
            <TimelineItem
              key={p.item.itemKey}
              p={p}
              height={height}
              shared={shared}
              presentationKey={presentationKey}
              plan={plan}
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
