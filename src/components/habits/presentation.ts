import { createContext } from "react";
/** Optional view metadata; never stored in habits or included in backups. */
export const HabitPresentationContext = createContext<
  Record<string, { durationMinutes?: number; hue?: string }>
>({});
