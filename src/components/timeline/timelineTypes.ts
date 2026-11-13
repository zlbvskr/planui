import type { UnoccupiedTimeGap } from "../../domain/availability";

import type { ProjectedDaySchedule } from "../../domain/scheduling";

import type {
  CalendarEvent,
  DailyPlan,
  DayOffAnnotation,
  EntityId,
  Folder,
  Goal,
  LifeAreaAssessment,
  LifeAreaQuestion,
  Project,
  Task,
  TaskReservation,
} from "../../domain/types";

export interface SharedDayTimelineHandle {
  scrollToDay: (date: string, behavior?: "smooth" | "auto") => void;
}

export interface SharedDayTimelineProps {
  folders?: readonly Folder[];
  projects?: readonly Project[];
  goals?: readonly Goal[];
  lifeAreas?: readonly LifeAreaQuestion[];
  assessments?: readonly LifeAreaAssessment[];
  dayOffAnnotations?: readonly DayOffAnnotation[];
  plan?: DailyPlan;
  plans?: Record<string, DailyPlan>;
  onDayInView?: (date: string) => void;
  testIdPrefix: string;
  projection: ProjectedDaySchedule;
  projectionWithReleased?: ProjectedDaySchedule;
  nowMs: number;
  events: readonly CalendarEvent[];
  tasks: readonly Task[];
  reservations: readonly TaskReservation[];
  onToggleTaskState: (taskId: EntityId) => Promise<void> | void;
  onCancelEvent: (eventId: EntityId, revision: number) => Promise<void> | void;
  onInspectEvent: (event: CalendarEvent) => void;
  onOpenGapPicker: (gap: UnoccupiedTimeGap) => void;
  onEmptyCreateAction?: () => void;
  emptyActionLabel?: string;
  compactMode?: boolean;
  onInspectHabitSession?: (reservation: TaskReservation) => void;
  onInspectTask?: (task: Task, reservationId?: string) => void;
}
