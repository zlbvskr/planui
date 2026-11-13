import React from "react";
import { Folder, Goal, Project } from "../../domain/types";
import { Row } from "../../ui/rows";
import { Sheet } from "../../ui/sheets";

interface PlanContextMenuProps {
  contextMenuTarget:
    | { kind: "folder"; folder: Folder }
    | { kind: "project"; project: Project };
  setContextMenuTarget: React.Dispatch<
    React.SetStateAction<
      | { kind: "folder"; folder: Folder }
      | { kind: "project"; project: Project }
      | null
    >
  >;
  setRenameTarget: React.Dispatch<
    React.SetStateAction<
      | { kind: "folder"; folder: Folder }
      | { kind: "project"; project: Project }
      | { kind: "goal"; goal: Goal }
      | null
    >
  >;
  setRenameValue: React.Dispatch<React.SetStateAction<string>>;
  setMoveTarget: React.Dispatch<
    React.SetStateAction<
      | { kind: "folder"; folder: Folder }
      | { kind: "project"; project: Project }
      | null
    >
  >;
  setMoveTargetFolderId: React.Dispatch<React.SetStateAction<string | null>>;
  currentChildFolders: Folder[];
  handleReorderFolders: (fromIdx: number, toIdx: number) => Promise<void>;
  filteredProjects: Project[];
  handleReorderProjects: (fromIdx: number, toIdx: number) => Promise<void>;
  setDeleteFolderAlert: React.Dispatch<React.SetStateAction<Folder | null>>;
  setDeleteProjectAlert: React.Dispatch<React.SetStateAction<Project | null>>;
}

export function PlanContextMenu({
  contextMenuTarget,
  setContextMenuTarget,
  setRenameTarget,
  setRenameValue,
  setMoveTarget,
  setMoveTargetFolderId,
  currentChildFolders,
  handleReorderFolders,
  filteredProjects,
  handleReorderProjects,
  setDeleteFolderAlert,
  setDeleteProjectAlert,
}: PlanContextMenuProps) {
  return (
    <Sheet
      isOpen
      title={
        contextMenuTarget.kind === "folder"
          ? contextMenuTarget.folder.name
          : contextMenuTarget.project.title
      }
      onClose={() => setContextMenuTarget(null)}
    >
      <div className="space-y-2 py-1">
        <Row
          hideOrb
          title="Перейменувати"
          onClick={() => {
            const target = contextMenuTarget;
            setContextMenuTarget(null);
            if (target.kind === "folder") {
              setRenameTarget({ kind: "folder", folder: target.folder });
              setRenameValue(target.folder.name);
            } else {
              setRenameTarget({ kind: "project", project: target.project });
              setRenameValue(target.project.title);
            }
          }}
        />
        <Row
          hideOrb
          title="Перемістити"
          onClick={() => {
            const target = contextMenuTarget;
            setContextMenuTarget(null);
            if (target.kind === "folder") {
              setMoveTarget({ kind: "folder", folder: target.folder });
              setMoveTargetFolderId(target.folder.parentId ?? null);
            } else {
              setMoveTarget({ kind: "project", project: target.project });
              setMoveTargetFolderId(target.project.folderId ?? null);
            }
          }}
        />
        <Row
          hideOrb
          title="Змінити порядок: Вище"
          onClick={() => {
            const target = contextMenuTarget;
            setContextMenuTarget(null);
            if (target.kind === "folder") {
              const i = currentChildFolders.findIndex(
                (f) => f.id === target.folder.id,
              );
              if (i > 0) void handleReorderFolders(i, i - 1);
            } else {
              const i = filteredProjects.findIndex(
                (p) => p.id === target.project.id,
              );
              if (i > 0) void handleReorderProjects(i, i - 1);
            }
          }}
        />
        <Row
          hideOrb
          title="Змінити порядок: Нижче"
          onClick={() => {
            const target = contextMenuTarget;
            setContextMenuTarget(null);
            if (target.kind === "folder") {
              const i = currentChildFolders.findIndex(
                (f) => f.id === target.folder.id,
              );
              if (i >= 0 && i < currentChildFolders.length - 1) {
                void handleReorderFolders(i, i + 1);
              }
            } else {
              const i = filteredProjects.findIndex(
                (p) => p.id === target.project.id,
              );
              if (i >= 0 && i < filteredProjects.length - 1) {
                void handleReorderProjects(i, i + 1);
              }
            }
          }}
        />
        <Row
          hideOrb
          title="Видалити"
          className="text-rose-600"
          onClick={() => {
            const target = contextMenuTarget;
            setContextMenuTarget(null);
            if (target.kind === "folder") {
              setDeleteFolderAlert(target.folder);
            } else {
              setDeleteProjectAlert(target.project);
            }
          }}
        />
      </div>
    </Sheet>
  );
}
