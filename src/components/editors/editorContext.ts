import { type Icon3DName } from "../../ui/Icon3D";

import { type UserGlyphName as UserIconKey } from "../../domain/modelHelpers";

import { formatInstantInZone } from "../../domain/temporal";

import { Folder, FolderKind } from "../../domain/types";

import { AnyDestinationId } from "../../i18n/uk";

import {
  DestinationContextMap,
  ImplementedCreationActionKind,
} from "../../state/shellStore";

export const MONTH_NAMES_NOMINATIVE_UK = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
] as const;

export const USER_GLYPHS: readonly { key: UserIconKey; label: string }[] = [
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
] as const;

interface TypeCreationMeta {
  menuLabel: string;
  hint: string;
  ctaLabel: string;
  placeholder: string;
  iconName: Icon3DName;
  iconColor: string;
}

export const TYPE_CREATION_META: Record<
  ImplementedCreationActionKind,
  TypeCreationMeta
> = {
  task: {
    menuLabel: "Нове завдання",
    hint: "Справа з датою або без",
    ctaLabel: "Додати завдання",
    placeholder: "Що потрібно зробити?",
    iconName: "check",
    iconColor: "var(--color-mint)",
  },
  event: {
    menuLabel: "Нова подія",
    hint: "Зустріч чи день народження",
    ctaLabel: "Додати подію",
    placeholder: "Назва події",
    iconName: "calendar",
    iconColor: "var(--color-blue)",
  },
  shift: {
    menuLabel: "Нова зміна",
    hint: "Денна або нічна",
    ctaLabel: "Додати зміну",
    placeholder: "Назва зміни",
    iconName: "sun",
    iconColor: "var(--color-yellow)",
  },
  habit: {
    menuLabel: "Нова звичка",
    hint: "Щоденна чи за розкладом",
    ctaLabel: "Додати звичку",
    placeholder: "Назва звички",
    iconName: "repeat",
    iconColor: "var(--color-pink)",
  },
  folder: {
    menuLabel: "Нова папка",
    hint: "Для проєктів і завдань",
    ctaLabel: "Додати папку",
    placeholder: "Назва папки",
    iconName: "folder",
    iconColor: "var(--color-coral)",
  },
  project: {
    menuLabel: "Новий проєкт",
    hint: "Робота з кінцем і метою",
    ctaLabel: "Додати проєкт",
    placeholder: "Назва проєкту",
    iconName: "folder",
    iconColor: "var(--color-purple)",
  },
  goal: {
    menuLabel: "Нова ціль",
    hint: "З терміном і етапами",
    ctaLabel: "Додати ціль",
    placeholder: "Назва цілі",
    iconName: "target",
    iconColor: "var(--color-pink)",
  },
  wish: {
    menuLabel: "Нове бажання",
    hint: "Те, що хочу придбати",
    ctaLabel: "Додати бажання",
    placeholder: "Що хочеться придбати?",
    iconName: "gift",
    iconColor: "var(--color-pink)",
  },
  day_off: {
    menuLabel: "Вихідний",
    hint: "День відпочинку",
    ctaLabel: "Додати вихідний",
    placeholder: "Назва вихідного",
    iconName: "sun",
    iconColor: "var(--color-mint)",
  },
  inspiration: {
    menuLabel: "Натхнення",
    hint: "Нотатка для себе",
    ctaLabel: "Додати нотатку",
    placeholder: "Нотатка",
    iconName: "heart",
    iconColor: "var(--color-purple)",
  },
  personal_record: {
    menuLabel: "Запис",
    hint: "Особистий результат",
    ctaLabel: "Додати запис",
    placeholder: "Назва запису",
    iconName: "star",
    iconColor: "var(--color-yellow)",
  },
  stage: {
    menuLabel: "Новий етап",
    hint: "Крок проєкту чи цілі",
    ctaLabel: "Додати етап",
    placeholder: "Назва етапу",
    iconName: "target",
    iconColor: "var(--color-blue)",
  },
  wishlist_category: {
    menuLabel: "Група бажань",
    hint: "Категорія покупок",
    ctaLabel: "Додати групу",
    placeholder: "Назва групи",
    iconName: "gift",
    iconColor: "var(--color-pink)",
  },
};

export function todayLocalDateInZone(zone: string): string {
  try {
    return formatInstantInZone(Date.now(), zone).localDate;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function flattenFoldersForSelect(
  folders: readonly Folder[],
): { folder: Folder; depth: number }[] {
  const byParent = new Map<string | null, Folder[]>();
  const validIds = new Set(folders.map((f) => f.id));
  for (const f of folders) {
    const pid = f.parentId && validIds.has(f.parentId) ? f.parentId : null;
    const list = byParent.get(pid) ?? [];
    list.push(f);
    byParent.set(pid, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  const out: { folder: Folder; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (pid: string | null, depth: number) => {
    for (const f of byParent.get(pid) ?? []) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function getContextTypes(
  activeDestination: AnyDestinationId,
  contexts: DestinationContextMap,
): ImplementedCreationActionKind[] {
  if (activeDestination === "calendar") {
    return ["event", "shift", "task"];
  }

  if (activeDestination === "directions" || activeDestination === "plans") {
    const subMode =
      (contexts.directions ?? contexts.plans)?.subMode ?? "projects";
    if (subMode === "goals") {
      return ["goal"];
    }
    return ["folder", "project", "task"];
  }

  if (activeDestination === "me") {
    if (contexts.me.subView === "wishlist") {
      return ["wish", "folder"];
    }
    return ["task", "habit", "wish"];
  }
  return ["task", "event", "shift", "habit"];
}

export function getDefaultContextType(
  activeDestination: AnyDestinationId,
  contexts: DestinationContextMap,
  availableTypes: readonly ImplementedCreationActionKind[],
  initialActionKind?: ImplementedCreationActionKind,
): ImplementedCreationActionKind {
  if (initialActionKind) {
    return initialActionKind;
  }
  if (activeDestination === "directions" || activeDestination === "plans") {
    const context = contexts.directions ?? contexts.plans;
    if (context.activeProjectId && availableTypes.includes("task"))
      return "task";
    if (context.subMode === "goals") return "goal";
    if (context.activeFolderId && availableTypes.includes("project"))
      return "project";
  }
  if (
    (activeDestination === "today" || activeDestination === "habits") &&
    contexts.today.mode === "habits" &&
    availableTypes.includes("habit")
  ) {
    return "habit";
  }
  return availableTypes[0] ?? "task";
}

export function getFolderKindForType(
  type: ImplementedCreationActionKind,
  activeDestination: AnyDestinationId,
  contexts: DestinationContextMap,
): FolderKind {
  if (type === "habit") return "habits";
  if (type === "wish") return "wishes";
  if (type === "project" || type === "goal") return "projects";
  if (type === "folder") {
    if (activeDestination === "me" && contexts.me.subView === "wishlist") {
      return "wishes";
    }
    if (activeDestination === "today" && contexts.today.mode === "habits") {
      return "habits";
    }
    if (activeDestination === "directions" || activeDestination === "plans") {
      return "projects";
    }
  }
  return "tasks";
}

export function supportsMeasure(type: ImplementedCreationActionKind): boolean {
  return (
    type === "task" ||
    type === "habit" ||
    type === "goal" ||
    type === "project" ||
    type === "wish"
  );
}
