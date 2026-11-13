import React, { useMemo } from "react";

import { ORB_PALETTE, orbVars } from "../domain/modelHelpers";

export type Icon3DName =
  // System glyphs
  | "check"
  | "calendar"
  | "repeat"
  | "folder"
  | "target"
  | "heart"
  | "sun"
  | "moon"
  | "gift"
  | "bar-chart"
  | "gear"
  // Area glyphs
  | "leaf"
  | "lotus"
  | "hourglass"
  | "people"
  | "palette"
  | "briefcase"
  | "wallet"
  | "book"
  | "house"
  | "compass"
  // User glyphs (Значок)
  | "laptop"
  | "sprout"
  | "palm"
  | "camera"
  | "books"
  | "rocket"
  | "music"
  | "plane"
  | "star"
  | "home"
  | string;

export interface Icon3DProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  name: Icon3DName;
  color?: string | null;
  size?: number;
  shape?: "squircle" | "circle" | "bare";
}

export const CANONICAL_ICON3D_KEYS = [
  "check",
  "calendar",
  "repeat",
  "folder",
  "target",
  "heart",
  "sun",
  "moon",
  "gift",
  "bar-chart",
  "gear",
  "leaf",
  "lotus",
  "hourglass",
  "people",
  "palette",
  "briefcase",
  "wallet",
  "book",
  "books",
  "house",
  "compass",
  "laptop",
  "sprout",
  "palm",
  "camera",
  "rocket",
  "music",
  "plane",
  "star",
] as const;

export function normalizeIcon3DGlyphKey(name: string): string {
  const n = name.trim().toLowerCase();
  switch (n) {
    case "check":
    case "task":
      return "check";
    case "calendar":
    case "event":
      return "calendar";
    case "repeat":
    case "habit":
      return "repeat";
    case "folder":
    case "projects":
      return "folder";
    case "target":
    case "goal":
    case "goals":
      return "target";
    case "heart":
    case "me":
      return "heart";
    case "sun":
    case "shift-day":
      return "sun";
    case "moon":
    case "shift-night":
      return "moon";
    case "gift":
    case "wish":
    case "wishlist":
      return "gift";
    case "bar-chart":
    case "stats":
    case "records":
    case "chart":
      return "bar-chart";
    case "gear":
    case "settings":
      return "gear";
    case "leaf":
    case "physical":
      return "leaf";
    case "lotus":
    case "brain":
    case "mental":
      return "lotus";
    case "hourglass":
    case "recovery":
      return "hourglass";
    case "people":
    case "users":
    case "relationships":
      return "people";
    case "palette":
    case "creativity":
      return "palette";
    case "briefcase":
    case "work":
      return "briefcase";
    case "wallet":
    case "finance":
    case "finances":
      return "wallet";
    case "book":
    case "book-open":
    case "learning":
      return "book";
    case "books":
      return "books";
    case "house":
    case "home":
      return "house";
    case "compass":
    case "meaning":
      return "compass";
    case "laptop":
      return "laptop";
    case "sprout":
      return "sprout";
    case "palm":
      return "palm";
    case "camera":
      return "camera";
    case "rocket":
      return "rocket";
    case "music":
      return "music";
    case "plane":
      return "plane";
    case "star":
    default:
      return "star";
  }
}

export const Icon3D = React.memo(function Icon3D({
  name,
  color,
  size = 32,
  shape = "squircle",
  className = "",
  style,
  ...props
}: Icon3DProps) {
  const vars = useMemo(() => orbVars(color ?? ORB_PALETTE.pink), [color]);
  const glyphKey = useMemo(() => normalizeIcon3DGlyphKey(name), [name]);

  return (
    <span
      {...props}
      aria-hidden="true"
      data-ui="icon-3d"
      data-icon={name}
      data-shape={shape}
      className={`ui-icon-3d ${className}`.trim()}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        color: "var(--c)",
        ...vars,
        ...style,
      }}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} fill="none">
        {shape !== "bare" && (
          <use
            href={
              shape === "circle" ? "#i3d-tile-circle" : "#i3d-tile-squircle"
            }
          />
        )}
        <use href={`#i3d-glyph-${glyphKey}`} />
      </svg>
    </span>
  );
});
