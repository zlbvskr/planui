import {Icon} from "../../ui/icons";
import React from "react";
import type { Folder, Project, Task } from "../../domain/types";
export function directionFor(
  task: Task | undefined,
  folders: readonly Folder[],
  projects: readonly Project[],
) {
  const ownership = task?.ownership;
  const folderId =
    ownership?.kind === "folder"
      ? ownership.folderId
      : ownership?.kind === "project"
        ? projects.find((p) => p.id === ownership.projectId)?.folderId
        : null;
  const index = Math.max(
    0,
    folders.findIndex((f) => f.id === folderId),
  );
  return {
    name: folders.find((f) => f.id === folderId)?.name ?? "Без напряму",
    hue: [
      "var(--hue-english)",
      "var(--hue-creative)",
      "var(--hue-university)",
      "var(--hue-relationships)",
      "var(--hue-work)",
    ][index % 5],
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
