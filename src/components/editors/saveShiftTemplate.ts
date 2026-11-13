import React from "react";
import { ShiftTemplate } from "../../domain/types";
import type { PlanuiRepositories } from "../../storage/repositories";

interface SaveShiftTemplateContext {
  tplName: string;
  tplStart: string;
  tplEnd: string;
  editingTpl: ShiftTemplate | null;
  shiftTemplates: readonly ShiftTemplate[];
  tplKind: "day" | "night";
  tplAreaId: string;
  areaId: string;
  folderId: string;
  repositories: PlanuiRepositories;
  setStampTool: React.Dispatch<React.SetStateAction<string>>;
  title: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  setTplSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingTpl: React.Dispatch<React.SetStateAction<ShiftTemplate | null>>;
  onEntityCreated: (
    toastMessageUk: string,
    undoFn?: () => void,
  ) => Promise<void> | void;
}

export async function saveShiftTemplate({
  tplName,
  tplStart,
  tplEnd,
  editingTpl,
  shiftTemplates,
  tplKind,
  tplAreaId,
  areaId,
  folderId,
  repositories,
  setStampTool,
  title,
  setTitle,
  setTplSheetOpen,
  setEditingTpl,
  onEntityCreated,
}: SaveShiftTemplateContext) {
  const trimmed = tplName.trim();
  if (!trimmed) return;
  const startStr = tplStart.slice(0, 5);
  const endStr = tplEnd.slice(0, 5);
  const nowIso = new Date().toISOString();
  const crossesMidnight = endStr <= startStr;

  const baseCode =
    trimmed.replace(/\s+/g, "").slice(0, 2).toUpperCase() || "ЗМ";
  let candidateCode = editingTpl?.code ?? baseCode;
  let suffix = 1;
  while (
    shiftTemplates.some(
      (t) =>
        t.id !== editingTpl?.id &&
        t.code.toUpperCase() === candidateCode.toUpperCase(),
    )
  ) {
    candidateCode = `${baseCode.slice(0, 2)}${suffix}`.slice(0, 4);
    suffix++;
  }

  const tpl: ShiftTemplate = {
    id:
      editingTpl?.id ??
      `stpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
    start: startStr,
    end: endStr,
    kind: tplKind,
    code: candidateCode,
    startLocalTime: startStr,
    endLocalTime: endStr,
    endDateOffsetDays: crossesMidnight || tplKind === "night" ? 1 : 0,
    color: "work",
    note: editingTpl?.note ?? null,
    areaId: tplAreaId || areaId || null,
    folderId: editingTpl?.folderId ?? (folderId || null),
    createdAt: editingTpl?.createdAt ?? nowIso,
    updatedAt: nowIso,
    revision: editingTpl ? editingTpl.revision + 1 : 1,
  };
  await repositories.saveShiftTemplate(tpl, editingTpl?.revision);
  setStampTool(tpl.id);
  if (!title.trim()) {
    setTitle(tpl.name);
  }
  setTplSheetOpen(false);
  setEditingTpl(null);
  await onEntityCreated("");
}
