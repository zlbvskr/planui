import { useMemo, useRef } from "react";

import { formatDate } from "../lib/format";

import { Icon } from "./icons";

import { RoundButton } from "./buttons";

interface WeekStripMarkerData {
  shift?: "day" | "night";
  dayOff?: boolean;
  eventColors?: string[];
}

type WeekStripMarker =
  | "day"
  | "night"
  | "event"
  | "rest"
  | boolean
  | WeekStripMarkerData;

export interface WeekStripProps {
  date: string;
  today?: string;
  markers?: Record<string, WeekStripMarker | undefined>;
  onChange: (isoDate: string) => void;
  className?: string;
}

const UK_WEEKDAY_SHORT_MON = [
  "Пн",
  "Вт",
  "Ср",
  "Чт",
  "Пт",
  "Сб",
  "Нд",
] as const;

function addDaysToIso(iso: string, deltaDays: number): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const dt = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + deltaDays),
  );
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function getWeekDatesISO(anchorIso: string): string[] {
  const m = anchorIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : new Date();
  const dow = (base.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate() - dow,
    ),
  );
  return Array.from({ length: 7 }, (_, idx) => {
    const dt = new Date(
      Date.UTC(
        monday.getUTCFullYear(),
        monday.getUTCMonth(),
        monday.getUTCDate() + idx,
      ),
    );
    const y = dt.getUTCFullYear();
    const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  });
}

export function WeekStrip({
  date,
  today,
  markers,
  onChange,
  className = "",
}: WeekStripProps) {
  const days = useMemo(() => getWeekDatesISO(date), [date]);
  const touchStartX = useRef<number | null>(null);

  const handlePage = (deltaDays: number) => {
    onChange(addDaysToIso(date, deltaDays));
  };

  return (
    <div
      role="group"
      aria-label="Тиждень"
      data-ui="week-strip"
      className={className}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (deltaX > 48) {
          handlePage(-7);
        } else if (deltaX < -48) {
          handlePage(7);
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <RoundButton
          size={32}
          variant="frosted"
          aria-label="Попередній тиждень"
          data-testid="week-strip-prev-week"
          onClick={() => handlePage(-7)}
        >
          <Icon name="chevron-left" size={16} />
        </RoundButton>

        <div className="flex items-center justify-between gap-[6px] flex-1">
          {days.map((iso, idx) => {
            const isSelected = iso === date;
            const isToday = today ? iso === today : false;
            const dayNum = Number(iso.slice(8, 10));
            const rawMarker = markers?.[iso];
            const marker: WeekStripMarkerData =
              typeof rawMarker === "object" && rawMarker !== null
                ? rawMarker
                : {
                    shift:
                      rawMarker === "day"
                        ? "day"
                        : rawMarker === "night"
                          ? "night"
                          : undefined,
                    dayOff: rawMarker === "rest" || rawMarker === true,
                    eventColors:
                      rawMarker === "event"
                        ? ["var(--accent-primary)"]
                        : undefined,
                  };

            return (
              <button
                key={iso}
                type="button"
                aria-pressed={isSelected}
                aria-label={formatDate(iso)}
                data-testid={`week-strip-day-${iso}`}
                data-selected={isSelected ? "true" : undefined}
                data-today={isToday && !isSelected ? "true" : undefined}
                onClick={() => onChange(iso)}
                className={`ui-tile-3d ui-week-capsule ${
                  isSelected
                    ? "is-selected ui-week-capsule-selected ui-day-circle-selected"
                    : isToday
                      ? "is-today ui-week-capsule-today ui-day-circle-today"
                      : ""
                }`}
              >
                <span
                  className={`text-[11px] font-bold leading-tight ${
                    isSelected
                      ? "text-[#06281F]/80"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  {UK_WEEKDAY_SHORT_MON[idx]}
                </span>

                <span
                  className={`text-[15px] font-extrabold leading-tight tabular-nums ${
                    isSelected ? "text-[#06281F]" : "text-[var(--text-primary)]"
                  }`}
                >
                  {dayNum}
                </span>

                {/* Sub-day indicators: tiny sun/moon icon for shifts + up to 2 mini orbs inside tile */}
                <div className="flex items-center justify-center gap-1 min-h-[10px] h-2.5">
                  {marker.shift && (
                    <span
                      aria-label={
                        marker.shift === "night" ? "Нічна зміна" : "Денна зміна"
                      }
                      className="inline-flex items-center justify-center"
                    >
                      {marker.shift === "night" ? (
                        <svg
                          viewBox="0 0 12 12"
                          width="10"
                          height="10"
                          fill="var(--shift-night)"
                          aria-hidden="true"
                        >
                          <path d="M7.8 7.4C6.2 7.4 5 6.2 5 4.6C5 4 5.2 3.5 5.5 3.1C4.1 3.3 3 4.5 3 6C3 7.7 4.3 9 6 9C7.2 9 8.2 8.3 8.7 7.2C8.4 7.3 8.1 7.4 7.8 7.4Z" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 12 12"
                          width="10"
                          height="10"
                          fill="var(--shift-day)"
                          stroke="var(--shift-day)"
                          aria-hidden="true"
                        >
                          <circle cx="6" cy="6" r="2" stroke="none" />
                          <line
                            x1="6"
                            y1="1"
                            x2="6"
                            y2="2.5"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                          <line
                            x1="6"
                            y1="9.5"
                            x2="6"
                            y2="11"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                          <line
                            x1="1"
                            y1="6"
                            x2="2.5"
                            y2="6"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                          <line
                            x1="9.5"
                            y1="6"
                            x2="11"
                            y2="6"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                    </span>
                  )}
                  {marker.eventColors &&
                    marker.eventColors.slice(0, 2).map((col, cIdx) => (
                      <span
                        key={cIdx}
                        aria-hidden="true"
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: col,
                          boxShadow:
                            "inset 0 1px 1px rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.18)",
                        }}
                      />
                    ))}
                </div>
              </button>
            );
          })}
        </div>

        <RoundButton
          size={32}
          variant="frosted"
          aria-label="Наступний тиждень"
          data-testid="week-strip-next-week"
          onClick={() => handlePage(7)}
        >
          <Icon name="chevron-right" size={16} />
        </RoundButton>
      </div>
    </div>
  );
}
