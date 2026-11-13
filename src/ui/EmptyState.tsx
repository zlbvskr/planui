import React, { useMemo } from "react";

import { type OrbHue } from "../domain/modelHelpers";

import { type IconName } from "./icons";

import { ButtonVariant } from "./buttons";

import { Icon3DName } from "./Icon3D";

import { normalizeIcon3DGlyphKey } from "./Icon3D";

import { lookupBundledArtUrl } from "./art";

import { HeroArt } from "./art";

import { ArtIcon } from "./art";

import { Orb } from "./Orb";

import { Icon3D } from "./Icon3D";

import { GlossyButton } from "./buttons";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  testId?: string;
}

type EmptyStateContext =
  | "tasks"
  | "habits"
  | "projects"
  | "goals"
  | "calendar"
  | "wishlist"
  | "stats";

export interface EmptyStateProps {
  title?: string;
  text?: string;
  context?: EmptyStateContext | string;
  glyph?: Icon3DName | string;
  description?: string;
  icon?: IconName;
  action?: string | React.ReactNode;
  actionLabel?: string;
  actionTestId?: string;
  onAction?: () => void;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction | string;
  onSecondaryAction?: () => void;
  orbColor?: string | null;
  orbHue?: OrbHue;
  className?: string;
  testId?: string;
}

export function EmptyState({
  title,
  text,
  context,
  glyph,
  action,
  actionLabel,
  actionTestId,
  onAction,
  primaryAction,
  secondaryAction,
  onSecondaryAction,
  orbColor,
  orbHue,
  className = "",
  testId,
}: EmptyStateProps) {
  const displayTitle = title ?? text ?? "";

  const resolvedGlyph = useMemo(() => {
    if (glyph) return normalizeIcon3DGlyphKey(glyph);
    const ctx = (context || "").toLowerCase();
    if (ctx === "tasks" || ctx === "task") return "check";
    if (ctx === "habits" || ctx === "habit") return "repeat";
    if (ctx === "projects" || ctx === "project" || ctx === "folder")
      return "folder";
    if (ctx === "goals" || ctx === "goal") return "target";
    if (ctx === "calendar" || ctx === "day" || ctx === "event")
      return "calendar";
    if (ctx === "wishlist" || ctx === "wish") return "gift";
    if (ctx === "stats" || ctx === "statistics" || ctx === "records")
      return "bar-chart";
    if (ctx) return normalizeIcon3DGlyphKey(ctx);

    const lower = `${displayTitle}`.toLowerCase();
    if (
      lower.includes("завдан") ||
      lower.includes("задач") ||
      lower.includes("план")
    )
      return "check";
    if (lower.includes("звич")) return "repeat";
    if (
      lower.includes("проєкт") ||
      lower.includes("проект") ||
      lower.includes("папк")
    )
      return "folder";
    if (lower.includes("ціл") || lower.includes("етап")) return "target";
    if (
      lower.includes("поді") ||
      lower.includes("день") ||
      lower.includes("розклад")
    )
      return "calendar";
    if (
      lower.includes("бажан") ||
      lower.includes("мрій") ||
      lower.includes("wish")
    )
      return "gift";
    if (
      lower.includes("стат") ||
      lower.includes("запис") ||
      lower.includes("рекорд")
    )
      return "bar-chart";
    return "check";
  }, [glyph, context, displayTitle]);

  const resolvedPrimary: EmptyStateAction | undefined =
    primaryAction ??
    (actionLabel && onAction
      ? {
          label: actionLabel,
          onClick: onAction,
          variant: "mint",
          testId: actionTestId,
        }
      : typeof action === "string" && onAction
        ? {
            label: action,
            onClick: onAction,
            variant: "mint",
            testId: actionTestId,
          }
        : undefined);

  const resolvedSecondary: EmptyStateAction | undefined =
    typeof secondaryAction === "object" && secondaryAction !== null
      ? secondaryAction
      : typeof secondaryAction === "string" && onSecondaryAction
        ? {
            label: secondaryAction,
            onClick: onSecondaryAction,
            variant: "secondary",
          }
        : undefined;

  const customActionNode = typeof action !== "string" ? action : null;

  const emptyArtName = useMemo(() => {
    const ctx = (context || "").toLowerCase();
    if (ctx === "tasks" || ctx === "task" || resolvedGlyph === "check")
      return "task";
    if (ctx === "habits" || ctx === "habit" || resolvedGlyph === "repeat")
      return "habit";
    if (ctx === "projects" || ctx === "project") return "project";
    if (ctx === "folder" || resolvedGlyph === "folder") return "folder";
    if (ctx === "goals" || ctx === "goal" || resolvedGlyph === "target")
      return "goal";
    if (
      ctx === "calendar" ||
      ctx === "day" ||
      ctx === "event" ||
      resolvedGlyph === "calendar"
    )
      return "event";
    if (ctx === "wishlist" || ctx === "wish" || resolvedGlyph === "gift")
      return "wish";
    if (
      ctx === "stats" ||
      ctx === "statistics" ||
      ctx === "records" ||
      resolvedGlyph === "bar-chart"
    )
      return "chart";
    return resolvedGlyph;
  }, [context, resolvedGlyph]);

  return (
    <div
      data-ui="empty-state"
      data-testid={testId}
      className={`ui-empty-state ${className}`.trim()}
    >
      {context === "stats" && lookupBundledArtUrl("hero-sphere-empty") ? (
        <HeroArt name="sphere-empty" size={96} />
      ) : (
        <ArtIcon
          name={emptyArtName}
          size={64}
          className="ui-empty-state-art"
          fallback={
            <Orb
              color={orbColor ?? "var(--empty-orb-base)"}
              hue={orbHue}
              size={64}
              className="ui-empty-state-orb"
            >
              <Icon3D name={resolvedGlyph} shape="bare" size={32} />
            </Orb>
          }
        />
      )}
      <p className="ui-empty-state-title">{displayTitle}</p>
      {(resolvedPrimary || resolvedSecondary || customActionNode) && (
        <div className="ui-empty-state-actions">
          {resolvedPrimary && (
            <GlossyButton
              variant={
                resolvedPrimary.variant === "ink"
                  ? "mint"
                  : (resolvedPrimary.variant ?? "mint")
              }
              data-testid={resolvedPrimary.testId}
              onClick={resolvedPrimary.onClick}
            >
              {resolvedPrimary.label}
            </GlossyButton>
          )}
          {resolvedSecondary && (
            <GlossyButton
              variant={resolvedSecondary.variant ?? "secondary"}
              data-testid={resolvedSecondary.testId}
              onClick={resolvedSecondary.onClick}
            >
              {resolvedSecondary.label}
            </GlossyButton>
          )}
          {customActionNode}
        </div>
      )}
    </div>
  );
}
