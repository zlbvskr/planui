import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { formatTime } from "../../lib/format";

import { getNowWallClockInZone } from "./timelineGeometry";

import { HOUR_H } from "./timelineGeometry";

export /**
 * Now-line is positioned with a transform from nowMinutes and updates once per minute.
 */
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
    const id = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const lineRef = useRef<HTMLDivElement>(null);
  const nowInfo = useMemo(() => getNowWallClockInZone(now, zone), [now, zone]);
  const isToday = nowInfo.localDate === date;
  const topPx = (nowInfo.nowMinutes / 60) * HOUR_H;

  useLayoutEffect(() => {
    const section = lineRef.current?.closest(".timeline-day");
    if (!section) return;
    section.querySelectorAll<HTMLElement>("[data-hour-y]").forEach((label) => {
      label.style.visibility =
        isToday && Math.abs(Number(label.dataset.hourY) - topPx) < 14
          ? "hidden"
          : "";
    });
  }, [isToday, topPx]);

  if (!isToday) return null;

  return (
    <div
      ref={lineRef}
      className="today-now-line"
      style={{ top: 0, transform: `translateY(${topPx}px)` }}
      data-testid="today-current-time-indicator"
    >
      <span className="today-now-chip">{formatTime(nowInfo.localTime)}</span>
      <i className="today-now-bar" />
    </div>
  );
}
