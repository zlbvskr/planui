import React, { useMemo } from "react";

import { ORB_PALETTE, orbVars, type OrbHue } from "../domain/modelHelpers";

import { usePressFeedback } from "./motion";

import { OrbSize } from "./Orb";

import { Icon3DName } from "./Icon3D";

import { mergeRefs } from "./refs";

import { Icon3D } from "./Icon3D";

import { Orb } from "./Orb";

import { ProgressRing } from "./ProgressRing";

import { Checkbox } from "./Checkbox";

export interface RowProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title" | "color"> {
  orbColor?: string | null;
  orbHue?: OrbHue;
  orbSize?: OrbSize;
  hideOrb?: boolean;
  icon3d?: Icon3DName;
  leading?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  secondary?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  value?: React.ReactNode;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onToggleCheck?: (checked: boolean) => void;
  checkboxTestId?: string;
  checkboxAriaLabel?: string;
  checkLabel?: string;
  chevron?: boolean;
  progress?: number | null;
  measure?: { current: number; target: number; unit?: string } | null;
  selected?: boolean;
  done?: boolean;
  glowColor?: string | null;
  interactive?: boolean;
  as?: "div" | "button";
  disabled?: boolean;
}

export type SoftRowProps = RowProps;

export const Row = React.memo(
  React.forwardRef<HTMLElement, RowProps>(function Row(
    {
      orbColor,
      orbHue,
      orbSize = 32,
      hideOrb = false,
      icon3d,
      leading,
      title,
      subtitle,
      secondary,
      meta,
      trailing,
      value,
      checked,
      onCheckedChange,
      onToggleCheck,
      checkboxTestId,
      checkboxAriaLabel,
      checkLabel,
      chevron = false,
      progress,
      measure,
      selected = false,
      done = false,
      glowColor,
      interactive,
      as,
      disabled = false,
      className = "",
      style,
      children,
      onClick,
      ...props
    },
    forwardedRef,
  ) {
    const handleCheck = onCheckedChange ?? onToggleCheck;
    const resolvedCheckLabel = checkboxAriaLabel ?? checkLabel;
    const isInteractive = Boolean(interactive ?? onClick);
    const Tag: "div" | "button" =
      as ?? (onClick && !handleCheck ? "button" : "div");
    const press = usePressFeedback<HTMLElement>(isInteractive && !disabled);

    const resolvedGlowColor =
      glowColor ?? orbColor ?? (orbHue ? ORB_PALETTE[orbHue] : undefined);
    const glowVars = useMemo(
      () =>
        resolvedGlowColor
          ? orbVars(resolvedGlowColor)
          : done || selected
            ? orbVars(ORB_PALETTE.pink)
            : undefined,
      [done, selected, resolvedGlowColor],
    );

    const metaContent = meta ?? secondary ?? subtitle;
    const showOrb =
      !hideOrb && (orbColor !== undefined || orbHue !== undefined);
    const hasLeading = leading !== undefined || Boolean(icon3d) || showOrb;
    const isKeyValueRow =
      value !== undefined &&
      (metaContent == null || metaContent === "") &&
      measure == null &&
      typeof progress !== "number" &&
      handleCheck === undefined &&
      typeof checked !== "boolean";

    return (
      <Tag
        {...(props as Record<string, unknown>)}
        ref={mergeRefs(press.ref, forwardedRef)}
        type={Tag === "button" ? "button" : undefined}
        disabled={Tag === "button" ? disabled : undefined}
        data-ui="row"
        data-kv={isKeyValueRow ? "true" : undefined}
        data-selected={selected ? "true" : undefined}
        data-done={done ? "true" : undefined}
        className={`ui-soft-row ui-row ${isInteractive ? "ui-soft-row-interactive" : ""} ${
          isKeyValueRow ? "ui-soft-row-kv" : ""
        } ${isKeyValueRow && hasLeading ? "ui-soft-row-kv-leading" : ""} ${
          isKeyValueRow && chevron ? "ui-soft-row-kv-chevron" : ""
        } ${selected ? "ui-soft-row-ring" : ""} ${done ? "ui-soft-row-glow" : ""} ${className}`.trim()}
        style={{
          ...glowVars,
          ...style,
        }}
        onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerDown(e);
          props.onPointerDown?.(e);
        }}
        onPointerUp={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerUp(e);
          props.onPointerUp?.(e);
        }}
        onPointerCancel={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerCancel(e);
          props.onPointerCancel?.(e);
        }}
        onPointerLeave={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerLeave(e);
          props.onPointerLeave?.(e);
        }}
        onClick={onClick}
      >
        {title !== undefined ? (
          <>
            {leading !== undefined ? (
              <span className="ui-soft-row-leading">{leading}</span>
            ) : icon3d ? (
              <Icon3D name={icon3d} color={orbColor} size={orbSize} />
            ) : showOrb ? (
              <Orb color={orbColor} hue={orbHue} size={orbSize} />
            ) : null}

            <span className="ui-soft-row-body">
              <span
                className={`ui-soft-row-title ${done ? "is-done" : ""}`.trim()}
              >
                {title}
              </span>
              {metaContent != null && metaContent !== "" && (
                <span className="ui-soft-row-meta">{metaContent}</span>
              )}
            </span>

            {(trailing !== undefined ||
              value !== undefined ||
              measure != null ||
              typeof progress === "number" ||
              handleCheck !== undefined ||
              typeof checked === "boolean" ||
              chevron) && (
              <span className="ui-soft-row-trailing">
                {measure && measure.target > 0 && (
                  <ProgressRing
                    current={measure.current}
                    target={measure.target}
                    color={orbColor}
                    size={40}
                    strokeWidth={7}
                  />
                )}
                {!measure &&
                  typeof progress === "number" &&
                  Number.isFinite(progress) && (
                    <span className="ui-soft-row-progress" aria-hidden="true">
                      <span
                        className="ui-soft-row-progress-fill"
                        style={{
                          width: `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`,
                        }}
                      />
                    </span>
                  )}
                {value !== undefined && (
                  <span className="ui-soft-row-value">
                    {value === "" ? "Не заповнено" : value}
                  </span>
                )}
                {trailing}
                {(handleCheck !== undefined ||
                  typeof checked === "boolean") && (
                  <Checkbox
                    checked={Boolean(checked)}
                    onChange={handleCheck}
                    data-testid={checkboxTestId}
                    aria-label={resolvedCheckLabel}
                  />
                )}
                {chevron && (
                  <svg
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                    aria-hidden="true"
                    className="ui-soft-row-chevron"
                  >
                    <path
                      d="M7.5 4.5L13 10L7.5 15.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
            )}
          </>
        ) : (
          children
        )}
      </Tag>
    );
  }),
);

