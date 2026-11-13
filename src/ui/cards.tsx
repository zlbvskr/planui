import React from "react";

import { usePressFeedback } from "./motion";

import { mergeRefs } from "./refs";

export interface MilkyCardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  nested?: boolean;
}

export const MilkyCard = React.forwardRef<HTMLDivElement, MilkyCardProps>(
  function MilkyCard(
    { padded = true, nested = false, className = "", children, ...props },
    ref,
  ) {
    return (
      <div
        {...props}
        ref={ref}
        data-ui="milky-card"
        className={`ui-milky-card ui-soft-card ui-card ${padded ? "ui-soft-card-padded" : ""} ${
          nested ? "ui-milky-card-nested" : ""
        } ${className}`.trim()}
      >
        {children}
      </div>
    );
  },
);

export const Card = MilkyCard;

export interface Tile3DProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  today?: boolean;
  radius?: 14 | 18 | number;
  as?: "button" | "div";
}

export const Tile3D = React.forwardRef<HTMLElement, Tile3DProps>(
  function Tile3D(
    {
      selected = false,
      today = false,
      radius = 18,
      as = "button",
      disabled = false,
      className = "",
      style,
      children,
      type = "button",
      ...props
    },
    forwardedRef,
  ) {
    const Tag: "button" | "div" = as;
    const press = usePressFeedback<HTMLElement>(Tag === "button" && !disabled);

    return (
      <Tag
        {...(props as Record<string, unknown>)}
        ref={mergeRefs(press.ref, forwardedRef)}
        type={Tag === "button" ? type : undefined}
        disabled={Tag === "button" ? disabled : undefined}
        aria-pressed={
          Tag === "button" && props["aria-pressed"] === undefined
            ? selected
            : props["aria-pressed"]
        }
        data-ui="tile-3d"
        data-selected={selected ? "true" : undefined}
        data-today={today && !selected ? "true" : undefined}
        className={`ui-tile-3d ${selected ? "is-selected" : ""} ${
          today && !selected ? "is-today" : ""
        } ${className}`.trim()}
        style={{
          borderRadius: `${radius}px`,
          ...style,
        }}
        onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerDown(e);
          props.onPointerDown?.(e as React.PointerEvent<HTMLButtonElement>);
        }}
        onPointerUp={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerUp(e);
          props.onPointerUp?.(e as React.PointerEvent<HTMLButtonElement>);
        }}
        onPointerCancel={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerCancel(e);
          props.onPointerCancel?.(e as React.PointerEvent<HTMLButtonElement>);
        }}
        onPointerLeave={(e: React.PointerEvent<HTMLElement>) => {
          press.onPointerLeave(e);
          props.onPointerLeave?.(e as React.PointerEvent<HTMLButtonElement>);
        }}
      >
        {children}
      </Tag>
    );
  },
);
