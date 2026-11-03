import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryTransactionalEngine } from '../db';
import { PlanuiRepositories } from '../repositories';
import {
  buildAbbreviatedBreadcrumbs,
  calculateProjectTaskProgress,
  classifyTaskTemporalNotice,
  computeFolderDeleteImpact,
  getAllowedMoveTargetFolders,
  getUnresolvedProjectTasks,
} from '../../domain/plans';
import {
  getContextualCreationActions,
  createInitialDestinationContextMap,
} from '../../state/shellStore';

function createTestRepo() {
  const engine = new InMemoryTransactionalEngine();
  return new PlanuiRepositories(engine);
}

test('Stage 4.1: Deep folder nesting (6 levels), abbreviated breadcrumbs, and cycle/descendant move prevention', async () => {
  const repo = createTestRepo();
  const nowIso = '2026-03-30T10:00:00.000Z';

  // Create 6 nested folders: f1 -> f2 -> f3 -> f4 -> f5 -> f6
  let parentId: string | null = null;
  for (let i = 1; i <= 6; i++) {
    const id = `f${i}`;
    await repo.saveFolder({
      id,
      name: `Рівень ${i}`,
      parentId,
      order: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    });
    parentId = id;
  }

  const { snapshot } = await repo.captureCoherentSnapshot();
  assert.equal(snapshot.folders.length, 6);

  // Abbreviated breadcrumbs for f6 with maxVisible = 3
  const crumbs = buildAbbreviatedBreadcrumbs(snapshot.folders, 'f6', 3);
  assert.equal(crumbs.isAbbreviated, true);
  assert.equal(crumbs.fullChain.length, 6);
  assert.deepEqual(
    crumbs.visibleLeading.map((f) => f.id),
    ['f1']
  );
  assert.deepEqual(
    crumbs.hiddenMiddle.map((f) => f.id),
    ['f2', 'f3', 'f4']
  );
  assert.deepEqual(
    crumbs.visibleTrailing.map((f) => f.id),
    ['f5', 'f6']
  );

  // Allowed move targets for f2 cannot include f2 or any of f3..f6
  const allowedTargetsForF2 = getAllowedMoveTargetFolders(
    snapshot.folders,
    'f2'
  );
  assert.deepEqual(
    allowedTargetsForF2.map((f) => f.id),
    ['f1']
  );

  // Attempting to move f2 into its descendant f5 must throw a Ukrainian validation error
  const f2 = snapshot.folders.find((f) => f.id === 'f2')!;
  await assert.rejects(
    async () => {
      await repo.saveFolder({
        ...f2,
        parentId: 'f5',
        updatedAt: nowIso,
        revision: f2.revision + 1,
      });
    },
    (err: Error) => {
      assert.match(err.message, /циклічн|вкладен/i);
      return true;
    }
  );
});