export const SoftRow = Row;

export interface RowTextValueProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title" | "color"> {
  orbColor?: string | null;
  orbHue?: OrbHue;
  orbSize?: OrbSize;
  hideOrb?: boolean;
  icon3d?: Icon3DName;
  leading?: React.ReactNode;
  title: React.ReactNode;
  value?: React.ReactNode;
  placeholder?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  interactive?: boolean;
  as?: "div" | "button";
  disabled?: boolean;
}

export const RowTextValue = React.memo(
  React.forwardRef<HTMLElement, RowTextValueProps>(function RowTextValue(
    {
      orbColor,
      orbHue,
      orbSize = 32,
      hideOrb = false,
      icon3d,
      leading,
      title,
      value,
      placeholder = "Не заповнено",
      trailing,
      chevron = false,
      interactive,
      as,
      disabled = false,
      className = "",
      style,
      onClick,
      ...props
    },
    forwardedRef,
  ) {
    const isInteractive = Boolean(interactive ?? onClick);
    const Tag: "div" | "button" = as ?? (onClick ? "button" : "div");
    const press = usePressFeedback<HTMLElement>(isInteractive && !disabled);
    const showOrb =
      !hideOrb && (orbColor !== undefined || orbHue !== undefined);
    const hasValue = value !== undefined && value !== null && value !== "";

    return (
      <Tag
        {...(props as Record<string, unknown>)}
        ref={mergeRefs(press.ref, forwardedRef)}
        type={Tag === "button" ? "button" : undefined}
        disabled={Tag === "button" ? disabled : undefined}
        data-ui="row-text-value"
        className={`ui-soft-row ui-row ui-row-text-value ${
          isInteractive ? "ui-soft-row-interactive" : ""
        } ${className}`.trim()}
        style={style}
        onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerDown(e);
          props.onPointerDown?.(e);
        }}
        onPointerUp={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerUp(e);
          props.onPointerUp?.(e);
        }}
        onPointerCancel={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerCancel(e);
          props.onPointerCancel?.(e);
        }}
        onPointerLeave={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerLeave(e);
          props.onPointerLeave?.(e);
        }}
        onClick={onClick}
      >
        {leading !== undefined ? (
          <span className="ui-soft-row-leading">{leading}</span>
        ) : icon3d ? (
          <Icon3D name={icon3d} color={orbColor} size={orbSize} />
        ) : showOrb ? (
          <Orb color={orbColor} hue={orbHue} size={orbSize} />
        ) : null}

        <span className="ui-row-text-value-body">
          <span className="ui-soft-row-title">{title}</span>
          <span
            className={`ui-row-text-value-text ${!hasValue ? "is-placeholder" : ""}`.trim()}
          >
            {hasValue ? value : placeholder}
          </span>
        </span>

        {(trailing !== undefined || chevron) && (
          <span className="ui-soft-row-trailing">
            {trailing}
            {chevron && (
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                aria-hidden="true"
                className="ui-soft-row-chevron"
              >
                <path
                  d="M7.5 4.5L13 10L7.5 15.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        )}
      </Tag>
    );
  }),
);
