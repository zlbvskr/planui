import React from "react";
import { getAllowedMoveTargetFolders } from "../../domain/plans";
import { Folder, Project } from "../../domain/types";
import { PlanuiRepositories } from "../../storage/repositories";
import { GlossyButton } from "../../ui/buttons";
import { Row } from "../../ui/rows";
import { Sheet } from "../../ui/sheets";

interface PlanMoveSheetProps {
  moveTarget:
    | { kind: "folder"; folder: Folder }
    | { kind: "project"; project: Project };
  setMoveTarget: React.Dispatch<
    React.SetStateAction<
      | { kind: "folder"; folder: Folder }
      | { kind: "project"; project: Project }
      | null
    >
  >;
  moveTargetFolderId: string | null;
  setMoveTargetFolderId: React.Dispatch<React.SetStateAction<string | null>>;
  projectFolders: Folder[];
  repositories: PlanuiRepositories;
  onDataChanged: (feedbackMessage?: string) => Promise<void>;
}

export function PlanMoveSheet({
  moveTarget,
  setMoveTarget,
  moveTargetFolderId,
  setMoveTargetFolderId,
  projectFolders,
  repositories,
  onDataChanged,
}: PlanMoveSheetProps) {
  return (
    <Sheet
      title="Перемістити"
      isOpen={Boolean(moveTarget)}
      onClose={() => setMoveTarget(null)}
    >
      <div className="space-y-2.5 p-2">
        <Row
          icon3d="folder"
          title="Корінь проєктів"
          selected={moveTargetFolderId === null}
          onClick={() => setMoveTargetFolderId(null)}
        />
        {(moveTarget.kind === "folder"
          ? getAllowedMoveTargetFolders(projectFolders, moveTarget.folder.id)
          : projectFolders
        ).map((f) => (
          <Row
            key={f.id}
            icon3d={f.iconKey || "folder"}
            title={f.name}
            selected={moveTargetFolderId === f.id}
            onClick={() => setMoveTargetFolderId(f.id)}
          />
        ))}
        <div className="pt-2">
          <GlossyButton
            variant="mint"
            fullWidth
            onClick={async () => {
              if (moveTarget.kind === "folder") {
                await repositories.saveFolder(
                  { ...moveTarget.folder, parentId: moveTargetFolderId },
                  moveTarget.folder.revision,
                );
              } else {
                await repositories.saveProject(
                  { ...moveTarget.project, folderId: moveTargetFolderId },
                  moveTarget.project.revision,
                );
              }
              setMoveTarget(null);
              await onDataChanged("Переміщено");
            }}
          >
            Перемістити
          </GlossyButton>
        </div>
      </div>
    </Sheet>
  );
}
