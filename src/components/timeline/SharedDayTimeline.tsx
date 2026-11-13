import { forwardRef,useCallback,useEffect,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState } from "react";

import type { ProjectedDaySchedule } from "../../domain/scheduling";

import { projectScheduleForDate } from "../../domain/scheduling";

import { EMPTY_DAILY_PLAN } from "../../domain/today";

import { formatInstant,formatTime } from "../../lib/format";

import { ArrowDown,ArrowUp,ChevronDown,Moon } from "../../ui/icons";

import { isReducedMotion } from "../../ui/motion";

import { Pill } from "../../ui/selection";

import { SharedDayTimelineHandle } from './timelineTypes';

import { SharedDayTimelineProps } from './timelineTypes';

import { getNowWallClockInZone } from './timelineGeometry';

import { diffDays } from './timelineGeometry';

import { WINDOW_RADIUS } from './timelineGeometry';

import { indexOfDate } from './timelineGeometry';

import { TOTAL_DAYS } from './timelineGeometry';

import { EMPTY } from './timelineGeometry';

import { DAY_H } from './timelineGeometry';

import { HOUR_H } from './timelineGeometry';

import { TOTAL_SCROLL_H } from './timelineGeometry';

import { CENTER_INDEX } from './timelineGeometry';

import { dateAtIndex } from './timelineGeometry';

import { TimelineDay } from './TimelineDay';

/**
 * Deterministic fixed-window continuous timeline:
 * - Fixed geometry: HOUR_H = 56, DAY_H = 24 * HOUR_H (1344px).
 * - Fixed virtual window: 361 days (anchor - 180 .. anchor + 180, anchor = today by default).
 * - Renders ONLY the days intersecting the viewport ± 1 day, absolutely positioned at top = index * DAY_H.
 * - Zero prepend, zero scroll compensation, zero scroll effects tied to visibleDay.
 */
export const SharedDayTimeline = forwardRef<
  SharedDayTimelineHandle,
  SharedDayTimelineProps
