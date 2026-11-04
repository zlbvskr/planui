import { LifeLinkKind, LifeLinkSource, STARTER_LIFE_AREAS, directMergeLinks, lifeAreaMergeSignature } from '../domain/lifeAreas';
import { DailyPlan, TaskEffort } from '../domain/types';
import { validateDailyPlans } from '../domain/today';
import { RoadmapOwner, RoadmapMetadata } from '../domain/types';
import { validateRoadmapMetadata } from '../domain/roadmap';
import { PlanuiError } from '../i18n/errorsUk';
import {
  collectDescendantFolderIds,
  validateFolderHierarchy,
} from '../domain/folders';
import {
  CalendarEvent,
  DayOffAnnotation,
  EntityId,
  EventTemporalSchedule,
  Folder,
  Goal,
  Habit,
  HabitEntry,
  HabitLifecycleState,
  HabitRuleRevision,
  InspirationItem,
  IsoInstantString,
  LifeAreaAssessment,
  LifeAreaQuestion,
  LocalDateString,
  MediaAssetMeta,
  MediaBlobRecord,
  PersonalRecord,
  PlanuiDomainSnapshot,
  PlanuiSettings,
  OptionalModulesSettings,
  Project,
  ProjectStage,
  RecoverySnapshotRecord,
  ShiftTemplate,
  SupportedCurrencyCode,
  Task,
  TaskOwnership,
  TaskReservation,
  WishItem,
  WishlistCategory,
  ZonedInterval,
  PLANUI_DB_SCHEMA_VERSION,
} from '../domain/types';
import { assertValidLocalDate, formatInstantInZone, validateZonedInterval } from '../domain/temporal';
import {
  HabitRecordingInput,
  appendEffectiveHabitRuleRevision,
  resolveHabitEntryMutation,
  sortHabitRuleRevisions,
} from '../domain/habits';
import { isMediaReferencedByLiveOrSnapshots } from '../domain/personalSpace';
import {
  ScheduleConflictReport,
  detectScheduleConflicts,
} from '../domain/scheduling';
import {
  validateCalendarEventRecord,
  validateDayOffAnnotationRecord,
  validateFolderRecord,
  validateGoalRecord,
  validateHabitEntryRecord,
  validateHabitRecord,
  validateInspirationItemRecord,
  validateLifeAreaAssessment,
  validateLifeAreaQuestion,
  validateMediaAssetMetaAndBytes,
  validatePersonalRecord,
  validateProjectRecord,
  validateReservationRecord,
  validateSettingsRecord,
  validateShiftTemplateRecord,
  validateStageRecord,
  validateTaskRecord,
  validateWishItemRecord,
  validateWishlistCategoryRecord,
} from '../domain/validation';
import {
  ALL_STORE_NAMES,
  STORE_NAMES,
  StorageEngine,
  StorageTransactionContext,
  StoreName,
  createDefaultLifeAreaQuestions,
  createDefaultSettings,
  createStorageEngine,
} from './db';
import { TabSyncCoordinator } from './tabSync';

export const DOMAIN_DATA_STORES: readonly StoreName[] = [
  STORE_NAMES.folders,
  STORE_NAMES.goals,
  STORE_NAMES.projects,
  STORE_NAMES.stages,
  STORE_NAMES.tasks,
  STORE_NAMES.reservations,
  STORE_NAMES.events,
  STORE_NAMES.shiftTemplates,
  STORE_NAMES.dayOffAnnotations,
  STORE_NAMES.habits,
  STORE_NAMES.habitEntries,
  STORE_NAMES.personalRecords,
  STORE_NAMES.lifeAreaQuestions,
  STORE_NAMES.lifeAreaAssessments,
  STORE_NAMES.inspirationItems,
  STORE_NAMES.mediaMeta,
  STORE_NAMES.wishlistCategories,
  STORE_NAMES.wishes,
  STORE_NAMES.settings,
];

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

export class PlanuiRepositories {
  public readonly engine: StorageEngine;
  public readonly tabSync: TabSyncCoordinator;
  private readonly rawEngine: StorageEngine;
  private knownDbGeneration: number | null = null;
  private bypassGenerationCheck = false;

  constructor(engine?: StorageEngine, tabSync?: TabSyncCoordinator) {
    const baseEngine = engine ?? createStorageEngine();
    this.rawEngine = baseEngine;
    this.tabSync = tabSync ?? new TabSyncCoordinator();

    this.engine = {
      dbName: baseEngine.dbName,
      close: () => baseEngine.close(),
      runTransaction: async <R>(
        storeNames: readonly StoreName[],
        mode: 'readonly' | 'readwrite',
        work: (tx: StorageTransactionContext) => Promise<R> | R
      ): Promise<R> => {
        const effectiveStores =
          mode === 'readwrite' && !storeNames.includes(STORE_NAMES.settings)
            ? [...storeNames, STORE_NAMES.settings]
            : storeNames;

        return baseEngine.runTransaction(effectiveStores, mode, async (tx) => {
          if (mode === 'readwrite' && !this.bypassGenerationCheck) {
            const existingSettings = await tx.get<PlanuiSettings>(
              STORE_NAMES.settings,
              'singleton'
            );
            if (existingSettings) {
              if (
                existingSettings.dbSchemaVersion > PLANUI_DB_SCHEMA_VERSION
              ) {
                throw new PlanuiError(
                  'INCOMPATIBLE_NEWER_SCHEMA_WRITE_BLOCKED',
                  `dbSchemaVersion=${existingSettings.dbSchemaVersion} > ${PLANUI_DB_SCHEMA_VERSION}`
                );
              }
              if (
                this.knownDbGeneration !== null &&
                existingSettings.dbGeneration !== this.knownDbGeneration
              ) {
                throw new PlanuiError('STALE_DB_GENERATION_CONFLICT');
              }
              this.knownDbGeneration = existingSettings.dbGeneration;
            }
          } else if (
            mode === 'readonly' &&
            effectiveStores.includes(STORE_NAMES.settings) &&
            this.knownDbGeneration === null
          ) {
            const existingSettings = await tx.get<PlanuiSettings>(
              STORE_NAMES.settings,
              'singleton'
            );
            if (existingSettings) {
              this.knownDbGeneration = existingSettings.dbGeneration;
            }
          }

          const result = await work(tx);

          if (mode === 'readwrite') {
            const postSettings = await tx.get<PlanuiSettings>(
              STORE_NAMES.settings,
              'singleton'
            );
            if (postSettings) {
              this.knownDbGeneration = postSettings.dbGeneration;
            }
          }

          return result;
        });
      },
    };
  }

  public getKnownDbGeneration(): number | null {
    return this.knownDbGeneration;
  }

  public syncKnownDbGeneration(dbGeneration: number | null): void {
    this.knownDbGeneration = dbGeneration;
  }

  public acknowledgeExternalGenerationChange(): void {
    this.knownDbGeneration = null;
  }

  public async runUnguardedReplacementTransaction<R>(
    storeNames: readonly StoreName[],
    work: (tx: StorageTransactionContext) => Promise<R> | R
  ): Promise<R> {
    const prev = this.bypassGenerationCheck;
    this.bypassGenerationCheck = true;
    try {
      return await this.rawEngine.runTransaction(storeNames, 'readwrite', async (tx) => {
        const res = await work(tx);
        if (storeNames.includes(STORE_NAMES.settings)) {
          const postSettings = await tx.get<PlanuiSettings>(
            STORE_NAMES.settings,
            'singleton'
          );
          if (postSettings) {
            this.knownDbGeneration = postSettings.dbGeneration;
          }
        }
        return res;
      });
    } finally {
      this.bypassGenerationCheck = prev;
    }
  }

  private assertRevisionMatch(
    existing: { revision: number } | undefined,
    expectedRevision?: number
  ): number {
    if (!existing) {
      return 1;
    }
    if (
      expectedRevision !== undefined &&
      existing.revision !== expectedRevision
    ) {
      throw new PlanuiError('STALE_WRITE_CONFLICT');
    }
    return existing.revision + 1;
  }

  private async ensureSettingsInTx(
    tx: StorageTransactionContext,
    nowIso: IsoInstantString
  ): Promise<PlanuiSettings> {
    const existing = await tx.get<PlanuiSettings>(
      STORE_NAMES.settings,
      'singleton'
    );
    if (existing) {
      if (
        !this.bypassGenerationCheck &&
        this.knownDbGeneration !== null &&
        existing.dbGeneration !== this.knownDbGeneration
      ) {
        throw new PlanuiError('STALE_DB_GENERATION_CONFLICT');
      }
      this.knownDbGeneration = existing.dbGeneration;
      return existing;
    }
    const created = createDefaultSettings(nowIso);
    this.knownDbGeneration = created.dbGeneration;
    await tx.put(STORE_NAMES.settings, created);
    return created;
  }

  public async getOrInitSettings(
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<PlanuiSettings> {
    return this.engine.runTransaction(
      [STORE_NAMES.settings, STORE_NAMES.lifeAreaQuestions],
      'readwrite',
      async (tx) => {
        const wasFresh = !(await tx.get<PlanuiSettings>(STORE_NAMES.settings, 'singleton'));
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        const questions = await tx.getAll<LifeAreaQuestion>(
          STORE_NAMES.lifeAreaQuestions
        );
        if (wasFresh && questions.length === 0) {
          for (const q of createDefaultLifeAreaQuestions(nowIso)) {
            await tx.put(STORE_NAMES.lifeAreaQuestions, q);
          }
        }
        return settings;
      }
    );
  }

  public async saveSettings(
    next: PlanuiSettings,
    expectedRevision?: number
  ): Promise<PlanuiSettings> {
    this.tabSync.assertNoRemoteImportInProgress();
    validateSettingsRecord(next);

    const saved = await this.engine.runTransaction(
      [STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<PlanuiSettings>(
          STORE_NAMES.settings,
          'singleton'
        );
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const updated: PlanuiSettings = {
          ...next,
          revision: nextRev,
        };
        validateSettingsRecord(updated);
        await tx.put(STORE_NAMES.settings, updated);
        return updated;
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.settings],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.updatedAt,
    });
    return saved;
  }