test('Stage 4.1: Folder deletion defaults to rehoming contents; recursive deletion reports exact impact counts', async () => {
  const repo = createTestRepo();
  const nowIso = '2026-03-30T10:00:00.000Z';

  await repo.saveFolder({
    id: 'root-f',
    name: 'Головна',
    parentId: null,
    order: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    revision: 1,
  });
  await repo.saveFolder({
    id: 'sub-f',
    name: 'Підпапка',
    parentId: 'root-f',
    order: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    revision: 1,
  });

  await repo.saveProject({
    id: 'p-in-sub',
    title: 'Проєкт у підпапці',
    description: null,
    desiredOutcome: 'Результат',
    completionCriteria: null,
    targetDate: null,
    folderId: 'sub-f',
    lifeAreaId: null,
    collaboratorText: null,
    state: 'active',
    archived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    revision: 1,
  });

  await repo.saveTask({
    id: 't-in-sub',
    title: 'Окрема справа у підпапці',
    description: null,
    state: 'open',
    priority: 'normal',
    deadline: null,
    estimatedDurationMinutes: null,
    planningState: 'unplanned',
    plannedDate: null,
    ownership: { kind: 'standalone', folderId: 'sub-f' },
    checklist: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    canceledAt: null,
    revision: 1,
  });

  await repo.saveTask({
    id: 't-in-proj',
    title: 'Справа проєкту у підпапці',
    description: null,
    state: 'open',
    priority: 'normal',
    deadline: null,
    estimatedDurationMinutes: null,
    planningState: 'unplanned',
    plannedDate: null,
    ownership: { kind: 'project', projectId: 'p-in-sub', stageId: null },
    checklist: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    canceledAt: null,
    revision: 1,
  });

  const { snapshot: beforeSnap } = await repo.captureCoherentSnapshot();
  const impact = computeFolderDeleteImpact(
    beforeSnap.folders,
    beforeSnap.projects,
    beforeSnap.tasks,
    'root-f'
  );
  assert.equal(impact.descendantFolderCount, 1);
  assert.equal(impact.projectCount, 1);
  assert.equal(impact.totalTaskCount, 2);

  // Rehome deletion on sub-f moves p-in-sub and t-in-sub to root-f while preserving their IDs
  await repo.deleteFolderTransactionally('sub-f', 'rehome_to_parent', nowIso);
  const { snapshot: afterRehome } = await repo.captureCoherentSnapshot();
  assert.equal(
    afterRehome.folders.find((f) => f.id === 'sub-f'),
    undefined
  );
  assert.equal(
    afterRehome.projects.find((p) => p.id === 'p-in-sub')?.folderId,
    'root-f'
  );
  const rehomedTask = afterRehome.tasks.find((t) => t.id === 't-in-sub');
  assert.deepEqual(rehomedTask?.ownership, {
    kind: 'standalone',
    folderId: 'root-f',
  });

  // Recursive deletion on root-f removes root-f, p-in-sub, t-in-sub, and t-in-proj
  await repo.deleteFolderTransactionally('root-f', 'recursive_delete', nowIso);
  const { snapshot: afterRecursive } = await repo.captureCoherentSnapshot();
  assert.equal(afterRecursive.folders.length, 0);
  assert.equal(afterRecursive.projects.length, 0);
  assert.equal(afterRecursive.tasks.length, 0);
});

