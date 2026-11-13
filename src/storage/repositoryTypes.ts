import {
  CalendarEvent,
  DayOffAnnotation,
  EntityId,
  IsoInstantString,
  Task,
  TaskReservation,
} from "../domain/types";

export interface TaskLifecycleUndoToken {
  taskId: EntityId;
  previousTaskSnapshot: Task;
  postActionTaskRevision: number;
  previousReservationsSnapshot: TaskReservation[];
  postActionReservationRevisions: Record<EntityId, number>;
}

export interface RosterBatchUndoToken {
  createdAt: IsoInstantString;
  eventMutations: {
    id: EntityId;
    previousSnapshot: CalendarEvent | null;
    postBatchRevision: number | null;
  }[];
  dayOffMutations: {
    id: EntityId;
    previousSnapshot: DayOffAnnotation | null;
    postBatchRevision: number | null;
  }[];
}
