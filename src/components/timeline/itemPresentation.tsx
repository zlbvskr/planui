import {Icon} from "../../ui/icons";
import React from "react";
import type { Folder, Project, Task, LifeArea, LifeAreaQuestion } from "../../domain/types";
import { itemColor, resolveArea } from "../../domain/modelHelpers";

export { itemColor };

export function directionFor(
  task: Task | undefined,
  folders: readonly Folder[] = [],
  projects: readonly Project[] = [],
  lifeAreas: readonly (LifeArea | LifeAreaQuestion)[] = [],
) {
  const resolved = resolveArea(task, { folders, projects, lifeAreas });
  const ownership = task?.ownership;
  const folderId =
    task?.folderId ??
    (ownership?.kind === "folder"
      ? ownership.folderId
      : ownership?.kind === "project"
        ? projects.find((p) => p.id === ownership.projectId)?.folderId
        : null);

  const folderName = folders.find((f) => f.id === folderId)?.name;
  const name = resolved?.name ?? folderName ?? "Без напряму";
  const hue = itemColor(task, { folders, projects, lifeAreas });

  return {
    name,
    hue,
  };
}
export const effortDots = (effort: Task["effort"]) =>
  effort === "small"
    ? "●○○"
    : effort === "medium"
      ? "●●○"
      : effort === "large"
        ? "●●●"
        : "";

export function Effort({ effort }: { effort: Task["effort"] }) {
  return effort ? (
    <span
      className="ui-effort" role="img"
      aria-label={`Зусилля: ${{ small: "малі", medium: "середні", large: "значні" }[effort]}`}
    >
      {[0,1,2].map(index=><Icon key={index} name="circle" size={8} fill={index<({small:1,medium:2,large:3}[effort])?'currentColor':'none'}/>)}
    </span>
  ) : null;
}
