import React from "react";
import { Folder, Goal, Project } from "../../domain/types";
import { PlanuiRepositories } from "../../storage/repositories";
import { GlossyButton } from "../../ui/buttons";
import { Sheet } from "../../ui/sheets";

interface PlanRenameSheetProps {
  renameTarget:
    | { kind: "folder"; folder: Folder }
    | { kind: "project"; project: Project }
    | { kind: "goal"; goal: Goal };
  setRenameTarget: React.Dispatch<
    React.SetStateAction<
      | { kind: "folder"; folder: Folder }
      | { kind: "project"; project: Project }
      | { kind: "goal"; goal: Goal }
      | null
    >
  >;
  renameValue: string;
  setRenameValue: React.Dispatch<React.SetStateAction<string>>;
  repositories: PlanuiRepositories;
  onDataChanged: (feedbackMessage?: string) => Promise<void>;
}

export function PlanRenameSheet({
  renameTarget,
  setRenameTarget,
  renameValue,
  setRenameValue,
  repositories,
  onDataChanged,
}: PlanRenameSheetProps) {
  return (
    <Sheet
      title="Перейменувати"
      isOpen={Boolean(renameTarget)}
      onClose={() => setRenameTarget(null)}
    >
      <div className="space-y-4 p-2">
        <input
          type="text"
          className="ui-input-field w-full"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          autoFocus
        />
        <GlossyButton
          variant="mint"
          fullWidth
          disabled={!renameValue.trim()}
          onClick={async () => {
            const trimmed = renameValue.trim();
            if (!trimmed) return;
            if (renameTarget.kind === "folder") {
              await repositories.saveFolder(
                { ...renameTarget.folder, name: trimmed },
                renameTarget.folder.revision,
              );
            } else if (renameTarget.kind === "project") {
              await repositories.saveProject(
                { ...renameTarget.project, title: trimmed },
                renameTarget.project.revision,
              );
            } else {
              await repositories.saveGoal(
                { ...renameTarget.goal, title: trimmed },
                renameTarget.goal.revision,
              );
            }
            setRenameTarget(null);
            await onDataChanged("Назву оновлено");
          }}
        >
          Зберегти
        </GlossyButton>
      </div>
    </Sheet>
  );
}