test('Stage 4.2 & 4.3: Task ownership relinking clears old stage when moving between projects and supports checklist promotion', async () => {
  const repo = createTestRepo();
  const nowIso = '2026-03-30T10:00:00.000Z';

  await repo.saveProject({
    id: 'proj-a',
    title: 'Проєкт А',
    description: null,
    desiredOutcome: null,
    completionCriteria: null,
    targetDate: null,
    folderId: null,
    lifeAreaId: null,
    collaboratorText: 'Олена, Ігор',
    state: 'active',
    archived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    revision: 1,
  });

  await repo.saveStage({
    id: 'stage-a1',
    projectId: 'proj-a',
    title: 'Етап А1',
    expectedOutcome: 'Підготовка',
    targetDate: null,
    order: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    revision: 1,
  });

  await repo.saveProject({
    id: 'proj-b',
    title: 'Проєкт Б',
    description: null,
    desiredOutcome: null,
    completionCriteria: null,
    targetDate: null,
    folderId: null,
    lifeAreaId: null,
    collaboratorText: null,
    state: 'active',
    archived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    revision: 1,
  });

  await repo.saveTask({
    id: 'task-1',
    title: 'Справа з чеклістом',
    description: null,
    state: 'open',
    priority: 'normal',
    deadline: null,
    estimatedDurationMinutes: 45,
    planningState: 'unplanned',
    plannedDate: null,
    ownership: { kind: 'project', projectId: 'proj-a', stageId: 'stage-a1' },
    checklist: [
      { id: 'c1', title: 'Крок 1', completed: false, order: 1 },
      { id: 'c2', title: 'Крок для підвищення у справу', completed: false, order: 2 },
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    canceledAt: null,
    revision: 1,
  });

  // Promote checklist item c2 to an ordinary task in proj-a / stage-a1
  const { updatedParentTask, promotedTask } =
    await repo.promoteChecklistItemToTaskTransactionally(
      'task-1',
      'c2',
      'promoted-task-c2',
      nowIso
    );
  assert.equal(updatedParentTask.checklist.length, 1);
  assert.equal(updatedParentTask.checklist[0].id, 'c1');
  assert.equal(promotedTask.title, 'Крок для підвищення у справу');
  assert.deepEqual(promotedTask.ownership, {
    kind: 'project',
    projectId: 'proj-a',
    stageId: 'stage-a1',
  });

  // Moving task-1 to proj-b while passing stale stage-a1 automatically clears stageId to null (C06)
  const movedTask = await repo.moveTaskOwnershipTransactionally(
    'task-1',
    { kind: 'project', projectId: 'proj-b', stageId: 'stage-a1' },
    nowIso
  );
  assert.equal(movedTask.id, 'task-1'); // Preserves ID
  assert.deepEqual(movedTask.ownership, {
    kind: 'project',
    projectId: 'proj-b',
    stageId: null,
  });
});

test('Stage 4.4 & 4.5: Project progress, explicit completion without silent task completion, and archive planning choices', async () => {
  const repo = createTestRepo();
  const nowIso = '2026-03-30T10:00:00.000Z';

  await repo.saveProject({
    id: 'proj-progress',
    title: 'Проєкт прогресу',
    description: null,
    desiredOutcome: 'Готовий реліз',
    completionCriteria: 'Усі тести зелені',
    targetDate: '2026-04-15',
    folderId: null,
    lifeAreaId: null,
    collaboratorText: null,
    state: 'active',
    archived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    revision: 1,
  });

  // Empty project progress has percentage: null and hasCountableTasks: false
  const { snapshot: snapEmpty } = await repo.captureCoherentSnapshot();
  const emptyProg = calculateProjectTaskProgress(
    snapEmpty.tasks,
    'proj-progress'
  );
  assert.equal(emptyProg.hasCountableTasks, false);
  assert.equal(emptyProg.percentage, null);

  // Add 1 stage (must not count as task), 1 completed task with 2 checklist items (checklist must not count as extra tasks),
  // 1 open task with future plannedDate, and 1 canceled task (excluded from denominator)
  await repo.saveStage({
    id: 'st-1',
    projectId: 'proj-progress',
    title: 'Етап 1',
    expectedOutcome: null,
    targetDate: null,
    order: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    revision: 1,
  });

  await repo.saveTask({
    id: 't-done',
    title: 'Виконана справа',
    description: null,
    state: 'completed',
    priority: 'normal',
    deadline: null,
    estimatedDurationMinutes: null,
    planningState: 'unplanned',
    plannedDate: null,
    ownership: { kind: 'project', projectId: 'proj-progress', stageId: 'st-1' },
    checklist: [
      { id: 'k1', title: 'Підкрок 1', completed: true, order: 1 },
      { id: 'k2', title: 'Підкрок 2', completed: false, order: 2 },
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: nowIso,
    canceledAt: null,
    revision: 1,
  });

  await repo.saveTask({
    id: 't-open',
    title: 'Незавершена справа',
    description: null,
    state: 'open',
    priority: 'normal',
    deadline: null,
    estimatedDurationMinutes: null,
    planningState: 'date_only',
    plannedDate: '2026-04-02',
    ownership: { kind: 'project', projectId: 'proj-progress', stageId: 'st-1' },
    checklist: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    canceledAt: null,
    revision: 1,
  });

  await repo.saveTask({
    id: 't-canceled',
    title: 'Скасована справа',
    description: null,
    state: 'canceled',
    priority: 'low',
    deadline: null,
    estimatedDurationMinutes: null,
    planningState: 'unplanned',
    plannedDate: null,
    ownership: { kind: 'project', projectId: 'proj-progress', stageId: null },
    checklist: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    canceledAt: nowIso,
    revision: 1,
  });

  const { snapshot: snapWithTasks } = await repo.captureCoherentSnapshot();
  const prog = calculateProjectTaskProgress(
    snapWithTasks.tasks,
    'proj-progress'
  );
  assert.equal(prog.completedCount, 1);
  assert.equal(prog.totalCountable, 2); // t-done + t-open (t-canceled excluded, stage & checklist excluded)
  assert.equal(prog.percentage, 50);
  assert.equal(prog.hasCountableTasks, true);

  // Explicit project completion identifies unresolved t-open and does NOT complete it silently
  const unresolvedBefore = getUnresolvedProjectTasks(
    snapWithTasks.tasks,
    'proj-progress'
  );
  assert.equal(unresolvedBefore.length, 1);
  assert.equal(unresolvedBefore[0].id, 't-open');

  await repo.completeProjectExplicitlyTransactionally(
    'proj-progress',
    nowIso
  );

  const { snapshot: snapAfterComplete } = await repo.captureCoherentSnapshot();
  assert.equal(
    snapAfterComplete.projects.find((p) => p.id === 'proj-progress')?.state,
    'completed'
  );
  assert.equal(
    snapAfterComplete.tasks.find((t) => t.id === 't-open')?.state,
    'open'
  );

  // Archive project with retain_planning preserves plannedDate on t-open
  await repo.archiveProjectTransactionally(
    'proj-progress',
    true,
    'retain_planning',
    nowIso,
    '2026-03-30'
  );
  const { snapshot: snapRetained } = await repo.captureCoherentSnapshot();
  assert.equal(
    snapRetained.projects.find((p) => p.id === 'proj-progress')?.archived,
    true
  );
  assert.equal(
    snapRetained.tasks.find((t) => t.id === 't-open')?.plannedDate,
    '2026-04-02'
  );

  // Archive project with remove_planning clears plannedDate on t-open
  await repo.archiveProjectTransactionally(
    'proj-progress',
    true,
    'remove_planning',
    nowIso,
    '2026-03-30'
  );
  const { snapshot: snapRemoved } = await repo.captureCoherentSnapshot();
  assert.equal(
    snapRemoved.tasks.find((t) => t.id === 't-open')?.plannedDate,
    null
  );
  assert.equal(
    snapRemoved.tasks.find((t) => t.id === 't-open')?.planningState,
    'unplanned'
  );
});

test('Stage 4.5: Distinguish overdue deadline from past planned date without deadline; contextual creation prioritizes project stage inside open project', () => {
  const todayLocalDate = '2026-03-30';
  const nowIso = '2026-03-30T12:00:00.000Z';

  // Open task assigned to past date WITHOUT deadline must NEVER be labeled overdue_deadline
  const pastPlannedNoDeadline = classifyTaskTemporalNotice(
    {
      id: 't1',
      title: 'Минула дата без дедлайну',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: null,
      estimatedDurationMinutes: null,
      planningState: 'date_only',
      plannedDate: '2026-03-28',
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    },
    [],
    todayLocalDate,
    nowIso
  );
  assert.equal(pastPlannedNoDeadline.isDeadlineOverdue, false);
  assert.equal(pastPlannedNoDeadline.isPastPlannedDate, true);

  // Open task with past date-only deadline IS overdue_deadline
  const overdueDateOnly = classifyTaskTemporalNotice(
    {
      id: 't2',
      title: 'Прострочений дедлайн',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: { kind: 'date_only', localDate: '2026-03-29' },
      estimatedDurationMinutes: null,
      planningState: 'unplanned',
      plannedDate: null,
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      canceledAt: null,
      revision: 1,
    },
    [],
    todayLocalDate,
    nowIso
  );
  assert.equal(overdueDateOnly.isDeadlineOverdue, true);
  assert.equal(overdueDateOnly.isPastPlannedDate, false);

  // Contextual creation actions inside Plans folder vs inside open Project (C04)
  const contexts = createInitialDestinationContextMap(todayLocalDate);
  const folderActions = getContextualCreationActions('plans', contexts);
  assert.deepEqual(
    folderActions.slice(0, 3).map((a) => a.kind),
    ['task', 'project', 'folder']
  );

  contexts.plans.activeProjectId = 'proj-1';
  const projectActions = getContextualCreationActions('plans', contexts);
  assert.deepEqual(
    projectActions.slice(0, 2).map((a) => a.kind),
    ['task', 'stage']
  );
});
