import React from "react";
import type { Folder } from "../../domain/types";
import { InlineChipKey } from "./editorTypes";

interface EditorFolderPanelProps {
  setFolderId: React.Dispatch<React.SetStateAction<string>>;
  setOpenChip: React.Dispatch<React.SetStateAction<InlineChipKey | null>>;
  folderId: string;
  folderOptions: { folder: Folder; depth: number }[];
}

export function EditorFolderPanel({
  setFolderId,
  setOpenChip,
  folderId,
  folderOptions,
}: EditorFolderPanelProps) {
  return (
    <div
      className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)] space-y-1.5"
      data-testid="inline-panel-folder"
    >
      <button
        type="button"
        onClick={() => {
          setFolderId("");
          setOpenChip(null);
        }}
        className={`w-full text-left px-3 py-2 rounded-2xl text-sm font-bold cursor-pointer ${
          !folderId
            ? "ui-ring-selected text-[var(--text-primary)]"
            : "text-[var(--text-primary)]"
        }`}
      >
        Без папки
      </button>
      {folderOptions.map((opt) => (
        <button
          key={opt.folder.id}
          type="button"
          onClick={() => {
            setFolderId(opt.folder.id);
            setOpenChip(null);
          }}
          style={{ paddingLeft: `${12 + opt.depth * 16}px` }}
          className={`w-full text-left pr-3 py-2 rounded-2xl text-sm font-bold cursor-pointer ${
            folderId === opt.folder.id
              ? "ui-ring-selected text-[var(--text-primary)]"
              : "text-[var(--text-primary)]"
          }`}
        >
          {opt.folder.name}
        </button>
      ))}
    </div>
  );
}
