import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  Folder,
  Project,
  Goal,
  Task,
} from '../../domain/types';
import {
  calculateGoalProgress,
  calculateProjectTaskProgress,
  getAllowedMoveTargetFolders,
} from '../../domain/plans';
import { InMemoryTransactionalEngine } from '../db';
import { PlanuiRepositories } from '../repositories';

describe('Stage M3: Complete Directions, Goals, and Projects Experience Tests', () => {
  let engine: InMemoryTransactionalEngine;
  let repos: PlanuiRepositories;

  beforeEach(() => {
    engine = new InMemoryTransactionalEngine();
    repos = new PlanuiRepositories(engine);
  });

  it('M3.1 Direction/Folder cycle-safe movement and unlimited depth', async () => {
    const nowIso = new Date().toISOString();
    // Level 1: Root Folder A
    const folderA: Folder = {
      id: 'dir-a',
      name: 'Напрям А',
      parentId: null,
      order: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    // Level 2: Sub-folder B inside A
    const folderB: Folder = {
      id: 'dir-b',
      name: 'Напрям Б',
      parentId: 'dir-a',
      order: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    // Level 3: Sub-folder C inside B
    const folderC: Folder = {
      id: 'dir-c',
      name: 'Напрям В',
      parentId: 'dir-b',
      order: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    // Level 4: Sub-folder D inside C (> 3 levels depth)
    const folderD: Folder = {
      id: 'dir-d',
      name: 'Напрям Г',
      parentId: 'dir-c',
      order: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };

    await repos.saveFolder(folderA);
    await repos.saveFolder(folderB);
    await repos.saveFolder(folderC);
    await repos.saveFolder(folderD);

    const { snapshot } = await repos.captureCoherentSnapshot();
    const allFolders = snapshot.folders;

    // Cycle prevention: folderA cannot be moved into folderA, folderB, folderC, or folderD
    const allowedForA = getAllowedMoveTargetFolders(allFolders, 'dir-a');
    assert.equal(allowedForA.some((f) => f.id === 'dir-a'), false);
    assert.equal(allowedForA.some((f) => f.id === 'dir-b'), false);
    assert.equal(allowedForA.some((f) => f.id === 'dir-c'), false);
    assert.equal(allowedForA.some((f) => f.id === 'dir-d'), false);

    // But folderD can be moved to root or folderA or folderB
    const allowedForD = getAllowedMoveTargetFolders(allFolders, 'dir-d');
    assert.equal(allowedForD.some((f) => f.id === 'dir-a'), true);
    assert.equal(allowedForD.some((f) => f.id === 'dir-b'), true);
    assert.equal(allowedForD.some((f) => f.id === 'dir-d'), false);
  });

  it('M3.2 Goal entity creation with progressive disclosure', async () => {
    const nowIso = new Date().toISOString();

    const folderA: Folder = {
      id: 'dir-a',
      name: 'Навчання',
      parentId: null,
      order: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repos.saveFolder(folderA);

    // Minimal goal: title only
    const minimalGoal: Goal = {
      id: 'goal-minimal',
      title: 'Вивчити базову граматику',
      description: null,
      purposeUk: null,
      completionCriteriaUk: null,
      lifeAreaId: null,
      implementationIntentionUk: null,
      timing: null,
      folderId: null,
      state: 'idea',
      nextActionTaskId: null,
      order: 0,
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };
    await repos.saveGoal(minimalGoal);

    // Full goal: all progressive disclosure fields
    const fullGoal: Goal = {
      id: 'goal-full',
      title: 'Здати сертифікаційний іспит C1',
      description: 'Підготовка до мовного сертифікату',
      purposeUk: 'Для професійного зростання та впевненого спілкування',
      completionCriteriaUk: 'Отримати сертифікат із балом не нижче 85%',
      lifeAreaId: null,
      implementationIntentionUk: 'Якщо настає 19:00, то я відкриваю конспекти на 45 хвилин',
      timing: {
        targetDate: '2026-12-01',
        targetPeriodUk: 'Q4 2026',
      },
      folderId: 'dir-a',
      state: 'active',
      nextActionTaskId: null,
      order: 1,
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };
    await repos.saveGoal(fullGoal);

    const { snapshot } = await repos.captureCoherentSnapshot();
    const savedMinimal = snapshot.goals.find((g) => g.id === 'goal-minimal');
    const savedFull = snapshot.goals.find((g) => g.id === 'goal-full');

    assert.ok(savedMinimal);
    assert.equal(savedMinimal.title, 'Вивчити базову граматику');
    assert.equal(savedMinimal.state, 'idea');
    assert.equal(savedMinimal.purposeUk, null);

    assert.ok(savedFull);
    assert.equal(savedFull.title, 'Здати сертифікаційний іспит C1');
    assert.equal(savedFull.state, 'active');
    assert.equal(savedFull.timing?.targetPeriodUk, 'Q4 2026');
    assert.equal(
      savedFull.implementationIntentionUk,
      'Якщо настає 19:00, то я відкриваю конспекти на 45 хвилин'
    );
  });

  it('M3.3 Canonical Task Ownership across 4 kinds and transactional move', async () => {
    const nowIso = new Date().toISOString();

    const folderA: Folder = {
      id: 'dir-a',
      name: 'Дім',
      parentId: null,
      order: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repos.saveFolder(folderA);

    const goalFull: Goal = {
      id: 'goal-full',
      title: 'Оновити оселю',
      description: null,
      purposeUk: null,
      completionCriteriaUk: null,
      lifeAreaId: null,
      implementationIntentionUk: null,
      timing: null,
      folderId: null,
      state: 'active',
      nextActionTaskId: null,
      order: 0,
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };
    await repos.saveGoal(goalFull);

    // Create Project
    const project: Project = {
      id: 'proj-1',
      title: 'Ремонт вітальні',
      desiredOutcome: 'Оновлений інтерʼєр',
      completionCriteria: null,
      description: null,
      collaboratorText: null,
      targetDate: null,
      folderId: null,
      lifeAreaId: null,
      goalId: 'goal-full',
      state: 'active',
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };
    await repos.saveProject(project);

    // 1. Standalone Task
    const task1: Task = {
      id: 'task-standalone',
      title: 'Купити батарейки',
      description: null,
      priority: 'normal',
      deadline: null,
      planningState: 'unplanned',
      plannedDate: null,
      state: 'open',
      ownership: { kind: 'standalone', folderId: null },
      estimatedDurationMinutes: null,
      checklist: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };
    await repos.saveTask(task1);

    // 2. Folder Task
    const task2: Task = {
      id: 'task-folder',
      title: 'Провітрити кімнату',
      description: null,
      priority: 'normal',
      deadline: null,
      planningState: 'unplanned',
      plannedDate: null,
      state: 'open',
      ownership: { kind: 'folder', folderId: 'dir-a' },
      estimatedDurationMinutes: null,
      checklist: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };
    await repos.saveTask(task2);

    // 3. Goal Direct Task
    const task3: Task = {
      id: 'task-goal',
      title: 'Зареєструватися на консультацію',
      description: null,
      priority: 'high',
      deadline: null,
      planningState: 'unplanned',
      plannedDate: null,
      state: 'open',
      ownership: { kind: 'goal', goalId: 'goal-full' },
      estimatedDurationMinutes: null,
      checklist: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };
    await repos.saveTask(task3);

    // 4. Project Task
    const task4: Task = {
      id: 'task-project',
      title: 'Пофарбувати стіни',
      description: null,
      priority: 'normal',
      deadline: null,
      planningState: 'unplanned',
      plannedDate: null,
      state: 'open',
      ownership: { kind: 'project', projectId: 'proj-1', stageId: null },
      estimatedDurationMinutes: null,
      checklist: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };
    await repos.saveTask(task4);

    // Verify all 4 stored properly
    const { snapshot } = await repos.captureCoherentSnapshot();
    const t1 = snapshot.tasks.find((t) => t.id === 'task-standalone');
    const t2 = snapshot.tasks.find((t) => t.id === 'task-folder');
    const t3 = snapshot.tasks.find((t) => t.id === 'task-goal');
    const t4 = snapshot.tasks.find((t) => t.id === 'task-project');

    assert.equal(t1?.ownership.kind, 'standalone');
    assert.equal(t2?.ownership.kind, 'folder');
    assert.equal(t3?.ownership.kind, 'goal');
    assert.equal(t4?.ownership.kind, 'project');

    // Move task-goal into project-1
    const moved = await repos.moveTaskOwnershipTransactionally(
      'task-goal',
      { kind: 'project', projectId: 'proj-1', stageId: null },
      new Date().toISOString(),
      t3!.revision
    );
    assert.equal(moved.ownership.kind, 'project');
    assert.equal((moved.ownership as { projectId: string }).projectId, 'proj-1');
    assert.equal(moved.revision, t3!.revision + 1);
  });

  it('M3.4 Goal deletion transactional choices (unlink_children vs delete_direct_tasks)', async () => {
    const nowIso = new Date().toISOString();

    // Create Goal A with 1 direct task and 1 linked project
    const goalA: Goal = {
      id: 'goal-del-a',
      title: 'Ціль для відвʼязки',
      description: null,
      purposeUk: null,
      completionCriteriaUk: null,
      lifeAreaId: null,
      implementationIntentionUk: null,
      timing: null,
      folderId: null,
      state: 'active',
      nextActionTaskId: null,
      order: 0,
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };
    await repos.saveGoal(goalA);

    const directTaskA: Task = {
      id: 'task-direct-a',
      title: 'Пряма справа А',
      description: null,
      priority: 'normal',
      deadline: null,
      planningState: 'unplanned',
      plannedDate: null,
      state: 'open',
      ownership: { kind: 'goal', goalId: 'goal-del-a' },
      estimatedDurationMinutes: null,
      checklist: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };
    await repos.saveTask(directTaskA);

    const linkedProjectA: Project = {
      id: 'proj-linked-a',
      title: 'Повʼязаний проєкт А',
      desiredOutcome: null,
      completionCriteria: null,
      description: null,
      collaboratorText: null,
      targetDate: null,
      folderId: null,
      lifeAreaId: null,
      goalId: 'goal-del-a',
      state: 'active',
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };
    await repos.saveProject(linkedProjectA);

    // Choice 1: unlink_children
    await repos.deleteGoalTransactionally('goal-del-a', 'unlink_children', new Date().toISOString());

    const { snapshot: snap1 } = await repos.captureCoherentSnapshot();
    assert.equal(snap1.goals.some((g) => g.id === 'goal-del-a'), false);
    const preservedTask = snap1.tasks.find((t) => t.id === 'task-direct-a');
    assert.ok(preservedTask);
    assert.equal(preservedTask.ownership.kind, 'standalone');
    const preservedProject = snap1.projects.find((p) => p.id === 'proj-linked-a');
    assert.ok(preservedProject);
    assert.equal(preservedProject.goalId, null);

    // Choice 2: delete_direct_tasks
    const goalB: Goal = {
      id: 'goal-del-b',
      title: 'Ціль для видалення зі справами',
      description: null,
      purposeUk: null,
      completionCriteriaUk: null,
      lifeAreaId: null,
      implementationIntentionUk: null,
      timing: null,
      folderId: null,
      state: 'active',
      nextActionTaskId: null,
      order: 0,
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };
    await repos.saveGoal(goalB);

    const directTaskB: Task = {
      id: 'task-direct-b',
      title: 'Пряма справа Б',
      description: null,
      priority: 'normal',
      deadline: null,
      planningState: 'unplanned',
      plannedDate: null,
      state: 'open',
      ownership: { kind: 'goal', goalId: 'goal-del-b' },
      estimatedDurationMinutes: null,
      checklist: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };
    await repos.saveTask(directTaskB);

    await repos.deleteGoalTransactionally('goal-del-b', 'delete_direct_tasks', new Date().toISOString());

    const { snapshot: snap2 } = await repos.captureCoherentSnapshot();
    assert.equal(snap2.goals.some((g) => g.id === 'goal-del-b'), false);
    assert.equal(snap2.tasks.some((t) => t.id === 'task-direct-b'), false);
  });

  it('M3.5 Honest transparent progress calculation without checklist contamination', async () => {
    const nowIso = new Date().toISOString();
    const projId = 'proj-prog-1';

    // Task 1: open with 3 checklist items (2 checked, 1 unchecked)
    const taskWithChecklist: Task = {
      id: 'task-chk-1',
      title: 'Справа з чеклистом',
      description: null,
      priority: 'normal',
      deadline: null,
      planningState: 'unplanned',
      plannedDate: null,
      state: 'open',
      ownership: { kind: 'project', projectId: projId, stageId: null },
      estimatedDurationMinutes: null,
      checklist: [
        { id: 'c1', title: 'Крок 1', completed: true, order: 1 },
        { id: 'c2', title: 'Крок 2', completed: true, order: 2 },
        { id: 'c3', title: 'Крок 3', completed: false, order: 3 },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };
    // Task 2: completed
    const taskCompleted: Task = {
      id: 'task-comp-2',
      title: 'Завершена справа',
      description: null,
      priority: 'normal',
      deadline: null,
      planningState: 'unplanned',
      plannedDate: null,
      state: 'completed',
      ownership: { kind: 'project', projectId: projId, stageId: null },
      estimatedDurationMinutes: null,
      checklist: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: nowIso,
      canceledAt: null,
      revision: 1,
    };

    const tasks = [taskWithChecklist, taskCompleted];
    const progress = calculateProjectTaskProgress(tasks, projId);

    // Contract requirement: Transparent task count (completedTasks / totalCountableTasks).
    // Checklist items MUST NEVER contaminate project task progress.
    assert.equal(progress.totalCountable, 2);
    assert.equal(progress.completedCount, 1);
    assert.equal(progress.percentage, 50);

    // Goal progress calculation: transparent counts of direct tasks and linked projects
    const goal: Goal = {
      id: 'goal-prog-test',
      title: 'Ціль прогресу',
      description: null,
      purposeUk: null,
      completionCriteriaUk: null,
      lifeAreaId: null,
      implementationIntentionUk: null,
      timing: null,
      folderId: null,
      state: 'active',
      nextActionTaskId: null,
      order: 0,
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };
    const directGoalTask: Task = {
      id: 'task-goal-direct',
      title: 'Пряма справа цілі',
      description: null,
      priority: 'normal',
      deadline: null,
      planningState: 'unplanned',
      plannedDate: null,
      state: 'completed',
      ownership: { kind: 'goal', goalId: 'goal-prog-test' },
      estimatedDurationMinutes: null,
      checklist: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: nowIso,
      canceledAt: null,
      revision: 1,
    };

    const projectLinked: Project = {
      id: 'proj-linked-prog',
      title: 'Проєкт цілі',
      desiredOutcome: null,
      completionCriteria: null,
      description: null,
      collaboratorText: null,
      targetDate: null,
      folderId: null,
      lifeAreaId: null,
      goalId: 'goal-prog-test',
      state: 'active',
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      revision: 1,
    };

    const goalProg = calculateGoalProgress(
      goal.id,
      [directGoalTask, ...tasks],
      [projectLinked]
    );
    assert.equal(goalProg.directTasks.completedCount, 1);
    assert.equal(goalProg.directTasks.totalCountable, 1);
    assert.equal(goalProg.projectTasks.totalCountable, 0); // projectLinked has no tasks in this test
    assert.equal(goalProg.completedCount, 1);
    assert.equal(goalProg.totalCountable, 1);
  });
});
