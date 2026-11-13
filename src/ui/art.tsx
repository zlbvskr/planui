import React, { useMemo, useState } from "react";

import { Icon3DProps } from "./Icon3D";

import { Icon3D } from "./Icon3D";

const BUNDLED_ART_MODULES = import.meta.glob("../assets/art/*.webp", {
  eager: true,
  query: "?url",
}) as Record<string, string | { default?: string }>;

function extractBundledUrl(
  mod: string | { default?: string } | undefined,
): string | undefined {
  if (!mod) return undefined;
  if (typeof mod === "string") return mod;
  return typeof mod.default === "string" ? mod.default : undefined;
}

function resolveArtCandidateNames(rawName: string): string[] {
  const n = rawName.trim().toLowerCase();
  switch (n) {
    case "task":
    case "tasks":
    case "check":
      return ["task", "check"];
    case "event":
      return ["event", "calendar-date"];
    case "calendar-date":
    case "calendar":
      return ["calendar-date", "event"];
    case "calendar-check":
    case "today":
      return ["calendar-check", "task"];
    case "sun":
    case "shift-day":
      return ["shift-day", "shift"];
    case "moon":
    case "shift-night":
      return ["shift-night", "shift"];
    case "shift":
      return ["shift"];
    case "habit":
    case "habits":
    case "repeat":
      return ["habit"];
    case "briefcase":
      return ["briefcase", "project", "folder"];
    case "project":
      return ["project", "folder"];
    case "house":
    case "home":
      return ["house", "home"];
    case "folder":
    case "projects":
      return ["folder", "project"];
    case "goal":
    case "goals":
      return ["goal", "target"];
    case "target":
      return ["target", "goal"];
    case "wish":
      return ["wish", "gift"];
    case "gift":
    case "wishlist":
      return ["gift", "wish"];
    case "heart":
    case "me":
      return ["heart"];
    case "chart":
    case "stats":
    case "records":
    case "bar-chart":
      return ["chart"];
    case "gear":
    case "settings":
      return ["gear"];
    default:
      return [n];
  }
}

export function lookupBundledArtUrl(rawName: string): string | undefined {
  const candidates = resolveArtCandidateNames(rawName);
  for (const candidate of candidates) {
    const directKey = `../assets/art/${candidate}.webp`;
    const found = extractBundledUrl(BUNDLED_ART_MODULES[directKey]);
    if (found) return found;
    for (const [k, v] of Object.entries(BUNDLED_ART_MODULES)) {
      if (k.endsWith(`/${candidate}.webp`)) {
        const url = extractBundledUrl(v);
        if (url) return url;
      }
    }
  }
  return undefined;
}

export function HeroArt({
  name,
  size = 132,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = extractBundledUrl(
    BUNDLED_ART_MODULES[`../assets/art/hero-${name}.webp`],
  );
  if (!src || failed) return null;
  return (
    <span
      className={`ui-hero-art ${className}`.trim()}
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export interface ArtIconProps extends Icon3DProps {
  src?: string;
  fallback?: React.ReactNode;
}

/**
 * ArtIcon — 3D icon with bundled .webp render lookup (`import.meta.glob("../assets/art/*.webp")`,
 * square, `decoding="async"`, `mix-blend-mode: multiply`) and volumetric Icon3D/SVG fallback.
 * Supported canonical names: task, event, shift, habit, project, folder, goal, wish, gift,
 * calendar-check, calendar-date, target, heart, chart, gear.
 */
export const ArtIcon = React.memo(function ArtIcon({
  name,
  color,
  size = 40,
  shape = "squircle",
  src,
  fallback,
  className = "",
  style,
  ...props
}: ArtIconProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedSrc = useMemo(
    () => src ?? lookupBundledArtUrl(name),
    [src, name],
  );

  if (resolvedSrc && !imgFailed) {
    return (
      <span
        {...props}
        aria-hidden="true"
        data-ui="art-icon"
        data-icon={name}
        className={`ui-art-icon inline-flex items-center justify-center shrink-0 ${className}`.trim()}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          aspectRatio: "1 / 1",
          ...style,
        }}
      >
        <img
          src={resolvedSrc}
          alt=""
          width={size}
          height={size}
          decoding="async"
          onError={() => setImgFailed(true)}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            aspectRatio: "1 / 1",
            objectFit: "contain",
            mixBlendMode: "multiply",
          }}
        />
      </span>
    );
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <Icon3D
      {...props}
      name={name}
      color={color}
      size={size}
      shape={shape}
      className={`ui-art-icon ${className}`.trim()}
      style={style}
    />
  );
});
