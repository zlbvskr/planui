import { validateRoadmapMetadata } from "./roadmap";

import { PlanuiError } from "../i18n/errorsUk";

import {
  assertValidHalfOpenInstants,
  assertValidIanaZone,
  assertValidIsoInstant,
  assertValidLocalDate,
  validateZonedInterval,
} from "./temporal";

import {
  Folder,
  Goal,
  Project,
  ProjectStage,
  Task,
  TaskReservation,
} from "./types";

import { assertNonEmptyString } from "./validationInputs";

import { assertPositiveRevision } from "./validationInputs";

export function validateFolderRecord(folder: Folder): Folder {
  assertNonEmptyString(folder.id, "INVALID_ID");
  assertNonEmptyString(folder.name, "REQUIRED_TITLE");
  if (folder.parentId !== null) {
    assertNonEmptyString(folder.parentId, "INVALID_ID");
    if (folder.parentId === folder.id) {
      throw new PlanuiError("FOLDER_SELF_PARENT", folder.id);
    }
  }
  assertValidIsoInstant(folder.createdAt);
  assertValidIsoInstant(folder.updatedAt);
  assertPositiveRevision(folder.revision);
  return folder;
}

export function validateGoalRecord(
  goal: Goal,
  context?: {
    folderIds?: ReadonlySet<string>;
    taskIds?: ReadonlySet<string>;
  },
): Goal {
  validateRoadmapMetadata(goal);
  assertNonEmptyString(goal.id, "INVALID_ID");
  assertNonEmptyString(goal.title, "REQUIRED_TITLE");

  if (
    goal.state !== "idea" &&
    goal.state !== "active" &&
    goal.state !== "paused" &&
    goal.state !== "completed"
  ) {
    throw new PlanuiError("GOAL_INVALID_STATE", `goal.state=${goal.state}`);
  }

  if (goal.folderId !== null) {
    assertNonEmptyString(goal.folderId, "INVALID_ID");
    if (context?.folderIds && !context.folderIds.has(goal.folderId)) {
      throw new PlanuiError("FOLDER_PARENT_NOT_FOUND", goal.folderId);
    }
  }

  if (goal.nextActionTaskId !== null) {
    assertNonEmptyString(goal.nextActionTaskId, "INVALID_ID");
    if (context?.taskIds && !context.taskIds.has(goal.nextActionTaskId)) {
      throw new PlanuiError("TASK_INVALID_NEXT_ACTION", goal.nextActionTaskId);
    }
  }

  if (goal.timing !== null) {
    if (goal.timing.targetDate !== null) {
      assertValidLocalDate(goal.timing.targetDate);
    }
  }

  assertValidIsoInstant(goal.createdAt);
  assertValidIsoInstant(goal.updatedAt);
  if (goal.completedAt !== null) {
    assertValidIsoInstant(goal.completedAt);
  }
  assertPositiveRevision(goal.revision);
  return goal;
}

export function validateProjectRecord(
  project: Project,
  context?: {
    folderIds?: ReadonlySet<string>;
    goalIds?: ReadonlySet<string>;
    taskIds?: ReadonlySet<string>;
  },
): Project {
  validateRoadmapMetadata(project);
  assertNonEmptyString(project.id, "INVALID_ID");
  assertNonEmptyString(project.title, "REQUIRED_TITLE");
  if (project.targetDate !== null) {
    assertValidLocalDate(project.targetDate);
  }
  if (project.folderId !== null) {
    assertNonEmptyString(project.folderId, "INVALID_ID");
    if (context?.folderIds && !context.folderIds.has(project.folderId)) {
      throw new PlanuiError("FOLDER_PARENT_NOT_FOUND", project.folderId);
    }
  }
  if (project.goalId !== null && project.goalId !== undefined) {
    assertNonEmptyString(project.goalId, "INVALID_ID");
    if (context?.goalIds && !context.goalIds.has(project.goalId)) {
      throw new PlanuiError("GOAL_NOT_FOUND", project.goalId);
    }
  }
  if (
    project.nextActionTaskId !== null &&
    project.nextActionTaskId !== undefined
  ) {
    assertNonEmptyString(project.nextActionTaskId, "INVALID_ID");
    if (context?.taskIds && !context.taskIds.has(project.nextActionTaskId)) {
      throw new PlanuiError(
        "TASK_INVALID_NEXT_ACTION",
        project.nextActionTaskId,
      );
    }
  }
  if (
    project.state !== "idea" &&
    project.state !== "active" &&
    project.state !== "paused" &&
    project.state !== "completed"
  ) {
    throw new PlanuiError(
      "VALIDATION_FAILED",
      `project.state=${project.state}`,
    );
  }
  assertValidIsoInstant(project.createdAt);
  assertValidIsoInstant(project.updatedAt);
  if (project.completedAt !== null) {
    assertValidIsoInstant(project.completedAt);
  }
  assertPositiveRevision(project.revision);
  return project;
}

