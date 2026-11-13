import React from "react";
import {
  NEUTRAL_SLATE,
  getContrastTextColor,
  itemColor,
  orbVars,
  resolveArea,
} from "../../domain/modelHelpers";
import {
  Folder,
  Goal,
  LifeAreaAssessment,
  LifeAreaQuestion,
  Project,
  ProjectStage,
} from "../../domain/types";
import { formatShortDate } from "../../lib/format";
import { RoundButton } from "../../ui/buttons";
import { MilkyCard } from "../../ui/cards";
import { Icon } from "../../ui/icons";

interface GoalsTimelineProps {
  visibleRangeHeader: string;
  isTodayOffScreen: boolean;
  scrollTimelineToToday: () => void;
  jumpTimelineMonths: (deltaMonths: number) => void;
  timelineScrollerRef: React.RefObject<HTMLDivElement | null>;
  handleTimelineScroll: () => void;
  totalTimelineWidth: number;
  timedGoals: Goal[];
  timelineMonths: {
    year: number;
    month0: number;
    key: string;
    shortLabel: string;
    fullLabel: string;
    startMs: number;
    endMs: number;
    offset: number;
  }[];
  monthWidth: number;
  todayPx: number;
  modelContext: {
    folders: Folder[];
    projects: Project[];
    goals: Goal[];
    areas: readonly LifeAreaQuestion[];
    lifeAreas: readonly LifeAreaQuestion[];
    lifeAreaAssessments: readonly LifeAreaAssessment[];
  };
  actualTodayDate: string;
  timelineEndMs: number;
  timelineStartMs: number;
  stages: ProjectStage[];
  setActiveGoalId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function GoalsTimeline({
  visibleRangeHeader,
  isTodayOffScreen,
  scrollTimelineToToday,
  jumpTimelineMonths,
  timelineScrollerRef,
  handleTimelineScroll,
  totalTimelineWidth,
  timedGoals,
  timelineMonths,
  monthWidth,
  todayPx,
  modelContext,
  actualTodayDate,
  timelineEndMs,
  timelineStartMs,
  stages,
  setActiveGoalId,
}: GoalsTimelineProps) {
  return (
    <MilkyCard
      className="space-y-2.5 min-w-0"
      data-testid="goals-timeline-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[15px] leading-[20px] font-extrabold text-ink truncate"
          data-testid="goals-timeline-range"
        >
          {visibleRangeHeader}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isTodayOffScreen && (
            <button
              type="button"
              className="ui-pill px-3 py-1 min-h-[44px] h-[44px] text-[12.5px] font-extrabold cursor-pointer"
              onClick={scrollTimelineToToday}
            >
              Сьогодні
            </button>
          )}
          <RoundButton
            size={44}
            aria-label="На 12 місяців назад"
            onClick={() => jumpTimelineMonths(-12)}
          >
            <Icon name="chevron-left" size={16} />
          </RoundButton>
          <RoundButton
            size={44}
            aria-label="На 12 місяців вперед"
            onClick={() => jumpTimelineMonths(12)}
          >
            <Icon name="chevron-right" size={16} />
          </RoundButton>
        </div>
      </div>

      <div
        ref={timelineScrollerRef}
        className="planui-goals-scroller no-scrollbar"
        style={{
          minHeight: "120px",
        }}
        onScroll={handleTimelineScroll}
        data-testid="goals-timeline-scroller"
      >
        <div
          className="relative"
          style={{
            width: `${totalTimelineWidth}px`,
            minHeight: `${Math.max(120, 36 + timedGoals.length * 36)}px`,
          }}
        >
          <div
            className="planui-goals-sticky-header sticky top-0 z-10 flex items-center h-7 backdrop-blur-sm"
            style={{
              width: `${totalTimelineWidth}px`,
              background: "rgba(255, 255, 255, 0.92)",
              borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
            }}
          >
            {timelineMonths.map((m) => (
              <div
                key={m.key}
                className="flex-shrink-0 text-[11px] leading-[14px] font-bold text-[var(--text-secondary)] text-left pl-1"
                style={{
                  width: `${monthWidth}px`,
                }}
              >
                {m.shortLabel}
              </div>
            ))}
          </div>

          <div
            className="absolute left-0 right-0 bottom-0 pointer-events-none flex"
            style={{ top: "28px" }}
            aria-hidden="true"
          >
            {timelineMonths.map((m) => (
              <div
                key={m.key}
                className="flex-shrink-0 border-l border-black/[0.04] h-full"
                style={{ width: `${monthWidth}px` }}
              />
            ))}
          </div>

          <div
            className="planui-goals-today-line absolute bottom-0 pointer-events-none z-[5]"
            style={{
              top: "28px",
              left: `${todayPx}px`,
            }}
            title="Сьогодні"
            data-testid="goals-timeline-today-line"
          >
            <span
              className="block w-2 h-2 rounded-full -ml-[3px]"
              style={{ backgroundColor: "var(--color-time-now)" }}
            />
            <span
              className="block w-[2px] h-full"
              style={{ backgroundColor: "var(--color-time-now)" }}
            />
          </div>

          <div
            className="relative flex flex-col pt-2.5 pb-2 z-[6]"
            style={{ rowGap: "8px" }}
          >
            {timedGoals.map((g, idx) => {
              const gArea = resolveArea(g, modelContext);
              const gColor = gArea ? itemColor(g, modelContext) : NEUTRAL_SLATE;
              const vars = orbVars(gColor);
              const barTextColor = getContrastTextColor(gColor);

              const startStr =
                g.termStart ||
                g.timing?.targetDate ||
                g.termEnd ||
                actualTodayDate;
              const endStr =
                g.termEnd || g.timing?.targetDate || g.termStart || startStr;

              const sMs = new Date(`${startStr}T00:00:00Z`).getTime();
              const eMs = Math.max(
                sMs + 14 * 86_400_000,
                new Date(`${endStr}T23:59:59Z`).getTime(),
              );

              const totalMs = Math.max(1, timelineEndMs - timelineStartMs);
              const rawLeftPx =
                ((sMs - timelineStartMs) / totalMs) * totalTimelineWidth;
              const rawRightPx =
                ((eMs - timelineStartMs) / totalMs) * totalTimelineWidth;
              const leftPx = Math.max(
                0,
                Math.min(totalTimelineWidth - 28, rawLeftPx),
              );
              const widthPx = Math.max(28, rawRightPx - leftPx);

              const goalStages = stages.filter(
                (s) => s.goalId === g.id && s.targetDate,
              );

              return (
                <div
                  key={g.id}
                  className="relative flex items-center"
                  style={{ height: "44px", minHeight: "44px" }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveGoalId(g.id)}
                    className="planui-goal-timeline-bar relative flex items-center px-3 text-left cursor-pointer transition-transform active:scale-[0.98]"
                    style={{
                      marginLeft: `${leftPx}px`,
                      width: `${widthPx}px`,
                      minHeight: "44px",
                      height: "44px",
                      borderRadius: "14px",
                      ...vars,
                      color: barTextColor,
                      animationDelay: `${Math.min(idx, 7) * 30}ms`,
                    }}
                    title={g.title}
                    data-testid={`goal-bar-${g.id}`}
                  >
                    <span
                      className="sticky text-[12px] leading-[16px] font-extrabold z-[2]"
                      style={{
                        left: "12px",
                        color: barTextColor,
                      }}
                    >
                      {g.title}
                    </span>

                    {goalStages.map((st) => {
                      const stMs = new Date(
                        `${st.targetDate}T12:00:00Z`,
                      ).getTime();
                      const relPct = Math.max(
                        6,
                        Math.min(
                          94,
                          ((stMs - sMs) / Math.max(1, eMs - sMs)) * 100,
                        ),
                      );
                      return (
                        <span
                          key={st.id}
                          className="planui-goal-stage-diamond"
                          style={{
                            left: `${relPct}%`,
                            backgroundColor: vars["--c-dark"],
                          }}
                          title={`${st.title} (${formatShortDate(st.targetDate!)})`}
                        />
                      );
                    })}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </MilkyCard>
  );
}
