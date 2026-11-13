import {
  CalendarEvent,
  DayOffAnnotation,
  Folder,
  Goal,
  LifeAreaQuestion,
  OptionalModulesSettings,
  Project,
  ProjectStage,
  ShiftTemplate,
  SupportedCurrencyCode,
  Task,
  TaskReservation,
  WishlistCategory,
} from "../../domain/types";

import { AnyDestinationId } from "../../i18n/uk";

import {
  DestinationContextMap,
  EditableCreationContext,
  ImplementedCreationActionKind,
} from "../../state/shellStore";

import { PlanuiRepositories } from "../../storage/repositories";

export interface SharedEditorHostProps {
  globalQuickAdd?: boolean;
  isOpen: boolean;
  activeDestination: AnyDestinationId;
  contexts: DestinationContextMap;
  initialContext: EditableCreationContext & {
    areaId?: string;
    targetTime?: string;
  };
  initialActionKind?: ImplementedCreationActionKind;
  enabledModules?: OptionalModulesSettings;
  activeZone: string;
  folders: readonly Folder[];
  goals: readonly Goal[];
  projects: readonly Project[];
  stages: readonly ProjectStage[];
  tasks: readonly Task[];
  reservations: readonly TaskReservation[];
  events: readonly CalendarEvent[];
  shiftTemplates: readonly ShiftTemplate[];
  dayOffAnnotations?: readonly DayOffAnnotation[];
  lifeAreaQuestions?: readonly LifeAreaQuestion[];
  wishlistCategories: readonly WishlistCategory[];
  preferredWishlistCurrency: SupportedCurrencyCode | null;
  repositories: PlanuiRepositories;
  onClose: () => void;
  onEntityCreated: (
    toastMessageUk: string,
    undoFn?: () => void,
  ) => Promise<void> | void;
}

export type InlineChipKey =
  | "area"
  | "folder"
  | "measure"
  | "icon"
  | "datetime"
  | "duration"
  | "effort"
  | "project"
  | "frequency"
  | "minimum"
  | "project_deadline"
  | "goal_term"
  | "wish_price"
  | "wish_group"
  | "shift_template"
  | "shift_dates"
  | "shift_repeat";
