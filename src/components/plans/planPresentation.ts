import { formatShortDate } from "../../lib/format";

import { Goal, Project, Task } from "../../domain/types";

export function formatTaskDeadline(deadline: Task["deadline"]): string {
  if (!deadline) return "";
  if (deadline.kind === "date_only") return formatShortDate(deadline.localDate);
  return formatShortDate(deadline.instant.slice(0, 10));
}

export function pluralizeProjects(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} проєкт`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return `${count} проєкти`;
  return `${count} проєктів`;
}

export function pluralizeTasks(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} завдання`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return `${count} завдання`;
  return `${count} завдань`;
}

const MONTH_NAMES_SHORT_UK = [
  "Січ",
  "Лют",
  "Бер",
  "Кві",
  "Тра",
  "Чер",
  "Лип",
  "Сер",
  "Вер",
  "Жов",
  "Лис",
  "Гру",
];

export const USER_GLYPHS: Array<{ key: string; label: string }> = [
  { key: "folder", label: "Папка" },
  { key: "target", label: "Ціль" },
  { key: "laptop", label: "Ноутбук" },
  { key: "sprout", label: "Паросток" },
  { key: "palm", label: "Пальма" },
  { key: "camera", label: "Камера" },
  { key: "books", label: "Книги" },
  { key: "rocket", label: "Ракета" },
  { key: "music", label: "Музика" },
  { key: "plane", label: "Літак" },
  { key: "star", label: "Зірка" },
  { key: "gift", label: "Подарунок" },
  { key: "heart", label: "Серце" },
  { key: "home", label: "Дім" },
];

export const ICON_LABELS_UK: Record<string, string> = Object.fromEntries(
  USER_GLYPHS.map((g) => [g.key, g.label]),
);

export const STATE_LABELS_PROJECT: Record<Project["state"], string> = {
  active: "Активний",
  idea: "Ідея",
  paused: "На паузі",
  completed: "Завершений",
};

export const STATE_LABELS_GOAL: Record<Goal["state"], string> = {
  active: "Активна",
  idea: "Ідея",
  paused: "На паузі",
  completed: "Завершена",
};

export const STATE_ORB_HUE: Record<
  Project["state"],
  "pink" | "yellow" | "purple" | "mint"
> = {
  active: "pink",
  idea: "yellow",
  paused: "purple",
  completed: "mint",
};

export function addMonthsToYearMonth(
  baseYear: number,
  baseMonth0: number,
  deltaMonths: number,
) {
  const total = baseYear * 12 + baseMonth0 + deltaMonths;
  const year = Math.floor(total / 12);
  const month0 = ((total % 12) + 12) % 12;
  return {
    year,
    month0,
    key: `${year}-${String(month0 + 1).padStart(2, "0")}`,
    shortLabel: MONTH_NAMES_SHORT_UK[month0],
    fullLabel: `${MONTH_NAMES_SHORT_UK[month0]} ${year}`,
    startMs: Date.UTC(year, month0, 1, 0, 0, 0),
    endMs: Date.UTC(year, month0 + 1, 0, 23, 59, 59, 999),
  };
}
