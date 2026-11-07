import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertSheet,
  Button,
  DateField,
  DurationField,
  Icon,
  InfoSheet,
  InlineBanner,
  InputField,
  Orb,
  Pill,
  Row,
  Section,
  SelectField,
  Sheet,
  TimeField,
  Toggle,
} from '../../ui';
import { areaColor, logMeasure, resolveArea } from '../../domain/modelHelpers';
import { detectScheduleConflicts } from '../../domain/scheduling';
import {
  addDaysToLocalDate,
  buildZonedIntervalFromLocalInput,
  formatInstantInZone,
  resolveLocalDateTimeToInstant,
} from '../../domain/temporal';
import type { ZonedInterval } from '../../domain/types';

function buildZonedIntervalFromStartAndDuration(
  localDate: string,
  startHm: string,
  durationMinutes: number,
  zone: string
): ZonedInterval {
  const startRes = resolveLocalDateTimeToInstant(localDate, startHm, zone);
  const endWall = formatInstantInZone(
    startRes.epochMs + Math.max(5, durationMinutes) * 60_000,
    zone
  );
  return buildZonedIntervalFromLocalInput({
    startLocalDate: localDate,
    startLocalTime: startHm,
    endLocalDate: endWall.localDate,
    endLocalTime: endWall.localTime,
    originZone: zone,
  }).interval;
}

function localDateAndTimeToInstant(
  localDate: string,
  localTime: string,
  zone: string
): string {
  return resolveLocalDateTimeToInstant(localDate, localTime, zone).instant;
}

function detectTimeConflicts(
  interval: ZonedInterval,
  events: readonly CalendarEvent[],
  reservations: readonly TaskReservation[],
  excludeReservationId?: string
) {
  return detectScheduleConflicts({
    candidateStartInstant: interval.startInstant,
    candidateEndInstant: interval.endInstant,
    displayZone: interval.originZone,
    events,
    reservations,
    tasks: [],
    excludeReservationId,
  });
}
import {
  CalendarEvent,
  Folder,
  Goal,
  Habit,
  HabitEntry,
  LifeAreaQuestion,
  Measure,
  Project,
  ProjectStage,
  RoadmapPeriod,
  Task,
  TaskEffort,
  TaskOwnership,
  TaskReservation,
} from '../../domain/types';
import { PlanuiRepositories } from '../../storage/repositories';

const UK_SHORT_WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;
const UK_GENITIVE_MONTHS = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
] as const;

/**
 * Formats a session summary like "Чт, 5 листопада · 09:00-09:30" (no seconds).
 */
export function formatSessionSummaryUk(
  localDate: string,
  startTime: string,
  durationMinutes: number,
  zone: string
): string {
  const [y, m, d] = localDate.split('-').map(Number);
  if (!y || !m || !d) return `${localDate} · ${startTime}`;
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = UK_SHORT_WEEKDAYS[utcDate.getUTCDay()] ?? '';
  const monthName = UK_GENITIVE_MONTHS[(m - 1) % 12] ?? '';
  const safeStart = (startTime || '09:00').slice(0, 5);
  try {
    const interval = buildZonedIntervalFromStartAndDuration(
      localDate,
      safeStart,
      Math.max(5, durationMinutes || 30),
      zone
    );
    const endHm = interval.originEndLocalTime.slice(0, 5);
    return `${weekday}, ${d} ${monthName} · ${safeStart}-${endHm}`;
  } catch {
    return `${weekday}, ${d} ${monthName} · ${safeStart}`;
  }
}

export interface FreeWindowSlot {
  startTime: string;
  endTime: string;
  label: string;
}

/**
 * Computes up to 5 free time windows on `localDate` of at least `durationMinutes`.
 */
