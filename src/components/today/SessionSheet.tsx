import { useEffect, useMemo, useState } from "react";

import { Sheet } from "../../ui/sheets";

import { Button } from "../../ui/buttons";

import { DateField, DurationField, TimeField } from "../../ui/fields";

import { InlineBanner } from "../../ui/feedback";

import { Pill } from "../../ui/selection";

import { Section } from "../../ui/headers";

import {
  CalendarEvent,
  Habit,
  HabitEntry,
  Task,
  TaskReservation,
} from "../../domain/types";

import { PlanuiRepositories } from "../../storage/repositories";

import { buildZonedIntervalFromStartAndDuration } from "./planningTime";

import { detectTimeConflicts } from "./planningTime";

import { computeFreeWindowsForDay } from "./planningTime";

import { formatSessionSummaryUk } from "./planningTime";

export interface SessionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  zone: string;
  initialTime?: string;
  initialDurationMinutes?: number;
  task?: Task | null;
  reservationId?: string | null;
  habit?: Habit | null;
  habitEntries?: readonly HabitEntry[];
  tasks: readonly Task[];
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  repositories: PlanuiRepositories;
  onSaved: (msg?: string) => Promise<unknown> | void;
}

export function SessionSheet({
  isOpen,
  onClose,
  date,
  zone,
  initialTime,
  initialDurationMinutes,
  task,
  reservationId,
  habit,
  habitEntries = [],
  tasks,
  events,
  reservations,
  repositories,
  onSaved,
}: SessionSheetProps) {
  const existingReservation = useMemo(
    () =>
      reservationId
        ? (reservations.find((r) => r.id === reservationId) ?? null)
        : habit
          ? (reservations.find(
              (r) =>
                r.state === "active" &&
                r.habitOccurrence?.habitId === habit.id &&
                r.habitOccurrence.localDate === date,
            ) ?? null)
          : null,
    [reservationId, reservations, habit, date],
  );

  const [sessionDate, setSessionDate] = useState<string>(
    existingReservation?.interval.originStartLocalDate ??
      task?.plannedDate ??
      date,
  );
  const [startTime, setStartTime] = useState<string>(
    (
      existingReservation?.interval.originStartLocalTime ??
      initialTime ??
      "09:00"
    ).slice(0, 5),
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    existingReservation
      ? Math.max(
          15,
          Math.round(
            (Date.parse(existingReservation.interval.endInstant) -
              Date.parse(existingReservation.interval.startInstant)) /
              60000,
          ),
        )
      : (initialDurationMinutes ?? task?.estimatedDurationMinutes ?? 30),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSessionDate(
      existingReservation?.interval.originStartLocalDate ??
        task?.plannedDate ??
        date,
    );
    setStartTime(
      (
        existingReservation?.interval.originStartLocalTime ??
        initialTime ??
        "09:00"
      ).slice(0, 5),
    );
    setDurationMinutes(
      existingReservation
        ? Math.max(
            15,
            Math.round(
              (Date.parse(existingReservation.interval.endInstant) -
                Date.parse(existingReservation.interval.startInstant)) /
                60000,
            ),
          )
        : (initialDurationMinutes ?? task?.estimatedDurationMinutes ?? 30),
    );
    setError(null);
  }, [
    isOpen,
    existingReservation,
    task?.plannedDate,
    task?.estimatedDurationMinutes,
    date,
    initialTime,
    initialDurationMinutes,
  ]);

  const interval = useMemo(() => {
    try {
      return buildZonedIntervalFromStartAndDuration(
        sessionDate,
        startTime.slice(0, 5),
        Math.max(5, durationMinutes || 30),
        zone,
      );
    } catch {
      return null;
    }
  }, [sessionDate, startTime, durationMinutes, zone]);

  const conflict = useMemo(() => {
    if (!interval)
      return {
        hasConflicts: false,
        conflicts: [],
        overlappingEvents: [],
        overlappingReservations: [],
        warningMessageUk: null,
      };
    return detectTimeConflicts(
      interval,
      events,
      reservations,
      existingReservation?.id,
      tasks,
    );
  }, [interval, events, reservations, existingReservation?.id, tasks]);

  const overlapBannerText = useMemo(() => {
    if (!conflict.hasConflicts) return null;
    const first = conflict.conflicts?.[0];
    if (!first) {
      return "Збігається з іншим записом у розкладі";
    }
    const firstTime = first.displayRangeUk
      ? ` ${first.displayRangeUk.replace("–", "-")}`
      : "";
    const extraCount = Math.max(0, (conflict.conflicts?.length ?? 1) - 1);
    const extraSuffix = extraCount > 0 ? ` та ще ${extraCount}` : "";
    return `Збігається з: ${first.title}${firstTime}${extraSuffix}`;
  }, [conflict]);

  const freeWindows = useMemo(() => {
    if (!conflict.hasConflicts) return [];
    return computeFreeWindowsForDay(
      sessionDate,
      zone,
      durationMinutes || 30,
      events,
      reservations,
      existingReservation?.id,
    );
  }, [
    conflict.hasConflicts,
    sessionDate,
    zone,
    durationMinutes,
    events,
    reservations,
    existingReservation?.id,
  ]);

  const summaryText = useMemo(
    () =>
      formatSessionSummaryUk(
        sessionDate,
        startTime.slice(0, 5),
        durationMinutes || 30,
        zone,
      ),
    [sessionDate, startTime, durationMinutes, zone],
  );

  const habitEntry = useMemo(
    () =>
      habit
        ? (habitEntries.find(
            (e) => e.habitId === habit.id && e.localDate === sessionDate,
          ) ?? null)
        : null,
    [habit, habitEntries, sessionDate],
  );

  const handleSaveSession = async () => {
    if (!interval) return;
    setBusy(true);
    setError(null);
    const nowIso = new Date().toISOString();
    try {
      if (habit) {
        await repositories.scheduleHabitSession({
          id: existingReservation?.id ?? crypto.randomUUID(),
          habitId: habit.id,
          localDate: sessionDate,
          interval,
          confirmOverlap: conflict.hasConflicts,
          expectedHabitRevision: habit.revision,
          nowIso,
        });
        await onSaved("Сеанс заплановано");
        onClose();
        return;
      }

      if (task) {
        const freshTask = tasks.find((t) => t.id === task.id) ?? task;
        if (existingReservation) {
          await repositories.rescheduleReservationTransactionally(
            existingReservation.id,
            interval,
            nowIso,
            existingReservation.revision,
          );
        } else {
          await repositories.saveReservationTransactionally({
            id: crypto.randomUUID(),
            taskId: freshTask.id,
            interval,
            state: "active",
            releaseMetadata: null,
            createdAt: nowIso,
            updatedAt: nowIso,
            revision: 1,
          });
        }
        await onSaved("Сеанс збережено");
        onClose();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося зберегти сеанс.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteHabitFromSession = async (minimum = false) => {
    if (!habit) return;
    setBusy(true);
    setError(null);
    try {
      await repositories.recordHabitEntryForDateTransactionally({
        habitId: habit.id,
        localDate: sessionDate,
        input: minimum ? { kind: "minimum" } : { kind: "complete" },
        nowIso: new Date().toISOString(),
      });
      await onSaved("Звичку відмічено");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={habit ? habit.name : "Сеанс"}
      footer={
        <Button
          variant="primary"
          disabled={busy || !interval}
          onClick={() => void handleSaveSession()}
          data-testid="session-sheet-submit"
        >
          {conflict.hasConflicts ? "Зберегти з накладанням" : "Готово"}
        </Button>
      }
    >
      <div className="space-y-4" data-testid="session-sheet">
        {error && <InlineBanner tone="error">{error}</InlineBanner>}

        <p
          className="text-sm font-semibold text-[var(--text-secondary)] px-1"
          data-testid="session-sheet-summary"
        >
          {summaryText}
        </p>

        <Section>
          <DateField
            label="Дата"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            data-testid="session-date-input"
          />
          <TimeField
            label="Початок"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value.slice(0, 5))}
            data-testid="session-time-input"
          />
          <DurationField
            label="Тривалість"
            value={durationMinutes}
            onChange={(v) => setDurationMinutes(v ?? 30)}
          />
        </Section>

        {conflict.hasConflicts && overlapBannerText && (
          <div className="space-y-2.5" data-testid="session-overlap-box">
            <InlineBanner tone="amber">
              <span className="line-clamp-2">{overlapBannerText}</span>
            </InlineBanner>
            {freeWindows.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[var(--text-secondary)] px-1">
                  Вільні вікна
                </p>
                <div
                  className="ui-pill-row"
                  role="group"
                  aria-label="Вільні вікна"
                >
                  {freeWindows.map((slot) => (
                    <Pill
                      key={slot.startTime}
                      selected={startTime.slice(0, 5) === slot.startTime}
                      onClick={() => setStartTime(slot.startTime)}
                      data-testid={`free-window-chip-${slot.startTime}`}
                    >
                      {slot.label}
                    </Pill>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {habit && (
          <Section title="Відмітка виконання">
            <div className="p-3 flex flex-wrap gap-2">
              <Pill
                selected={
                  habitEntry?.status === "completed" &&
                  !habitEntry.minimumCompletedUk
                }
                onClick={() => void handleCompleteHabitFromSession(false)}
              >
                Виконано
              </Pill>
              {habit.minimumVersionUk && (
                <Pill
                  selected={Boolean(habitEntry?.minimumCompletedUk)}
                  onClick={() => void handleCompleteHabitFromSession(true)}
                >
                  Мінімум: {habit.minimumVersionUk}
                </Pill>
              )}
              {existingReservation && (
                <Pill
                  onClick={() => {
                    void repositories
                      .cancelHabitSession(
                        existingReservation.id,
                        existingReservation.revision,
                      )
                      .then(() => onSaved("Сеанс скасовано"))
                      .then(() => onClose());
                  }}
                >
                  Скасувати сеанс
                </Pill>
              )}
            </div>
          </Section>
        )}
      </div>
    </Sheet>
  );
}
