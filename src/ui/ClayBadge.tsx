import React, { useMemo } from "react";

import { ArtIcon } from "./art";

export type ClayBadgeShape =
  | "today"
  | "projects"
  | "folder"
  | "goals"
  | "target"
  | "me"
  | "heart"
  | "calendar"
  | "stats"
  | "records"
  | "wishlist"
  | "settings";

export interface ClayBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  shape: ClayBadgeShape;
  dayNumber?: number | string;
  size?: number;
}

export const ClayBadge = React.memo(function ClayBadge({
  shape,
  dayNumber,
  size = 52,
  className = "",
  style,
  ...props
}: ClayBadgeProps) {
  const clampedSize = Math.min(56, size);
  const normalizedShape =
    shape === "folder"
      ? "projects"
      : shape === "target"
        ? "goals"
        : shape === "heart"
          ? "me"
          : shape === "records"
            ? "stats"
            : shape;

  const badgeArtName =
    normalizedShape === "today"
      ? "calendar-check"
      : normalizedShape === "calendar"
        ? "calendar-date"
        : normalizedShape === "projects"
          ? "folder"
          : normalizedShape === "goals"
            ? "target"
            : normalizedShape === "me"
              ? "heart"
              : normalizedShape === "stats"
                ? "chart"
                : normalizedShape === "wishlist"
                  ? "gift"
                  : "gear";

  const resolvedDayNumber = useMemo(() => {
    if (dayNumber !== undefined) return String(dayNumber);
    return String(new Date().getDate());
  }, [dayNumber]);

  const svgFallback = (
    <svg
      viewBox="0 0 88 88"
      width={clampedSize}
      height={clampedSize}
      fill="none"
      className="ui-clay-badge-svg"
    >
      <use href={`#cb-shape-${normalizedShape}`} />
      {normalizedShape === "calendar" && (
        <text
          x="44"
          y="56"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-primary)"
          fontFamily="var(--font-sans)"
          fontWeight="800"
          fontSize="18"
        >
          {resolvedDayNumber}
        </text>
      )}
    </svg>
  );

  return (
    <div
      {...props}
      aria-hidden="true"
      data-ui="clay-badge"
      data-shape={normalizedShape}
      className={`ui-clay-badge ui-clay-badge-${normalizedShape} ${className}`.trim()}
      style={{
        width: `${clampedSize}px`,
        height: `${clampedSize}px`,
        ...style,
      }}
    >
      <ArtIcon name={badgeArtName} size={clampedSize} fallback={svgFallback} />
    </div>
  );
});
