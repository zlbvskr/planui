import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlanuiError } from '../../i18n/errorsUk';
import {
  Folder,
  Goal,
  Project,
  Task,
  TaskOwnership,
  PLANUI_DB_SCHEMA_VERSION,
  PLANUI_BACKUP_VERSION,
} from '../../domain/types';
import {
  validateFolderRecord,
  validateGoalRecord,
  validateProjectRecord,
  validateTaskRecord,
} from '../../domain/validation';
import {
  calculateGoalProgress,
  resolveEffectiveLifeArea,
} from '../../domain/plans';
import { InMemoryTransactionalEngine, STORE_NAMES } from '../db';
import { PlanuiRepositories } from '../repositories';
import {
  exportFullBackupZip,
  validateBackupArchive,
  executeAtomicBackupReplacement,
} from '../backup/backupService';

describe('Stage M1: Canonical Direction / Goal / Project / Task Model', () => {
  it('M1.1: Reuses folder hierarchy as directions, preserves unlimited depth, and prevents cycles', async () => {
    const engine = new InMemoryTransactionalEngine('m1_folders_db');
    const repos = new PlanuiRepositories(engine);

    // Create 10 levels of direction folders
    for (let i = 1; i <= 10; i++) {
      await repos.saveFolder({
        id: `dir-${i}`,
        name: `Напрям ${i}`,
        parentId: i === 1 ? null : `dir-${i - 1}`,
        order: i,
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-01T10:00:00.000Z',
        revision: 1,
      });
    }

    const { snapshot } = await repos.captureCoherentSnapshot();
    assert.equal(snapshot.folders.length, 10);

    // Prevent direct cycle
    await assert.rejects(
      () =>
        repos.saveFolder({
          id: 'dir-1',
          name: 'Напрям 1',
          parentId: 'dir-10', // cycle
          order: 1,
          createdAt: '2026-06-01T10:00:00.000Z',
          updatedAt: '2026-06-01T10:00:00.000Z',
          revision: 1,
        }),
      (err: unknown) =>
        err instanceof PlanuiError && err.code === 'FOLDER_CYCLE_DETECTED'
    );
  });

  it('M1.2: Goal CRUD, planning states (idea, active, paused, completed), and implementation intention', async () => {
    const engine = new InMemoryTransactionalEngine('m1_goals_db');
    const repos = new PlanuiRepositories(engine);
    const now = '2026-06-01T12:00:00.000Z';

    const goal1: Goal = {
      id: 'goal-marathon',
      title: 'Пробігти півмарафон',
      description: 'Поліпшення витривалості',
      purposeUk: 'Відчувати енергію та зміцнити серцево-судинну систему',
      completionCriteriaUk: 'Офіційний фініш 21.1 км без травм із темпом до 5:40 хв/км',
      nextActionTaskId: null,
      timing: {
        targetDate: '2026-10-18',
        targetPeriodUk: 'Осінь 2026',
      },
      folderId: null,
      lifeAreaId: 'life-q-1',
      implementationIntentionUk: 'Якщо вівторок або четвер 07:00, то я взуваю кросівки і біжу 8 км',
      state: 'idea',
      archived: false,
      order: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      revision: 1,
    };

    const saved = await repos.saveGoal(goal1);
    assert.equal(saved.id, 'goal-marathon');
    assert.equal(saved.state, 'idea');
    assert.equal(saved.revision, 1);

    // Transition state from 'idea' to 'active'
    const activated = await repos.saveGoal(
      { ...saved, state: 'active', updatedAt: '2026-06-02T10:00:00.000Z' },
      1
    );
    assert.equal(activated.state, 'active');
    assert.equal(activated.revision, 2);

    // Archiving goal orthogonally
    const archived = await repos.archiveGoalTransactionally(
      'goal-marathon',
      true,
      '2026-06-03T10:00:00.000Z',
      2
    );
    assert.equal(archived.archived, true);
    assert.equal(archived.state, 'active'); // orthogonal
    assert.equal(archived.revision, 3);
  });

  it('M1.3: Direct goal tasks, associated projects, and independent projects', async () => {
    const engine = new InMemoryTransactionalEngine('m1_assoc_db');
    const repos = new PlanuiRepositories(engine);
    const now = '2026-06-01T12:00:00.000Z';

    // 1. Create a goal
    const goal: Goal = {
      id: 'goal-album',
      title: 'Записати міні-альбом',
      description: '4 треки',
      purposeUk: 'Творча самореалізація',
      completionCriteriaUk: 'Готовий мастер на стрімінгах',
      nextActionTaskId: null,
      timing: null,
      folderId: null,
      lifeAreaId: 'life-q-5',
      implementationIntentionUk: null,
      state: 'active',
      archived: false,
      order: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      revision: 1,
    };
    await repos.saveGoal(goal);

    // 2. Direct task belonging to the goal
    const directTask: Task = {
      id: 'task-buy-strings',
      title: 'Купити струни для бас-гітари',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: null,
      estimatedDurationMinutes: 30,
      planningState: 'unplanned',
      plannedDate: null,
      ownership: { kind: 'goal', goalId: 'goal-album' },
      checklist: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };
    await repos.saveTask(directTask);

    // Link nextActionTaskId on goal to this direct task
    await repos.saveGoal(
      { ...goal, nextActionTaskId: 'task-buy-strings', updatedAt: now },
      1
    );

    // 3. Project associated with the goal
    const projectInGoal: Project = {
      id: 'proj-recording',
      title: 'Студійний запис барабанів',
      description: null,
      desiredOutcome: 'Доріжки ударних',
      completionCriteria: 'WAV 24/48',
      targetDate: '2026-07-01',
      folderId: null,
      goalId: 'goal-album',
      lifeAreaId: null, // Inherits from goal
      collaboratorText: null,
      purposeUk: null,
      completionCriteriaUk: null,
      nextActionTaskId: null,
      state: 'active',
      archived: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      revision: 1,
    };
    await repos.saveProject(projectInGoal);

    // Project task
    const projectTask: Task = {
      id: 'task-book-studio',
      title: 'Забронювати студію на 4 години',
      description: null,
      state: 'completed',
      priority: 'high',
      deadline: null,
      estimatedDurationMinutes: 60,
      planningState: 'unplanned',
      plannedDate: null,
      ownership: { kind: 'project', projectId: 'proj-recording', stageId: null },
      checklist: [],
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      canceledAt: null,
      revision: 1,
    };
    await repos.saveTask(projectTask);

    // 4. Independent project (no goal)
    const independentProject: Project = {
      id: 'proj-taxes',
      title: 'Подати податкову декларацію за Q2',
      description: null,
      desiredOutcome: 'Квитанція №2',
      completionCriteria: 'Прийнято без зауважень',
      targetDate: '2026-07-15',
      folderId: null,
      goalId: null,
      lifeAreaId: 'life-q-7',
      collaboratorText: null,
      purposeUk: 'Фінансова дисципліна',
      completionCriteriaUk: null,
      nextActionTaskId: null,
      state: 'active',
      archived: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      revision: 1,
    };
    await repos.saveProject(independentProject);

    // Test calculateGoalProgress
    const { snapshot } = await repos.captureCoherentSnapshot();
    const progress = calculateGoalProgress(
      'goal-album',
      snapshot.tasks,
      snapshot.projects
    );
    assert.equal(progress.directTasks.totalCountable, 1);
    assert.equal(progress.directTasks.completedCount, 0);
    assert.equal(progress.projectTasks.totalCountable, 1);
    assert.equal(progress.projectTasks.completedCount, 1);
    assert.equal(progress.totalCountable, 2);
    assert.equal(progress.completedCount, 1);
    assert.equal(progress.percentage, 50);
  });

  it('M1.4: Dynamic Life-Area inheritance without field mutation', async () => {
    const goalsById = new Map<string, Goal>([
      [
        'g-health',
        {
          id: 'g-health',
          title: 'Здоров’я',
          description: null,
          purposeUk: null,
          completionCriteriaUk: null,
          nextActionTaskId: null,
          timing: null,
          folderId: null,
          lifeAreaId: 'life-health-id',
          implementationIntentionUk: null,
          state: 'active',
          archived: false,
          order: 1,
          createdAt: '2026-06-01T10:00:00.000Z',
          updatedAt: '2026-06-01T10:00:00.000Z',
          completedAt: null,
          revision: 1,
        },
      ],
    ]);

    const projectsById = new Map<string, Project>([
      [
        'p-run',
        {
          id: 'p-run',
          title: 'Пробіжки',
          description: null,
          desiredOutcome: null,
          completionCriteria: null,
          targetDate: null,
          folderId: null,
          goalId: 'g-health',
          lifeAreaId: null, // intentionally null to test inheritance
          collaboratorText: null,
          purposeUk: null,
          completionCriteriaUk: null,
          nextActionTaskId: null,
          state: 'active',
          archived: false,
          createdAt: '2026-06-01T10:00:00.000Z',
          updatedAt: '2026-06-01T10:00:00.000Z',
          completedAt: null,
          revision: 1,
        },
      ],
      [
        'p-direct',
        {
          id: 'p-direct',
          title: 'Фінанси',
          description: null,
          desiredOutcome: null,
          completionCriteria: null,
          targetDate: null,
          folderId: null,
          goalId: 'g-health',
          lifeAreaId: 'life-finance-id', // overrides goal
          collaboratorText: null,
          purposeUk: null,
          completionCriteriaUk: null,
          nextActionTaskId: null,
          state: 'active',
          archived: false,
          createdAt: '2026-06-01T10:00:00.000Z',
          updatedAt: '2026-06-01T10:00:00.000Z',
          completedAt: null,
          revision: 1,
        },
      ],
    ]);

    // 1. Project inherits from goal when project lifeAreaId is null
    const resProj1 = resolveEffectiveLifeArea(projectsById.get('p-run')!, {
      goalsById,
      projectsById,
    });
    assert.equal(resProj1.directLifeAreaId, null);
    assert.equal(resProj1.inheritedLifeAreaId, 'life-health-id');
    assert.equal(resProj1.effectiveLifeAreaId, 'life-health-id');

    // 2. Project direct lifeAreaId takes precedence over goal
    const resProj2 = resolveEffectiveLifeArea(projectsById.get('p-direct')!, {
      goalsById,
      projectsById,
    });
    assert.equal(resProj2.directLifeAreaId, 'life-finance-id');
    assert.equal(resProj2.inheritedLifeAreaId, 'life-health-id');
    assert.equal(resProj2.effectiveLifeAreaId, 'life-finance-id');

    // 3. Task in project inherits from project's goal
    const taskInRunProj: Task = {
      id: 't-1',
      title: 'Купити воду',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: null,
      estimatedDurationMinutes: null,
      planningState: 'unplanned',
      plannedDate: null,
      ownership: { kind: 'project', projectId: 'p-run', stageId: null },
      checklist: [],
      createdAt: '2026-06-01T10:00:00.000Z',
      updatedAt: '2026-06-01T10:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };
    const resTask1 = resolveEffectiveLifeArea(taskInRunProj, {
      goalsById,
      projectsById,
    });
    assert.equal(resTask1.effectiveLifeAreaId, 'life-health-id');
  });

  it('M1.5: Safe goal deletion unlinks projects and direct tasks without corrupting state', async () => {
    const engine = new InMemoryTransactionalEngine('m1_del_db');
    const repos = new PlanuiRepositories(engine);
    const now = '2026-06-01T10:00:00.000Z';

    await repos.saveFolder({
      id: 'f-work',
      name: 'Робота',
      parentId: null,
      order: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    await repos.saveGoal({
      id: 'g-career',
      title: 'Кар’єрний ріст',
      description: null,
      purposeUk: null,
      completionCriteriaUk: null,
      nextActionTaskId: null,
      timing: null,
      folderId: 'f-work',
      lifeAreaId: null,
      implementationIntentionUk: null,
      state: 'active',
      archived: false,
      order: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      revision: 1,
    });

    await repos.saveProject({
      id: 'p-promo',
      title: 'Підготовка до промоції',
      description: null,
      desiredOutcome: null,
      completionCriteria: null,
      targetDate: null,
      folderId: 'f-work',
      goalId: 'g-career',
      lifeAreaId: null,
      collaboratorText: null,
      purposeUk: null,
      completionCriteriaUk: null,
      nextActionTaskId: null,
      state: 'active',
      archived: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      revision: 1,
    });

    await repos.saveTask({
      id: 't-review',
      title: 'Скласти список досягнень',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: null,
      estimatedDurationMinutes: null,
      planningState: 'unplanned',
      plannedDate: null,
      ownership: { kind: 'goal', goalId: 'g-career' },
      checklist: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    });

    // Delete goal in mode 'unlink_children'
    const result = await repos.deleteGoalTransactionally(
      'g-career',
      'unlink_children',
      '2026-06-01T11:00:00.000Z'
    );
    assert.equal(result.unlinkedProjects, 1);
    assert.equal(result.unlinkedTasks, 1);

    const { snapshot } = await repos.captureCoherentSnapshot();
    assert.equal(snapshot.goals.length, 0);
    const proj = snapshot.projects.find((p) => p.id === 'p-promo')!;
    assert.equal(proj.goalId, null); // cleanly unlinked

    const task = snapshot.tasks.find((t) => t.id === 't-review')!;
    assert.equal(task.ownership.kind, 'folder');
    if (task.ownership.kind === 'folder') {
      assert.equal(task.ownership.folderId, 'f-work'); // rehomed to goal folder
    }
  });

  it('M1.6: Task ownership transitions (folder <-> goal <-> project <-> standalone) preserve IDs and history', async () => {
    const engine = new InMemoryTransactionalEngine('m1_task_trans_db');
    const repos = new PlanuiRepositories(engine);
    const now = '2026-06-01T10:00:00.000Z';

    await repos.saveFolder({
      id: 'f-tech',
      name: 'Технології',
      parentId: null,
      order: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });

    await repos.saveGoal({
      id: 'g-rust',
      title: 'Вивчити Rust',
      description: null,
      purposeUk: null,
      completionCriteriaUk: null,
      nextActionTaskId: null,
      timing: null,
      folderId: 'f-tech',
      lifeAreaId: null,
      implementationIntentionUk: null,
      state: 'active',
      archived: false,
      order: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      revision: 1,
    });

    await repos.saveProject({
      id: 'p-cli',
      title: 'Написати CLI на Rust',
      description: null,
      desiredOutcome: null,
      completionCriteria: null,
      targetDate: null,
      folderId: 'f-tech',
      goalId: 'g-rust',
      lifeAreaId: null,
      collaboratorText: null,
      purposeUk: null,
      completionCriteriaUk: null,
      nextActionTaskId: null,
      state: 'active',
      archived: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      revision: 1,
    });

    // Initial: standalone task without direction
    let task = await repos.saveTask({
      id: 'task-read-book',
      title: 'Прочитати The Rust Book',
      description: 'Розділи 1-4',
      state: 'open',
      priority: 'high',
      deadline: null,
      estimatedDurationMinutes: 180,
      planningState: 'unplanned',
      plannedDate: null,
      ownership: { kind: 'standalone', folderId: null },
      checklist: [{ id: 'chk-1', title: 'Розділ 1', order: 1, completed: true }],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    });

    // 1. Move to folder
    task = await repos.moveTaskOwnershipTransactionally(
      task.id,
      { kind: 'folder', folderId: 'f-tech' },
      '2026-06-01T11:00:00.000Z',
      1
    );
    assert.equal(task.ownership.kind, 'folder');
    assert.equal(task.revision, 2);

    // 2. Move to goal
    task = await repos.moveTaskOwnershipTransactionally(
      task.id,
      { kind: 'goal', goalId: 'g-rust' },
      '2026-06-01T12:00:00.000Z',
      2
    );
    assert.equal(task.ownership.kind, 'goal');
    assert.equal(task.revision, 3);

    // 3. Move to project
    task = await repos.moveTaskOwnershipTransactionally(
      task.id,
      { kind: 'project', projectId: 'p-cli', stageId: null },
      '2026-06-01T13:00:00.000Z',
      3
    );
    assert.equal(task.ownership.kind, 'project');
    assert.equal(task.revision, 4);

    // 4. Move back to standalone
    task = await repos.moveTaskOwnershipTransactionally(
      task.id,
      { kind: 'standalone', folderId: null },
      '2026-06-01T14:00:00.000Z',
      4
    );
    assert.equal(task.ownership.kind, 'standalone');
    assert.equal(task.checklist.length, 1); // checklist intact
    assert.equal(task.estimatedDurationMinutes, 180); // metadata intact
    assert.equal(task.revision, 5);
  });

  it('M1.7: Full ZIP Backup export, validation, and atomic restore round-trip with schema v2 and goals', async () => {
    const engine = new InMemoryTransactionalEngine('m1_backup_db');
    const repos = new PlanuiRepositories(engine);
    const now = '2026-06-01T10:00:00.000Z';

    await repos.saveGoal({
      id: 'goal-zen',
      title: 'Практика медитації',
      description: 'Щоденна усвідомленість',
      purposeUk: 'Внутрішній спокій',
      completionCriteriaUk: '30 днів поспіль',
      nextActionTaskId: null,
      timing: null,
      folderId: null,
      lifeAreaId: null,
      implementationIntentionUk: 'Якщо ранок, то медитація 10 хв',
      state: 'active',
      archived: false,
      order: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      revision: 1,
    });

    const { zipBytes, manifest } = await exportFullBackupZip(repos, now);
    assert.equal(manifest.backupVersion, PLANUI_BACKUP_VERSION);
    assert.equal(manifest.dbSchemaVersion, PLANUI_DB_SCHEMA_VERSION);
    assert.equal(manifest.entityCounts.goals, 1);

    const preview = await validateBackupArchive(zipBytes);
    assert.equal(preview.manifest.entityCounts.goals, 1);
    assert.equal(preview.snapshot.goals.length, 1);
    assert.equal(preview.snapshot.goals[0].id, 'goal-zen');

    // Restore into a fresh engine
    const freshEngine = new InMemoryTransactionalEngine('m1_fresh_restore_db');
    const freshRepos = new PlanuiRepositories(freshEngine);

    const replacement = await executeAtomicBackupReplacement(
      freshRepos,
      preview,
      {
        explicitUserConfirmation: true,
        nowIso: '2026-06-01T11:00:00.000Z',
      }
    );
    assert.ok(replacement.recoverySnapshotId);
    assert.ok(replacement.newDbGeneration > 0);

    const { snapshot: restoredSnap } = await freshRepos.captureCoherentSnapshot();
    assert.equal(restoredSnap.goals.length, 1);
    assert.equal(restoredSnap.goals[0].title, 'Практика медитації');
    assert.equal(
      restoredSnap.goals[0].implementationIntentionUk,
      'Якщо ранок, то медитація 10 хв'
    );
  });
});
