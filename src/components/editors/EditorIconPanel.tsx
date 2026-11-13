import React from "react";
import {
  areaIdentity,
  type UserGlyphName as UserIconKey,
} from "../../domain/modelHelpers";
import type { LifeAreaQuestion } from "../../domain/types";
import { Icon3D } from "../../ui/Icon3D";
import { Tile3D } from "../../ui/cards";
import { USER_GLYPHS } from "./editorContext";
import { InlineChipKey } from "./editorTypes";

interface EditorIconPanelProps {
  iconKey:
    | "laptop"
    | "sprout"
    | "palm"
    | "camera"
    | "books"
    | "rocket"
    | "music"
    | "plane"
    | "star"
    | "gift"
    | "heart"
    | "home"
    | null;
  setIconKey: React.Dispatch<
    React.SetStateAction<
      | "laptop"
      | "sprout"
      | "palm"
      | "camera"
      | "books"
      | "rocket"
      | "music"
      | "plane"
      | "star"
      | "gift"
      | "heart"
      | "home"
      | null
    >
  >;
  setOpenChip: React.Dispatch<React.SetStateAction<InlineChipKey | null>>;
  selectedArea: LifeAreaQuestion | null;
}

export function EditorIconPanel({
  iconKey,
  setIconKey,
  setOpenChip,
  selectedArea,
}: EditorIconPanelProps) {
  return (
    <div
      className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)] space-y-2"
      data-testid="inline-panel-icon"
    >
      <div className="grid grid-cols-4 gap-2">
        {USER_GLYPHS.map((glyph) => {
          const selected = iconKey === glyph.key;
          return (
            <Tile3D
              key={glyph.key}
              selected={selected}
              radius={18}
              onClick={() => {
                setIconKey((prev: UserIconKey | null) =>
                  prev === glyph.key ? null : glyph.key,
                );
                setOpenChip(null);
              }}
              aria-label={glyph.label}
              data-testid={`user-glyph-${glyph.key}`}
              className="flex flex-col items-center justify-center gap-1 p-2.5"
            >
              <Icon3D
                name={glyph.key}
                color={selected ? undefined : areaIdentity(selectedArea)}
                size={24}
              />
              <span
                className={`text-[11px] font-bold truncate max-w-full ${
                  selected ? "text-[#06281F]" : "text-[var(--text-secondary)]"
                }`}
              >
                {glyph.label}
              </span>
            </Tile3D>
          );
        })}
      </div>
    </div>
  );
}
