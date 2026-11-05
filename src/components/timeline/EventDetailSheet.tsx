import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarEvent,
  EventPaletteColor,
  IanaTimeZone,
  Task,
  TaskReservation,
} from '../../domain/types';
import {
  addDaysToLocalDate,
  buildZonedIntervalFromLocalInput,
  suggestEndDateForClockRange,
} from '../../domain/temporal';
import { detectScheduleConflicts } from '../../domain/scheduling';
import { PlanuiRepositories } from '../../storage/repositories';
import { UK_STRINGS } from '../../i18n/uk';
import { formatDate } from '../../lib/format';
import { DateField, Row, TimeField, Toggle } from '../../ui';
import {
  Button,
  FeedbackBanner,
  InputField,
  ModalSheet,
  SelectField,
  TextAreaField,
} from '../ui/primitives';

export interface EventDetailSheetProps {
  event: CalendarEvent | null;
  displayZone: IanaTimeZone;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  repositories: PlanuiRepositories;
  onClose: () => void;
  onEventUpdated: (feedbackUk: string) => Promise<void> | void;
}

export function EventDetailSheet({
  event,
  displayZone,
  events,
  reservations,
  tasks,
  repositories,
  onClose,
  onEventUpdated,
}: EventDetailSheetProps) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [color, setColor] = useState<EventPaletteColor>('personal');
  const [isBlocking, setIsBlocking] = useState(true);
  const [startLocalDate, setStartLocalDate] = useState('');
  const [startLocalTime, setStartLocalTime] = useState('09:00');
  const [endLocalDate, setEndLocalDate] = useState('');
  const [endLocalTime, setEndLocalTime] = useState('10:00');
  const [confirmOverlap, setConfirmOverlap] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!event) return;
    setTitle(event.title);
    setNote(event.note ?? '');
    setColor(event.color);
    setIsBlocking(event.isBlocking);
    setConfirmOverlap(false);
    setErrorMessage(null);

    if (event.schedule.kind === 'timed') {
      setStartLocalDate(event.schedule.interval.originStartLocalDate);
      setStartLocalTime(event.schedule.interval.originStartLocalTime);
      setEndLocalDate(event.schedule.interval.originEndLocalDate);
      setEndLocalTime(event.schedule.interval.originEndLocalTime);
    } else {
      setStartLocalDate(event.schedule.startLocalDate);
      setEndLocalDate(
        addDaysToLocalDate(event.schedule.endLocalDateExclusive, -1)
      );
    }
  }, [event]);

  const clockSuggestion = useMemo(() => {
    if (!event || event.schedule.kind !== 'timed' || !startLocalDate) {
      return null;
    }
    return suggestEndDateForClockRange(
      startLocalDate,
      startLocalTime,
      endLocalTime
    );
  }, [event, startLocalDate, startLocalTime, endLocalTime]);

  const candidateConflictReport = useMemo(() => {
    if (!event || event.schedule.kind !== 'timed' || !isBlocking) {
      return null;
    }
    try {
      const built = buildZonedIntervalFromLocalInput({
        startLocalDate,
        startLocalTime,
        endLocalDate,
        endLocalTime,
        originZone: event.schedule.interval.originZone,
      });
      return detectScheduleConflicts({
        candidateStartInstant: built.interval.startInstant,
        candidateEndInstant: built.interval.endInstant,
        displayZone,
        events,
        reservations,
        tasks,
        excludeEventId: event.id,
      });
    } catch {
      return null;
    }
  }, [
    event,
    isBlocking,
    startLocalDate,
    startLocalTime,
    endLocalDate,
    endLocalTime,
    displayZone,
    events,
    reservations,
    tasks,
  ]);

  if (!event) return null;

  const isWorkShift = event.type === 'work_shift';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage('Введіть назву запису календаря.');
      return;
    }

    if (event.schedule.kind === 'timed') {
      if (
        startLocalDate === endLocalDate &&
        startLocalTime === endLocalTime
      ) {
        setErrorMessage(UK_STRINGS.creation.eventForm.equalClocksWarning);
        return;
      }
      if (candidateConflictReport?.hasConflicts && !confirmOverlap) {
        setErrorMessage(
          UK_STRINGS.creation.eventForm.overlapConfirmationRequiredError
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      if (event.schedule.kind === 'timed') {
        const built = buildZonedIntervalFromLocalInput({
          startLocalDate,
          startLocalTime,
          endLocalDate,
          endLocalTime,
          originZone: event.schedule.interval.originZone,
        });
        await repositories.saveCalendarEvent(
          {
            ...event,
            title: title.trim(),
            note: note.trim() ? note.trim() : null,
            color,
            isBlocking,
            schedule: {
              kind: 'timed',
              interval: built.interval,
            },
            workProperties: isWorkShift
              ? {
                  shiftName: title.trim(),
                  shiftCode: event.workProperties?.shiftCode ?? null,
                  sourceTemplateId:
                    event.workProperties?.sourceTemplateId ?? null,
                }
              : null,
            updatedAt: nowIso,
          },
          event.revision
        );
      } else {
        const exclusiveEnd = addDaysToLocalDate(endLocalDate, 1);
        await repositories.saveCalendarEvent(
          {
            ...event,
            title: title.trim(),
            note: note.trim() ? note.trim() : null,
            color,
            isBlocking,
            schedule: {
              kind: 'all_day',
              startLocalDate,
              endLocalDateExclusive: exclusiveEnd,
              originZone: event.schedule.originZone,
            },
            updatedAt: nowIso,
          },
          event.revision
        );
      }

      await onEventUpdated(UK_STRINGS.timeline.eventUpdatedFeedback);
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Не вдалося оновити запис.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelRecord = async () => {
    setIsSaving(true);
    try {
      await repositories.cancelCalendarEventTransactionally(
        event.id,
        new Date().toISOString(),
        event.revision
      );
      await onEventUpdated('Запис календаря скасовано.');
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Не вдалося скасувати запис.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const colorOptions = [
    { value: 'personal', label: UK_STRINGS.creation.eventForm.colorPersonal },
    { value: 'work', label: UK_STRINGS.creation.eventForm.colorWork },
    { value: 'rest', label: UK_STRINGS.creation.eventForm.colorRest },
    { value: 'dayoff', label: UK_STRINGS.creation.eventForm.colorDayoff },
    { value: 'brand', label: UK_STRINGS.creation.eventForm.colorBrand },
  ];

  return (
    <ModalSheet
      isOpen={Boolean(event)}
      title={UK_STRINGS.timeline.eventDetailsModalTitle}
      subtitle={isWorkShift ? 'Робоча зміна' : 'Подія календаря'}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => void handleSave(e)}
        className="space-y-4"
        data-testid="event-detail-sheet-form"
      >
        {errorMessage && (
          <FeedbackBanner
            tone="error"
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
          />
        )}

        <InputField
          id="edit-event-title"
          label={UK_STRINGS.creation.eventForm.titleLabel}
          data-testid="edit-event-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {event.schedule.kind === 'timed' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <DateField
                id="edit-event-start-date"
                label={UK_STRINGS.creation.eventForm.startDateLabel}
                data-testid="edit-event-start-date-input"
                value={startLocalDate}
                onChange={(e) => setStartLocalDate(e.target.value)}
              />
              <TimeField
                id="edit-event-start-time"
                label={UK_STRINGS.creation.eventForm.startTimeLabel}
                data-testid="edit-event-start-time-input"
                value={startLocalTime}
                onChange={(e) => setStartLocalTime(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DateField
                id="edit-event-end-date"
                label={UK_STRINGS.creation.eventForm.endDateLabel}
                data-testid="edit-event-end-date-input"
                value={endLocalDate}
                onChange={(e) => setEndLocalDate(e.target.value)}
              />
              <TimeField
                id="edit-event-end-time"
                label={UK_STRINGS.creation.eventForm.endTimeLabel}
                data-testid="edit-event-end-time-input"
                value={endLocalTime}
                onChange={(e) => {
                  const nextEnd = e.target.value;
                  setEndLocalTime(nextEnd);
                  const sug = suggestEndDateForClockRange(
                    startLocalDate,
                    startLocalTime,
                    nextEnd
                  );
                  if (sug.isOvernightSuggestion) {
                    setEndLocalDate(sug.suggestedEndLocalDate);
                  }
                }}
              />
            </div>

            {clockSuggestion?.isOvernightSuggestion &&
              endLocalDate > startLocalDate && (
                <div
                  className="text-[12px] font-medium"
                  style={{ color: 'var(--color-work-text)' }}
                >
                  {UK_STRINGS.creation.eventForm.overnightSuggestedBadge}:{' '}
                  {formatDate(startLocalDate)} {startLocalTime} → {formatDate(endLocalDate)}{' '}
                  {endLocalTime}
                </div>
              )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <DateField
              id="edit-allday-start-date"
              label={UK_STRINGS.creation.eventForm.startDateLabel}
              value={startLocalDate}
              onChange={(e) => setStartLocalDate(e.target.value)}
            />
            <DateField
              id="edit-allday-end-date"
              label={UK_STRINGS.creation.eventForm.allDayEndInclusiveLabel}
              value={endLocalDate}
              onChange={(e) => setEndLocalDate(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            id="edit-event-color"
            label={UK_STRINGS.creation.eventForm.colorLabel}
            options={colorOptions}
            value={color}
            onChange={(e) => setColor(e.target.value as EventPaletteColor)}
          />

          <Row
            title={UK_STRINGS.creation.eventForm.blockingLabel}
            trailing={
              <Toggle
                label={UK_STRINGS.creation.eventForm.blockingLabel}
                checked={isBlocking}
                onChange={setIsBlocking}
              />
            }
          />
        </div>

        <TextAreaField
          id="edit-event-note"
          label={UK_STRINGS.creation.eventForm.noteLabel}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {candidateConflictReport?.hasConflicts &&
          candidateConflictReport.warningMessageUk && (
            <div
              className="p-3 rounded-xl space-y-2 text-[12px]"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--color-brand)',
              }}
            >
              <div
                className="font-medium"
                style={{ color: 'var(--color-brand-text)' }}
              >
                {candidateConflictReport.warningMessageUk}
              </div>
              <Row
                title={UK_STRINGS.creation.eventForm.confirmConsciousOverlapLabel}
                trailing={
                  <Toggle
                    label={UK_STRINGS.creation.eventForm.confirmConsciousOverlapLabel}
                    checked={confirmOverlap}
                    onChange={setConfirmOverlap}
                  />
                }
              />
            </div>
          )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="danger"
            onClick={() => void handleCancelRecord()}
            disabled={isSaving}
            data-testid="event-detail-cancel-record-button"
          >
            Скасувати запис
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {UK_STRINGS.app.closeButton}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSaving}
              data-testid="event-detail-save-button"
            >
              {UK_STRINGS.app.saveButton}
            </Button>
          </div>
        </div>
      </form>
    </ModalSheet>
  );
}