export function validateStageRecord(
  stage: ProjectStage,
  projectIds?: ReadonlySet<string>,
  goalIds?: ReadonlySet<string>,
): ProjectStage {
  validateRoadmapMetadata(stage);
  assertNonEmptyString(stage.id, "INVALID_ID");
  if (stage.projectId !== null) {
    assertNonEmptyString(stage.projectId, "INVALID_ID");
    if (
      stage.goalId != null ||
      (projectIds && !projectIds.has(stage.projectId))
    )
      throw new PlanuiError("STAGE_PROJECT_NOT_FOUND");
  } else {
    assertNonEmptyString(stage.goalId, "INVALID_ID");
    if (goalIds && !goalIds.has(stage.goalId!))
      throw new PlanuiError("GOAL_NOT_FOUND");
  }
  assertNonEmptyString(stage.title, "REQUIRED_TITLE");
  if (stage.targetDate !== null) {
    assertValidLocalDate(stage.targetDate);
  }
  assertValidIsoInstant(stage.createdAt);
  assertValidIsoInstant(stage.updatedAt);
  assertPositiveRevision(stage.revision);
  return stage;
}

export function validateTaskRecord(
  task: Task,
  context?: {
    folderIds: ReadonlySet<string>;
    goalIds?: ReadonlySet<string>;
    projectIds: ReadonlySet<string>;
    stageProjectMap: ReadonlyMap<string, string>;
    activeReservationsByTaskId?: ReadonlyMap<string, number>;
  },
): Task {
  if (
    task.effort !== undefined &&
    task.effort !== null &&
    !["small", "medium", "large"].includes(task.effort)
  )
    throw new PlanuiError("VALIDATION_FAILED");
  assertNonEmptyString(task.id, "INVALID_ID");
  assertNonEmptyString(task.title, "REQUIRED_TITLE");

  if (
    task.state !== "open" &&
    task.state !== "completed" &&
    task.state !== "canceled"
  ) {
    throw new PlanuiError("VALIDATION_FAILED", `task.state=${task.state}`);
  }

  if (
    task.priority !== "high" &&
    task.priority !== "normal" &&
    task.priority !== "low"
  ) {
    throw new PlanuiError(
      "VALIDATION_FAILED",
      `task.priority=${task.priority}`,
    );
  }

  if (task.deadline !== null) {
    if (task.deadline.kind === "date_only") {
      assertValidLocalDate(task.deadline.localDate);
    } else if (task.deadline.kind === "exact_instant") {
      assertValidIsoInstant(task.deadline.instant);
      assertValidIanaZone(task.deadline.zoneId);
    } else {
      throw new PlanuiError("VALIDATION_FAILED", "deadline");
    }
  }

  if (task.planningState === "unplanned") {
    if (task.plannedDate !== null) {
      throw new PlanuiError("TASK_CONTRADICTORY_PLANNING", task.id);
    }
  } else if (task.planningState === "date_only") {
    if (task.plannedDate === null) {
      throw new PlanuiError("TASK_CONTRADICTORY_PLANNING", task.id);
    }
    assertValidLocalDate(task.plannedDate);
    if (
      context?.activeReservationsByTaskId &&
      (context.activeReservationsByTaskId.get(task.id) ?? 0) > 0
    ) {
      throw new PlanuiError("TASK_CONTRADICTORY_PLANNING", task.id);
    }
  } else if (task.planningState === "timed") {
    if (task.plannedDate !== null) {
      throw new PlanuiError("TASK_CONTRADICTORY_PLANNING", task.id);
    }
  } else {
    throw new PlanuiError("VALIDATION_FAILED", "planningState");
  }

  if (!task.ownership || typeof task.ownership !== "object") {
    throw new PlanuiError("TASK_INVALID_OWNERSHIP", task.id);
  }
  const ownRec = task.ownership as Record<string, unknown>;
  if (task.ownership.kind === "standalone") {
    if ("projectId" in ownRec || "stageId" in ownRec || "goalId" in ownRec) {
      throw new PlanuiError("TASK_INVALID_OWNERSHIP", task.id);
    }
    const folderIdFromOwnership = ownRec.folderId as string | null | undefined;
    if (folderIdFromOwnership !== null && folderIdFromOwnership !== undefined) {
      assertNonEmptyString(folderIdFromOwnership, "INVALID_ID");
      if (context && !context.folderIds.has(folderIdFromOwnership)) {
        throw new PlanuiError("FOLDER_PARENT_NOT_FOUND", folderIdFromOwnership);
      }
    }
  } else if (task.ownership.kind === "folder") {
    if ("projectId" in ownRec || "stageId" in ownRec || "goalId" in ownRec) {
      throw new PlanuiError("TASK_INVALID_OWNERSHIP", task.id);
    }
    assertNonEmptyString(task.ownership.folderId, "INVALID_ID");
    if (context && !context.folderIds.has(task.ownership.folderId)) {
      throw new PlanuiError("FOLDER_PARENT_NOT_FOUND", task.ownership.folderId);
    }
  } else if (task.ownership.kind === "goal") {
    if ("projectId" in ownRec || "stageId" in ownRec || "folderId" in ownRec) {
      throw new PlanuiError("TASK_INVALID_OWNERSHIP", task.id);
    }
    assertNonEmptyString(task.ownership.goalId, "INVALID_ID");
    if (
      context &&
      (context as { goalIds?: ReadonlySet<string> }).goalIds &&
      !(context as { goalIds?: ReadonlySet<string> }).goalIds!.has(
        task.ownership.goalId,
      )
    ) {
      throw new PlanuiError("GOAL_NOT_FOUND", task.ownership.goalId);
    }
  } else if (task.ownership.kind === "project") {
    if ("folderId" in ownRec || "goalId" in ownRec) {
      throw new PlanuiError("TASK_INVALID_OWNERSHIP", task.id);
    }
    assertNonEmptyString(task.ownership.projectId, "INVALID_ID");
    if (context && !context.projectIds.has(task.ownership.projectId)) {
      throw new PlanuiError(
        "STAGE_PROJECT_NOT_FOUND",
        task.ownership.projectId,
      );
    }
    if (task.ownership.stageId !== null) {
      assertNonEmptyString(task.ownership.stageId, "INVALID_ID");
      if (context) {
        const ownerProjectId = context.stageProjectMap.get(
          task.ownership.stageId,
        );
        if (ownerProjectId !== task.ownership.projectId) {
          throw new PlanuiError("TASK_STAGE_MISMATCH", task.ownership.stageId);
        }
      }
    }
  } else {
    throw new PlanuiError("TASK_INVALID_OWNERSHIP", task.id);
  }

  for (const item of task.checklist) {
    assertNonEmptyString(item.id, "INVALID_ID");
    assertNonEmptyString(item.title, "REQUIRED_TITLE");
  }

  assertValidIsoInstant(task.createdAt);
  assertValidIsoInstant(task.updatedAt);
  if (task.completedAt !== null) assertValidIsoInstant(task.completedAt);
  if (task.canceledAt !== null) assertValidIsoInstant(task.canceledAt);
  assertPositiveRevision(task.revision);

  return task;
}

