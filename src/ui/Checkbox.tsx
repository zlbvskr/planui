import React from "react";

import { usePressFeedback } from "./motion";

export interface CheckboxProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
}

export function Checkbox({
  checked = false,
  onChange,
  label,
  disabled = false,
  className = "",
  onClick,
  ...props
}: CheckboxProps) {
  const press = usePressFeedback<HTMLButtonElement>(!disabled);

  return (
    <button
      {...props}
      ref={press.ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={
        props["aria-label"] ??
        label ??
        (checked ? "Виконано" : "Позначити виконаним")
      }
      disabled={disabled}
      data-ui="checkbox"
      data-checked={checked ? "true" : "false"}
      className={`ui-checkbox ${checked ? "is-checked" : ""} ${className}`.trim()}
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
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
        if (!disabled) {
          onChange?.(!checked);
        }
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        aria-hidden="true"
        className="ui-checkbox-mark"
      >
        <defs>
          <linearGradient
            id="ui-chk-3d"
            x1="5"
            y1="7"
            x2="19"
            y2="18"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#D6FBEF" />
          </linearGradient>
        </defs>
        <path
          d="M5.5 13.3L10 17.8L18.5 8.6"
          fill="none"
          stroke="rgba(12, 105, 74, 0.30)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5.5 12.5L10 17L18.5 7.8"
          fill="none"
          stroke="url(#ui-chk-3d)"
          strokeWidth="3.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5.8 11.9L10 16.1L18.2 7.2"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.92"
        />
      </svg>
    </button>
  );
}
