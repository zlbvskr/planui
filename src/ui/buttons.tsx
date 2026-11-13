import React from "react";

import { Icon, type IconName } from "./icons";

import { usePressFeedback } from "./motion";

import { mergeRefs } from "./refs";

export type ButtonVariant =
  | "primary"
  | "mint"
  | "ink"
  | "coral"
  | "pink"
  | "secondary"
  | "destructive"
  | "danger"
  | "tertiary"
  | "subtle";

export interface GlossyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm" | "icon" | string;
  fullWidth?: boolean;
  busy?: boolean;
  icon?: React.ReactNode;
}

export type ButtonProps = GlossyButtonProps;

export const GlossyButton = React.forwardRef<
  HTMLButtonElement,
  GlossyButtonProps
>(function GlossyButton(
  {
    variant = "mint",
    size = "md",
    fullWidth = false,
    busy = false,
    icon,
    className = "",
    children,
    disabled,
    type = "button",
    ...props
  },
  forwardedRef,
) {
  const isDisabled = Boolean(disabled || busy);
  const press = usePressFeedback<HTMLButtonElement>(!isDisabled);
  const normalizedVariant =
    variant === "primary" || variant === "mint"
      ? "mint"
      : variant === "ink"
        ? "ink"
        : variant === "danger" ||
            variant === "destructive" ||
            variant === "coral"
          ? "coral"
          : variant === "subtle"
            ? "tertiary"
            : variant;

  const isGlossy =
    normalizedVariant === "mint" ||
    normalizedVariant === "ink" ||
    normalizedVariant === "coral" ||
    normalizedVariant === "pink";

  return (
    <button
      {...props}
      ref={mergeRefs(press.ref, forwardedRef)}
      type={type}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      data-ui="glossy-button"
      data-variant={normalizedVariant}
      data-size={size}
      className={`ui-btn ui-glossy-btn ui-btn-${normalizedVariant} ${
        isGlossy ? "ui-btn-glossy-3d" : ""
      } ${fullWidth ? "w-full" : ""} ${className}`.trim()}
      onPointerDown={(e) => {
        press.onPointerDown(e);
        props.onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        press.onPointerUp(e);
        props.onPointerUp?.(e);
      }}
      onPointerCancel={(e) => {
        press.onPointerCancel(e);
        props.onPointerCancel?.(e);
      }}
      onPointerLeave={(e) => {
        press.onPointerLeave(e);
        props.onPointerLeave?.(e);
      }}
    >
      {icon && <span className="ui-btn-icon">{icon}</span>}
      <span className="ui-btn-label">{busy ? "Зачекайте…" : children}</span>
    </button>
  );
});

export const Button = GlossyButton;

export interface RoundButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  icon?: IconName;
  size?: 36 | 44 | 48 | 52 | 56 | number;
  variant?: "soft" | "ink" | "pink" | "mint" | "frosted";
  active?: boolean;
}

export const RoundButton = React.forwardRef<
  HTMLButtonElement,
  RoundButtonProps
>(function RoundButton(
  {
    label,
    icon,
    size = 44,
    variant = "soft",
    active = false,
    className = "",
    children,
    disabled,
    type = "button",
    style,
    ...props
  },
  forwardedRef,
) {
  const press = usePressFeedback<HTMLButtonElement>(!disabled);
  const defaultIconLabels: Partial<Record<IconName, string>> = {
    "chevron-left": "Назад",
    "chevron-right": "Вперед",
    x: "Закрити",
    calendar: "Календар",
    plus: "Додати",
    more: "Ще",
    "more-horizontal": "Ще",
  };
  const ariaLabel =
    props["aria-label"] ??
    label ??
    (icon ? defaultIconLabels[icon] : undefined) ??
    "Кнопка";

  return (
    <button
      {...props}
      ref={mergeRefs(press.ref, forwardedRef)}
      type={type}
      aria-label={ariaLabel}
      disabled={disabled}
      data-ui="round-button"
      data-variant={variant}
      data-active={active ? "true" : undefined}
      className={`ui-round-btn ui-round-btn-${variant} ${active ? "is-active" : ""} ${className}`.trim()}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        ...style,
      }}
      onPointerDown={(e) => {
        press.onPointerDown(e);
        props.onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        press.onPointerUp(e);
        props.onPointerUp?.(e);
      }}
      onPointerCancel={(e) => {
        press.onPointerCancel(e);
        props.onPointerCancel?.(e);
      }}
      onPointerLeave={(e) => {
        press.onPointerLeave(e);
        props.onPointerLeave?.(e);
      }}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
});
