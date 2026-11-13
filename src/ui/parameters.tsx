import React from "react";

import { Icon, type IconName } from "./icons";

import { usePressFeedback } from "./motion";

import { mergeRefs } from "./refs";

export interface ParameterChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  icon?: IconName | React.ReactNode;
  label: string;
  value?: string | null;
  selected?: boolean;
  highlighted?: boolean;
}

export const ParameterChip = React.forwardRef<
  HTMLButtonElement,
  ParameterChipProps
>(function ParameterChip(
  {
    icon,
    label,
    value,
    selected = false,
    highlighted = false,
    disabled = false,
    className = "",
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    children,
    ...props
  },
  forwardedRef,
) {
  const press = usePressFeedback<HTMLButtonElement>(!disabled);

  return (
    <button
      {...props}
      ref={mergeRefs(press.ref, forwardedRef)}
      type="button"
      disabled={disabled}
      aria-pressed={props["aria-pressed"] ?? selected}
      data-ui="parameter-chip"
      data-active={selected ? "true" : undefined}
      data-highlighted={highlighted ? "true" : undefined}
      className={`ui-parameter-chip ${selected ? "is-active" : ""} ${
        highlighted ? "is-highlighted" : ""
      } ${className}`.trim()}
      onPointerDown={(e) => {
        press.onPointerDown(e);
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        press.onPointerUp(e);
        onPointerUp?.(e);
      }}
      onPointerCancel={(e) => {
        press.onPointerCancel(e);
        onPointerCancel?.(e);
      }}
      onPointerLeave={(e) => {
        press.onPointerLeave(e);
        onPointerLeave?.(e);
      }}
    >
      {icon && (
        <span className="ui-parameter-chip-icon" aria-hidden="true">
          {typeof icon === "string" ? (
            <Icon name={icon as IconName} size={16} />
          ) : (
            icon
          )}
        </span>
      )}
      <span className="ui-parameter-chip-label">{label}</span>
      {value ? <span className="ui-parameter-chip-value">{value}</span> : null}
      {children}
    </button>
  );
});
