import React, { useMemo } from "react";

import {
  ORB_PALETTE,
  getContrastTextColor,
  orbVars,
} from "../domain/modelHelpers";

import { Icon, type IconName } from "./icons";

import { usePressFeedback } from "./motion";

import { mergeRefs } from "./refs";

export interface GelBarProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title" | "color"> {
  color?: string | null;
  colorEnd?: string | null;
  shiftType?: "day" | "night";
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  timeLabel?: React.ReactNode;
  icon?: IconName | React.ReactNode;
  status?: React.ReactNode;
  trailing?: React.ReactNode;
  progress?: number | null;
  as?: "div" | "button";
}

export type EventBarProps = GelBarProps;

export const GelBar = React.memo(
  React.forwardRef<HTMLElement, GelBarProps>(function GelBar(
    {
      color,
      colorEnd: _colorEnd,
      shiftType,
      title,
      subtitle,
      meta,
      timeLabel,
      icon,
      status,
      trailing,
      progress,
      as,
      className = "",
      style,
      onClick,
      children,
      ...props
    },
    forwardedRef,
  ) {
    const Tag: "div" | "button" = as ?? (onClick ? "button" : "div");
    const press = usePressFeedback<HTMLElement>(Boolean(onClick));

    const resolvedVars = useMemo(() => {
      if (color) return orbVars(color);
      if (shiftType === "night") return orbVars("var(--shift-night)");
      if (shiftType === "day") return orbVars("var(--shift-day)");
      return orbVars(ORB_PALETTE.blue);
    }, [color, shiftType]);

    const renderedIcon = useMemo(() => {
      if (typeof icon === "string") {
        return <Icon name={icon as IconName} size={16} />;
      }
      if (icon !== undefined) return icon;
      if (shiftType === "day") return <Icon name="sun" size={16} />;
      if (shiftType === "night") return <Icon name="moon" size={16} />;
      return <Icon name="calendar" size={16} />;
    }, [icon, shiftType]);

    const metaNode = timeLabel ?? meta ?? subtitle;
    const trailingNode = trailing ?? status;
    const effectiveColor =
      color ??
      (shiftType === "night"
        ? "var(--shift-night)"
        : shiftType === "day"
          ? "var(--shift-day)"
          : ORB_PALETTE.blue);
    const isLightLum =
      shiftType === "day" || getContrastTextColor(effectiveColor) === "#121216";
    const computedAriaLabel =
      props["aria-label"] ??
      (typeof title === "string"
        ? metaNode && typeof metaNode === "string"
          ? `${title}, ${metaNode}`
          : title
        : undefined);

    return (
      <Tag
        {...(props as Record<string, unknown>)}
        ref={mergeRefs(press.ref, forwardedRef)}
        type={Tag === "button" ? "button" : undefined}
        aria-label={Tag === "button" ? computedAriaLabel : props["aria-label"]}
        data-ui="gel-bar"
        data-shift={shiftType}
        data-yellow={isLightLum ? "true" : undefined}
        className={`ui-gel-bar ${shiftType ? `ui-gel-bar-shift-${shiftType}` : ""} ${className}`.trim()}
        style={{
          ...resolvedVars,
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
        <span className="ui-gel-bar-icon" aria-hidden="true">
          {renderedIcon}
        </span>
        <span className="ui-gel-bar-body">
          {title !== undefined ? (
            <span className="ui-gel-bar-title">{title}</span>
          ) : (
            children
          )}
          {metaNode && <span className="ui-gel-bar-meta">{metaNode}</span>}
          {typeof progress === "number" && Number.isFinite(progress) && (
            <span className="ui-gel-bar-progress" aria-hidden="true">
              <span
                className="ui-gel-bar-progress-fill"
                style={{
                  width: `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`,
                }}
              />
            </span>
          )}
        </span>
        {trailingNode && (
          <span className="ui-gel-bar-trailing">{trailingNode}</span>
        )}
      </Tag>
    );
  }),
);

export const EventBar = GelBar;
