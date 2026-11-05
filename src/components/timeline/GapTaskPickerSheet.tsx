import { formatDuration } from '../../lib/format';
import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarEvent,
  IanaTimeZone,
  Project,
  Task,
  TaskReservation,
} from '../../domain/types';
import {
  UnoccupiedTimeGap,
  evaluateGapTaskSessionProposal,
} from '../../domain/scheduling';
import { PlanuiRepositories } from '../../storage/repositories';
import { UK_STRINGS } from '../../i18n/uk';
import {
  Button,
  FeedbackBanner,
  InputField,
  ModalSheet,
  SelectField,
} from '../ui/primitives';

export interface GapTaskPickerSheetProps {
  isOpen: boolean;
  gap: UnoccupiedTimeGap | null;
  displayZone: IanaTimeZone;
  tasks: readonly Task[];
  projects: readonly Project[];
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  repositories: PlanuiRepositories;
  onClose: () => void;
  onReservationCreated: (feedbackUk: string) => Promise<void> | void;
}

export function GapTaskPickerSheet({
  isOpen,
  gap,
  displayZone,
  tasks,
  projects,
  events,
  reservations,
  repositories,
  onClose,
  onReservationCreated,
}: GapTaskPickerSheetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [startLocalTime, setStartLocalTime] = useState<string>('09:00');
  const [durationInputStr, setDurationInputStr] = useState<string>('');
  const [confirmOverlap, setConfirmOverlap] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const openTasks = useMemo(
    () => tasks.filter((t) => t.state === 'open'),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return openTasks.filter((t) => {
      if (projectFilter === 'standalone') {
        if (t.ownership.kind !== 'standalone') return false;
      } else if (projectFilter !== 'all') {
        if (
          t.ownership.kind !== 'project' ||
          t.ownership.projectId !== projectFilter
        ) {
          return false;
        }
      }
      if (q) {
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q) ?? false;
        if (!matchTitle && !matchDesc) return false;
      }
      return true;
    });
  }, [openTasks, projectFilter, searchQuery]);

  const selectedTask = useMemo(
    () => openTasks.find((t) => t.id === selectedTaskId) ?? null,
    [openTasks, selectedTaskId]
  );

  const lastOpenedGapKeyRef = React.useRef<string | null>(null);

  // Reset form ONLY when a gap is newly opened
  useEffect(() => {
    const gapKey =
      isOpen && gap
        ? `${gap.localDate}|${gap.startLocalTime}|${gap.endLocalTime}`
        : null;
    if (gapKey && lastOpenedGapKeyRef.current !== gapKey) {
      lastOpenedGapKeyRef.current = gapKey;
      setSearchQuery('');
      setProjectFilter('all');
      setStartLocalTime(gap!.startLocalTime);
      setConfirmOverlap(false);
      setSubmitError(null);

      const firstTask = openTasks[0] ?? null;
      setSelectedTaskId(firstTask ? firstTask.id : null);
      if (firstTask) {
        if (firstTask.estimatedDurationMinutes !== null) {
          const initialMin = Math.min(
            firstTask.estimatedDurationMinutes,
            gap!.durationMinutes
          );
          setDurationInputStr(String(Math.max(5, initialMin)));
        } else {
          // 6.4 Ask for session length when absent (do not prefill silently when task has no estimate)
          setDurationInputStr('');
        }
      } else {
        setDurationInputStr('');
      }
    } else if (!isOpen) {
      lastOpenedGapKeyRef.current = null;
    }
  }, [isOpen, gap, openTasks]);

  const handleSelectTask = (task: Task) => {
    setSelectedTaskId(task.id);
    setConfirmOverlap(false);
    setSubmitError(null);
    if (!gap) return;
    if (task.estimatedDurationMinutes !== null) {
      const initialMin = Math.min(
        task.estimatedDurationMinutes,
        gap.durationMinutes
      );
      setDurationInputStr(String(Math.max(5, initialMin)));
    } else {
      // 6.4 Explicitly ask user for session length when task has no estimate
      setDurationInputStr('');
    }
  };

  const parsedDurationMinutes = useMemo(() => {
    const trimmed = durationInputStr.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }, [durationInputStr]);

  const proposal = useMemo(() => {
    if (!gap || !selectedTask) return null;
    return evaluateGapTaskSessionProposal({
      gap,
      task: selectedTask,
      startLocalTime,
      durationMinutesInput: parsedDurationMinutes,
      displayZone,
      events,
      reservations,
      tasks,
    });
  }, [
    gap,
    selectedTask,
    startLocalTime,
    parsedDurationMinutes,
    displayZone,
    events,
    reservations,
    tasks,
  ]);

  if (!isOpen || !gap) return null;

  const handleConfirmSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedTask) {
      setSubmitError('Оберіть існуючу справу зі списку.');
      return;
    }
    if (
      !proposal ||
      !proposal.isValid ||
      !proposal.candidateStartInstant ||
      !proposal.candidateEndInstant
    ) {
      setSubmitError(
        proposal?.errorUk ?? 'Перевірте час початку та тривалість сесії.'
      );
      return;
    }
    if (proposal.conflictReport.hasConflicts && !confirmOverlap) {
      setSubmitError(
        UK_STRINGS.creation.eventForm.overlapConfirmationRequiredError
      );
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const newRes: TaskReservation = {
        id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        taskId: selectedTask.id,
        interval: {
          startInstant: proposal.candidateStartInstant,
          endInstant: proposal.candidateEndInstant,
          originZone: displayZone,
          originStartLocalDate: gap.localDate,
          originStartLocalTime: proposal.displayStartLocalTime,
          originEndLocalDate: proposal.displayEndLocalDate,
          originEndLocalTime: proposal.displayEndLocalTime,
        },
        state: 'active',
        releaseMetadata: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      };
      await repositories.saveReservationTransactionally(newRes);
      await onReservationCreated(UK_STRINGS.gapPicker.scheduledFeedback);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Не вдалося створити часовий резерв.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const projectFilterOptions = [
    { value: 'all', label: UK_STRINGS.gapPicker.projectFilterAll },
    {
      value: 'standalone',
      label: UK_STRINGS.gapPicker.projectFilterStandalone,
    },
    ...projects
      .filter((p) => !p.archived)
      .map((proj) => ({
        value: proj.id,
        label: `Проєкт: ${proj.title}`,
      })),
  ];

  return (
    <ModalSheet
      isOpen={isOpen}
      title={UK_STRINGS.gapPicker.modalTitle}
      subtitle={`${UK_STRINGS.gapPicker.gapSummaryPrefix}: ${gap.localDate}, ${gap.startLocalTime}–${gap.endLocalTime} (${formatDuration(gap.durationMinutes)})`}
      onClose={onClose}
      isDirty={Boolean(durationInputStr.trim())}
    >
      <form
        onSubmit={(e) => void handleConfirmSchedule(e)}
        className="space-y-4"
        data-testid="gap-task-picker-form"
      >
        {submitError && (
          <FeedbackBanner
            tone="error"
            message={submitError}
            onDismiss={() => setSubmitError(null)}
          />
        )}

        {/* Search & Project Filter (6.4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InputField
            id="gap-picker-search"
            label={UK_STRINGS.plansView.searchLabel}
            data-testid="gap-picker-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={UK_STRINGS.gapPicker.searchPlaceholder}
          />

          <SelectField
            id="gap-picker-project-filter"
            label={UK_STRINGS.gapPicker.projectFilterLabel}
            data-testid="gap-picker-project-select"
            options={projectFilterOptions}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          />
        </div>

        {/* Existing Open Tasks List */}
        <div className="space-y-2">
          <div className="text-[13px] font-semibold">
            {UK_STRINGS.gapPicker.selectTaskHeading} ({filteredTasks.length})
          </div>

          {filteredTasks.length === 0 ? (
            <div
              className="p-3.5 rounded-xl text-[13px]"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
              }}
              data-testid="gap-picker-empty-tasks"
            >
              {UK_STRINGS.gapPicker.noMatchingTasks}
            </div>
          ) : (
            <div
              className="max-h-48 overflow-y-auto space-y-1.5 pr-1"
              role="radiogroup"
              aria-label={UK_STRINGS.gapPicker.selectTaskHeading}
            >
              {filteredTasks.map((task) => {
                const isSelected = task.id === selectedTaskId;
                const projTitle =
                  task.ownership.kind === 'project'
                    ? projectsById.get(task.ownership.projectId)?.title ?? null
                    : null;

                return (
                  <button
                    key={task.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    data-testid={`gap-picker-task-option-${task.title}`}
                    onClick={() => handleSelectTask(task)}
                    className="w-full min-h-[44px] p-3 rounded-xl text-left flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    style={{
                      backgroundColor: isSelected
                        ? 'var(--bg-pressed)'
                        : 'var(--bg-elevated)',
                      border: isSelected
                        ? '1.5px solid var(--color-reservation)'
                        : '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-[14px] font-semibold truncate">
                        {task.title}
                      </div>
                      <div
                        className="text-[12px] flex flex-wrap items-center gap-1.5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {projTitle ? (
                          <span>Проєкт: {projTitle}</span>
                        ) : (
                          <span>Окрема справа</span>
                        )}
                        {task.estimatedDurationMinutes !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              Оцінка: {formatDuration(task.estimatedDurationMinutes)}
                            </span>
                          </>
                        )}
                        {task.plannedDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Дата: {task.plannedDate}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Session Configuration for Selected Task */}
        {selectedTask && (
          <div
            className="p-3.5 rounded-2xl space-y-3"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
            data-testid="gap-picker-session-config"
          >
            <div className="space-y-1">
              <div className="text-[13px] font-semibold">
                {UK_STRINGS.gapPicker.selectedTaskLabel}: «{selectedTask.title}»
              </div>
              {selectedTask.estimatedDurationMinutes !== null ? (
                <div
                  className="text-[12px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.gapPicker.estimatePresentNote(
                    selectedTask.estimatedDurationMinutes
                  )}
                </div>
              ) : (
                <div
                  className="text-[12px] font-medium"
                  style={{ color: 'var(--color-work-text)' }}
                  data-testid="gap-picker-missing-estimate-prompt"
                >
                  {UK_STRINGS.gapPicker.estimateMissingPrompt}
                </div>
              )}
            </div>

            {/* Partial session notice when task estimate > gap duration (C10 / 6.4) */}
            {selectedTask.estimatedDurationMinutes !== null &&
              selectedTask.estimatedDurationMinutes > gap.durationMinutes && (
                <div
                  className="p-3 rounded-xl space-y-2 text-[12px]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  data-testid="gap-picker-partial-session-banner"
                >
                  <div>
                    {UK_STRINGS.gapPicker.partialSessionNotice(
                      selectedTask.estimatedDurationMinutes,
                      gap.durationMinutes
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-testid="gap-picker-use-partial-button"
                      onClick={() => {
                        setDurationInputStr(String(gap.durationMinutes));
                        setConfirmOverlap(false);
                      }}
                    >
                      {UK_STRINGS.gapPicker.usePartialSessionButton(
                        gap.durationMinutes
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="subtle"
                      size="sm"
                      data-testid="gap-picker-use-full-estimate-button"
                      onClick={() =>
                        setDurationInputStr(
                          String(selectedTask.estimatedDurationMinutes)
                        )
                      }
                    >
                      {UK_STRINGS.gapPicker.useFullEstimateButton(
                        selectedTask.estimatedDurationMinutes
                      )}
                    </Button>
                  </div>
                </div>
              )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField
                id="gap-picker-start-time"
                label={UK_STRINGS.gapPicker.sessionStartTimeLabel}
                type="time"
                data-testid="gap-picker-start-time-input"
                value={startLocalTime}
                onChange={(e) => {
                  setStartLocalTime(e.target.value);
                  setConfirmOverlap(false);
                }}
              />

              <InputField
                id="gap-picker-duration-minutes"
                label={UK_STRINGS.gapPicker.sessionDurationMinutesLabel}
                type="number"
                min={1}
                max={1440}
                data-testid="gap-picker-duration-input"
                placeholder="Наприклад: 30"
                value={durationInputStr}
                onChange={(e) => {
                  setDurationInputStr(e.target.value);
                  setConfirmOverlap(false);
                }}
              />
            </div>

            {proposal && proposal.isValid && (
              <div
                className="text-[12px] flex flex-wrap items-center justify-between gap-2 pt-1"
                style={{ color: 'var(--text-secondary)' }}
                data-testid="gap-picker-preview-range"
              >
                <span>
                  {UK_STRINGS.gapPicker.sessionPreviewRangeLabel}:{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {gap.localDate} {proposal.displayStartLocalTime} –{' '}
                    {proposal.displayEndLocalDate !== gap.localDate
                      ? `${proposal.displayEndLocalDate} `
                      : ''}
                    {proposal.displayEndLocalTime} ({proposal.durationMinutes}{' '}
                    хв)
                  </strong>
                </span>
                {proposal.isPartialSession && (
                  <span>Часткова сесія</span>
                )}
              </div>
            )}

            {proposal?.conflictReport.hasConflicts &&
              proposal.conflictReport.warningMessageUk && (
                <div
                  className="p-3 rounded-xl space-y-2 text-[12px]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--color-brand)',
                  }}
                  data-testid="gap-picker-conflict-warning"
                >
                  <div
                    className="font-medium"
                    style={{ color: 'var(--color-brand-text)' }}
                  >
                    {proposal.conflictReport.warningMessageUk}
                  </div>
                  <label className="flex items-start gap-2.5 cursor-pointer min-h-[44px] pt-1">
                    <input
                      type="checkbox"
                      checked={confirmOverlap}
                      onChange={(e) => setConfirmOverlap(e.target.checked)}
                      data-testid="gap-picker-confirm-overlap-checkbox"
                      className="mt-0.5 w-4 h-4"
                    />
                    <span>
                      {
                        UK_STRINGS.creation.eventForm
                          .confirmConsciousOverlapLabel
                      }
                    </span>
                  </label>
                </div>
              )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {UK_STRINGS.app.cancelButton}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSaving || !selectedTask}
            data-testid="gap-picker-submit-button"
          >
            {UK_STRINGS.gapPicker.confirmScheduleButton}
          </Button>
        </div>
      </form>
    </ModalSheet>
  );
}