  public async updateSettingsPatch(
    patch: Partial<PlanuiSettings>,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<PlanuiSettings> {
    this.tabSync.assertNoRemoteImportInProgress();
    const saved = await this.engine.runTransaction(
      [STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await this.ensureSettingsInTx(tx, nowIso);
        const updated: PlanuiSettings = {
          ...existing,
          ...patch,
          id: 'singleton',
          updatedAt: nowIso,
          revision: existing.revision + 1,
        };
        validateSettingsRecord(updated);
        await tx.put(STORE_NAMES.settings, updated);
        return updated;
      }
    );
    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.settings],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.updatedAt,
    });
    return saved;
  }

  public async savePreferredWishlistCurrency(
    currency: SupportedCurrencyCode,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<PlanuiSettings> {
    this.tabSync.assertNoRemoteImportInProgress();
    return this.engine.runTransaction(
      [STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const current = await this.ensureSettingsInTx(tx, nowIso);
        const updated: PlanuiSettings = {
          ...current,
          preferredWishlistCurrency: currency,
          updatedAt: nowIso,
          revision: current.revision + 1,
        };
        validateSettingsRecord(updated);
        await tx.put(STORE_NAMES.settings, updated);
        return updated;
      }
    );
  }

  public async saveFolder(
    folder: Folder,
    expectedRevision?: number
  ): Promise<Folder> {
    this.tabSync.assertNoRemoteImportInProgress();
    validateFolderRecord(folder);

    return this.engine.runTransaction(
      [STORE_NAMES.folders],
      'readwrite',
      async (tx) => {
        const allFolders = await tx.getAll<Folder>(STORE_NAMES.folders);
        const existing = allFolders.find((f) => f.id === folder.id);
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);

        const record: Folder = { ...folder, revision: nextRev };
        validateFolderRecord(record);

        const otherFolders = allFolders.filter((f) => f.id !== record.id);
        validateFolderHierarchy([...otherFolders, record]);

        await tx.put(STORE_NAMES.folders, record);
        return record;
      }
    );
  }

  public async deleteFolderTransactionally(
    folderId: EntityId,
    mode: 'rehome_to_parent' | 'recursive_delete',
    nowIso: IsoInstantString
  ): Promise<{ deletedFolders: number; affectedProjects: number; affectedTasks: number }> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [
        STORE_NAMES.folders,
        STORE_NAMES.projects,
        STORE_NAMES.stages,
        STORE_NAMES.tasks,
        STORE_NAMES.reservations,
      ],
      'readwrite',
      async (tx) => {
        const allFolders = await tx.getAll<Folder>(STORE_NAMES.folders);
        const target = allFolders.find((f) => f.id === folderId);
        if (!target) {
          throw new PlanuiError('ENTITY_NOT_FOUND', folderId);
        }

        const allProjects = await tx.getAll<Project>(STORE_NAMES.projects);
        const allTasks = await tx.getAll<Task>(STORE_NAMES.tasks);

        if (mode === 'rehome_to_parent') {
          const newParentId = target.parentId;
          let affectedProjects = 0;
          let affectedTasks = 0;

          for (const childFolder of allFolders) {
            if (childFolder.parentId === folderId) {
              await tx.put(STORE_NAMES.folders, {
                ...childFolder,
                parentId: newParentId,
                updatedAt: nowIso,
                revision: childFolder.revision + 1,
              });
            }
          }

          for (const proj of allProjects) {
            if (proj.folderId === folderId) {
              affectedProjects++;
              await tx.put(STORE_NAMES.projects, {
                ...proj,
                folderId: newParentId,
                updatedAt: nowIso,
                revision: proj.revision + 1,
              });
            }
          }

          for (const task of allTasks) {
            if (
              task.ownership.kind === 'standalone' &&
              task.ownership.folderId === folderId
            ) {
              affectedTasks++;
              await tx.put(STORE_NAMES.tasks, {
                ...task,
                ownership: { kind: 'standalone', folderId: newParentId },
                updatedAt: nowIso,
                revision: task.revision + 1,
              });
            }
          }

          await tx.delete(STORE_NAMES.folders, folderId);
          return { deletedFolders: 1, affectedProjects, affectedTasks };
        }

        const subtreeIds = collectDescendantFolderIds(allFolders, folderId);
        const deletedProjectIds = new Set<EntityId>();

        for (const proj of allProjects) {
          if (proj.folderId !== null && subtreeIds.has(proj.folderId)) {
            deletedProjectIds.add(proj.id);
            await tx.delete(STORE_NAMES.projects, proj.id);
          }
        }

        const allStages = await tx.getAll<ProjectStage>(STORE_NAMES.stages);
        for (const st of allStages) {
          if (st.projectId !== null && deletedProjectIds.has(st.projectId)) {
            await tx.delete(STORE_NAMES.stages, st.id);
          }
        }

        const deletedTaskIds = new Set<EntityId>();
        for (const task of allTasks) {
          const inSubtreeFolder =
            (task.ownership.kind === 'folder' && subtreeIds.has(task.ownership.folderId)) ||
            (task.ownership.kind === 'standalone' &&
              task.ownership.folderId &&
              subtreeIds.has(task.ownership.folderId));
          const inDeletedProject =
            task.ownership.kind === 'project' &&
            deletedProjectIds.has(task.ownership.projectId);

          if (inSubtreeFolder || inDeletedProject) {
            deletedTaskIds.add(task.id);
            await tx.delete(STORE_NAMES.tasks, task.id);
          }
        }

        const allReservations = await tx.getAll<TaskReservation>(
          STORE_NAMES.reservations
        );
        for (const res of allReservations) {
          if (deletedTaskIds.has(res.taskId)) {
            await tx.delete(STORE_NAMES.reservations, res.id);
          }
        }

        for (const fId of subtreeIds) {
          await tx.delete(STORE_NAMES.folders, fId);
        }

        return {
          deletedFolders: subtreeIds.size,
          affectedProjects: deletedProjectIds.size,
          affectedTasks: deletedTaskIds.size,
        };
      }
    );
  }

  /** Shared by roadmap and calendar. No cascading dates or reservations. */
  public async updateRoadmapItem(owner: RoadmapOwner, patch: RoadmapMetadata & { deadline?: string | null }, expectedRevision: number): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    const store = owner.kind === 'goal' ? STORE_NAMES.goals : owner.kind === 'project' ? STORE_NAMES.projects : STORE_NAMES.stages;
    await this.engine.runTransaction([store], 'readwrite', async tx => {
      const current = await tx.get<Goal | Project | ProjectStage>(store, owner.id);
      if (!current) throw new PlanuiError('ENTITY_NOT_FOUND');
      const revision = this.assertRevisionMatch(current, expectedRevision);
      const { deadline, ...metadata } = patch;
      const next = { ...current, ...metadata, revision, updatedAt: new Date().toISOString() };
      validateRoadmapMetadata(next);
      if (deadline !== undefined) {
        if (deadline !== null) assertValidLocalDate(deadline);
        if (owner.kind === 'goal') {
          const goal = next as Goal;
          goal.timing = { targetDate: deadline, targetPeriodUk: goal.timing?.targetPeriodUk ?? null };
        } else (next as Project | ProjectStage).targetDate = deadline;
      }
      await tx.put(store, next);
    });
  }

  public async reorderRoadmapStages(owner: { kind: 'goal' | 'project'; id: string }, ids: readonly string[]): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    await this.engine.runTransaction([STORE_NAMES.stages], 'readwrite', async tx => {
      const stages = (await tx.getAll<ProjectStage>(STORE_NAMES.stages)).filter(s => owner.kind === 'goal' ? s.goalId === owner.id : s.projectId === owner.id);
      if (ids.length !== stages.length || new Set(ids).size !== ids.length || stages.some(s => !ids.includes(s.id))) throw new PlanuiError('VALIDATION_FAILED');
      for (const stage of stages) await tx.put(STORE_NAMES.stages, { ...stage, order: ids.indexOf(stage.id), revision: stage.revision + 1, updatedAt: new Date().toISOString() });
    });
  }

  public async saveDailyPlan(date: string, plan: DailyPlan, expectedPlan?: DailyPlan): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    assertValidLocalDate(date); validateDailyPlans({ [date]: plan });
    await this.engine.runTransaction([STORE_NAMES.settings, STORE_NAMES.tasks], 'readwrite', async tx => {
      const settings = await this.ensureSettingsInTx(tx, new Date().toISOString());
      if (expectedPlan && JSON.stringify(settings.dailyPlans?.[date] ?? { focusTaskIds: [], focusNoteUk: null, minimalDay: false }) !== JSON.stringify(expectedPlan)) throw new PlanuiError('STALE_WRITE_CONFLICT');
      const tasks = await tx.getAll<Task>(STORE_NAMES.tasks);
      const oldIds = settings.dailyPlans?.[date]?.focusTaskIds ?? [];
      if (plan.focusTaskIds.some(id => !oldIds.includes(id) && !tasks.some(t => t.id === id))) throw new PlanuiError('ENTITY_NOT_FOUND');
      await tx.put(STORE_NAMES.settings, { ...settings, dailyPlans: { ...settings.dailyPlans, [date]: plan }, revision: settings.revision + 1, updatedAt: new Date().toISOString() });
    });
  }

  public async setTaskEffort(taskId: string, effort: TaskEffort | null, expectedRevision: number): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    if (effort !== null && !['small', 'medium', 'large'].includes(effort)) throw new PlanuiError('VALIDATION_FAILED');
    await this.engine.runTransaction([STORE_NAMES.tasks], 'readwrite', async tx => {
      const task = await tx.get<Task>(STORE_NAMES.tasks, taskId);
      if (!task) throw new PlanuiError('ENTITY_NOT_FOUND');
      await tx.put(STORE_NAMES.tasks, { ...task, effort, revision: this.assertRevisionMatch(task, expectedRevision), updatedAt: new Date().toISOString() });
    });
  }

  public async saveGoal(
    goal: Goal,
    expectedRevision?: number
  ): Promise<Goal> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.goals, STORE_NAMES.folders, STORE_NAMES.tasks],
      'readwrite',
      async (tx) => {
        const folders = await tx.getAll<Folder>(STORE_NAMES.folders);
        const tasks = await tx.getAll<Task>(STORE_NAMES.tasks);
        const folderIds = new Set(folders.map((f) => f.id));
        const taskIds = new Set(tasks.map((t) => t.id));

        const existing = await tx.get<Goal>(STORE_NAMES.goals, goal.id);
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: Goal = { ...goal, revision: nextRev };
        validateGoalRecord(record, { folderIds, taskIds });
        await tx.put(STORE_NAMES.goals, record);
        return record;
      }
    );
  }

  public async deleteGoalTransactionally(
    goalId: EntityId,
    mode: 'unlink_children' | 'delete_direct_tasks',
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<{ unlinkedProjects: number; deletedTasks: number; unlinkedTasks: number }> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [
        STORE_NAMES.inspirationItems, STORE_NAMES.goals,
        STORE_NAMES.projects,
        STORE_NAMES.stages,
        STORE_NAMES.tasks,
        STORE_NAMES.reservations,
      ],
      'readwrite',
      async (tx) => {
        const goal = await tx.get<Goal>(STORE_NAMES.goals, goalId);
        if (!goal) {
          throw new PlanuiError('GOAL_NOT_FOUND', goalId);
        }

        // Unlink any projects pointing to this goal
        const projects = await tx.getAll<Project>(STORE_NAMES.projects);
        let unlinkedProjects = 0;
        for (const proj of projects) {
          if (proj.goalId === goalId) {
            await tx.put(STORE_NAMES.projects, {
              ...proj,
              goalId: null,
              updatedAt: nowIso,
              revision: proj.revision + 1,
            });
            unlinkedProjects++;
          }
        }

        // Direct tasks of this goal
        const allTasks = await tx.getAll<Task>(STORE_NAMES.tasks);
        const directTasks = allTasks.filter(
          (t) => t.ownership.kind === 'goal' && t.ownership.goalId === goalId
        );

        let deletedTasks = 0;
        let unlinkedTasks = 0;

        if (mode === 'delete_direct_tasks') {
          const deletedIds = new Set(directTasks.map((t) => t.id));
          for (const t of directTasks) {
            await tx.delete(STORE_NAMES.tasks, t.id);
            deletedTasks++;
          }
          const reservations = await tx.getAll<TaskReservation>(STORE_NAMES.reservations);
          for (const r of reservations) {
            if (deletedIds.has(r.taskId)) {
              await tx.delete(STORE_NAMES.reservations, r.id);
            }
          }
        } else {
          // unlink_children: rehome direct tasks to the goal's folder, or standalone if goal had no folder
          for (const t of directTasks) {
            const nextOwnership: TaskOwnership = goal.folderId !== null
              ? { kind: 'folder', folderId: goal.folderId }
              : { kind: 'standalone', folderId: null };
            await tx.put(STORE_NAMES.tasks, {
              ...t,
              ownership: nextOwnership,
              updatedAt: nowIso,
              revision: t.revision + 1,
            });
            unlinkedTasks++;
          }
        }

        for (const stage of await tx.getAll<ProjectStage>(STORE_NAMES.stages)) {
          if (stage.goalId === goalId) await tx.delete(STORE_NAMES.stages, stage.id);
        }
        for (const item of await tx.getAll<InspirationItem>(STORE_NAMES.inspirationItems)) {
          if (item.goalId === goalId) await tx.put(STORE_NAMES.inspirationItems, { ...item, goalId: null, revision: item.revision + 1, updatedAt: nowIso });
        }
        await tx.delete(STORE_NAMES.goals, goalId);

        return {
          unlinkedProjects,
          deletedTasks,
          unlinkedTasks,
        };
      }
    );
  }

  public async archiveGoalTransactionally(
    goalId: EntityId,
    archived: boolean,
    nowIso: IsoInstantString = new Date().toISOString(),
    expectedRevision?: number
  ): Promise<Goal> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.goals],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<Goal>(STORE_NAMES.goals, goalId);
        if (!existing) {
          throw new PlanuiError('GOAL_NOT_FOUND', goalId);
        }
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const updated: Goal = {
          ...existing,
          archived,
          updatedAt: nowIso,
          revision: nextRev,
        };
        validateGoalRecord(updated);
        await tx.put(STORE_NAMES.goals, updated);
        return updated;
      }
    );
  }

  public async saveProject(
    project: Project,
    expectedRevision?: number
  ): Promise<Project> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.projects, STORE_NAMES.folders, STORE_NAMES.goals, STORE_NAMES.tasks],
      'readwrite',
      async (tx) => {
        const folders = await tx.getAll<Folder>(STORE_NAMES.folders);
        const goals = await tx.getAll<Goal>(STORE_NAMES.goals);
        const tasks = await tx.getAll<Task>(STORE_NAMES.tasks);
        const folderIds = new Set(folders.map((f) => f.id));
        const goalIds = new Set(goals.map((g) => g.id));
        const taskIds = new Set(tasks.map((t) => t.id));

        const existing = await tx.get<Project>(
          STORE_NAMES.projects,
          project.id
        );
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: Project = { ...project, revision: nextRev };
        validateProjectRecord(record, { folderIds, goalIds, taskIds });
        await tx.put(STORE_NAMES.projects, record);
        return record;
      }
    );
  }

  public async saveStage(
    stage: ProjectStage,
    expectedRevision?: number
  ): Promise<ProjectStage> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.stages, STORE_NAMES.projects, STORE_NAMES.goals],
      'readwrite',
      async (tx) => {
        const projects = await tx.getAll<Project>(STORE_NAMES.projects);
        const projectIds = new Set(projects.map((p) => p.id));
        const existing = await tx.get<ProjectStage>(
          STORE_NAMES.stages,
          stage.id
        );
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: ProjectStage = { ...stage, revision: nextRev };
        validateStageRecord(record, projectIds, new Set((await tx.getAll<Goal>(STORE_NAMES.goals)).map(g => g.id)));
        await tx.put(STORE_NAMES.stages, record);
        return record;
      }
    );
  }

  public async saveTask(
    task: Task,
    expectedRevision?: number
  ): Promise<Task> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [
        STORE_NAMES.tasks,
        STORE_NAMES.lifeAreaQuestions,
        STORE_NAMES.folders,
        STORE_NAMES.goals,
        STORE_NAMES.projects,
        STORE_NAMES.stages,
        STORE_NAMES.reservations,
      ],
      'readwrite',
      async (tx) => {
        if (task.lifeAreaId != null) {
          const area = await tx.get<LifeAreaQuestion>(STORE_NAMES.lifeAreaQuestions, task.lifeAreaId);
          if (!area || area.mergedIntoId) throw new PlanuiError('ENTITY_NOT_FOUND');
        }
        const existing = await tx.get<Task>(STORE_NAMES.tasks, task.id);
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);

        const folders = await tx.getAll<Folder>(STORE_NAMES.folders);
        const goals = await tx.getAll<Goal>(STORE_NAMES.goals);
        const projects = await tx.getAll<Project>(STORE_NAMES.projects);
        const stages = await tx.getAll<ProjectStage>(STORE_NAMES.stages);
        const reservations = await tx.getAll<TaskReservation>(
          STORE_NAMES.reservations
        );

        const folderIds = new Set(folders.map((f) => f.id));
        const goalIds = new Set(goals.map((g) => g.id));
        const projectIds = new Set(projects.map((p) => p.id));
        const stageProjectMap = new Map(
          stages.filter((s) => s.projectId !== null).map((s) => [s.id, s.projectId!])
        );
        const activeReservationsByTaskId = new Map<string, number>();
        for (const r of reservations) {
          if (r.state === 'active') {
            activeReservationsByTaskId.set(
              r.taskId,
              (activeReservationsByTaskId.get(r.taskId) ?? 0) + 1
            );
          }
        }

        const record: Task = { ...task, revision: nextRev };
        validateTaskRecord(record, {
          folderIds,
          goalIds,
          projectIds,
          stageProjectMap,
          activeReservationsByTaskId,
        });

        await tx.put(STORE_NAMES.tasks, record);
        return record;
      }
    );
  }

  public async moveTaskOwnershipTransactionally(
    taskId: EntityId,
    nextOwnership: TaskOwnership,
    nowIso: IsoInstantString,
    expectedRevision?: number
  ): Promise<Task> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [
        STORE_NAMES.tasks,
        STORE_NAMES.folders,
        STORE_NAMES.goals,
        STORE_NAMES.projects,
        STORE_NAMES.stages,
      ],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<Task>(STORE_NAMES.tasks, taskId);
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', taskId);
        }
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);

        const folders = await tx.getAll<Folder>(STORE_NAMES.folders);
        const goals = await tx.getAll<Goal>(STORE_NAMES.goals);
        const projects = await tx.getAll<Project>(STORE_NAMES.projects);
        const stages = await tx.getAll<ProjectStage>(STORE_NAMES.stages);
        const stageProjectMap = new Map(stages.filter((s) => s.projectId !== null).map((s) => [s.id, s.projectId!]));

        let normalizedOwnership: TaskOwnership = nextOwnership;
        if (
          nextOwnership.kind === 'project' &&
          nextOwnership.stageId !== null &&
          existing.ownership.kind === 'project' &&
          existing.ownership.projectId !== nextOwnership.projectId &&
          stageProjectMap.get(nextOwnership.stageId) ===
            existing.ownership.projectId
        ) {
          normalizedOwnership = {
            kind: 'project',
            projectId: nextOwnership.projectId,
            stageId: null,
          };
        }

        const updated: Task = {
          ...existing,
          ownership: normalizedOwnership,
          updatedAt: nowIso,
          revision: nextRev,
        };

        const folderIds = new Set(folders.map((f) => f.id));
        const goalIds = new Set(goals.map((g) => g.id));
        const projectIds = new Set(projects.map((p) => p.id));
        validateTaskRecord(updated, {
          folderIds,
          goalIds,
          projectIds,
          stageProjectMap,
        });

        await tx.put(STORE_NAMES.tasks, updated);
        return updated;
      }
    );
  }

  public async saveReservationTransactionally(
    reservation: TaskReservation,
    expectedRevision?: number,
    expectedTaskRevision?: number
  ): Promise<{ reservation: TaskReservation; task: Task }> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.reservations, STORE_NAMES.tasks],
      'readwrite',
      async (tx) => {
        const task = await tx.get<Task>(STORE_NAMES.tasks, reservation.taskId);
        if (!task) {
          throw new PlanuiError(
            'RESERVATION_TASK_NOT_FOUND',
            reservation.taskId
          );
        }

        if (expectedTaskRevision !== undefined && (task.revision !== expectedTaskRevision || task.state !== 'open')) throw new PlanuiError('STALE_WRITE_CONFLICT');
        const existingRes = await tx.get<TaskReservation>(
          STORE_NAMES.reservations,
          reservation.id
        );
        const nextResRev = this.assertRevisionMatch(
          existingRes,
          expectedRevision
        );

        const savedRes: TaskReservation = {
          ...reservation,
          revision: nextResRev,
        };
        validateReservationRecord(savedRes, new Set([task.id]));
        await tx.put(STORE_NAMES.reservations, savedRes);

        let updatedTask = task;
        if (savedRes.state === 'active') {
          updatedTask = {
            ...task,
            planningState: 'timed',
            plannedDate: null,
            updatedAt: savedRes.updatedAt,
            revision: task.revision + 1,
          };
          await tx.put(STORE_NAMES.tasks, updatedTask);
        }

        return { reservation: savedRes, task: updatedTask };
      }
    );
  }

  public async rescheduleReservationTransactionally(
    reservationId: EntityId,
    nextInterval: ZonedInterval,
    nowIso: IsoInstantString,
    expectedRevision?: number
  ): Promise<TaskReservation> {
    this.tabSync.assertNoRemoteImportInProgress();
    validateZonedInterval(nextInterval);

    return this.engine.runTransaction(
      [STORE_NAMES.reservations, STORE_NAMES.tasks],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<TaskReservation>(
          STORE_NAMES.reservations,
          reservationId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', reservationId);
        }
        const task = await tx.get<Task>(STORE_NAMES.tasks, existing.taskId);
        if (!task) {
          throw new PlanuiError('RESERVATION_TASK_NOT_FOUND', existing.taskId);
        }
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);

        // Moving or resizing a reservation preserves task deadline, priority, ownership, and estimatedDurationMinutes (C07 / 5.4)
        const updated: TaskReservation = {
          ...existing,
          interval: nextInterval,
          updatedAt: nowIso,
          revision: nextRev,
        };
        validateReservationRecord(updated, new Set([task.id]));
        await tx.put(STORE_NAMES.reservations, updated);
        return updated;
      }
    );
  }

  public async cancelSingleReservationTransactionally(
    reservationId: EntityId,
    mode: 'cancel' | 'release',
    nowIso: IsoInstantString,
    expectedRevision?: number
  ): Promise<{ reservation: TaskReservation; task: Task }> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.reservations, STORE_NAMES.tasks],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<TaskReservation>(
          STORE_NAMES.reservations,
          reservationId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', reservationId);
        }
        const task = await tx.get<Task>(STORE_NAMES.tasks, existing.taskId);
        if (!task) {
          throw new PlanuiError('RESERVATION_TASK_NOT_FOUND', existing.taskId);
        }
        const nextResRev = this.assertRevisionMatch(existing, expectedRevision);

        const updatedRes: TaskReservation = {
          ...existing,
          state: mode === 'cancel' ? 'canceled' : 'released',
          releaseMetadata:
            existing.releaseMetadata ?? {
              releasedAt: nowIso,
              reason: 'manual_unplan',
              originalStartInstant: existing.interval.startInstant,
              originalEndInstant: existing.interval.endInstant,
            },
          updatedAt: nowIso,
          revision: nextResRev,
        };
        if (mode === 'release' && Date.parse(existing.interval.startInstant) < Date.parse(nowIso) && Date.parse(existing.interval.endInstant) > Date.parse(nowIso)) {
          const wall = formatInstantInZone(nowIso, existing.interval.originZone);
          // Retain the elapsed blocking slice, as in explicit task completion.
          updatedRes.state = 'active';
          updatedRes.interval = { ...existing.interval, endInstant: nowIso, originEndLocalDate: wall.localDate, originEndLocalTime: wall.localTime };
        }
        validateReservationRecord(updatedRes, new Set([task.id]));
        await tx.put(STORE_NAMES.reservations, updatedRes);

        const allReservations = await tx.getAll<TaskReservation>(
          STORE_NAMES.reservations
        );
        const remainingActiveForTask = allReservations.filter(
          (r) =>
            r.taskId === task.id &&
            r.id !== reservationId &&
            r.state === 'active'
        );

        let updatedTask = task;
        if (
          remainingActiveForTask.length === 0 &&
          task.planningState === 'timed'
        ) {
          updatedTask = {
            ...task,
            planningState: 'unplanned',
            plannedDate: null,
            updatedAt: nowIso,
            revision: task.revision + 1,
          };
          await tx.put(STORE_NAMES.tasks, updatedTask);
        }

        return { reservation: updatedRes, task: updatedTask };
      }
    );
  }

  public async setTaskDateOnlyPlanningTransactionally(
    taskId: EntityId,
    plannedDate: LocalDateString | null,
    nowIso: IsoInstantString,
    expectedTaskRevision?: number,
    expectedReservationRevisions?: Record<string, number>
  ): Promise<{ task: Task; modifiedReservations: TaskReservation[] }> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.tasks, STORE_NAMES.reservations],
      'readwrite',
      async (tx) => {
        const existingTask = await tx.get<Task>(STORE_NAMES.tasks, taskId);
        if (!existingTask) {
          throw new PlanuiError('ENTITY_NOT_FOUND', taskId);
        }
        const nextTaskRev = this.assertRevisionMatch(
          existingTask,
          expectedTaskRevision
        );

        const allReservations = await tx.getAll<TaskReservation>(
          STORE_NAMES.reservations
        );
        const activeTaskReservations = allReservations.filter(
          (r) => r.taskId === taskId && r.state === 'active'
        );

        if (expectedReservationRevisions && (activeTaskReservations.length !== Object.keys(expectedReservationRevisions).length || activeTaskReservations.some(r => expectedReservationRevisions[r.id] !== r.revision))) throw new PlanuiError('STALE_WRITE_CONFLICT');
        const actionMs = Date.parse(nowIso);
        const modifiedReservations: TaskReservation[] = [];

        // Transitioning away from timed reservations releases active future/ongoing sessions
        for (const res of activeTaskReservations) {
          const startMs = Date.parse(res.interval.startInstant);
          const endMs = Date.parse(res.interval.endInstant);
          if (startMs >= actionMs) {
            const released: TaskReservation = {
              ...res,
              state: 'released',
              releaseMetadata: {
                releasedAt: nowIso,
                reason: 'manual_unplan',
                originalStartInstant: res.interval.startInstant,
                originalEndInstant: res.interval.endInstant,
              },
              updatedAt: nowIso,
              revision: res.revision + 1,
            };
            await tx.put(STORE_NAMES.reservations, released);
            modifiedReservations.push(released);
          } else if (startMs < actionMs && endMs > actionMs) {
            const actionWall = formatInstantInZone(
              actionMs,
              res.interval.originZone
            );
            const truncated: TaskReservation = {
              ...res,
              state: 'released',
              interval: {
                ...res.interval,
                endInstant: nowIso,
                originEndLocalDate: actionWall.localDate,
                originEndLocalTime: actionWall.localTime,
              },
              releaseMetadata: {
                releasedAt: nowIso,
                reason: 'manual_unplan',
                originalStartInstant: res.interval.startInstant,
                originalEndInstant: res.interval.endInstant,
              },
              updatedAt: nowIso,
              revision: res.revision + 1,
            };
            await tx.put(STORE_NAMES.reservations, truncated);
            modifiedReservations.push(truncated);
          } else {
            // Historical elapsed block: mark as released so task can cleanly transition to date_only
            const historical: TaskReservation = {
              ...res,
              state: 'released',
              releaseMetadata:
                res.releaseMetadata ?? {
                  releasedAt: nowIso,
                  reason: 'manual_unplan',
                  originalStartInstant: res.interval.startInstant,
                  originalEndInstant: res.interval.endInstant,
                },
              updatedAt: nowIso,
              revision: res.revision + 1,
            };
            await tx.put(STORE_NAMES.reservations, historical);
            modifiedReservations.push(historical);
          }
        }

        const updatedTask: Task = {
          ...existingTask,
          planningState: plannedDate ? 'date_only' : 'unplanned',
          plannedDate: plannedDate ?? null,
          updatedAt: nowIso,
          revision: nextTaskRev,
        };
        validateTaskRecord(updatedTask);
        await tx.put(STORE_NAMES.tasks, updatedTask);
        return { task: updatedTask, modifiedReservations };
      }
    );
  }

  public async removeTaskCurrentPlanningTransactionally(
    taskId: EntityId,
    nowIso: IsoInstantString,
    expectedTaskRevision?: number
  ): Promise<{ task: Task; modifiedReservations: TaskReservation[] }> {
    return this.setTaskDateOnlyPlanningTransactionally(
      taskId,
      null,
      nowIso,
      expectedTaskRevision
    );
  }

  public async completeOrCancelTaskTransactionally(
    taskId: EntityId,
    targetState: 'completed' | 'canceled',
    actionInstant: IsoInstantString,
    expectedTaskRevision?: number
  ): Promise<{
    task: Task;
    modifiedReservations: TaskReservation[];
    undoToken: TaskLifecycleUndoToken;
  }> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.tasks, STORE_NAMES.reservations],
      'readwrite',
      async (tx) => {
        const existingTask = await tx.get<Task>(STORE_NAMES.tasks, taskId);
        if (!existingTask) {
          throw new PlanuiError('ENTITY_NOT_FOUND', taskId);
        }
        const nextTaskRev = this.assertRevisionMatch(
          existingTask,
          expectedTaskRevision
        );

        const allReservations = await tx.getAll<TaskReservation>(
          STORE_NAMES.reservations
        );
        const taskReservations = allReservations.filter(
          (r) => r.taskId === taskId && r.state === 'active'
        );

        const actionMs = Date.parse(actionInstant);
        const releaseReason =
          targetState === 'completed' ? 'task_completed' : 'task_canceled';
        const modifiedReservations: TaskReservation[] = [];
        const previousReservationsSnapshot: TaskReservation[] = [];
        const postActionReservationRevisions: Record<EntityId, number> = {};

        for (const res of taskReservations) {
          const startMs = Date.parse(res.interval.startInstant);
          const endMs = Date.parse(res.interval.endInstant);

          if (startMs >= actionMs) {
            previousReservationsSnapshot.push({
              ...res,
              interval: { ...res.interval },
              releaseMetadata: res.releaseMetadata
                ? { ...res.releaseMetadata }
                : null,
            });
            const nextResRev = res.revision + 1;
            const releasedFuture: TaskReservation = {
              ...res,
              state: 'released',
              releaseMetadata: {
                releasedAt: actionInstant,
                reason: releaseReason,
                originalStartInstant: res.interval.startInstant,
                originalEndInstant: res.interval.endInstant,
              },
              updatedAt: actionInstant,
              revision: nextResRev,
            };
            await tx.put(STORE_NAMES.reservations, releasedFuture);
            modifiedReservations.push(releasedFuture);
            postActionReservationRevisions[res.id] = nextResRev;
          } else if (startMs < actionMs && endMs > actionMs) {
            previousReservationsSnapshot.push({
              ...res,
              interval: { ...res.interval },
              releaseMetadata: res.releaseMetadata
                ? { ...res.releaseMetadata }
                : null,
            });
            const actionWall = formatInstantInZone(
              actionMs,
              res.interval.originZone
            );
            const nextResRev = res.revision + 1;
            const truncatedOngoing: TaskReservation = {
              ...res,
              interval: {
                ...res.interval,
                endInstant: actionInstant,
                originEndLocalDate: actionWall.localDate,
                originEndLocalTime: actionWall.localTime,
              },
              releaseMetadata: {
                releasedAt: actionInstant,
                reason: releaseReason,
                originalStartInstant: res.interval.startInstant,
                originalEndInstant: res.interval.endInstant,
              },
              updatedAt: actionInstant,
              revision: nextResRev,
            };
            await tx.put(STORE_NAMES.reservations, truncatedOngoing);
            modifiedReservations.push(truncatedOngoing);
            postActionReservationRevisions[res.id] = nextResRev;
          }
        }

        const updatedTask: Task = {
          ...existingTask,
          state: targetState,
          completedAt: targetState === 'completed' ? actionInstant : null,
          canceledAt: targetState === 'canceled' ? actionInstant : null,
          updatedAt: actionInstant,
          revision: nextTaskRev,
        };

        await tx.put(STORE_NAMES.tasks, updatedTask);

        const undoToken: TaskLifecycleUndoToken = {
          taskId,
          previousTaskSnapshot: {
            ...existingTask,
            checklist: existingTask.checklist.map((item) => ({ ...item })),
          },
          postActionTaskRevision: nextTaskRev,
          previousReservationsSnapshot,
          postActionReservationRevisions,
        };

        return { task: updatedTask, modifiedReservations, undoToken };
      }
    );
  }

  public async completeTaskTransactionally(
    taskId: EntityId,
    completedAt: IsoInstantString,
    expectedTaskRevision?: number
  ): Promise<{
    task: Task;
    modifiedReservations: TaskReservation[];
    undoToken: TaskLifecycleUndoToken;
  }> {
    return this.completeOrCancelTaskTransactionally(
      taskId,
      'completed',
      completedAt,
      expectedTaskRevision
    );
  }

  public async reopenTaskTransactionally(
    taskId: EntityId,
    nowIso: IsoInstantString,
    expectedTaskRevision?: number
  ): Promise<Task> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.tasks],
      'readwrite',
      async (tx) => {
        const existingTask = await tx.get<Task>(STORE_NAMES.tasks, taskId);
        if (!existingTask) {
          throw new PlanuiError('ENTITY_NOT_FOUND', taskId);
        }
        const nextTaskRev = this.assertRevisionMatch(
          existingTask,
          expectedTaskRevision
        );
        // C07 / 5.5: Reopening does not silently restore old reservations.
        const reopened: Task = {
          ...existingTask,
          state: 'open',
          completedAt: null,
          canceledAt: null,
          updatedAt: nowIso,
          revision: nextTaskRev,
        };
        await tx.put(STORE_NAMES.tasks, reopened);
        return reopened;
      }
    );
  }

  public async cancelTaskTransactionally(
    taskId: EntityId,
    canceledAt: IsoInstantString,
    expectedTaskRevision?: number
  ): Promise<{
    task: Task;
    modifiedReservations: TaskReservation[];
    undoToken: TaskLifecycleUndoToken;
  }> {
    return this.completeOrCancelTaskTransactionally(
      taskId,
      'canceled',
      canceledAt,
      expectedTaskRevision
    );
  }

  /**
   * C07 / 5.5: Bounded immediate undo restores previous state only when revision checks
   * prevent overwriting subsequent changes. Restored overlaps are reported, not auto-resolved.
   */
  public async undoTaskLifecycleTransactionally(
    token: TaskLifecycleUndoToken,
    nowIso: IsoInstantString,
    displayZone: string = 'Europe/Kyiv'
  ): Promise<{
    restoredTask: Task;
    restoredReservations: TaskReservation[];
    conflictReport: ScheduleConflictReport;
  }> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.tasks, STORE_NAMES.reservations, STORE_NAMES.events],
      'readwrite',
      async (tx) => {
        const currentTask = await tx.get<Task>(STORE_NAMES.tasks, token.taskId);
        if (!currentTask) {
          throw new PlanuiError('ENTITY_NOT_FOUND', token.taskId);
        }
        if (currentTask.revision !== token.postActionTaskRevision) {
          throw new PlanuiError('STALE_WRITE_CONFLICT');
        }

        const currentReservationsById = new Map<EntityId, TaskReservation>();
        for (const prevRes of token.previousReservationsSnapshot) {
          const curRes = await tx.get<TaskReservation>(
            STORE_NAMES.reservations,
            prevRes.id
          );
          if (
            !curRes ||
            curRes.revision !== token.postActionReservationRevisions[prevRes.id]
          ) {
            throw new PlanuiError('STALE_WRITE_CONFLICT');
          }
          currentReservationsById.set(prevRes.id, curRes);
        }

        const restoredTask: Task = {
          ...token.previousTaskSnapshot,
          updatedAt: nowIso,
          revision: currentTask.revision + 1,
        };
        await tx.put(STORE_NAMES.tasks, restoredTask);

        const restoredReservations: TaskReservation[] = [];
        for (const prevRes of token.previousReservationsSnapshot) {
          const curRes = currentReservationsById.get(prevRes.id)!;
          const restoredRes: TaskReservation = {
            ...prevRes,
            updatedAt: nowIso,
            revision: curRes.revision + 1,
          };
          await tx.put(STORE_NAMES.reservations, restoredRes);
          restoredReservations.push(restoredRes);
        }

        // Check for overlaps created while the reservation was released (report, do not auto-resolve)
        const [allEvents, allReservations, allTasks] = await Promise.all([
          tx.getAll<CalendarEvent>(STORE_NAMES.events),
          tx.getAll<TaskReservation>(STORE_NAMES.reservations),
          tx.getAll<Task>(STORE_NAMES.tasks),
        ]);

        const aggregatedConflicts: ScheduleConflictReport['conflicts'] = [];
        for (const rRes of restoredReservations) {
          if (rRes.state !== 'active') continue;
          const report = detectScheduleConflicts({
            candidateStartInstant: rRes.interval.startInstant,
            candidateEndInstant: rRes.interval.endInstant,
            displayZone,
            events: allEvents,
            reservations: allReservations,
            tasks: allTasks,
            excludeReservationId: rRes.id,
          });
          for (const c of report.conflicts) {
            aggregatedConflicts.push(c);
          }
        }

        const conflictReport: ScheduleConflictReport = {
          hasConflicts: aggregatedConflicts.length > 0,
          conflicts: aggregatedConflicts,
          warningMessageUk:
            aggregatedConflicts.length > 0
              ? `Стан справи відновлено, проте відновлений резерв перетинається з іншими записами (${aggregatedConflicts
                  .map((c) => `«${c.title}»`)
                  .join(', ')}). Перевірте розклад.`
              : null,
        };

        return {
          restoredTask,
          restoredReservations,
          conflictReport,
        };
      }
    );
  }

  public async deleteTaskTransactionally(taskId: EntityId): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    await this.engine.runTransaction(
      [STORE_NAMES.tasks, STORE_NAMES.reservations],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<Task>(STORE_NAMES.tasks, taskId);
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', taskId);
        }
        const reservations = await tx.getAll<TaskReservation>(
          STORE_NAMES.reservations
        );
        for (const res of reservations) {
          if (res.taskId === taskId) {
            await tx.delete(STORE_NAMES.reservations, res.id);
          }
        }
        await tx.delete(STORE_NAMES.tasks, taskId);
      }
    );
  }

  public async promoteChecklistItemToTaskTransactionally(
    taskId: EntityId,
    checklistItemId: EntityId,
    newTaskId: EntityId,
    nowIso: IsoInstantString
  ): Promise<{ updatedParentTask: Task; promotedTask: Task }> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [
        STORE_NAMES.tasks,
        STORE_NAMES.folders,
        STORE_NAMES.projects,
        STORE_NAMES.stages,
      ],
      'readwrite',
      async (tx) => {
        const parentTask = await tx.get<Task>(STORE_NAMES.tasks, taskId);
        if (!parentTask) {
          throw new PlanuiError('ENTITY_NOT_FOUND', taskId);
        }
        const targetItem = parentTask.checklist.find(
          (item) => item.id === checklistItemId
        );
        if (!targetItem) {
          throw new PlanuiError('ENTITY_NOT_FOUND', checklistItemId);
        }

        const remainingChecklist = parentTask.checklist
          .filter((item) => item.id !== checklistItemId)
          .map((item, idx) => ({ ...item, order: idx + 1 }));

        const updatedParentTask: Task = {
          ...parentTask,
          checklist: remainingChecklist,
          updatedAt: nowIso,
          revision: parentTask.revision + 1,
        };

        const promotedTask: Task = {
          id: newTaskId,
          title: targetItem.title,
          description: null,
          state: 'open',
          priority: 'normal',
          deadline: null,
          estimatedDurationMinutes: null,
          planningState: 'unplanned',
          plannedDate: null,
          ownership: { ...parentTask.ownership },
          checklist: [],
          createdAt: nowIso,
          updatedAt: nowIso,
          completedAt: null,
          canceledAt: null,
          revision: 1,
        };

        const folders = await tx.getAll<Folder>(STORE_NAMES.folders);
        const projects = await tx.getAll<Project>(STORE_NAMES.projects);
        const stages = await tx.getAll<ProjectStage>(STORE_NAMES.stages);
        const validationCtx = {
          folderIds: new Set(folders.map((f) => f.id)),
          projectIds: new Set(projects.map((p) => p.id)),
          stageProjectMap: new Map(stages.filter((s) => s.projectId !== null).map((s) => [s.id, s.projectId!])),
        };

        validateTaskRecord(updatedParentTask, validationCtx);
        validateTaskRecord(promotedTask, validationCtx);

        await tx.put(STORE_NAMES.tasks, updatedParentTask);
        await tx.put(STORE_NAMES.tasks, promotedTask);

        return { updatedParentTask, promotedTask };
      }
    );
  }

  public async reorderFoldersTransactionally(
    parentId: EntityId | null,
    orderedFolderIds: readonly EntityId[],
    nowIso: IsoInstantString
  ): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    await this.engine.runTransaction(
      [STORE_NAMES.folders],
      'readwrite',
      async (tx) => {
        const allFolders = await tx.getAll<Folder>(STORE_NAMES.folders);
        const byId = new Map(allFolders.map((f) => [f.id, f]));
        let order = 1;
        for (const id of orderedFolderIds) {
          const folder = byId.get(id);
          if (folder && folder.parentId === parentId) {
            await tx.put(STORE_NAMES.folders, {
              ...folder,
              order: order++,
              updatedAt: nowIso,
              revision: folder.revision + 1,
            });
          }
        }
      }
    );
  }

  public async reorderStagesTransactionally(
    projectId: EntityId,
    orderedStageIds: readonly EntityId[],
    nowIso: IsoInstantString
  ): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    await this.engine.runTransaction(
      [STORE_NAMES.stages],
      'readwrite',
      async (tx) => {
        const allStages = await tx.getAll<ProjectStage>(STORE_NAMES.stages);
        const byId = new Map(allStages.map((s) => [s.id, s]));
        let order = 1;
        for (const id of orderedStageIds) {
          const stage = byId.get(id);
          if (stage && stage.projectId === projectId) {
            await tx.put(STORE_NAMES.stages, {
              ...stage,
              order: order++,
              updatedAt: nowIso,
              revision: stage.revision + 1,
            });
          }
        }
      }
    );
  }

  public async deleteStageTransactionally(
    stageId: EntityId,
    nowIso: IsoInstantString
  ): Promise<{ unlinkedTaskCount: number }> {
    this.tabSync.assertNoRemoteImportInProgress();
    return this.engine.runTransaction(
      [STORE_NAMES.stages, STORE_NAMES.tasks],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<ProjectStage>(
          STORE_NAMES.stages,
          stageId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', stageId);
        }
        const allTasks = await tx.getAll<Task>(STORE_NAMES.tasks);
        let unlinkedTaskCount = 0;
        for (const task of allTasks) {
          if (
            task.ownership.kind === 'project' &&
            task.ownership.projectId === existing.projectId &&
            task.ownership.stageId === stageId
          ) {
            unlinkedTaskCount++;
            await tx.put(STORE_NAMES.tasks, {
              ...task,
              ownership: {
                kind: 'project',
                projectId: existing.projectId,
                stageId: null,
              },
              updatedAt: nowIso,
              revision: task.revision + 1,
            });
          }
        }
        await tx.delete(STORE_NAMES.stages, stageId);
        return { unlinkedTaskCount };
      }
    );
  }

  public async completeProjectExplicitlyTransactionally(
    projectId: EntityId,
    nowIso: IsoInstantString,
    expectedRevision?: number
  ): Promise<Project> {
    this.tabSync.assertNoRemoteImportInProgress();
    return this.engine.runTransaction(
      [STORE_NAMES.projects, STORE_NAMES.folders],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<Project>(STORE_NAMES.projects, projectId);
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', projectId);
        }
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const folders = await tx.getAll<Folder>(STORE_NAMES.folders);
        const completedProject: Project = {
          ...existing,
          state: 'completed',
          completedAt: nowIso,
          updatedAt: nowIso,
          revision: nextRev,
        };
        validateProjectRecord(completedProject, {
          folderIds: new Set(folders.map((f) => f.id)),
        });
        await tx.put(STORE_NAMES.projects, completedProject);
        return completedProject;
      }
    );
  }

  public async archiveProjectTransactionally(
    projectId: EntityId,
    archived: boolean,
    planningMode: 'retain_planning' | 'remove_planning',
    nowIso: IsoInstantString,
    todayLocalDate: string
  ): Promise<{
    project: Project;
    releasedReservationCount: number;
    unplannedTaskCount: number;
  }> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.projects, STORE_NAMES.tasks, STORE_NAMES.reservations],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<Project>(STORE_NAMES.projects, projectId);
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', projectId);
        }
        const updatedProject: Project = {
          ...existing,
          archived,
          updatedAt: nowIso,
          revision: existing.revision + 1,
        };
        await tx.put(STORE_NAMES.projects, updatedProject);

        let releasedReservationCount = 0;
        let unplannedTaskCount = 0;

        if (archived && planningMode === 'remove_planning') {
          const allTasks = await tx.getAll<Task>(STORE_NAMES.tasks);
          const allReservations = await tx.getAll<TaskReservation>(
            STORE_NAMES.reservations
          );
          const projectOpenTasks = allTasks.filter(
            (t) =>
              t.ownership.kind === 'project' &&
              t.ownership.projectId === projectId &&
              t.state === 'open'
          );
          const projectTaskIds = new Set(projectOpenTasks.map((t) => t.id));
          const nowMs = Date.parse(nowIso);

          for (const res of allReservations) {
            if (projectTaskIds.has(res.taskId) && res.state === 'active') {
              const startMs = Date.parse(res.interval.startInstant);
              const endMs = Date.parse(res.interval.endInstant);
              if (startMs >= nowMs) {
                releasedReservationCount++;
                await tx.put(STORE_NAMES.reservations, {
                  ...res,
                  state: 'released',
                  releaseMetadata: {
                    releasedAt: nowIso,
                    reason: 'project_archived',
                    originalStartInstant: res.interval.startInstant,
                    originalEndInstant: res.interval.endInstant,
                  },
                  updatedAt: nowIso,
                  revision: res.revision + 1,
                });
              } else if (startMs < nowMs && endMs > nowMs) {
                releasedReservationCount++;
                await tx.put(STORE_NAMES.reservations, {
                  ...res,
                  interval: {
                    ...res.interval,
                    endInstant: nowIso,
                  },
                  releaseMetadata: {
                    releasedAt: nowIso,
                    reason: 'project_archived',
                    originalStartInstant: res.interval.startInstant,
                    originalEndInstant: res.interval.endInstant,
                  },
                  updatedAt: nowIso,
                  revision: res.revision + 1,
                });
              }
            }
          }

          for (const task of projectOpenTasks) {
            if (
              task.planningState === 'date_only' &&
              task.plannedDate !== null &&
              task.plannedDate >= todayLocalDate
            ) {
              unplannedTaskCount++;
              await tx.put(STORE_NAMES.tasks, {
                ...task,
                planningState: 'unplanned',
                plannedDate: null,
                updatedAt: nowIso,
                revision: task.revision + 1,
              });
            } else if (task.planningState === 'timed') {
              unplannedTaskCount++;
              await tx.put(STORE_NAMES.tasks, {
                ...task,
                planningState: 'unplanned',
                plannedDate: null,
                updatedAt: nowIso,
                revision: task.revision + 1,
              });
            }
          }
        }

        return {
          project: updatedProject,
          releasedReservationCount,
          unplannedTaskCount,
        };
      }
    );
  }

  public async deleteProjectTransactionally(
    projectId: EntityId,
    taskHandling: 'rehome_to_folder' | 'delete_tasks',
    nowIso: IsoInstantString
  ): Promise<{
    affectedTasks: number;
    deletedStages: number;
    unlinkedInspirationCount: number;
  }> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [
        STORE_NAMES.projects,
        STORE_NAMES.stages,
        STORE_NAMES.tasks,
        STORE_NAMES.reservations,
        STORE_NAMES.inspirationItems,
        STORE_NAMES.habits,
      ],
      'readwrite',
      async (tx) => {
        const project = await tx.get<Project>(STORE_NAMES.projects, projectId);
        if (!project) {
          throw new PlanuiError('ENTITY_NOT_FOUND', projectId);
        }

        const allStages = await tx.getAll<ProjectStage>(STORE_NAMES.stages);
        let deletedStages = 0;
        for (const st of allStages) {
          if (st.projectId === projectId) {
            deletedStages++;
            await tx.delete(STORE_NAMES.stages, st.id);
          }
        }

        // 10.4: Project deletion does not silently delete inspiration — unlink projectId instead
        const allInspiration = await tx.getAll<InspirationItem>(
          STORE_NAMES.inspirationItems
        );
        let unlinkedInspirationCount = 0;
        for (const ins of allInspiration) {
          if (ins.projectId === projectId) {
            unlinkedInspirationCount++;
            await tx.put(STORE_NAMES.inspirationItems, {
              ...ins,
              projectId: null,
              updatedAt: nowIso,
              revision: ins.revision + 1,
            });
          }
        }

        const allHabits = await tx.getAll<Habit>(STORE_NAMES.habits);
        for (const h of allHabits) {
          if (h.projectId === projectId) {
            await tx.put(STORE_NAMES.habits, {
              ...h,
              projectId: null,
              updatedAt: nowIso,
              revision: h.revision + 1,
            });
          }
        }

        const allTasks = await tx.getAll<Task>(STORE_NAMES.tasks);
        const projectTasks = allTasks.filter(
          (t) =>
            t.ownership.kind === 'project' &&
            t.ownership.projectId === projectId
        );

        if (taskHandling === 'rehome_to_folder') {
          for (const task of projectTasks) {
            await tx.put(STORE_NAMES.tasks, {
              ...task,
              ownership: {
                kind: 'standalone',
                folderId: project.folderId,
              },
              updatedAt: nowIso,
              revision: task.revision + 1,
            });
          }
        } else {
          const deletedTaskIds = new Set(projectTasks.map((t) => t.id));
          const allReservations = await tx.getAll<TaskReservation>(
            STORE_NAMES.reservations
          );
          for (const res of allReservations) {
            if (deletedTaskIds.has(res.taskId)) {
              await tx.delete(STORE_NAMES.reservations, res.id);
            }
          }
          for (const task of projectTasks) {
            await tx.delete(STORE_NAMES.tasks, task.id);
          }
        }

        await tx.delete(STORE_NAMES.projects, projectId);
        return {
          affectedTasks: projectTasks.length,
          deletedStages,
          unlinkedInspirationCount,
        };
      }
    );
  }

  public async batchUpdateTasksTransactionally(
    taskIds: readonly EntityId[],
    action:
      | { kind: 'set_planned_date'; plannedDate: string | null }
      | { kind: 'move_ownership'; ownership: TaskOwnership }
      | { kind: 'complete' }
      | { kind: 'cancel' },
    nowIso: IsoInstantString
  ): Promise<number> {
    this.tabSync.assertNoRemoteImportInProgress();
    if (taskIds.length === 0) return 0;

    return this.engine.runTransaction(
      [
        STORE_NAMES.tasks,
        STORE_NAMES.reservations,
        STORE_NAMES.folders,
        STORE_NAMES.projects,
        STORE_NAMES.stages,
      ],
      'readwrite',
      async (tx) => {
        const folders = await tx.getAll<Folder>(STORE_NAMES.folders);
        const projects = await tx.getAll<Project>(STORE_NAMES.projects);
        const stages = await tx.getAll<ProjectStage>(STORE_NAMES.stages);
        const allReservations = await tx.getAll<TaskReservation>(
          STORE_NAMES.reservations
        );
        const validationCtx = {
          folderIds: new Set(folders.map((f) => f.id)),
          projectIds: new Set(projects.map((p) => p.id)),
          stageProjectMap: new Map(stages.filter((s) => s.projectId !== null).map((s) => [s.id, s.projectId!])),
        };

        const nowMs = Date.parse(nowIso);
        let updatedCount = 0;

        for (const taskId of taskIds) {
          const existing = await tx.get<Task>(STORE_NAMES.tasks, taskId);
          if (!existing) continue;

          if (action.kind === 'complete' || action.kind === 'cancel') {
            const targetState =
              action.kind === 'complete' ? 'completed' : 'canceled';
            const releaseReason =
              action.kind === 'complete' ? 'task_completed' : 'task_canceled';

            for (const res of allReservations) {
              if (res.taskId === taskId && res.state === 'active') {
                const startMs = Date.parse(res.interval.startInstant);
                const endMs = Date.parse(res.interval.endInstant);
                if (startMs >= nowMs) {
                  await tx.put(STORE_NAMES.reservations, {
                    ...res,
                    state: 'released',
                    releaseMetadata: {
                      releasedAt: nowIso,
                      reason: releaseReason,
                      originalStartInstant: res.interval.startInstant,
                      originalEndInstant: res.interval.endInstant,
                    },
                    updatedAt: nowIso,
                    revision: res.revision + 1,
                  });
                } else if (startMs < nowMs && endMs > nowMs) {
                  await tx.put(STORE_NAMES.reservations, {
                    ...res,
                    interval: { ...res.interval, endInstant: nowIso },
                    releaseMetadata: {
                      releasedAt: nowIso,
                      reason: releaseReason,
                      originalStartInstant: res.interval.startInstant,
                      originalEndInstant: res.interval.endInstant,
                    },
                    updatedAt: nowIso,
                    revision: res.revision + 1,
                  });
                }
              }
            }

            const updated: Task = {
              ...existing,
              state: targetState,
              completedAt: targetState === 'completed' ? nowIso : null,
              canceledAt: targetState === 'canceled' ? nowIso : null,
              updatedAt: nowIso,
              revision: existing.revision + 1,
            };
            await tx.put(STORE_NAMES.tasks, updated);
            updatedCount++;
          } else if (action.kind === 'set_planned_date') {
            for (const res of allReservations) {
              if (res.taskId === taskId && res.state === 'active') {
                const startMs = Date.parse(res.interval.startInstant);
                if (startMs >= nowMs) {
                  await tx.put(STORE_NAMES.reservations, {
                    ...res,
                    state: 'released',
                    releaseMetadata: {
                      releasedAt: nowIso,
                      reason: 'manual_unplan',
                      originalStartInstant: res.interval.startInstant,
                      originalEndInstant: res.interval.endInstant,
                    },
                    updatedAt: nowIso,
                    revision: res.revision + 1,
                  });
                }
              }
            }

            const updated: Task = {
              ...existing,
              planningState: action.plannedDate ? 'date_only' : 'unplanned',
              plannedDate: action.plannedDate,
              updatedAt: nowIso,
              revision: existing.revision + 1,
            };
            validateTaskRecord(updated, validationCtx);
            await tx.put(STORE_NAMES.tasks, updated);
            updatedCount++;
          } else if (action.kind === 'move_ownership') {
            const updated: Task = {
              ...existing,
              ownership: action.ownership,
              updatedAt: nowIso,
              revision: existing.revision + 1,
            };
            validateTaskRecord(updated, validationCtx);
            await tx.put(STORE_NAMES.tasks, updated);
            updatedCount++;
          }
        }

        return updatedCount;
      }
    );
  }

  public async saveCalendarEvent(
    event: CalendarEvent,
    expectedRevision?: number
  ): Promise<CalendarEvent> {
    this.tabSync.assertNoRemoteImportInProgress();
    validateCalendarEventRecord(event);

    return this.engine.runTransaction(
      [STORE_NAMES.events],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<CalendarEvent>(
          STORE_NAMES.events,
          event.id
        );
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: CalendarEvent = { ...event, revision: nextRev };
        validateCalendarEventRecord(record);
        await tx.put(STORE_NAMES.events, record);
        return record;
      }
    );
  }

  public async rescheduleCalendarEventTransactionally(
    eventId: EntityId,
    nextSchedule: EventTemporalSchedule,
    nowIso: IsoInstantString,
    expectedRevision?: number
  ): Promise<CalendarEvent> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.events],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<CalendarEvent>(
          STORE_NAMES.events,
          eventId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', eventId);
        }
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const updated: CalendarEvent = {
          ...existing,
          schedule: nextSchedule,
          updatedAt: nowIso,
          revision: nextRev,
        };
        validateCalendarEventRecord(updated);
        await tx.put(STORE_NAMES.events, updated);
        return updated;
      }
    );
  }

  public async cancelCalendarEventTransactionally(
    eventId: EntityId,
    nowIso: IsoInstantString,
    expectedRevision?: number
  ): Promise<CalendarEvent> {
    this.tabSync.assertNoRemoteImportInProgress();

    return this.engine.runTransaction(
      [STORE_NAMES.events],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<CalendarEvent>(
          STORE_NAMES.events,
          eventId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', eventId);
        }
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const updated: CalendarEvent = {
          ...existing,
          state: 'canceled',
          updatedAt: nowIso,
          revision: nextRev,
        };
        validateCalendarEventRecord(updated);
        await tx.put(STORE_NAMES.events, updated);
        return updated;
      }
    );
  }

  public async deleteCalendarEventTransactionally(
    eventId: EntityId
  ): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    await this.engine.runTransaction(
      [STORE_NAMES.events],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<CalendarEvent>(
          STORE_NAMES.events,
          eventId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', eventId);
        }
        await tx.delete(STORE_NAMES.events, eventId);
      }
    );
  }

  public async saveShiftTemplate(
    tpl: ShiftTemplate,
    expectedRevision?: number
  ): Promise<ShiftTemplate> {
    this.tabSync.assertNoRemoteImportInProgress();
    validateShiftTemplateRecord(tpl);

    const saved = await this.engine.runTransaction(
      [STORE_NAMES.shiftTemplates, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const allTemplates = await tx.getAll<ShiftTemplate>(
          STORE_NAMES.shiftTemplates
        );
        const normalizedCode = tpl.code.trim().toUpperCase();
        const duplicateCode = allTemplates.find(
          (other) =>
            other.id !== tpl.id &&
            other.code.trim().toUpperCase() === normalizedCode
        );
        if (duplicateCode) {
          throw new PlanuiError('ROSTER_TEMPLATE_CODE_DUPLICATE', tpl.code);
        }

        const existing = allTemplates.find((item) => item.id === tpl.id);
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: ShiftTemplate = {
          ...tpl,
          code: tpl.code.trim(),
          name: tpl.name.trim(),
          revision: nextRev,
        };
        validateShiftTemplateRecord(record);
        await tx.put(STORE_NAMES.shiftTemplates, record);
        const settings = await this.ensureSettingsInTx(tx, record.updatedAt);
        return { record, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.shiftTemplates],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.record.updatedAt,
    });
    return saved.record;
  }

  /**
   * 8.2 Delete a shift template without rewriting or deleting any previously applied work shift events.
   */
  public async deleteShiftTemplateTransactionally(
    templateId: EntityId,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();

    const res = await this.engine.runTransaction(
      [STORE_NAMES.shiftTemplates, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<ShiftTemplate>(
          STORE_NAMES.shiftTemplates,
          templateId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', templateId);
        }
        await tx.delete(STORE_NAMES.shiftTemplates, templateId);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.shiftTemplates],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });
  }

  public async saveDayOffAnnotationTransactionally(
    ann: DayOffAnnotation,
    expectedRevision?: number
  ): Promise<DayOffAnnotation> {
    this.tabSync.assertNoRemoteImportInProgress();
    validateDayOffAnnotationRecord(ann);

    const res = await this.engine.runTransaction(
      [STORE_NAMES.dayOffAnnotations, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const allAnns = await tx.getAll<DayOffAnnotation>(
          STORE_NAMES.dayOffAnnotations
        );
        const existingById = allAnns.find((a) => a.id === ann.id);
        const existingByDate = allAnns.find(
          (a) => a.localDate === ann.localDate && a.id !== ann.id
        );
        if (existingByDate) {
          await tx.delete(STORE_NAMES.dayOffAnnotations, existingByDate.id);
        }

        const nextRev = this.assertRevisionMatch(existingById, expectedRevision);
        const record: DayOffAnnotation = {
          ...ann,
          revision: nextRev,
        };
        validateDayOffAnnotationRecord(record);
        await tx.put(STORE_NAMES.dayOffAnnotations, record);
        const settings = await this.ensureSettingsInTx(tx, record.updatedAt);
        return { record, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.dayOffAnnotations],
      dbGeneration: res.dbGeneration,
      timestamp: res.record.updatedAt,
    });
    return res.record;
  }

  public async deleteDayOffAnnotationTransactionally(
    annotationId: EntityId,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();

    const res = await this.engine.runTransaction(
      [STORE_NAMES.dayOffAnnotations, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<DayOffAnnotation>(
          STORE_NAMES.dayOffAnnotations,
          annotationId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', annotationId);
        }
        await tx.delete(STORE_NAMES.dayOffAnnotations, annotationId);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.dayOffAnnotations],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });
  }

  /**
   * 8.3 / 8.4 / 8.5 / 8.7: Transactional roster batch commit with atomic validation
   * and revision-safe undo token capture.
   */
  public async applyRosterBatchTransactionally(
    batch: {
      eventsToSave: CalendarEvent[];
      dayOffAnnotationsToSave: DayOffAnnotation[];
      eventIdsToDelete?: EntityId[];
      dayOffAnnotationIdsToDelete?: EntityId[];
    },
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<{
    savedEvents: number;
    savedDayOffs: number;
    deletedEvents: number;
    deletedDayOffs: number;
    undoToken: RosterBatchUndoToken;
  }> {
    this.tabSync.assertNoRemoteImportInProgress();

    // Validate all records BEFORE opening write transaction so any failure leaves zero partial data
    for (const ev of batch.eventsToSave) {
      validateCalendarEventRecord(ev);
    }
    for (const ann of batch.dayOffAnnotationsToSave) {
      validateDayOffAnnotationRecord(ann);
    }

    const committed = await this.engine.runTransaction(
      [
        STORE_NAMES.events,
        STORE_NAMES.dayOffAnnotations,
        STORE_NAMES.settings,
      ],
      'readwrite',
      async (tx) => {
        const eventMutations: RosterBatchUndoToken['eventMutations'] = [];
        const dayOffMutations: RosterBatchUndoToken['dayOffMutations'] = [];

        const evIdsToDelete = Array.from(
          new Set(batch.eventIdsToDelete ?? [])
        );
        const doIdsToDelete = Array.from(
          new Set(batch.dayOffAnnotationIdsToDelete ?? [])
        );

        let deletedEvents = 0;
        for (const evId of evIdsToDelete) {
          const existingEv = await tx.get<CalendarEvent>(
            STORE_NAMES.events,
            evId
          );
          if (existingEv) {
            eventMutations.push({
              id: evId,
              previousSnapshot: existingEv,
              postBatchRevision: null,
            });
            await tx.delete(STORE_NAMES.events, evId);
            deletedEvents++;
          }
        }

        let deletedDayOffs = 0;
        for (const doId of doIdsToDelete) {
          const existingDo = await tx.get<DayOffAnnotation>(
            STORE_NAMES.dayOffAnnotations,
            doId
          );
          if (existingDo) {
            dayOffMutations.push({
              id: doId,
              previousSnapshot: existingDo,
              postBatchRevision: null,
            });
            await tx.delete(STORE_NAMES.dayOffAnnotations, doId);
            deletedDayOffs++;
          }
        }

        for (const ev of batch.eventsToSave) {
          const existingEv = await tx.get<CalendarEvent>(
            STORE_NAMES.events,
            ev.id
          );
          const nextRev = existingEv ? existingEv.revision + 1 : 1;
          const record: CalendarEvent = {
            ...ev,
            updatedAt: nowIso,
            revision: nextRev,
          };
          validateCalendarEventRecord(record);
          await tx.put(STORE_NAMES.events, record);
          eventMutations.push({
            id: record.id,
            previousSnapshot: existingEv ?? null,
            postBatchRevision: nextRev,
          });
        }

        for (const ann of batch.dayOffAnnotationsToSave) {
          const existingDo = await tx.get<DayOffAnnotation>(
            STORE_NAMES.dayOffAnnotations,
            ann.id
          );
          const nextRev = existingDo ? existingDo.revision + 1 : 1;
          const record: DayOffAnnotation = {
            ...ann,
            updatedAt: nowIso,
            revision: nextRev,
          };
          validateDayOffAnnotationRecord(record);
          await tx.put(STORE_NAMES.dayOffAnnotations, record);
          dayOffMutations.push({
            id: record.id,
            previousSnapshot: existingDo ?? null,
            postBatchRevision: nextRev,
          });
        }

        const settings = await this.ensureSettingsInTx(tx, nowIso);
        const undoToken: RosterBatchUndoToken = {
          createdAt: nowIso,
          eventMutations,
          dayOffMutations,
        };

        return {
          savedEvents: batch.eventsToSave.length,
          savedDayOffs: batch.dayOffAnnotationsToSave.length,
          deletedEvents,
          deletedDayOffs,
          undoToken,
          dbGeneration: settings.dbGeneration,
        };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.events, STORE_NAMES.dayOffAnnotations],
      dbGeneration: committed.dbGeneration,
      timestamp: nowIso,
    });

    return {
      savedEvents: committed.savedEvents,
      savedDayOffs: committed.savedDayOffs,
      deletedEvents: committed.deletedEvents,
      deletedDayOffs: committed.deletedDayOffs,
      undoToken: committed.undoToken,
    };
  }

  /**
   * 8.3 / 8.7: Revision-safe bounded undo for a roster batch.
   * Checks current revisions of affected records and preserves any records that were modified after the batch.
   */
  public async undoRosterBatchTransactionally(
    undoToken: RosterBatchUndoToken,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<{
    restoredEventsCount: number;
    restoredDayOffsCount: number;
    preservedLaterEditsCount: number;
  }> {
    this.tabSync.assertNoRemoteImportInProgress();

    const res = await this.engine.runTransaction(
      [
        STORE_NAMES.events,
        STORE_NAMES.dayOffAnnotations,
        STORE_NAMES.settings,
      ],
      'readwrite',
      async (tx) => {
        let restoredEventsCount = 0;
        let restoredDayOffsCount = 0;
        let preservedLaterEditsCount = 0;

        // Process event mutations in reverse order
        for (let i = undoToken.eventMutations.length - 1; i >= 0; i--) {
          const mut = undoToken.eventMutations[i];
          const current = await tx.get<CalendarEvent>(
            STORE_NAMES.events,
            mut.id
          );

          if (mut.postBatchRevision !== null) {
            // The batch created or updated this event
            if (!current || current.revision !== mut.postBatchRevision) {
              // Modified or deleted after batch — preserve later edit!
              preservedLaterEditsCount++;
              continue;
            }
            if (mut.previousSnapshot === null) {
              await tx.delete(STORE_NAMES.events, mut.id);
              restoredEventsCount++;
            } else {
              const restored: CalendarEvent = {
                ...mut.previousSnapshot,
                updatedAt: nowIso,
                revision: current.revision + 1,
              };
              await tx.put(STORE_NAMES.events, restored);
              restoredEventsCount++;
            }
          } else if (mut.previousSnapshot !== null) {
            // The batch deleted this event
            if (current) {
              // Recreated after batch — preserve later edit
              preservedLaterEditsCount++;
              continue;
            }
            const restored: CalendarEvent = {
              ...mut.previousSnapshot,
              updatedAt: nowIso,
              revision: mut.previousSnapshot.revision + 1,
            };
            await tx.put(STORE_NAMES.events, restored);
            restoredEventsCount++;
          }
        }

        const allCurrentDayOffs = await tx.getAll<DayOffAnnotation>(
          STORE_NAMES.dayOffAnnotations
        );

        // Process day-off mutations in reverse order
        for (let i = undoToken.dayOffMutations.length - 1; i >= 0; i--) {
          const mut = undoToken.dayOffMutations[i];
          const current = await tx.get<DayOffAnnotation>(
            STORE_NAMES.dayOffAnnotations,
            mut.id
          );

          if (mut.postBatchRevision !== null) {
            if (!current || current.revision !== mut.postBatchRevision) {
              preservedLaterEditsCount++;
              continue;
            }
            if (mut.previousSnapshot === null) {
              await tx.delete(STORE_NAMES.dayOffAnnotations, mut.id);
              restoredDayOffsCount++;
            } else {
              const restored: DayOffAnnotation = {
                ...mut.previousSnapshot,
                updatedAt: nowIso,
                revision: current.revision + 1,
              };
              await tx.put(STORE_NAMES.dayOffAnnotations, restored);
              restoredDayOffsCount++;
            }
          } else if (mut.previousSnapshot !== null) {
            const prevDate = mut.previousSnapshot.localDate;
            const newerOnSameDate = allCurrentDayOffs.find(
              (a) =>
                a.localDate === prevDate &&
                !undoToken.dayOffMutations.some(
                  (m) =>
                    m.id === a.id &&
                    m.postBatchRevision !== null &&
                    a.revision === m.postBatchRevision
                )
            );
            if (current || newerOnSameDate) {
              preservedLaterEditsCount++;
              continue;
            }
            const restored: DayOffAnnotation = {
              ...mut.previousSnapshot,
              updatedAt: nowIso,
              revision: mut.previousSnapshot.revision + 1,
            };
            await tx.put(STORE_NAMES.dayOffAnnotations, restored);
            restoredDayOffsCount++;
          }
        }

        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return {
          restoredEventsCount,
          restoredDayOffsCount,
          preservedLaterEditsCount,
          dbGeneration: settings.dbGeneration,
        };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.events, STORE_NAMES.dayOffAnnotations],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });

    return {
      restoredEventsCount: res.restoredEventsCount,
      restoredDayOffsCount: res.restoredDayOffsCount,
      preservedLaterEditsCount: res.preservedLaterEditsCount,
    };
  }

  public async saveHabit(
    habit: Habit,
    expectedRevision?: number
  ): Promise<Habit> {
    this.tabSync.assertNoRemoteImportInProgress();
    const sortedHabit: Habit = {
      ...habit,
      name: habit.name.trim(),
      ruleRevisions: sortHabitRuleRevisions(habit.ruleRevisions),
    };
    validateHabitRecord(sortedHabit);

    const saved = await this.engine.runTransaction(
      [STORE_NAMES.habits, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<Habit>(STORE_NAMES.habits, sortedHabit.id);
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: Habit = { ...sortedHabit, revision: nextRev };
        validateHabitRecord(record);
        await tx.put(STORE_NAMES.habits, record);
        const settings = await this.ensureSettingsInTx(tx, record.updatedAt);
        return { record, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.habits],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.record.updatedAt,
    });

    return saved.record;
  }

  /**
   * 9.3: Appends or updates an effective-dated schedule revision on an existing habit
   * without rewriting historical rule revisions or historical habit entries.
   */
  public async saveHabitRuleRevisionTransactionally(
    habitId: EntityId,
    newRevision: HabitRuleRevision,
    nowIso: IsoInstantString = new Date().toISOString(),
    expectedRevision?: number
  ): Promise<Habit> {
    this.tabSync.assertNoRemoteImportInProgress();

    const saved = await this.engine.runTransaction(
      [STORE_NAMES.habits, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<Habit>(STORE_NAMES.habits, habitId);
        if (!existing) {
          throw new PlanuiError('HABIT_NOT_FOUND', habitId);
        }
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const updatedRevisions = appendEffectiveHabitRuleRevision(
          existing.ruleRevisions,
          newRevision
        );
        const updatedHabit: Habit = {
          ...existing,
          ruleRevisions: updatedRevisions,
          updatedAt: nowIso,
          revision: nextRev,
        };
        validateHabitRecord(updatedHabit);
        await tx.put(STORE_NAMES.habits, updatedHabit);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { record: updatedHabit, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.habits],
      dbGeneration: saved.dbGeneration,
      timestamp: nowIso,
    });

    return saved.record;
  }

  /**
   * 9.1 / 9.3: Transitions a habit between 'active', 'paused', and 'archived' states
   * while preserving all existing habit entries and rule revision history.
   */
  public async updateHabitStateTransactionally(
    habitId: EntityId,
    nextState: HabitLifecycleState,
    nowIso: IsoInstantString = new Date().toISOString(),
    expectedRevision?: number
  ): Promise<Habit> {
    this.tabSync.assertNoRemoteImportInProgress();

    const saved = await this.engine.runTransaction(
      [STORE_NAMES.habits, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<Habit>(STORE_NAMES.habits, habitId);
        if (!existing) {
          throw new PlanuiError('HABIT_NOT_FOUND', habitId);
        }
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const updatedHabit: Habit = {
          ...existing,
          state: nextState,
          updatedAt: nowIso,
          revision: nextRev,
        };
        validateHabitRecord(updatedHabit);
        await tx.put(STORE_NAMES.habits, updatedHabit);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { record: updatedHabit, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.habits],
      dbGeneration: saved.dbGeneration,
      timestamp: nowIso,
    });

    return saved.record;
  }

  public async saveHabitEntry(
    entry: HabitEntry,
    expectedRevision?: number
  ): Promise<HabitEntry> {
    this.tabSync.assertNoRemoteImportInProgress();

    const saved = await this.engine.runTransaction(
      [STORE_NAMES.habitEntries, STORE_NAMES.habits, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const habit = await tx.get<Habit>(STORE_NAMES.habits, entry.habitId);
        if (!habit) {
          throw new PlanuiError('HABIT_NOT_FOUND', entry.habitId);
        }

        const allEntries = await tx.getAll<HabitEntry>(
          STORE_NAMES.habitEntries
        );
        const duplicate = allEntries.find(
          (e) =>
            e.habitId === entry.habitId &&
            e.localDate === entry.localDate &&
            e.id !== entry.id
        );
        if (duplicate) {
          throw new PlanuiError(
            'HABIT_DUPLICATE_BINARY_ENTRY',
            `${entry.habitId}::${entry.localDate}`
          );
        }

        const existing = allEntries.find((e) => e.id === entry.id);
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: HabitEntry = { ...entry, revision: nextRev };
        validateHabitEntryRecord(record, new Set([habit.id]));
        await tx.put(STORE_NAMES.habitEntries, record);
        const settings = await this.ensureSettingsInTx(tx, record.updatedAt);
        return { record, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.habitEntries],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.record.updatedAt,
    });

    return saved.record;
  }

  /**
   * 9.2 / 9.4: Records or updates a habit entry for an explicit localDate in one atomic transaction.
   * Prevents duplicate (habitId, localDate) entries, computes consistent numeric progress ('completed' vs 'partial'),
   * and serves both Today and Habits from the same underlying store.
   */
  public async recordHabitEntryForDateTransactionally(params: {
    habitId: EntityId;
    localDate: LocalDateString;
    input: HabitRecordingInput;
    nowIso?: IsoInstantString;
  }): Promise<HabitEntry | null> {
    this.tabSync.assertNoRemoteImportInProgress();
    const nowIso = params.nowIso ?? new Date().toISOString();

    const res = await this.engine.runTransaction(
      [STORE_NAMES.habitEntries, STORE_NAMES.habits, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const habit = await tx.get<Habit>(STORE_NAMES.habits, params.habitId);
        if (!habit) {
          throw new PlanuiError('HABIT_NOT_FOUND', params.habitId);
        }

        const allEntries = await tx.getAll<HabitEntry>(
          STORE_NAMES.habitEntries
        );
        const existingEntry =
          allEntries.find(
            (e) =>
              e.habitId === params.habitId && e.localDate === params.localDate
          ) ?? null;

        const mutation = resolveHabitEntryMutation({
          habit,
          existingEntry,
          localDate: params.localDate,
          input: params.input,
          nowIso,
        });

        let savedEntry: HabitEntry | null = null;
        if (mutation.action === 'delete') {
          await tx.delete(STORE_NAMES.habitEntries, mutation.entryId);
          savedEntry = null;
        } else if (mutation.action === 'upsert') {
          validateHabitEntryRecord(mutation.entry, new Set([habit.id]));
          await tx.put(STORE_NAMES.habitEntries, mutation.entry);
          savedEntry = mutation.entry;
        } else {
          savedEntry = existingEntry;
        }

        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { savedEntry, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.habitEntries],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });

    return res.savedEntry;
  }

  public async deleteHabitEntryTransactionally(
    entryId: EntityId,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();

    const res = await this.engine.runTransaction(
      [STORE_NAMES.habitEntries, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        await tx.delete(STORE_NAMES.habitEntries, entryId);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.habitEntries],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });
  }

  /**
   * 9.3: Permanently deletes a habit along with its dated history after user confirmation.
   */
  public async deleteHabitWithHistoryTransactionally(
    habitId: EntityId,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<{ deletedEntriesCount: number }> {
    this.tabSync.assertNoRemoteImportInProgress();

    const res = await this.engine.runTransaction(
      [STORE_NAMES.habits, STORE_NAMES.habitEntries, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existingHabit = await tx.get<Habit>(STORE_NAMES.habits, habitId);
        if (!existingHabit) {
          throw new PlanuiError('HABIT_NOT_FOUND', habitId);
        }

        const allEntries = await tx.getAll<HabitEntry>(
          STORE_NAMES.habitEntries
        );
        let deletedEntriesCount = 0;
        for (const entry of allEntries) {
          if (entry.habitId === habitId) {
            await tx.delete(STORE_NAMES.habitEntries, entry.id);
            deletedEntriesCount++;
          }
        }

        await tx.delete(STORE_NAMES.habits, habitId);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return {
          deletedEntriesCount,
          dbGeneration: settings.dbGeneration,
        };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.habits, STORE_NAMES.habitEntries],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });

    return { deletedEntriesCount: res.deletedEntriesCount };
  }

  public async savePersonalRecord(
    rec: PersonalRecord,
    expectedRevision?: number
  ): Promise<PersonalRecord> {
    this.tabSync.assertNoRemoteImportInProgress();
    validatePersonalRecord(rec);

    const saved = await this.engine.runTransaction(
      [STORE_NAMES.personalRecords, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<PersonalRecord>(
          STORE_NAMES.personalRecords,
          rec.id
        );
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: PersonalRecord = { ...rec, revision: nextRev };
        validatePersonalRecord(record);
        await tx.put(STORE_NAMES.personalRecords, record);
        const settings = await this.ensureSettingsInTx(tx, record.updatedAt);
        return { record, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.personalRecords],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.record.updatedAt,
    });
    return saved.record;
  }

  public async deletePersonalRecordTransactionally(
    recordId: EntityId,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    const res = await this.engine.runTransaction(
      [STORE_NAMES.personalRecords, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<PersonalRecord>(
          STORE_NAMES.personalRecords,
          recordId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', recordId);
        }
        await tx.delete(STORE_NAMES.personalRecords, recordId);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.personalRecords],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });
  }

  public async setLifeAreaLink(kind: Exclude<LifeLinkKind, 'reservation'>, id: string, areaId: string | null, expectedRevision: number): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    const stores = { inspiration: STORE_NAMES.inspirationItems, folder: STORE_NAMES.folders, goal: STORE_NAMES.goals, project: STORE_NAMES.projects, task: STORE_NAMES.tasks, habit: STORE_NAMES.habits, event: STORE_NAMES.events };
    const store = stores[kind];
    if (!store) throw new PlanuiError('VALIDATION_FAILED');
    await this.engine.runTransaction([store, STORE_NAMES.lifeAreaQuestions], 'readwrite', async tx => {
      if (areaId) { const area = await tx.get<LifeAreaQuestion>(STORE_NAMES.lifeAreaQuestions, areaId); if (!area || area.mergedIntoId) throw new PlanuiError('ENTITY_NOT_FOUND'); }
      const current = await tx.get<{ id: string; revision: number }>(store, id);
      if (!current) throw new PlanuiError('ENTITY_NOT_FOUND');
      await tx.put(store, { ...current, lifeAreaId: areaId, revision: this.assertRevisionMatch(current, expectedRevision), updatedAt: new Date().toISOString() });
    });
  }

  public async addOrMapStarterArea(key: string, targetId: string | null): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    const starter = STARTER_LIFE_AREAS.find(([id]) => id === key);
    if (!starter) throw new PlanuiError('VALIDATION_FAILED');
    await this.engine.runTransaction([STORE_NAMES.lifeAreaQuestions], 'readwrite', async tx => {
      const areas = await tx.getAll<LifeAreaQuestion>(STORE_NAMES.lifeAreaQuestions);
      if (areas.some(a => a.starterKeys?.includes(key))) throw new PlanuiError('STALE_WRITE_CONFLICT');
      const now = new Date().toISOString();
      if (targetId) {
        const target = areas.find(a => a.id === targetId && !a.mergedIntoId);
        if (!target) throw new PlanuiError('ENTITY_NOT_FOUND');
        await tx.put(STORE_NAMES.lifeAreaQuestions, { ...target, starterKeys: [...(target.starterKeys ?? []), key], updatedAt: now, revision: target.revision + 1 });
      } else {
        await tx.put(STORE_NAMES.lifeAreaQuestions, { id: crypto.randomUUID(), questionTextUk: starter[1], starterKeys: [key], order: Math.max(-1, ...areas.map(a => a.order)) + 1, version: 1, revision: 1, updatedAt: now, archived: false, mergedIntoId: null, goodEnoughUk: null });
      }
    });
  }

  public async reorderLifeAreas(ids: readonly string[], revisions: Record<string, number>): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    await this.engine.runTransaction([STORE_NAMES.lifeAreaQuestions], 'readwrite', async tx => {
      const areas = await tx.getAll<LifeAreaQuestion>(STORE_NAMES.lifeAreaQuestions);
      if (ids.length !== areas.length || new Set(ids).size !== ids.length || areas.some(a => !ids.includes(a.id) || revisions[a.id] !== a.revision)) throw new PlanuiError('STALE_WRITE_CONFLICT');
      for (const area of areas) await tx.put(STORE_NAMES.lifeAreaQuestions, { ...area, order: ids.indexOf(area.id), revision: area.revision + 1, updatedAt: new Date().toISOString() });
    });
  }

  public async mergeLifeAreas(sourceId: string, targetId: string, sourceRevision: number, targetRevision: number, reviewedSignature: string, explicitConfirmation: boolean): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    if (!explicitConfirmation || sourceId === targetId) throw new PlanuiError('VALIDATION_FAILED');
    const stores = { inspiration: STORE_NAMES.inspirationItems, folder: STORE_NAMES.folders, goal: STORE_NAMES.goals, project: STORE_NAMES.projects, task: STORE_NAMES.tasks, habit: STORE_NAMES.habits, event: STORE_NAMES.events };
    await this.engine.runTransaction([STORE_NAMES.lifeAreaQuestions, ...Object.values(stores), STORE_NAMES.reservations], 'readwrite', async tx => {
      const areas = await tx.getAll<LifeAreaQuestion>(STORE_NAMES.lifeAreaQuestions);
      const source = areas.find(a => a.id === sourceId), target = areas.find(a => a.id === targetId);
      if (!source || !target || source.mergedIntoId || target.mergedIntoId || target.archived) throw new PlanuiError('VALIDATION_FAILED');
      this.assertRevisionMatch(source, sourceRevision); this.assertRevisionMatch(target, targetRevision);
      const data: LifeLinkSource = { inspirationItems: await tx.getAll<InspirationItem>(STORE_NAMES.inspirationItems), folders: await tx.getAll(STORE_NAMES.folders), goals: await tx.getAll(STORE_NAMES.goals), projects: await tx.getAll(STORE_NAMES.projects), tasks: await tx.getAll(STORE_NAMES.tasks), habits: await tx.getAll(STORE_NAMES.habits), events: await tx.getAll(STORE_NAMES.events), reservations: await tx.getAll(STORE_NAMES.reservations) };
      if (lifeAreaMergeSignature(data, sourceId) !== reviewedSignature) throw new PlanuiError('STALE_WRITE_CONFLICT');
      const now = new Date().toISOString();
      for (const link of directMergeLinks(data, sourceId)) {
        if (link.kind === 'reservation') continue;
        const store = stores[link.kind];
        const record = await tx.get<{ id: string; revision: number }>(store, link.id);
        if (record) await tx.put(store, { ...record, lifeAreaId: targetId, revision: record.revision + 1, updatedAt: now });
      }
      await tx.put(STORE_NAMES.lifeAreaQuestions, { ...source, archived: true, mergedIntoId: targetId, revision: source.revision + 1, updatedAt: now });
      await tx.put(STORE_NAMES.lifeAreaQuestions, { ...target, starterKeys: [...new Set([...(target.starterKeys ?? []), ...(source.starterKeys ?? [])])], revision: target.revision + 1, updatedAt: now });
    });
  }

  public async saveLifeAreaQuestion(
    question: LifeAreaQuestion,
    expectedRevision?: number
  ): Promise<LifeAreaQuestion> {
    this.tabSync.assertNoRemoteImportInProgress();
    validateLifeAreaQuestion(question);

    const saved = await this.engine.runTransaction(
      [STORE_NAMES.lifeAreaQuestions, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<LifeAreaQuestion>(
          STORE_NAMES.lifeAreaQuestions,
          question.id
        );
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: LifeAreaQuestion = { ...question, revision: nextRev };
        validateLifeAreaQuestion(record);
        await tx.put(STORE_NAMES.lifeAreaQuestions, record);
        const settings = await this.ensureSettingsInTx(tx, record.updatedAt);
        return { record, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.lifeAreaQuestions],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.record.updatedAt,
    });
    return saved.record;
  }

  public async saveLifeAreaAssessment(
    assessment: LifeAreaAssessment,
    expectedRevision?: number
  ): Promise<LifeAreaAssessment> {
    this.tabSync.assertNoRemoteImportInProgress();
    validateLifeAreaAssessment(assessment);

    const saved = await this.engine.runTransaction(
      [STORE_NAMES.lifeAreaAssessments, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<LifeAreaAssessment>(
          STORE_NAMES.lifeAreaAssessments,
          assessment.id
        );
        if (existing) throw new PlanuiError('REVIEW_IMMUTABLE');
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: LifeAreaAssessment = { ...assessment, revision: nextRev };
        validateLifeAreaAssessment(record);
        await tx.put(STORE_NAMES.lifeAreaAssessments, record);
        const settings = await this.ensureSettingsInTx(tx, record.updatedAt);
        return { record, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.lifeAreaAssessments],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.record.updatedAt,
    });
    return saved.record;
  }

  public async deleteLifeAreaAssessmentTransactionally(
    assessmentId: EntityId,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    const res = await this.engine.runTransaction(
      [STORE_NAMES.lifeAreaAssessments, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<LifeAreaAssessment>(
          STORE_NAMES.lifeAreaAssessments,
          assessmentId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', assessmentId);
        }
        await tx.delete(STORE_NAMES.lifeAreaAssessments, assessmentId);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.lifeAreaAssessments],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });
  }

  public async saveInspirationWithMediaTransactionally(
    item: InspirationItem,
    media?: { meta: MediaAssetMeta; bytes: Uint8Array },
    expectedRevision?: number
  ): Promise<InspirationItem> {
    this.tabSync.assertNoRemoteImportInProgress();
    if (media) {
      validateMediaAssetMetaAndBytes(media.meta, media.bytes);
    }

    const saved = await this.engine.runTransaction(
      [
        STORE_NAMES.goals, STORE_NAMES.lifeAreaQuestions, STORE_NAMES.inspirationItems,
        STORE_NAMES.mediaMeta,
        STORE_NAMES.mediaBlobs,
        STORE_NAMES.settings,
      ],
      'readwrite',
      async (tx) => {
        if (media) {
          await tx.put(STORE_NAMES.mediaMeta, media.meta);
          const blobRec: MediaBlobRecord = {
            id: media.meta.id,
            mimeType: media.meta.mimeType,
            bytes: new Uint8Array(media.bytes),
          };
          await tx.put(STORE_NAMES.mediaBlobs, blobRec);
        }

        const allMediaMeta = await tx.getAll<MediaAssetMeta>(
          STORE_NAMES.mediaMeta
        );
        const mediaIds = new Set(allMediaMeta.map((m) => m.id));

        const existing = await tx.get<InspirationItem>(
          STORE_NAMES.inspirationItems,
          item.id
        );
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: InspirationItem = { ...item, revision: nextRev };
        validateInspirationItemRecord(record, mediaIds);
        if (record.goalId != null && !await tx.get(STORE_NAMES.goals, record.goalId)) throw new PlanuiError('VALIDATION_FAILED');
        if (record.lifeAreaId != null && !await tx.get(STORE_NAMES.lifeAreaQuestions, record.lifeAreaId)) throw new PlanuiError('VALIDATION_FAILED');
        await tx.put(STORE_NAMES.inspirationItems, record);
        const settings = await this.ensureSettingsInTx(tx, record.updatedAt);
        return { record, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.inspirationItems, STORE_NAMES.mediaMeta],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.record.updatedAt,
    });
    return saved.record;
  }

  /**
   * 10.4 / C20: Deletes an InspirationItem and removes its media asset ONLY if
   * the media asset is not referenced by any other live InspirationItem or retained RecoverySnapshotRecord.
   */
  public async deleteInspirationItemTransactionally(
    itemId: EntityId,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<{ deletedMediaAsset: boolean }> {
    this.tabSync.assertNoRemoteImportInProgress();

    const res = await this.engine.runTransaction(
      [
        STORE_NAMES.inspirationItems,
        STORE_NAMES.mediaMeta,
        STORE_NAMES.mediaBlobs,
        STORE_NAMES.recoverySnapshots,
        STORE_NAMES.settings,
      ],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<InspirationItem>(
          STORE_NAMES.inspirationItems,
          itemId
        );
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', itemId);
        }

        let deletedMediaAsset = false;
        if (existing.mediaId) {
          const allLiveInspiration = await tx.getAll<InspirationItem>(
            STORE_NAMES.inspirationItems
          );
          const allSnapshots = await tx.getAll<RecoverySnapshotRecord>(
            STORE_NAMES.recoverySnapshots
          );
          const stillReferenced = isMediaReferencedByLiveOrSnapshots(
            existing.mediaId,
            allLiveInspiration,
            allSnapshots,
            existing.id
          );
          if (!stillReferenced) {
            await tx.delete(STORE_NAMES.mediaMeta, existing.mediaId);
            await tx.delete(STORE_NAMES.mediaBlobs, existing.mediaId);
            deletedMediaAsset = true;
          }
        }

        await tx.delete(STORE_NAMES.inspirationItems, itemId);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { deletedMediaAsset, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.inspirationItems, STORE_NAMES.mediaMeta],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });

    return { deletedMediaAsset: res.deletedMediaAsset };
  }

  public async saveWishlistCategory(
    category: WishlistCategory,
    expectedRevision?: number
  ): Promise<WishlistCategory> {
    this.tabSync.assertNoRemoteImportInProgress();
    validateWishlistCategoryRecord(category);

    const saved = await this.engine.runTransaction(
      [STORE_NAMES.wishlistCategories, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<WishlistCategory>(
          STORE_NAMES.wishlistCategories,
          category.id
        );
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: WishlistCategory = { ...category, revision: nextRev };
        validateWishlistCategoryRecord(record);
        await tx.put(STORE_NAMES.wishlistCategories, record);
        const settings = await this.ensureSettingsInTx(tx, record.updatedAt);
        return { record, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.wishlistCategories],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.record.updatedAt,
    });
    return saved.record;
  }

  public async reorderWishlistCategoriesTransactionally(
    orderedCategoryIds: readonly EntityId[],
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    const res = await this.engine.runTransaction(
      [STORE_NAMES.wishlistCategories, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const allCategories = await tx.getAll<WishlistCategory>(
          STORE_NAMES.wishlistCategories
        );
        const byId = new Map(allCategories.map((c) => [c.id, c]));
        let order = 1;
        for (const id of orderedCategoryIds) {
          const cat = byId.get(id);
          if (cat) {
            await tx.put(STORE_NAMES.wishlistCategories, {
              ...cat,
              order: order++,
              updatedAt: nowIso,
              revision: cat.revision + 1,
            });
          }
        }
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.wishlistCategories],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });
  }

  public async saveWishItem(
    wish: WishItem,
    expectedRevision?: number
  ): Promise<WishItem> {
    this.tabSync.assertNoRemoteImportInProgress();

    const saved = await this.engine.runTransaction(
      [
        STORE_NAMES.wishes,
        STORE_NAMES.wishlistCategories,
        STORE_NAMES.settings,
      ],
      'readwrite',
      async (tx) => {
        const categories = await tx.getAll<WishlistCategory>(
          STORE_NAMES.wishlistCategories
        );
        const categoryIds = new Set(categories.map((c) => c.id));
        const existing = await tx.get<WishItem>(STORE_NAMES.wishes, wish.id);
        const nextRev = this.assertRevisionMatch(existing, expectedRevision);
        const record: WishItem = { ...wish, revision: nextRev };
        validateWishItemRecord(record, categoryIds);
        await tx.put(STORE_NAMES.wishes, record);
        const settings = await this.ensureSettingsInTx(tx, record.updatedAt);
        return { record, dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.wishes],
      dbGeneration: saved.dbGeneration,
      timestamp: saved.record.updatedAt,
    });
    return saved.record;
  }

  public async deleteWishItemTransactionally(
    wishId: EntityId,
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<void> {
    this.tabSync.assertNoRemoteImportInProgress();
    const res = await this.engine.runTransaction(
      [STORE_NAMES.wishes, STORE_NAMES.settings],
      'readwrite',
      async (tx) => {
        const existing = await tx.get<WishItem>(STORE_NAMES.wishes, wishId);
        if (!existing) {
          throw new PlanuiError('ENTITY_NOT_FOUND', wishId);
        }
        await tx.delete(STORE_NAMES.wishes, wishId);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return { dbGeneration: settings.dbGeneration };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.wishes],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });
  }

  public async deleteWishlistCategoryTransactionally(
    categoryId: EntityId,
    nowIso: IsoInstantString
  ): Promise<{ reassignedWishesCount: number }> {
    this.tabSync.assertNoRemoteImportInProgress();

    const res = await this.engine.runTransaction(
      [
        STORE_NAMES.wishlistCategories,
        STORE_NAMES.wishes,
        STORE_NAMES.settings,
      ],
      'readwrite',
      async (tx) => {
        const existingCat = await tx.get<WishlistCategory>(
          STORE_NAMES.wishlistCategories,
          categoryId
        );
        if (!existingCat) {
          throw new PlanuiError('WISHLIST_CATEGORY_NOT_FOUND', categoryId);
        }

        const allWishes = await tx.getAll<WishItem>(STORE_NAMES.wishes);
        let reassignedWishesCount = 0;

        for (const wish of allWishes) {
          if (wish.categoryId === categoryId) {
            reassignedWishesCount++;
            await tx.put(STORE_NAMES.wishes, {
              ...wish,
              categoryId: null,
              updatedAt: nowIso,
              revision: wish.revision + 1,
            });
          }
        }

        await tx.delete(STORE_NAMES.wishlistCategories, categoryId);
        const settings = await this.ensureSettingsInTx(tx, nowIso);
        return {
          reassignedWishesCount,
          dbGeneration: settings.dbGeneration,
        };
      }
    );

    this.tabSync.broadcast({
      type: 'ENTITY_MUTATED',
      stores: [STORE_NAMES.wishlistCategories, STORE_NAMES.wishes],
      dbGeneration: res.dbGeneration,
      timestamp: nowIso,
    });

    return { reassignedWishesCount: res.reassignedWishesCount };
  }

  public async captureCoherentSnapshot(
    nowIso: IsoInstantString = new Date().toISOString()
  ): Promise<{
    snapshot: PlanuiDomainSnapshot;
    mediaBlobs: Map<string, Uint8Array>;
  }> {
    const existingSettings = await this.rawEngine.runTransaction(
      [STORE_NAMES.settings, STORE_NAMES.lifeAreaQuestions],
      'readonly',
      async (tx) => {
        const s = await tx.get<PlanuiSettings>(
          STORE_NAMES.settings,
          'singleton'
        );
        const q = await tx.getAll<LifeAreaQuestion>(
          STORE_NAMES.lifeAreaQuestions
        );
        return { s, hasQuestions: q.length > 0 };
      }
    );
    if (!existingSettings.s) {
      await this.getOrInitSettings(nowIso);
    }

    return this.engine.runTransaction(
      ALL_STORE_NAMES,
      'readonly',
      async (tx) => {
        const [
          folders,
          goals,
          projects,
          stages,
          tasks,
          reservations,
          events,
          shiftTemplates,
          dayOffAnnotations,
          habits,
          habitEntries,
          personalRecords,
          lifeAreaQuestions,
          lifeAreaAssessments,
          inspirationItems,
          mediaMeta,
          mediaBlobRecords,
          wishlistCategories,
          wishes,
          settingsRec,
        ] = await Promise.all([
          tx.getAll<Folder>(STORE_NAMES.folders),
          tx.getAll<Goal>(STORE_NAMES.goals),
          tx.getAll<Project>(STORE_NAMES.projects),
          tx.getAll<ProjectStage>(STORE_NAMES.stages),
          tx.getAll<Task>(STORE_NAMES.tasks),
          tx.getAll<TaskReservation>(STORE_NAMES.reservations),
          tx.getAll<CalendarEvent>(STORE_NAMES.events),
          tx.getAll<ShiftTemplate>(STORE_NAMES.shiftTemplates),
          tx.getAll<DayOffAnnotation>(STORE_NAMES.dayOffAnnotations),
          tx.getAll<Habit>(STORE_NAMES.habits),
          tx.getAll<HabitEntry>(STORE_NAMES.habitEntries),
          tx.getAll<PersonalRecord>(STORE_NAMES.personalRecords),
          tx.getAll<LifeAreaQuestion>(STORE_NAMES.lifeAreaQuestions),
          tx.getAll<LifeAreaAssessment>(STORE_NAMES.lifeAreaAssessments),
          tx.getAll<InspirationItem>(STORE_NAMES.inspirationItems),
          tx.getAll<MediaAssetMeta>(STORE_NAMES.mediaMeta),
          tx.getAll<MediaBlobRecord>(STORE_NAMES.mediaBlobs),
          tx.getAll<WishlistCategory>(STORE_NAMES.wishlistCategories),
          tx.getAll<WishItem>(STORE_NAMES.wishes),
          tx.get<PlanuiSettings>(STORE_NAMES.settings, 'singleton'),
        ]);

        const mediaBlobs = new Map<string, Uint8Array>();
        for (const mb of mediaBlobRecords) {
          const bytes =
            mb.bytes instanceof Uint8Array
              ? mb.bytes
              : new Uint8Array(Object.values(mb.bytes as unknown as Record<string, number>));
          mediaBlobs.set(mb.id, bytes);
        }

        const baseSettings = settingsRec ?? createDefaultSettings(nowIso);
        let resolvedModules: OptionalModulesSettings;
        if (!baseSettings.modules) {
          resolvedModules = {
            habitsEnabled: habits.length > 0,
            stateCheckInsEnabled:
              personalRecords.length > 0,
            desiredLifeEnabled: inspirationItems.length > 0,
            wishlistEnabled:
              wishes.length > 0 || wishlistCategories.length > 0,
          };
        } else if (baseSettings.modules.userConfigured) {
          resolvedModules = { ...baseSettings.modules };
        } else {
          resolvedModules = {
            habitsEnabled: baseSettings.modules.habitsEnabled || habits.length > 0,
            stateCheckInsEnabled:
              baseSettings.modules.stateCheckInsEnabled ||
              personalRecords.length > 0,
            desiredLifeEnabled:
              baseSettings.modules.desiredLifeEnabled ||
              inspirationItems.length > 0,
            wishlistEnabled:
              baseSettings.modules.wishlistEnabled ||
              wishes.length > 0 ||
              wishlistCategories.length > 0,
          };
        }
        const snapshot: PlanuiDomainSnapshot = {
          folders,
          goals,
          projects,
          stages,
          tasks,
          reservations,
          events,
          shiftTemplates,
          dayOffAnnotations,
          habits,
          habitEntries,
          personalRecords,
          lifeAreaQuestions,
          lifeAreaAssessments,
          inspirationItems,
          mediaMeta,
          wishlistCategories,
          wishes,
          settings: {
            ...baseSettings,
            modules: resolvedModules,
          },
        };

        return { snapshot, mediaBlobs };
      }
    );
  }

  public async listRecoverySnapshots(): Promise<RecoverySnapshotRecord[]> {
    return this.engine.runTransaction(
      [STORE_NAMES.recoverySnapshots],
      'readonly',
      async (tx) => {
        const all = await tx.getAll<RecoverySnapshotRecord>(
          STORE_NAMES.recoverySnapshots
        );
        return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
    );
  }
}