export function computeFreeWindowsForDay(
  localDate: string,
  zone: string,
  durationMinutes: number,
  events: readonly CalendarEvent[],
  reservations: readonly TaskReservation[],
  excludeId?: string
): FreeWindowSlot[] {
  const dur = Math.max(15, durationMinutes || 30);
  const candidates = [
    '08:00',
    '09:00',
    '10:00',
    '11:00',
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00',
    '17:00',
    '18:00',
    '19:00',
    '20:00',
  ];
  const results: FreeWindowSlot[] = [];
  for (const startHm of candidates) {
    try {
      const interval = buildZonedIntervalFromStartAndDuration(
        localDate,
        startHm,
        dur,
        zone
      );
      const conflict = detectTimeConflicts(
        interval,
        events,
        reservations,
        excludeId
      );
      if (!conflict.hasConflicts) {
        const endHm = interval.originEndLocalTime.slice(0, 5);
        results.push({
          startTime: startHm,
          endTime: endHm,
          label: `${startHm}–${endHm}`,
        });
        if (results.length >= 4) break;
      }
    } catch {
      // Ignore invalid candidate
    }
  }
  return results;
}

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
        ? reservations.find((r) => r.id === reservationId) ?? null
        : habit
        ? reservations.find(
            (r) =>
              r.state === 'active' &&
              r.habitOccurrence?.habitId === habit.id &&
              r.habitOccurrence.localDate === date
          ) ?? null
        : null,
    [reservationId, reservations, habit, date]
  );

  const [sessionDate, setSessionDate] = useState<string>(
    existingReservation?.interval.originStartLocalDate ??
      task?.plannedDate ??
      date
  );
  const [startTime, setStartTime] = useState<string>(
    (
      existingReservation?.interval.originStartLocalTime ??
      initialTime ??
      '09:00'
    ).slice(0, 5)
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    existingReservation
      ? Math.max(
          15,
          Math.round(
            (Date.parse(existingReservation.interval.endInstant) -
              Date.parse(existingReservation.interval.startInstant)) /
              60000
          )
        )
      : initialDurationMinutes ?? task?.estimatedDurationMinutes ?? 30
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSessionDate(
      existingReservation?.interval.originStartLocalDate ??
        task?.plannedDate ??
        date
    );
    setStartTime(
      (
        existingReservation?.interval.originStartLocalTime ??
        initialTime ??
        '09:00'
      ).slice(0, 5)
    );
    setDurationMinutes(
      existingReservation
        ? Math.max(
            15,
            Math.round(
              (Date.parse(existingReservation.interval.endInstant) -
                Date.parse(existingReservation.interval.startInstant)) /
                60000
            )
          )
        : initialDurationMinutes ?? task?.estimatedDurationMinutes ?? 30
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
        zone
      );
    } catch {
      return null;
    }
  }, [sessionDate, startTime, durationMinutes, zone]);

  const conflict = useMemo(() => {
    if (!interval) return { hasConflicts: false, overlappingEvents: [], overlappingReservations: [], warningMessageUk: null };
    return detectTimeConflicts(
      interval,
      events,
      reservations,
      existingReservation?.id
    );
  }, [interval, events, reservations, existingReservation?.id]);

  const freeWindows = useMemo(() => {
    if (!conflict.hasConflicts) return [];
    return computeFreeWindowsForDay(
      sessionDate,
      zone,
      durationMinutes || 30,
      events,
      reservations,
      existingReservation?.id
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
        zone
      ),
    [sessionDate, startTime, durationMinutes, zone]
  );

  const habitEntry = useMemo(
    () =>
      habit
        ? habitEntries.find(
            (e) => e.habitId === habit.id && e.localDate === sessionDate
          ) ?? null
        : null,
    [habit, habitEntries, sessionDate]
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
        await onSaved('Сеанс заплановано');
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
            existingReservation.revision
          );
        } else {
          await repositories.saveReservationTransactionally(
            {
              id: crypto.randomUUID(),
              taskId: freshTask.id,
              interval,
              state: 'active',
              releaseMetadata: null,
              createdAt: nowIso,
              updatedAt: nowIso,
              revision: 1,
            }
          );
        }
        await onSaved('Сеанс збережено');
        onClose();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не вдалося зберегти сеанс.'
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
        input: minimum ? { kind: 'minimum' } : { kind: 'complete' },
        nowIso: new Date().toISOString(),
      });
      await onSaved('Звичку відмічено');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка збереження.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={habit ? habit.name : 'Сеанс'}
      footer={
        <Button
          variant="primary"
          disabled={busy || !interval}
          onClick={() => void handleSaveSession()}
          data-testid="session-sheet-submit"
        >
          {conflict.hasConflicts ? 'Зберегти з накладанням' : 'Готово'}
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

        {conflict.hasConflicts && (
          <div className="space-y-2.5" data-testid="session-overlap-box">
            <InlineBanner tone="amber">
              На цей час уже заплановано інший запис. Оберіть вільне вікно або
              збережіть із накладанням.
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
                  habitEntry?.status === 'completed' &&
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
                        existingReservation.revision
                      )
                      .then(() => onSaved('Сеанс скасовано'))
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

export interface StageSheetProps {
  isOpen: boolean;
  onClose: () => void;
  owner?: { kind: 'goal' | 'project'; id: string };
  goalId?: string | null;
  projectId?: string | null;
  stage?: ProjectStage | null;
  stages: readonly ProjectStage[];
  todayDate?: string;
  repositories: PlanuiRepositories;
  onSaved: (msg?: string) => Promise<unknown> | void;
}

type StagePeriodPreset = 'this_month' | 'next_month' | 'this_quarter' | 'custom';

function computeRoadmapPeriodFromPreset(
  preset: StagePeriodPreset,
  todayDate: string,
  customStart: string,
  customEnd: string
): RoadmapPeriod {
  const [yStr, mStr] = todayDate.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = Number(mStr) || 1;

  if (preset === 'this_month') {
    return {
      precision: 'month',
      month: `${year}-${String(month).padStart(2, '0')}`,
    };
  }
  if (preset === 'next_month') {
    const nextM = month === 12 ? 1 : month + 1;
    const nextY = month === 12 ? year + 1 : year;
    return {
      precision: 'month',
      month: `${nextY}-${String(nextM).padStart(2, '0')}`,
    };
  }
  if (preset === 'this_quarter') {
    const q = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
    return {
      precision: 'quarter',
      year,
      quarter: q,
    };
  }
  const safeStart = customStart || todayDate;
  const safeEnd =
    customEnd && customEnd > safeStart
      ? customEnd
      : addDaysToLocalDate(safeStart, 14);
  return {
    precision: 'range',
    startDate: safeStart,
    endDateExclusive: safeEnd,
  };
}

export function StageSheet({
  isOpen,
  onClose,
  owner: propOwner,
  goalId,
  projectId,
  stage,
  stages,
  todayDate = new Date().toISOString().slice(0, 10),
  repositories,
  onSaved,
}: StageSheetProps) {
  const owner = useMemo(
    () =>
      propOwner ??
      (goalId
        ? { kind: 'goal' as const, id: goalId }
        : { kind: 'project' as const, id: projectId ?? '' }),
    [propOwner, goalId, projectId]
  );
  const siblingStages = useMemo(
    () =>
      stages
        .filter((s) =>
          owner.kind === 'goal'
            ? s.goalId === owner.id
            : s.projectId === owner.id
        )
        .filter((s) => s.id !== stage?.id)
        .sort((a, b) => a.order - b.order),
    [stages, owner, stage?.id]
  );

  const [title, setTitle] = useState(stage?.title ?? '');
  const [preset, setPreset] = useState<StagePeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState(todayDate);
  const [customEnd, setCustomEnd] = useState(addDaysToLocalDate(todayDate, 14));
  const [hasCheckpointDate, setHasCheckpointDate] = useState(
    Boolean(stage?.targetDate)
  );
  const [checkpointDate, setCheckpointDate] = useState(
    stage?.targetDate ?? todayDate
  );
  const [afterStageId, setAfterStageId] = useState<string>(
    stage?.dependsOnStageIds?.[0] ?? ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(stage?.title ?? '');
    if (stage?.roadmapPeriod?.precision === 'range') {
      setPreset('custom');
      setCustomStart(stage.roadmapPeriod.startDate);
      setCustomEnd(stage.roadmapPeriod.endDateExclusive);
    } else if (stage?.roadmapPeriod?.precision === 'quarter') {
      setPreset('this_quarter');
    } else {
      setPreset('this_month');
    }
    setHasCheckpointDate(Boolean(stage?.targetDate));
    setCheckpointDate(stage?.targetDate ?? todayDate);
    setAfterStageId(stage?.dependsOnStageIds?.[0] ?? '');
    setError(null);
  }, [isOpen, stage, todayDate]);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Введіть назву етапу.');
      return;
    }
    setBusy(true);
    setError(null);
    const nowIso = new Date().toISOString();
    try {
      const roadmapPeriod = computeRoadmapPeriodFromPreset(
        preset,
        todayDate,
        customStart,
        customEnd
      );
      const record: ProjectStage = {
        id: stage?.id ?? `stage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        projectId: owner.kind === 'project' ? owner.id : null,
        goalId: owner.kind === 'goal' ? owner.id : null,
        title: trimmed,
        expectedOutcome: stage?.expectedOutcome ?? null,
        targetDate: hasCheckpointDate && checkpointDate ? checkpointDate : null,
        roadmapPeriod,
        checkpoints: stage?.checkpoints ?? [],
        dependsOnStageIds: afterStageId ? [afterStageId] : [],
        order: stage?.order ?? siblingStages.length,
        createdAt: stage?.createdAt ?? nowIso,
        updatedAt: nowIso,
        revision: stage ? stage.revision + 1 : 1,
      };
      await repositories.saveStage(record, stage?.revision);
      await onSaved(stage ? 'Етап оновлено' : 'Етап додано');
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не вдалося зберегти етап.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={stage ? 'Етап' : 'Новий етап'}
      footer={
        <Button
          variant="primary"
          disabled={busy || !title.trim()}
          onClick={() => void handleSave()}
          data-testid="stage-sheet-submit"
        >
          Додати
        </Button>
      }
    >
      <div className="space-y-4" data-testid="stage-sheet">
        {error && <InlineBanner tone="error">{error}</InlineBanner>}

        <InputField
          label="Назва етапу"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Наприклад: Підготувати основу"
          data-testid="stage-sheet-name-input"
        />

        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] px-1">
            Період
          </p>
          <div className="ui-pill-row" role="group" aria-label="Період етапу">
            {(
              [
                ['this_month', 'Цей місяць'],
                ['next_month', 'Наступний місяць'],
                ['this_quarter', 'Цей квартал'],
                ['custom', 'Свій період'],
              ] as const
            ).map(([key, label]) => (
              <Pill
                key={key}
                selected={preset === key}
                onClick={() => setPreset(key)}
                data-testid={`stage-period-pill-${key}`}
              >
                {label}
              </Pill>
            ))}
          </div>
        </div>

        {preset === 'custom' && (
          <Section>
            <DateField
              label="Початок періоду"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <DateField
              label="Кінець періоду"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </Section>
        )}

        <Section>
          <Row
            title="Контрольна дата"
            trailing={
              <Toggle
                label="Контрольна дата"
                checked={hasCheckpointDate}
                onChange={setHasCheckpointDate}
              />
            }
          />
          {hasCheckpointDate && (
            <DateField
              label="Дата"
              value={checkpointDate}
              onChange={(e) => setCheckpointDate(e.target.value)}
            />
          )}
          {siblingStages.length > 0 && (
            <SelectField
              label="Після етапу"
              value={afterStageId}
              onChange={(e) => setAfterStageId(e.target.value)}
              options={[
                { value: '', label: 'Незалежно' },
                ...siblingStages.map((s) => ({
                  value: s.id,
                  label: s.title,
                })),
              ]}
            />
          )}
        </Section>
      </div>
    </Sheet>
  );
}

export interface TaskSheetProps {
  isOpen?: boolean;
  task?: Task | null;
  event?: CalendarEvent | null;
  initialReservationId?: string;
  reviewAction?: string;
  initialDate?: string;
  initialTime?: string;
  date?: string;
  todayDate?: string;
  zone?: string;
  activeZone?: string;
  tasks: readonly Task[];
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  folders?: readonly Folder[];
  projects?: readonly Project[];
  goals?: readonly Goal[];
  lifeAreas?: readonly LifeAreaQuestion[];
  repositories: PlanuiRepositories;
  onSaved?: (msg?: string) => Promise<unknown> | void;
  onDataChanged?: (msg?: string) => Promise<unknown> | void;
  onClose: () => void;
}

export function TaskSheet({
  isOpen = true,
  task: propTask,
  event: propEvent,
  initialReservationId,
  reviewAction,
  initialDate,
  initialTime,
  date: propDate,
  todayDate,
  zone: propZone,
  activeZone,
  tasks,
  events,
  reservations,
  folders = [],
  projects = [],
  goals = [],
  lifeAreas = [],
  repositories,
  onSaved: propOnSaved,
  onDataChanged,
  onClose,
}: TaskSheetProps) {
  const date = propDate ?? todayDate ?? new Date().toISOString().slice(0, 10);
  const zone = propZone ?? activeZone ?? 'UTC';
  const onSaved = useMemo(
    () => propOnSaved ?? onDataChanged ?? (() => undefined),
    [propOnSaved, onDataChanged]
  );
  const liveTask = useMemo(
    () => (propTask ? tasks.find((t) => t.id === propTask.id) ?? propTask : null),
    [propTask, tasks]
  );
  const liveEvent = useMemo(
    () =>
      propEvent ? events.find((e) => e.id === propEvent.id) ?? propEvent : null,
    [propEvent, events]
  );

  const isEventMode = Boolean(liveEvent && !liveTask);

  const activeTaskReservations = useMemo(
    () =>
      liveTask
        ? reservations
            .filter((r) => r.taskId === liveTask.id && r.state === 'active')
            .sort((a, b) =>
              a.interval.startInstant.localeCompare(b.interval.startInstant)
            )
        : [],
    [liveTask, reservations]
  );

  const primaryReservation = useMemo(
    () =>
      (initialReservationId
        ? activeTaskReservations.find((r) => r.id === initialReservationId)
        : null) ??
      activeTaskReservations[0] ??
      null,
    [initialReservationId, activeTaskReservations]
  );

  const [title, setTitle] = useState(
    liveTask?.title ?? liveEvent?.title ?? ''
  );
  const [whenDate, setWhenDate] = useState<string>(
    initialDate ??
      primaryReservation?.interval.originStartLocalDate ??
      liveTask?.plannedDate ??
      (liveEvent
        ? liveEvent.schedule.kind === 'timed'
          ? liveEvent.schedule.interval.originStartLocalDate
          : liveEvent.schedule.startLocalDate
        : '')
  );
  const [whenTime, setWhenTime] = useState<string>(
    (
      initialTime ??
      primaryReservation?.interval.originStartLocalTime ??
      (liveEvent?.schedule.kind === 'timed'
        ? liveEvent.schedule.interval.originStartLocalTime
        : '') ??
      ''
    ).slice(0, 5)
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    liveTask?.estimatedDurationMinutes ??
      (primaryReservation
        ? Math.max(
            15,
            Math.round(
              (Date.parse(primaryReservation.interval.endInstant) -
                Date.parse(primaryReservation.interval.startInstant)) /
                60000
            )
          )
        : liveEvent?.schedule.kind === 'timed'
        ? Math.max(
            15,
            Math.round(
              (Date.parse(liveEvent.schedule.interval.endInstant) -
                Date.parse(liveEvent.schedule.interval.startInstant)) /
                60000
            )
          )
        : 30)
  );
  const [effort, setEffort] = useState<TaskEffort | null>(
    liveTask?.effort ?? null
  );
  const [deadlineDate, setDeadlineDate] = useState<string>(
    liveTask?.deadline
      ? liveTask.deadline.kind === 'date_only'
        ? liveTask.deadline.localDate
        : liveTask.deadline.instant.slice(0, 10)
      : ''
  );

  const [areaId, setAreaId] = useState<string>(
    liveTask?.areaId ??
      liveTask?.lifeAreaId ??
      liveEvent?.areaId ??
      liveEvent?.lifeAreaId ??
      ''
  );
  const [parentKey, setParentKey] = useState<string>(() => {
    if (liveTask) {
      if (liveTask.ownership.kind === 'project') {
        return `project:${liveTask.ownership.projectId}`;
      }
      if (liveTask.ownership.kind === 'goal') {
        return `goal:${liveTask.ownership.goalId}`;
      }
      const fId =
        liveTask.folderId ??
        (liveTask.ownership.kind === 'folder'
          ? liveTask.ownership.folderId
          : liveTask.ownership.kind === 'standalone'
          ? liveTask.ownership.folderId
          : null);
      if (fId) return `folder:${fId}`;
    }
    if (liveEvent?.folderId) return `folder:${liveEvent.folderId}`;
    return '';
  });

  const [measure, setMeasure] = useState<Measure | null>(
    liveTask?.measure ?? null
  );
  const [customDeltaOpen, setCustomDeltaOpen] = useState(false);
  const [customDeltaValue, setCustomDeltaValue] = useState('');

  // SessionSheet sub-sheet state
  const [sessionSheetState, setSessionSheetState] = useState<{
    open: boolean;
    reservationId?: string | null;
  }>({ open: false, reservationId: null });

  // Зробити легше inline tool state
  const [lighterMode, setLighterMode] = useState<
    null | 'shrink' | 'split' | 'pause'
  >(() =>
    reviewAction === 'Зменшити обсяг'
      ? 'shrink'
      : reviewAction === 'Розділити'
      ? 'split'
      : reviewAction === 'Поставити на паузу'
      ? 'pause'
      : null
  );
  const [shrinkDuration, setShrinkDuration] = useState<number>(15);
  const [splitLines, setSplitLines] = useState<string>('');

  // Destructive AlertSheet state
  const [abandonAlertOpen, setAbandonAlertOpen] = useState(
    reviewAction === 'Відмовитися'
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAreas = useMemo(
    () => lifeAreas.filter((a) => !a.archived && !a.mergedIntoId),
    [lifeAreas]
  );

  const resolvedAreaInfo = useMemo(() => {
    const tempItem = {
      ...(liveTask ?? liveEvent),
      areaId: areaId || null,
      lifeAreaId: areaId || null,
      folderId: parentKey.startsWith('folder:') ? parentKey.slice(7) : null,
      projectId: parentKey.startsWith('project:') ? parentKey.slice(8) : null,
      goalId: parentKey.startsWith('goal:') ? parentKey.slice(5) : null,
    };
    return resolveArea(tempItem, {
      folders,
      projects,
      goals,
      lifeAreas: activeAreas,
    });
  }, [
    liveTask,
    liveEvent,
    areaId,
    parentKey,
    folders,
    projects,
    goals,
    activeAreas,
  ]);

  const handleToggleCompleted = async () => {
    if (liveTask) {
      setBusy(true);
      try {
        const nowIso = new Date().toISOString();
        if (liveTask.state === 'open') {
          await repositories.completeTaskTransactionally(
            liveTask.id,
            nowIso,
            liveTask.revision
          );
        } else {
          await repositories.reopenTaskTransactionally(
            liveTask.id,
            nowIso,
            liveTask.revision
          );
        }
        await onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Помилка оновлення.');
      } finally {
        setBusy(false);
      }
    }
  };

  const handleQuickLogMeasure = async (delta: number) => {
    if (!liveTask || !Number.isFinite(delta) || delta === 0) return;
    const nowIso = new Date().toISOString();
    const updatedTask = logMeasure(
      { ...liveTask, measure: measure ?? liveTask.measure },
      delta,
      nowIso
    );
    setMeasure(updatedTask.measure ?? null);
    try {
      await repositories.saveTask(
        {
          ...updatedTask,
          updatedAt: nowIso,
        },
        liveTask.revision
      );
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося оновити вимір.');
    }
  };

  const buildOwnershipFromKey = (key: string): {
    ownership: TaskOwnership;
    folderId: string | null;
  } => {
    if (key.startsWith('project:')) {
      const projectId = key.slice(8);
      return {
        ownership: {
          kind: 'project',
          projectId,
          stageId:
            liveTask?.ownership.kind === 'project' &&
            liveTask.ownership.projectId === projectId
              ? liveTask.ownership.stageId
              : null,
        },
        folderId: null,
      };
    }
    if (key.startsWith('goal:')) {
      return {
        ownership: { kind: 'goal', goalId: key.slice(5) },
        folderId: null,
      };
    }
    if (key.startsWith('folder:')) {
      const fId = key.slice(7);
      return {
        ownership: { kind: 'folder', folderId: fId },
        folderId: fId,
      };
    }
    return {
      ownership: { kind: 'standalone', folderId: null },
      folderId: null,
    };
  };

  const handleSaveDone = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Назва не може бути порожньою.');
      return;
    }
    setBusy(true);
    setError(null);
    const nowIso = new Date().toISOString();

    try {
      if (isEventMode && liveEvent) {
        const targetDate =
          whenDate ||
          (liveEvent.schedule.kind === 'timed'
            ? liveEvent.schedule.interval.originStartLocalDate
            : liveEvent.schedule.startLocalDate);
        const schedule = whenTime
          ? {
              kind: 'timed' as const,
              interval: buildZonedIntervalFromStartAndDuration(
                targetDate,
                whenTime.slice(0, 5),
                Math.max(5, durationMinutes || 30),
                zone
              ),
            }
          : {
              kind: 'all_day' as const,
              startLocalDate: targetDate,
              endLocalDateExclusive: addDaysToLocalDate(targetDate, 1),
              originZone: zone,
            };

        await repositories.saveCalendarEvent(
          {
            ...liveEvent,
            title: trimmedTitle,
            areaId: areaId || null,
            lifeAreaId: areaId || null,
            folderId: parentKey.startsWith('folder:')
              ? parentKey.slice(7)
              : null,
            schedule,
            updatedAt: nowIso,
          },
          liveEvent.revision
        );
        await onSaved('Збережено');
        onClose();
        return;
      }

      if (liveTask) {
        const { ownership, folderId } = buildOwnershipFromKey(parentKey);
        const deadline = deadlineDate
          ? {
              kind: 'exact_instant' as const,
              instant: localDateAndTimeToInstant(deadlineDate, '23:59', zone),
              zoneId: zone,
            }
          : null;

        let currentRev = liveTask.revision;
        const baseTask: Task = {
          ...liveTask,
          title: trimmedTitle,
          estimatedDurationMinutes: durationMinutes || null,
          effort,
          deadline,
          areaId: areaId || null,
          lifeAreaId: areaId || null,
          folderId,
          ownership,
          measure,
          updatedAt: nowIso,
        };

        const savedTask = await repositories.saveTask(baseTask, currentRev);
        currentRev = savedTask.revision;

        if (whenDate && whenTime) {
          const interval = buildZonedIntervalFromStartAndDuration(
            whenDate,
            whenTime.slice(0, 5),
            Math.max(5, durationMinutes || 30),
            zone
          );
          if (primaryReservation) {
            await repositories.rescheduleReservationTransactionally(
              primaryReservation.id,
              interval,
              nowIso,
              primaryReservation.revision
            );
          } else {
            await repositories.saveReservationTransactionally(
              {
                id: crypto.randomUUID(),
                taskId: liveTask.id,
                interval,
                state: 'active',
                releaseMetadata: null,
                createdAt: nowIso,
                updatedAt: nowIso,
                revision: 1,
              }
            );
          }
        } else if (whenDate && !whenTime && activeTaskReservations.length === 0) {
          await repositories.setTaskDateOnlyPlanningTransactionally(
            liveTask.id,
            whenDate,
            nowIso,
            currentRev
          );
        }

        await onSaved('Збережено');
        onClose();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не вдалося зберегти зміни.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleShrinkScope = async () => {
    if (!liveTask) return;
    setBusy(true);
    setError(null);
    const nowIso = new Date().toISOString();
    try {
      await repositories.saveTask(
        {
          ...liveTask,
          title: title.trim() || liveTask.title,
          estimatedDurationMinutes: shrinkDuration,
          effort: 'small',
          updatedAt: nowIso,
        },
        liveTask.revision
      );
      setDurationMinutes(shrinkDuration);
      setEffort('small');
      setLighterMode(null);
      await onSaved('Обсяг зменшено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка збереження.');
    } finally {
      setBusy(false);
    }
  };

  const handleSplitIntoSteps = async () => {
    if (!liveTask) return;
    const steps = splitLines
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (steps.length < 2) {
      setError('Введіть щонайменше 2 кроки (кожен з нового рядка).');
      return;
    }
    setBusy(true);
    setError(null);
    const nowIso = new Date().toISOString();
    try {
      const nextChecklist = [
        ...liveTask.checklist,
        ...steps.map((stepTitle, idx) => ({
          id: `chk-${Date.now()}-${idx}`,
          title: stepTitle,
          order: liveTask.checklist.length + idx,
          completed: false,
        })),
      ];
      await repositories.saveTask(
        {
          ...liveTask,
          checklist: nextChecklist,
          updatedAt: nowIso,
        },
        liveTask.revision
      );
      setSplitLines('');
      setLighterMode(null);
      await onSaved('Розділено на кроки');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка збереження.');
    } finally {
      setBusy(false);
    }
  };

  const handlePauseItem = async () => {
    if (!liveTask) return;
    setBusy(true);
    setError(null);
    try {
      await repositories.removeTaskCurrentPlanningTransactionally(
        liveTask.id,
        new Date().toISOString(),
        liveTask.revision
      );
      setWhenDate('');
      setWhenTime('');
      setLighterMode(null);
      await onSaved('Поставлено на паузу');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка паузи.');
    } finally {
      setBusy(false);
    }
  };

  const handleAbandonConfirm = async () => {
    setBusy(true);
    setError(null);
    const nowIso = new Date().toISOString();
    try {
      if (isEventMode && liveEvent) {
        await repositories.cancelCalendarEventTransactionally(
          liveEvent.id,
          nowIso,
          liveEvent.revision
        );
        await onSaved('Подію скасовано');
        onClose();
        return;
      }
      if (liveTask) {
        await repositories.cancelTaskTransactionally(
          liveTask.id,
          nowIso,
          liveTask.revision
        );
        await onSaved('Справу скасовано');
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка скасування.');
    } finally {
      setBusy(false);
      setAbandonAlertOpen(false);
    }
  };

  const connectionOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: '', label: 'Без папки / проєкту' },
    ];
    for (const f of folders) {
      opts.push({ value: `folder:${f.id}`, label: `Папка: ${f.name}` });
    }
    for (const p of projects.filter((pr) => !pr.archived)) {
      opts.push({ value: `project:${p.id}`, label: `Проєкт: ${p.title}` });
    }
    for (const g of goals.filter((gl) => !gl.archived)) {
      opts.push({ value: `goal:${g.id}`, label: `Ціль: ${g.title}` });
    }
    return opts;
  }, [folders, projects, goals]);

  if (!isOpen || (!liveTask && !liveEvent)) return null;

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onClose={onClose}
        title={isEventMode ? 'Подія' : 'Завдання'}
        footer={
          <Button
            variant="primary"
            disabled={busy || !title.trim()}
            onClick={() => void handleSaveDone()}
            data-testid="task-sheet-done-button"
          >
            Готово
          </Button>
        }
      >
        <div className="space-y-4" data-testid="task-sheet">
          {error && <InlineBanner tone="error">{error}</InlineBanner>}

          {/* Editable title + check circle */}
          <div className="flex items-center gap-3 px-1">
            {!isEventMode && liveTask ? (
              <button
                type="button"
                onClick={() => void handleToggleCompleted()}
                aria-label={
                  liveTask.state === 'completed'
                    ? 'Повернути у відкриті'
                    : 'Позначити виконаним'
                }
                aria-pressed={liveTask.state === 'completed'}
                data-testid="task-sheet-check-circle"
                className="w-11 h-11 rounded-full inline-grid place-items-center shrink-0"
              >
                <span
                  className={`w-6 h-6 rounded-full grid place-items-center border transition-colors ${
                    liveTask.state === 'completed'
                      ? 'bg-[var(--ink)] border-[var(--ink)] text-[var(--on-ink)]'
                      : 'border-[var(--border-strong)] bg-transparent'
                  }`}
                >
                  {liveTask.state === 'completed' && (
                    <Icon name="check" size={14} />
                  )}
                </span>
              </button>
            ) : (
              <span className="w-11 h-11 rounded-full inline-grid place-items-center shrink-0">
                <Orb
                  color={areaColor(resolvedAreaInfo?.rating ?? null)}
                  size={20}
                />
              </span>
            )}
            <input
              type="text"
              aria-label="Назва"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="task-sheet-title-input"
              className="flex-1 min-w-0 bg-transparent border-0 text-xl font-bold text-[var(--text-primary)] focus:outline-none"
            />
          </div>

          {/* Section "Коли": Дата, Час, Тривалість, Зусилля, a separate "Дедлайн" */}
          <Section title="Коли">
            <DateField
              label="Дата"
              value={whenDate}
              onChange={(e) => setWhenDate(e.target.value)}
              data-testid="task-sheet-date-field"
            />
            <TimeField
              label="Час"
              value={whenTime}
              onChange={(e) => setWhenTime(e.target.value.slice(0, 5))}
              data-testid="task-sheet-time-field"
            />
            <DurationField
              label="Тривалість"
              value={durationMinutes}
              onChange={(next) => setDurationMinutes(next ?? 30)}
            />
            {!isEventMode && (
              <Row
                title="Зусилля"
                trailing={
                  <div className="flex items-center gap-1">
                    {(
                      [
                        ['small', 'Невеликі'],
                        ['medium', 'Середні'],
                        ['large', 'Значні'],
                      ] as const
                    ).map(([key, label]) => (
                      <Pill
                        key={key}
                        selected={effort === key}
                        onClick={() =>
                          setEffort((prev) => (prev === key ? null : key))
                        }
                        className="min-h-[36px] px-2.5 py-1 text-xs"
                      >
                        {label}
                      </Pill>
                    ))}
                  </div>
                }
              />
            )}
            {!isEventMode && (
              <DateField
                label="Дедлайн"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                data-testid="task-sheet-deadline-field"
              />
            )}
          </Section>

          {/* Section "Зв'язки": Сфера (orb), Проєкт/Папка */}
          <Section title="Зв'язки">
            <SelectField
              label="Сфера"
              value={areaId}
              options={[
                { value: '', label: 'Без сфери' },
                ...activeAreas.map((a) => ({
                  value: a.id,
                  label: a.questionTextUk,
                })),
              ]}
              onChange={(e: any) => setAreaId(e?.target?.value ?? e)}
            />
            <SelectField
              label="Проєкт/Папка"
              value={parentKey}
              onChange={(e: any) => setParentKey(e?.target?.value ?? e)}
              options={connectionOptions}
            />
          </Section>

          {/* Section "Вимір" (when the item has one): "120 / 300 стор." + quick-log +1 / +5 / "Своє" */}
          {!isEventMode && measure && (
            <Section title="Вимір">
              <Row
                title={
                  measure.target != null
                    ? `${measure.current} / ${measure.target} ${measure.unit}`.trim()
                    : `${measure.current} ${measure.unit}`.trim()
                }
                trailing={
                  <div className="flex items-center gap-1.5">
                    <Pill
                      onClick={() => void handleQuickLogMeasure(1)}
                      data-testid="measure-log-plus-1"
                    >
                      +1
                    </Pill>
                    <Pill
                      onClick={() => void handleQuickLogMeasure(5)}
                      data-testid="measure-log-plus-5"
                    >
                      +5
                    </Pill>
                    <Pill
                      selected={customDeltaOpen}
                      onClick={() => setCustomDeltaOpen((v) => !v)}
                      data-testid="measure-log-custom-toggle"
                    >
                      Своє
                    </Pill>
                  </div>
                }
              />
              {customDeltaOpen && (
                <div className="p-3 flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={customDeltaValue}
                    onChange={(e) => setCustomDeltaValue(e.target.value)}
                    placeholder="Значення"
                    className="flex-1 min-h-[44px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm"
                  />
                  <Pill
                    onClick={() => {
                      const num = Number(customDeltaValue);
                      if (Number.isFinite(num) && num !== 0) {
                        void handleQuickLogMeasure(num);
                        setCustomDeltaValue('');
                        setCustomDeltaOpen(false);
                      }
                    }}
                  >
                    Додати
                  </Pill>
                </div>
              )}
            </Section>
          )}

          {/* Section "Сеанси": rows + "+ Запланувати сеанс" (opens SessionSheet) */}
          {!isEventMode && liveTask && (
            <Section title="Сеанси">
              {activeTaskReservations.map((res) => {
                const dur = Math.max(
                  15,
                  Math.round(
                    (Date.parse(res.interval.endInstant) -
                      Date.parse(res.interval.startInstant)) /
                      60000
                  )
                );
                return (
                  <Row
                    key={res.id}
                    title={formatSessionSummaryUk(
                      res.interval.originStartLocalDate,
                      res.interval.originStartLocalTime.slice(0, 5),
                      dur,
                      zone
                    )}
                    onClick={() =>
                      setSessionSheetState({
                        open: true,
                        reservationId: res.id,
                      })
                    }
                    trailing={
                      <button
                        type="button"
                        aria-label="Скасувати сеанс"
                        onClick={(e) => {
                          e.stopPropagation();
                          void repositories
                            .cancelSingleReservationTransactionally(
                              res.id,
                              'cancel',
                              new Date().toISOString(),
                              res.revision
                            )
                            .then(() => onSaved('Сеанс скасовано'));
                        }}
                        className="ui-round"
                      >
                        <Icon name="x" size={16} />
                      </button>
                    }
                  />
                );
              })}
              <Row
                title="+ Запланувати сеанс"
                onClick={() =>
                  setSessionSheetState({ open: true, reservationId: null })
                }
                data-testid="open-session-sheet-row"
              />
            </Section>
          )}

          {/* Section "Зробити легше": "Зменшити обсяг", "Розділити на кроки", "Поставити на паузу" (explanation behind ⓘ) */}
          {!isEventMode && liveTask && (
            <Section title="Зробити легше">
              <Row
                title="Зменшити обсяг"
                onClick={() =>
                  setLighterMode((m) => (m === 'shrink' ? null : 'shrink'))
                }
                trailing={
                  <InfoSheet title="Зробити легше">
                    <p>
                      Якщо завдання здається заважким зараз, зменшіть його до
                      15-хвилинного першого кроку, розділіть на окремі підкроки
                      або поставте на паузу (звільнивши розклад без видалення
                      справи).
                    </p>
                  </InfoSheet>
                }
                data-testid="task-lighter-shrink"
              />
              {lighterMode === 'shrink' && (
                <div className="p-3 space-y-2 border-t border-[var(--border-subtle)]">
                  <DurationField
                    label="Нова оцінка часу"
                    value={shrinkDuration}
                    onChange={(v) => setShrinkDuration(v ?? 15)}
                  />
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void handleShrinkScope()}
                  >
                    Зберегти менший обсяг
                  </Button>
                </div>
              )}

              <Row
                title="Розділити на кроки"
                onClick={() =>
                  setLighterMode((m) => (m === 'split' ? null : 'split'))
                }
                data-testid="task-lighter-split"
              />
              {lighterMode === 'split' && (
                <div className="p-3 space-y-2 border-t border-[var(--border-subtle)]">
                  <textarea
                    rows={3}
                    value={splitLines}
                    onChange={(e) => setSplitLines(e.target.value)}
                    placeholder="Кожен крок з нового рядка…"
                    className="w-full p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm"
                  />
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void handleSplitIntoSteps()}
                  >
                    Додати кроки
                  </Button>
                </div>
              )}

              <Row
                title="Поставити на паузу"
                onClick={() => void handlePauseItem()}
                data-testid="task-lighter-pause"
              />
            </Section>
          )}

          {/* Destructive "Відмовитися" with an AlertSheet */}
          <div className="pt-1">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => setAbandonAlertOpen(true)}
              data-testid="task-sheet-abandon-button"
            >
              Відмовитися
            </Button>
          </div>
        </div>
      </Sheet>

      {liveTask && (
        <SessionSheet
          isOpen={sessionSheetState.open}
          onClose={() =>
            setSessionSheetState({ open: false, reservationId: null })
          }
          date={whenDate || date}
          zone={zone}
          initialTime={whenTime || initialTime || '09:00'}
          initialDurationMinutes={durationMinutes}
          task={liveTask}
          reservationId={sessionSheetState.reservationId}
          tasks={tasks}
          events={events}
          reservations={reservations}
          repositories={repositories}
          onSaved={onSaved}
        />
      )}

      <AlertSheet
        isOpen={abandonAlertOpen}
        onClose={() => setAbandonAlertOpen(false)}
        title={isEventMode ? 'Відмовитися від події?' : 'Відмовитися від справи?'}
        description={
          isEventMode
            ? 'Подію буде скасовано та прибрано з активного розкладу.'
            : 'Справу буде позначено скасованою, а заплановані сеанси звільнено.'
        }
        confirmLabel="Відмовитися"
        onConfirm={() => void handleAbandonConfirm()}
      />
    </>
  );
}

export { TaskSheet as TaskPlanningSheet };
