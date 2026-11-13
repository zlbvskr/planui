import React from "react";
import {
  buildDayOffAnnotationRecord,
  instantiateWorkShiftFromTemplate,
} from "../../domain/roster";
import {
  CalendarEvent,
  DayOffAnnotation,
  ShiftTemplate,
} from "../../domain/types";
import type { PlanuiRepositories } from "../../storage/repositories";

interface StampRosterDateContext {
  stampTool: string;
  allShiftTemplates: readonly ShiftTemplate[];
  events: readonly CalendarEvent[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  activeZone: string;
  areaId: string;
  title: string;
  folderId: string;
  repositories: PlanuiRepositories;
  setHasStampedAny: React.Dispatch<React.SetStateAction<boolean>>;
  onEntityCreated: (
    toastMessageUk: string,
    undoFn?: () => void,
  ) => Promise<void> | void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function stampRosterDate(
  {
    stampTool,
    allShiftTemplates,
    events,
    dayOffAnnotations,
    activeZone,
    areaId,
    title,
    folderId,
    repositories,
    setHasStampedAny,
    onEntityCreated,
    setError,
  }: StampRosterDateContext,
  localDate: string,
) {
  if (!stampTool) return;
  const nowIso = new Date().toISOString();
  try {
    const selectedTpl = allShiftTemplates.find((t) => t.id === stampTool);
    if (stampTool !== "day_off" && !selectedTpl) return;

    const existingShiftsOnDay = events.filter(
      (e) =>
        e.state === "active" &&
        e.type === "work_shift" &&
        e.schedule.kind === "timed" &&
        e.schedule.interval.originStartLocalDate === localDate,
    );
    const existingDayOff = dayOffAnnotations.find(
      (d) => d.localDate === localDate,
    );

    const eventsToSave: CalendarEvent[] = [];
    const dayOffAnnotationsToSave: DayOffAnnotation[] = [];
    const eventIdsToDelete: string[] = [];
    const dayOffAnnotationIdsToDelete: string[] = [];

    if (stampTool === "day_off") {
      if (existingDayOff) {
        dayOffAnnotationIdsToDelete.push(existingDayOff.id);
      } else {
        const ann = buildDayOffAnnotationRecord({
          id: `dayoff-${localDate}`,
          localDate,
          sourceZone: activeZone,
          code: "В",
          note: null,
          nowIso,
        });
        dayOffAnnotationsToSave.push({
          ...ann,
          areaId: areaId || null,
        });
      }
    } else if (selectedTpl) {
      const sameTplShift = existingShiftsOnDay.find(
        (e) => e.workProperties?.sourceTemplateId === selectedTpl.id,
      );
      if (sameTplShift && existingShiftsOnDay.length === 1) {
        eventIdsToDelete.push(sameTplShift.id);
      } else {
        for (const oldShift of existingShiftsOnDay) {
          eventIdsToDelete.push(oldShift.id);
        }
        const { event: builtEv } = instantiateWorkShiftFromTemplate({
          id: `shift-${localDate}-${selectedTpl.id}-${Date.now()}`,
          template: selectedTpl,
          startLocalDate: localDate,
          zoneId: activeZone,
          nowIso,
        });
        eventsToSave.push({
          ...builtEv,
          title: title.trim() || builtEv.title,
          areaId: areaId || selectedTpl.areaId || null,
          lifeAreaId: areaId || selectedTpl.areaId || null,
          folderId: folderId || null,
        });
      }
    }

    if (
      eventsToSave.length > 0 ||
      dayOffAnnotationsToSave.length > 0 ||
      eventIdsToDelete.length > 0 ||
      dayOffAnnotationIdsToDelete.length > 0
    ) {
      await repositories.applyRosterBatchTransactionally(
        {
          eventsToSave,
          dayOffAnnotationsToSave,
          eventIdsToDelete,
          dayOffAnnotationIdsToDelete,
        },
        nowIso,
      );
      setHasStampedAny(true);
      await onEntityCreated("");
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не вдалося оновити зміну.");
  }
}

import { addDaysToLocalDate } from "../../domain/temporal";
import { InlineChipKey } from "./editorTypes";

interface ApplyRosterCycleContext {
  allShiftTemplates: readonly ShiftTemplate[];
  stampTool: string;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  cycleWorkDays: number;
  cycleOffDays: number;
  cycleStartDate: string;
  cycleUntilDate: string;
  events: readonly CalendarEvent[];
  activeZone: string;
  title: string;
  areaId: string;
  folderId: string;
  dayOffAnnotations: readonly DayOffAnnotation[];
  repositories: PlanuiRepositories;
  setHasStampedAny: React.Dispatch<React.SetStateAction<boolean>>;
  setOpenChip: React.Dispatch<React.SetStateAction<InlineChipKey | null>>;
  onEntityCreated: (
    toastMessageUk: string,
    undoFn?: () => void,
  ) => Promise<void> | void;
}

export async function applyRosterCycle({
  allShiftTemplates,
  stampTool,
  setBusy,
  setError,
  cycleWorkDays,
  cycleOffDays,
  cycleStartDate,
  cycleUntilDate,
  events,
  activeZone,
  title,
  areaId,
  folderId,
  dayOffAnnotations,
  repositories,
  setHasStampedAny,
  setOpenChip,
  onEntityCreated,
}: ApplyRosterCycleContext) {
  const selectedTpl =
    allShiftTemplates.find((t) => t.id === stampTool) ?? allShiftTemplates[0];
  if (!selectedTpl) return;
  setBusy(true);
  setError(null);
  const nowIso = new Date().toISOString();
  try {
    const eventsToSave: CalendarEvent[] = [];
    const dayOffAnnotationsToSave: DayOffAnnotation[] = [];
    const eventIdsToDelete: string[] = [];
    const workCount = Math.max(1, Math.min(14, cycleWorkDays));
    const offCount = Math.max(1, Math.min(14, cycleOffDays));
    const cycleLen = workCount + offCount;
    let cursor = cycleStartDate;
    let safety = 0;
    while (cursor <= cycleUntilDate && safety < 120) {
      const pos = safety % cycleLen;
      if (pos < workCount) {
        for (const oldShift of events.filter(
          (e) =>
            e.state === "active" &&
            e.type === "work_shift" &&
            e.schedule.kind === "timed" &&
            e.schedule.interval.originStartLocalDate === cursor,
        )) {
          if (!eventIdsToDelete.includes(oldShift.id)) {
            eventIdsToDelete.push(oldShift.id);
          }
        }
        const { event: builtEv } = instantiateWorkShiftFromTemplate({
          id: `shift-${cursor}-${selectedTpl.id}-${safety}-${Date.now()}`,
          template: selectedTpl,
          startLocalDate: cursor,
          zoneId: activeZone,
          nowIso,
        });
        eventsToSave.push({
          ...builtEv,
          title: title.trim() || builtEv.title,
          areaId: areaId || selectedTpl.areaId || null,
          lifeAreaId: areaId || selectedTpl.areaId || null,
          folderId: folderId || null,
        });
      } else {
        const existingDayOff = dayOffAnnotations.find(
          (d) => d.localDate === cursor,
        );
        const ann = buildDayOffAnnotationRecord({
          id: existingDayOff?.id ?? `dayoff-${cursor}`,
          localDate: cursor,
          sourceZone: activeZone,
          code: "В",
          note: null,
          nowIso,
        });
        dayOffAnnotationsToSave.push({
          ...ann,
          revision: existingDayOff ? existingDayOff.revision + 1 : 1,
          areaId: areaId || null,
        });
      }
      cursor = addDaysToLocalDate(cursor, 1);
      safety++;
    }

    if (eventsToSave.length > 0 || dayOffAnnotationsToSave.length > 0) {
      const res = await repositories.applyRosterBatchTransactionally(
        {
          eventsToSave,
          dayOffAnnotationsToSave,
          eventIdsToDelete,
        },
        nowIso,
      );
      setHasStampedAny(true);
      setOpenChip(null);
      await onEntityCreated("Додано", () => {
        void repositories
          .undoRosterBatchTransactionally(
            res.undoToken,
            new Date().toISOString(),
          )
          .then(() => onEntityCreated(""));
      });
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не вдалося заповнити цикл.");
  } finally {
    setBusy(false);
  }
}