export function validateReservationRecord(
  reservation: TaskReservation,
  taskIds?: ReadonlySet<string>,
): TaskReservation {
  assertNonEmptyString(reservation.id, "INVALID_ID");
  if (reservation.habitOccurrence != null) {
    if (reservation.taskId !== null) throw new PlanuiError("VALIDATION_FAILED");
    assertNonEmptyString(reservation.habitOccurrence.entryId, "INVALID_ID");
    assertNonEmptyString(reservation.habitOccurrence.habitId, "INVALID_ID");
    assertValidLocalDate(reservation.habitOccurrence.localDate);
  } else {
    assertNonEmptyString(reservation.taskId, "INVALID_ID");
    if (taskIds && !taskIds.has(reservation.taskId!))
      throw new PlanuiError("RESERVATION_TASK_NOT_FOUND");
  }
  validateZonedInterval(reservation.interval);
  if (
    reservation.state !== "active" &&
    reservation.state !== "released" &&
    reservation.state !== "canceled"
  ) {
    throw new PlanuiError("VALIDATION_FAILED", "reservation.state");
  }
  if (reservation.releaseMetadata !== null) {
    assertValidIsoInstant(reservation.releaseMetadata.releasedAt);
    assertValidHalfOpenInstants(
      reservation.releaseMetadata.originalStartInstant,
      reservation.releaseMetadata.originalEndInstant,
    );
  }
  assertValidIsoInstant(reservation.createdAt);
  assertValidIsoInstant(reservation.updatedAt);
  assertPositiveRevision(reservation.revision);
  return reservation;
}
