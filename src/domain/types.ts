

export const PLANUI_APP_VERSION = '1.0.0';
export const PLANUI_DB_SCHEMA_VERSION = 1;
export const PLANUI_BACKUP_FORMAT = 'planui-backup' as const;
export const PLANUI_BACKUP_VERSION = 1;

export type EntityId = string;
export type IsoInstantString = string;
export type LocalDateString = string;
export type LocalTimeString = string;
export type IanaTimeZone = string;

export interface ZonedInterval {
  startInstant: IsoInstantString;
  endInstant: IsoInstantString;
  originZone: IanaTimeZone;
  originStartLocalDate: LocalDateString;
  originStartLocalTime: LocalTimeString;
  originEndLocalDate: LocalDateString;
  originEndLocalTime: LocalTimeString;
}

interface MeasureLogEntry {
  ts: IsoInstantString;
  delta: number;
}

export interface Measure {
  direction?: 'more' | 'less';
  unit: string;
  target?: number | null;
  current: number;
  log: MeasureLogEntry[];
}

export type FolderKind = 'tasks' | 'habits' | 'projects' | 'wishes';

export interface Folder {
  id: EntityId;
  kind?: FolderKind;
  name: string;
  parentId: EntityId | null;
  areaId?: EntityId | null;
  lifeAreaId?: EntityId | null;
  iconKey?: string | null;
  isDemo?: boolean;
  order: number;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

/**
 * M1 / PLANUI-LIFE-ALIGNMENT-1: Goal & Project Planning States
 * States: idea | active | paused | completed.
 * Archiving is a separate boolean orthogonal flag; cancelling is distinct.
 */
export type PlanningEntityState = 'idea' | 'active' | 'paused' | 'completed';
type GoalState = PlanningEntityState;
type ProjectResultState = PlanningEntityState;

export type RoadmapPeriod =
  | { precision: 'month'; month: string }
  | { precision: 'quarter'; year: number; quarter: 1 | 2 | 3 | 4 }
  | { precision: 'range'; startDate: LocalDateString; endDateExclusive: LocalDateString };

interface RoadmapCheckpoint {
  id: EntityId;
  title: string;
  localDate: LocalDateString | null;
  order: number;
}

export interface RoadmapMetadata {
  roadmapPeriod?: RoadmapPeriod | null;
  checkpoints?: RoadmapCheckpoint[];
}

export type RoadmapOwner = { kind: 'goal' | 'project' | 'stage'; id: EntityId };
export type RoadmapLayer = 'hidden' | 'key_dates' | 'periods';

interface GoalTimingMetadata {
  targetDate: LocalDateString | null;
  targetPeriodUk: string | null;
}

export interface Goal extends RoadmapMetadata {
  id: EntityId;
  title: string;
  description: string | null;
  purposeUk: string | null; // "Навіщо це мені"
  whyUk?: string | null;
  completionCriteriaUk: string | null; // "Як я зрозумію, що ціль досягнуто"
  definitionOfDoneUk?: string | null;
  nextActionTaskId: EntityId | null; // посилання на канонічну справу
  nextStepUk?: string | null;
  timing: GoalTimingMetadata | null;
  termStart?: LocalDateString | null;
  termEnd?: LocalDateString | null;
  horizon?: string | null;
  folderId: EntityId | null; // прив'язка до напряму (папки)
  areaId?: EntityId | null;
  lifeAreaId: EntityId | null; // пряма прив'язка до сфери життя
  implementationIntentionUk: string | null; // "Якщо..., то..."
  ifThenPlanUk?: string | null;
  measure?: Measure | null;
  iconKey?: string | null;
  icon?: string | null;
  isDemo?: boolean;
  state: GoalState;
  archived: boolean;
  order: number;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  completedAt: IsoInstantString | null;
  revision: number;
}

export interface Project extends RoadmapMetadata {
  id: EntityId;
  title: string;
  description: string | null;
  desiredOutcome: string | null;
  completionCriteria: string | null;
  targetDate: LocalDateString | null;
  horizon?: string | null;
  folderId: EntityId | null;
  goalId?: EntityId | null; // M1: опціональне посилання на ціль
  areaId?: EntityId | null;
  lifeAreaId: EntityId | null;
  measure?: Measure | null;
  iconKey?: string | null;
  icon?: string | null;
  isDemo?: boolean;
  order?: number;
  collaboratorText: string | null;
  purposeUk?: string | null; // M1: сенс / мета
  whyUk?: string | null;
  completionCriteriaUk?: string | null; // M1: критерії завершення
  definitionOfDoneUk?: string | null;
  nextActionTaskId?: EntityId | null; // M1: канонічна справа наступного кроку
  nextStepUk?: string | null;
  implementationIntentionUk?: string | null; // "Якщо - то"
  ifThenPlanUk?: string | null;
  state: ProjectResultState;
  archived: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  completedAt: IsoInstantString | null;
  revision: number;
}

export interface ProjectStage extends RoadmapMetadata {
  dependsOnStageIds?: EntityId[];
  id: EntityId;
  projectId: EntityId | null;
  goalId?: EntityId | null;
  title: string;
  expectedOutcome: string | null;
  targetDate: LocalDateString | null;
  isDemo?: boolean;
  order: number;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export type TaskState = 'open' | 'completed' | 'canceled';
export type TaskPriority = 'high' | 'normal' | 'low';
type TaskPlanningState = 'unplanned' | 'date_only' | 'timed';
export type TaskEffort = 'small' | 'medium' | 'large';
export type TodayMode = 'day' | 'tasks' | 'habits';
export interface DailyPlan {
  focusTaskIds: EntityId[];
  focusNoteUk: string | null;
  minimalDay: boolean;
}

type TaskDeadline =
  | { kind: 'date_only'; localDate: LocalDateString }
  | { kind: 'exact_instant'; instant: IsoInstantString; zoneId: IanaTimeZone };


export type TaskOwnership =
  | { kind: 'standalone'; folderId?: EntityId | null }
  | { kind: 'folder'; folderId: EntityId }
  | { kind: 'goal'; goalId: EntityId }
  | { kind: 'project'; projectId: EntityId; stageId: EntityId | null };

interface ChecklistItem {
  id: EntityId;
  title: string;
  order: number;
  completed: boolean;
}

export interface Task {
  areaId?: EntityId | null;
  lifeAreaId?: EntityId | null;
  folderId?: EntityId | null;
  order?: number;
  measure?: Measure | null;
  effort?: TaskEffort | null;
  id: EntityId;
  title: string;
  description: string | null;
  state: TaskState;
  priority: TaskPriority;
  deadline: TaskDeadline | null;
  estimatedDurationMinutes: number | null;
  planningState: TaskPlanningState;
  plannedDate: LocalDateString | null;
  ownership: TaskOwnership;
  checklist: ChecklistItem[];
  isDemo?: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  completedAt: IsoInstantString | null;
  canceledAt: IsoInstantString | null;
  revision: number;
}

type ReservationState = 'active' | 'released' | 'canceled';
export type ReservationReleaseReason =
  | 'task_completed'
  | 'task_canceled'
  | 'manual_unplan'
  | 'project_archived'
  | 'habit_completed'
  | 'habit_skipped';

interface ReservationReleaseMetadata {
  releasedAt: IsoInstantString;
  reason: ReservationReleaseReason;
  originalStartInstant: IsoInstantString;
  originalEndInstant: IsoInstantString;
}

export interface TaskReservation {
  id: EntityId;
  taskId: EntityId | null;
  habitOccurrence?: { entryId: EntityId; habitId: EntityId; localDate: LocalDateString } | null;
  interval: ZonedInterval;
  state: ReservationState;
  releaseMetadata: ReservationReleaseMetadata | null;
  isDemo?: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

type CalendarEventType = 'personal' | 'work_shift' | 'rest' | 'sleep' | 'travel';
export type EventPaletteColor = 'brand' | 'work' | 'dayoff' | 'personal' | 'reservation' | 'rest';
type CalendarEventState = 'active' | 'canceled';

export type EventTemporalSchedule =
  | {
      kind: 'timed';
      interval: ZonedInterval;
    }
  | {
      kind: 'all_day';
      startLocalDate: LocalDateString;
      endLocalDateExclusive: LocalDateString;
      originZone: IanaTimeZone;
    };

interface WorkShiftProperties {
  shiftName: string;
  shiftCode: string | null;
  sourceTemplateId: EntityId | null;
}

export interface CalendarEvent {
  areaId?: EntityId | null;
  lifeAreaId?: EntityId | null;
  folderId?: EntityId | null;
  order?: number;
  id: EntityId;
  title: string;
  note: string | null;
  type: CalendarEventType;
  color: EventPaletteColor;
  schedule: EventTemporalSchedule;
  isBlocking: boolean;
  state: CalendarEventState;
  workProperties: WorkShiftProperties | null;
  isDemo?: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export interface ShiftTemplate {
  id: EntityId;
  name: string;
  start?: LocalTimeString;
  end?: LocalTimeString;
  kind?: 'day' | 'night';
  areaId?: EntityId | null;
  folderId?: EntityId | null;
  order?: number;
  code: string;
  startLocalTime: LocalTimeString;
  endLocalTime: LocalTimeString;
  endDateOffsetDays: 0 | 1;
  color: EventPaletteColor;
  note: string | null;
  isDemo?: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export interface DayOffAnnotation {
  areaId?: EntityId | null;
  folderId?: EntityId | null;
  order?: number;
  id: EntityId;
  localDate: LocalDateString;
  sourceZone: IanaTimeZone;
  code: string | null;
  note: string | null;
  isDemo?: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export type HabitLifecycleState = 'active' | 'paused' | 'archived';

export type HabitFrequencyRule =
  | { kind: 'daily' }
  | { kind: 'days_off' }
  | { kind: 'selected_weekdays'; weekdaysIso: number[] }
  | { kind: 'weekly_frequency'; timesPerWeek: number };

export type HabitTargetSpec =
  | { kind: 'binary' }
  | { kind: 'numeric'; targetValue: number; unitUk: string };

export interface HabitRuleRevision {
  id: EntityId;
  effectiveFromLocalDate: LocalDateString;
  rule: HabitFrequencyRule;
  target: HabitTargetSpec;
  createdAt: IsoInstantString;
}

export interface Habit {
  areaId?: EntityId | null;
  order?: number;
  measure?: Measure | null;
  minimumVersionUk?: string | null;
  contextCueUk?: string | null;
  reminderIntentionUk?: string | null;
  folderId?: EntityId | null;
  id: EntityId;
  name: string;
  description: string | null;
  icon: string | null;
  lifeAreaId: EntityId | null;
  projectId: EntityId | null;
  state: HabitLifecycleState;
  ruleRevisions: HabitRuleRevision[];
  isDemo?: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export type HabitEntryStatus = 'completed' | 'partial' | 'skipped' | 'no_entry';

export interface HabitEntry {
  ruleSnapshot?: HabitRuleRevision;
  dayOffSnapshot?: boolean;
  minimumCompletedUk?: string | null;
  id: EntityId;
  habitId: EntityId;
  localDate: LocalDateString;
  status: HabitEntryStatus;
  numericValue: number | null;
  note: string | null;
  isDemo?: boolean;
  recordedAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export type Scale1To5 = 1 | 2 | 3 | 4 | 5;
export type Scale1To10 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface PersonalRecord {
  scaleVersion?: 1;
  sleepMinutes?: number | null;
  sleepQuality?: Scale1To5 | null;
  id: EntityId;
  recordedAt: IsoInstantString;
  localDate: LocalDateString;
  zoneId: IanaTimeZone;
  text: string | null;
  mood: Scale1To5 | null;
  energy: Scale1To5 | null;
  stress: Scale1To5 | null;
  tags: string[];
  isDemo?: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export interface LifeAreaQuestion {
  archived?: boolean;
  mergedIntoId?: EntityId | null;
  goodEnoughUk?: string | null;
  rating?: number | null;
  ratedAt?: IsoInstantString | null;
  goodEnough?: string | null;
  focus?: boolean | null;
  starterKeys?: string[];
  id: EntityId;
  order: number;
  questionTextUk: string;
  version: number;
  updatedAt: IsoInstantString;
  revision: number;
}

export interface LifeAreaAnswerItem {
  attentionNow?: boolean | null;
  usefulChangeUk?: string | null;
  definitionSnapshotUk?: string | null;
  satisfactionQuestionSnapshotUk?: string;
  questionId: EntityId;
  questionTextSnapshotUk: string;
  questionVersionSnapshot: number;
  score: 0 | Scale1To10 | null;
  note: string | null;
}

export interface LifeAreaAssessment {
  scale?: { min: 0 | 1; max: 10; labelUk: string };
  id: EntityId;
  recordedAt: IsoInstantString;
  periodStartLocalDate: LocalDateString;
  periodEndLocalDate: LocalDateString;
  answers: LifeAreaAnswerItem[];
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export type SupportedMediaMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface MediaAssetMeta {
  id: EntityId;
  mimeType: SupportedMediaMimeType;
  byteSize: number;
  width: number;
  height: number;
  sha256Hex: string;
  wasOptimized: boolean;
  optimizationNoteUk: string | null;
  createdAt: IsoInstantString;
}

export interface MediaBlobRecord {
  id: EntityId;
  mimeType: SupportedMediaMimeType;
  bytes: Uint8Array;
}

export type InspirationKind = 'text' | 'quote' | 'link' | 'image';

export interface InspirationItem {
  collection?: 'preferred_life' | 'saved';
  lifeAreaId?: EntityId | null;
  goalId?: EntityId | null;
  id: EntityId;
  kind: InspirationKind;
  title: string | null;
  contentText: string | null;
  linkUrl: string | null;
  mediaId: EntityId | null;
  isFavorite: boolean;
  projectId: EntityId | null;
  isDemo?: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export type WishlistTimingGroup = 'now' | 'later' | 'someday';
export type WishFulfillmentState = 'active' | 'fulfilled';

export const SUPPORTED_CURRENCIES = {
  UAH: { code: 'UAH', minorUnits: 2, labelUk: 'Гривня (UAH)' },
  USD: { code: 'USD', minorUnits: 2, labelUk: 'Долар США (USD)' },
  EUR: { code: 'EUR', minorUnits: 2, labelUk: 'Євро (EUR)' },
  PLN: { code: 'PLN', minorUnits: 2, labelUk: 'Польський злотий (PLN)' },
  GBP: { code: 'GBP', minorUnits: 2, labelUk: 'Фунт стерлінгів (GBP)' },
  CHF: { code: 'CHF', minorUnits: 2, labelUk: 'Швейцарський франк (CHF)' },
  CZK: { code: 'CZK', minorUnits: 2, labelUk: 'Чеська крона (CZK)' },
  CAD: { code: 'CAD', minorUnits: 2, labelUk: 'Канадський долар (CAD)' },
  JPY: { code: 'JPY', minorUnits: 0, labelUk: 'Японська єна (JPY)' },
} as const;

export type SupportedCurrencyCode = keyof typeof SUPPORTED_CURRENCIES;

export interface ExactPrice {
  amountMinor: number;
  amountDecimal: string;
  currency: SupportedCurrencyCode;
}

export interface WishlistCategory {
  id: EntityId;
  name: string;
  order: number;
  isDemo?: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export type WishPurchaseStatus = 'want' | 'purchased' | 'not_relevant';
export interface WishItem {
  purchaseStatus?: WishPurchaseStatus;
  purchasedAt?: IsoInstantString | null;
  linkUrl?: string | null;
  mediaId?: EntityId | null;
  projectId?: EntityId | null;
  areaId?: EntityId | null;
  folderId?: EntityId | null;
  order?: number;
  measure?: Measure | null;
  iconKey?: string | null;
  id: EntityId;
  title: string;
  note: string | null;
  description?: string | null;
  categoryId: EntityId | null;
  category?: string | null;
  group?: string | null;
  timing: WishlistTimingGroup;
  estimatedPrice: ExactPrice | null;
  targetAmount?: number | null;
  price?: number | null;
  currency?: SupportedCurrencyCode | null;
  icon?: string | null;
  glyph?: string | null;
  state: WishFulfillmentState;
  fulfilledAt: IsoInstantString | null;
  archived: boolean;
  isDemo?: boolean;
  createdAt: IsoInstantString;
  updatedAt: IsoInstantString;
  revision: number;
}

export type ThemePreference = 'system' | 'light' | 'dark';
type TimeZoneMode = 'device' | 'manual';

export interface OptionalModulesSettings {
  habitsEnabled: boolean;
  stateCheckInsEnabled: boolean;
  desiredLifeEnabled: boolean;
  wishlistEnabled: boolean;
  userConfigured?: boolean;
}

export interface DemoBackupAreaState {
  rating?: number | null;
  ratedAt?: IsoInstantString | null;
  goodEnough?: string | null;
  goodEnoughUk?: string | null;
  focus?: boolean | null;
}

export interface DemoBackupData {
  appliedAt: IsoInstantString;
  areas: Record<string, DemoBackupAreaState>;
  myLife?: string | null;
}

export interface PlanuiSettings {
  dailyPlans?: Record<LocalDateString, DailyPlan>;
  roadmapLayer?: RoadmapLayer;
  id: 'singleton';
  theme: ThemePreference;
  timeZoneMode: TimeZoneMode;
  manualTimeZone: IanaTimeZone | null;
  lastDetectedTimeZone: IanaTimeZone;
  todayNextDayCollapsed: boolean;
  reducedMotionOverride: boolean;
  // Не використовується; збережено для сумісності формату даних.
  reducedTransparencyOverride: boolean;
  // Не використовується; збережено для сумісності формату даних.
  liteModeOverride?: boolean | null;
  preferredWishlistCurrency: SupportedCurrencyCode | null;
  modules?: OptionalModulesSettings;
  myLife?: string | null;
  demoBackup?: DemoBackupData | null;
  textScale?: 'smallest' | 'smaller' | 'standard' | 'larger' | 'largest' | number | null;
  dbGeneration: number;
  appVersion: string;
  dbSchemaVersion: number;
  updatedAt: IsoInstantString;
  revision: number;
}


export interface PlanuiDomainSnapshot {
  folders: Folder[];
  goals: Goal[];
  projects: Project[];
  stages: ProjectStage[];
  tasks: Task[];
  reservations: TaskReservation[];
  events: CalendarEvent[];
  shiftTemplates: ShiftTemplate[];
  dayOffAnnotations: DayOffAnnotation[];
  habits: Habit[];
  habitEntries: HabitEntry[];
  personalRecords: PersonalRecord[];
  lifeAreaQuestions: LifeAreaQuestion[];
  lifeAreaAssessments: LifeAreaAssessment[];
  inspirationItems: InspirationItem[];
  mediaMeta: MediaAssetMeta[];
  wishlistCategories: WishlistCategory[];
  wishes: WishItem[];
  settings: PlanuiSettings;
}

export interface RecoverySnapshotRecord {
  id: EntityId;
  createdAt: IsoInstantString;
  reason: 'pre_import_replacement' | 'pre_recovery_restore' | 'pre_reset';
  dbSchemaVersion: number;
  appVersion: string;
  snapshot: PlanuiDomainSnapshot;
}

export interface BackupFileInventoryEntry {
  path: string;
  byteSize: number;
  sha256Hex: string;
  mimeType: string;
}

export interface BackupManifest {
  format: typeof PLANUI_BACKUP_FORMAT;
  version?: number;
  backupVersion: number;
  appVersion: string;
  dbSchemaVersion: number;
  exportedAt?: IsoInstantString;
  createdAt: IsoInstantString;
  entityCounts: Record<string, number>;
  files: BackupFileInventoryEntry[];
}
