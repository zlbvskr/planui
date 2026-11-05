import { projectScheduleForDate } from "../../domain/scheduling";
import type { CalendarEvent, Task, TaskReservation } from "../../domain/types";
self.onmessage = (
  message: MessageEvent<{
    index: number;
    date: string;
    zone: string;
    events: CalendarEvent[];
    tasks: Task[];
    reservations: TaskReservation[];
    released: boolean;
  }>,
) => {
  const { index, date, zone, events, tasks, reservations, released } =
    message.data;
  self.postMessage({
    index,
    projection: projectScheduleForDate({
      localDate: date,
      displayZone: zone,
      events,
      tasks,
      reservations,
      dayOffAnnotations: [],
      includeReleasedReservations: released,
    }),
  });
};