>(function SharedDayTimeline(props, forwardedRef) {
  const { projection, events, tasks, reservations } = props;
  const zone = projection.displayZone;
  const initialNow = useRef(props.nowMs).current;

  const [minuteTick, setMinuteTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setMinuteTick(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const nowInfo = useMemo(
    () => getNowWallClockInZone(minuteTick, zone),
    [minuteTick, zone],
  );
  const today = nowInfo.localDate;
  const nowMinutesRef = useRef(nowInfo.nowMinutes);
  nowMinutesRef.current = nowInfo.nowMinutes;

  const initialAnchor = useMemo(() => {
    const startDate = projection.localDate;
    return Math.abs(diffDays(today, startDate)) <= WINDOW_RADIUS
      ? today
      : startDate;
  }, []);

  const [anchorDate, setAnchorDate] = useState<string>(initialAnchor);
  const anchorDateRef = useRef<string>(initialAnchor);
  anchorDateRef.current = anchorDate;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const shared = useRef(props);
  shared.current = props;

  const initialTargetIdx = useMemo(() => {
    const idx = indexOfDate(initialAnchor, projection.localDate);
    return Math.max(0, Math.min(TOTAL_DAYS - 1, idx));
  }, []);

  const [renderSlice, setRenderSlice] = useState<{
    first: number;
    last: number;
  }>(() => ({
    first: Math.max(0, initialTargetIdx - 1),
    last: Math.min(TOTAL_DAYS - 1, initialTargetIdx + 1),
  }));

  const [visibleDay, setVisibleDay] = useState<string>(projection.localDate);
  const visibleDayRef = useRef<string>(projection.localDate);

  const [away, setAway] = useState<"up" | "down" | null>(null);
  const awayRef = useRef<"up" | "down" | null>(null);

  const [released, setReleased] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const didInitScrollRef = useRef(false);
  const isJumpingRef = useRef(false);
  const jumpTimerRef = useRef<number>(0);
  const pendingReanchorDateRef = useRef<string | null>(null);

  const dayOffAnnotations = props.dayOffAnnotations ?? EMPTY;  const projectionCache = useMemo(
    () => new Map<string, ProjectedDaySchedule>(),
    [
      zone,
      events,
      tasks,
      reservations,
      dayOffAnnotations,
      released,
      projection,
      props.projectionWithReleased,
    ],
  );

  const getProjectionForDate = useCallback(
    (date: string): ProjectedDaySchedule => {
      if (date === projection.localDate) {
        return released
          ? (props.projectionWithReleased ?? projection)
          : projection;
      }
      const cached = projectionCache.get(date);
      if (cached) return cached;
      const computed = projectScheduleForDate({
        localDate: date,
        displayZone: zone,
        events,
        tasks,
        reservations,
        dayOffAnnotations,
        includeReleasedReservations: released,
      });
      projectionCache.set(date, computed);
      return computed;
    },
    [
      projection,
      props.projectionWithReleased,
      released,
      projectionCache,
      zone,
      events,
      tasks,
      reservations,
      dayOffAnnotations,
    ],
  );  const updateAwayHysteresis = useCallback(
    (scrollTop: number, viewportHeight: number) => {
      const vh = Math.max(1, viewportHeight);
      const todayIdx = indexOfDate(anchorDateRef.current, today);
      if (todayIdx < 0 || todayIdx >= TOTAL_DAYS) {
        const nextAway: "up" | "down" = todayIdx < 0 ? "up" : "down";
        if (awayRef.current !== nextAway) {
          awayRef.current = nextAway;
          setAway(nextAway);
        }
        return;
      }
      const nowLineY =
        todayIdx * DAY_H + (nowMinutesRef.current / 60) * HOUR_H;
      const viewportCenterY = scrollTop + vh * 0.5;
      const deltaY = nowLineY - viewportCenterY;
      const viewportsAway = Math.abs(deltaY) / vh;

      if (viewportsAway > 1.2) {
        const nextAway: "up" | "down" = deltaY < 0 ? "up" : "down";
        if (awayRef.current !== nextAway) {
          awayRef.current = nextAway;
          setAway(nextAway);
        }
      } else if (viewportsAway < 0.6) {
        if (awayRef.current !== null) {
          awayRef.current = null;
          setAway(null);
        }
      }
    },
    [today],
  );  useLayoutEffect(() => {
    if (didInitScrollRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    didInitScrollRef.current = true;

    const startDate = projection.localDate;
    const idx = Math.max(
      0,
      Math.min(TOTAL_DAYS - 1, indexOfDate(anchorDateRef.current, startDate)),
    );
    const vh = el.clientHeight || 600;
    const maxScroll = Math.max(0, TOTAL_SCROLL_H - vh);
    const rawTop =
      startDate === today
        ? idx * DAY_H + (nowMinutesRef.current / 60) * HOUR_H - HOUR_H
        : idx * DAY_H + 7 * HOUR_H;
    const targetTop = Math.max(0, Math.min(maxScroll, Math.round(rawTop)));

    el.scrollTop = targetTop;

    const first = Math.max(0, Math.floor(targetTop / DAY_H) - 1);
    const last = Math.min(
      TOTAL_DAYS - 1,
      Math.floor((targetTop + vh) / DAY_H) + 1,
    );
    setRenderSlice((prev) =>
      prev.first === first && prev.last === last ? prev : { first, last },
    );
    updateAwayHysteresis(targetTop, vh);
  }, []);  useLayoutEffect(() => {
    const reanchorDate = pendingReanchorDateRef.current;
    if (!reanchorDate) return;
    pendingReanchorDateRef.current = null;
    const el = scrollerRef.current;
    if (!el) return;

    const vh = el.clientHeight || 600;
    const maxScroll = Math.max(0, TOTAL_SCROLL_H - vh);
    const rawTop =
      reanchorDate === today
        ? CENTER_INDEX * DAY_H + (nowMinutesRef.current / 60) * HOUR_H - HOUR_H
        : CENTER_INDEX * DAY_H + 7 * HOUR_H;
    const targetTop = Math.max(0, Math.min(maxScroll, Math.round(rawTop)));

    const first = Math.max(0, Math.floor(targetTop / DAY_H) - 1);
    const last = Math.min(
      TOTAL_DAYS - 1,
      Math.floor((targetTop + vh) / DAY_H) + 1,
    );
    setRenderSlice({ first, last });
    el.scrollTo({ top: targetTop, behavior: "auto" });
    updateAwayHysteresis(targetTop, vh);
  }, [anchorDate, today, updateAwayHysteresis]);  const scrollToDay = useCallback(
    (targetDate: string, behavior: "smooth" | "auto" = "smooth") => {
      const el = scrollerRef.current;
      if (!el) return;

      isJumpingRef.current = true;
      if (jumpTimerRef.current) {
        window.clearTimeout(jumpTimerRef.current);
      }

      const clearJumpFlag = () => {
        isJumpingRef.current = false;
        if (jumpTimerRef.current) {
          window.clearTimeout(jumpTimerRef.current);
          jumpTimerRef.current = 0;
        }
        el.removeEventListener("scrollend", clearJumpFlag);
        const curTop = el.scrollTop;
        const curVh = el.clientHeight || 600;
        const f = Math.max(0, Math.floor(curTop / DAY_H) - 1);
        const l = Math.min(
          TOTAL_DAYS - 1,
          Math.floor((curTop + curVh) / DAY_H) + 1,
        );
        setRenderSlice((prev) =>
          prev.first === f && prev.last === l ? prev : { first: f, last: l },
        );
        updateAwayHysteresis(curTop, curVh);
      };

      el.addEventListener("scrollend", clearJumpFlag, { once: true });
      jumpTimerRef.current = window.setTimeout(clearJumpFlag, 600);

      if (visibleDayRef.current !== targetDate) {
        visibleDayRef.current = targetDate;
        setVisibleDay(targetDate);
      }
      shared.current.onDayInView?.(targetDate);

      const offset = diffDays(anchorDateRef.current, targetDate);
      if (Math.abs(offset) > WINDOW_RADIUS) {
        pendingReanchorDateRef.current = targetDate;
        anchorDateRef.current = targetDate;
        setAnchorDate(targetDate);
        return;
      }

      const targetIdx = CENTER_INDEX + offset;
      const vh = el.clientHeight || 600;
      const maxScroll = Math.max(0, TOTAL_SCROLL_H - vh);
      const rawTop =
        targetDate === today
          ? targetIdx * DAY_H + (nowMinutesRef.current / 60) * HOUR_H - HOUR_H
          : targetIdx * DAY_H + 7 * HOUR_H;
      const targetTop = Math.max(0, Math.min(maxScroll, Math.round(rawTop)));

      const nextFirst = Math.max(0, Math.floor(targetTop / DAY_H) - 1);
      const nextLast = Math.min(
        TOTAL_DAYS - 1,
        Math.floor((targetTop + vh) / DAY_H) + 1,
      );
      setRenderSlice((prev) => ({
        first: Math.min(prev.first, nextFirst),
        last: Math.max(prev.last, nextLast),
      }));

      const effectiveBehavior: ScrollBehavior =
        behavior === "smooth" && !isReducedMotion() ? "smooth" : "auto";
      el.scrollTo({ top: targetTop, behavior: effectiveBehavior });
      updateAwayHysteresis(targetTop, vh);
    },
    [today, updateAwayHysteresis],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToDay,
    }),
    [scrollToDay],
  );  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let rafId = 0;

    const handleScrollFrame = () => {
      rafId = 0;
      const scrollTop = el.scrollTop;
      const vh = el.clientHeight || 600;

      const first = Math.max(0, Math.floor(scrollTop / DAY_H) - 1);
      const last = Math.min(
        TOTAL_DAYS - 1,
        Math.floor((scrollTop + vh) / DAY_H) + 1,
      );
      setRenderSlice((prev) =>
        prev.first === first && prev.last === last ? prev : { first, last },
      );

      updateAwayHysteresis(scrollTop, vh);

      if (isJumpingRef.current) return;

      const dayIdx = Math.max(
        0,
        Math.min(
          TOTAL_DAYS - 1,
          Math.floor((scrollTop + vh * 0.4) / DAY_H),
        ),
      );
      const nextDate = dateAtIndex(anchorDateRef.current, dayIdx);
      if (nextDate !== visibleDayRef.current) {
        visibleDayRef.current = nextDate;
        setVisibleDay(nextDate);
        shared.current.onDayInView?.(nextDate);
      }
    };

    const onScroll = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(handleScrollFrame);
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
      if (jumpTimerRef.current) window.clearTimeout(jumpTimerRef.current);
    };
  }, [updateAwayHysteresis]);

  const renderedIndices = useMemo(() => {
    const count = Math.max(0, renderSlice.last - renderSlice.first + 1);
    return Array.from({ length: count }, (_, i) => renderSlice.first + i);
  }, [renderSlice.first, renderSlice.last]);

  const todayProjection = useMemo(
    () => getProjectionForDate(today),
    [getProjectionForDate, today],
  );
  const overnight = todayProjection.timelineItems.find(
    (i) => i.sourceKind === "work_shift" && i.segment.continuesBeforeDayStart,
  );
  const sleep = todayProjection.timelineItems.find(
    (i) => events.find((e) => e.id === i.sourceId)?.type === "sleep",
  );

  const topSpacerHeight = renderSlice.first * DAY_H;
  const bottomSpacerTop = (renderSlice.last + 1) * DAY_H;
  const bottomSpacerHeight = Math.max(0, TOTAL_SCROLL_H - bottomSpacerTop);

  return (
    <section className="today-day-canvas" data-ui="content-start">
      {props.projectionWithReleased?.timelineItems.some(
        (i) => i.state === "released",
      ) && (
        <Pill selected={released} onClick={() => setReleased(!released)}>
          Показати зняті сеанси
        </Pill>
      )}
      {overnight && visibleDay === today && (
        <div className="today-continuity">
          {(() => {
            const e = events.find((ev) => ev.id === overnight.sourceId);
            const timedSchedule = e?.schedule.kind === "timed" ? e.schedule : null;
            const endTime = formatTime(overnight.segment.displayEndLocalTime);
            const startDateStr = timedSchedule
              ? formatInstant(timedSchedule.interval.startInstant, zone, {
                  day: "numeric",
                  month: "long",
                }).toLowerCase()
              : "";
            const startTimeStr = timedSchedule
              ? formatTime(timedSchedule.interval.originStartLocalTime)
              : "";
            const sleepStr = sleep
              ? ` · сон до ${formatTime(sleep.segment.displayEndLocalTime)}`
              : "";
            const labelText = timedSchedule
              ? `Нічна зміна до ${endTime} · з ${startDateStr} ${startTimeStr}${sleepStr}`
              : `Нічна зміна до ${endTime}${sleepStr}`;

            return (
              <button
                type="button"
                className="today-continuity-btn"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                <Moon size={16} className="text-[var(--shift-night)] shrink-0" aria-hidden="true" />
                <span className="today-continuity-text truncate">
                  {labelText}
                </span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            );
          })()}
        </div>
      )}
      <div
        ref={scrollerRef}
        className="continuous-time-scroll"
        tabIndex={0}
        role="region"
        aria-label="Безперервний розклад"
      >
        <div
          className="continuous-time-scroll-track"
          style={{
            position: "relative",
            height: TOTAL_SCROLL_H,
            width: "100%",
          }}
        >
          {topSpacerHeight > 0 && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: topSpacerHeight,
                pointerEvents: "none",
              }}
            />
          )}
          {renderedIndices.map((idx) => {
            const date = dateAtIndex(anchorDate, idx);
            const dayProj = getProjectionForDate(date);
            const dayPlan = props.plans
              ? (props.plans[date] ?? EMPTY_DAILY_PLAN)
              : (props.plan ?? EMPTY_DAILY_PLAN);
            return (
              <TimelineDay
                key={date}
                index={idx}
                projection={dayProj}
                shared={shared}
                today={today}
                initialNow={initialNow}
                nowMinutes={nowInfo.nowMinutes}
                expanded={expanded}
                presentationKey={JSON.stringify(dayPlan)}
              />
            );
          })}
          {bottomSpacerHeight > 0 && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: bottomSpacerTop,
                left: 0,
                right: 0,
                height: bottomSpacerHeight,
                pointerEvents: "none",
              }}
            />
          )}
        </div>
      </div>
      {away && (
        <button
          type="button"
          className="ui-pill today-now-jump"
          onClick={() => scrollToDay(today, "smooth")}
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
});
