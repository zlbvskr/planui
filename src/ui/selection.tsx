import React from "react";

import { type OrbHue } from "../domain/modelHelpers";

import { usePressFeedback, useSelectionThumb } from "./motion";

import { mergeRefs } from "./refs";

import { Orb } from "./Orb";

export interface PillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  selected?: boolean;
  orbColor?: string | null;
  orbHue?: OrbHue;
  icon?: React.ReactNode;
  count?: number;
}

export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(
  function Pill(
    {
      active,
      selected,
      orbColor,
      orbHue,
      icon,
      count,
      className = "",
      children,
      disabled,
      type = "button",
      ...props
    },
    forwardedRef,
  ) {
    const isSelected = Boolean(selected ?? active);
    const press = usePressFeedback<HTMLButtonElement>(!disabled);

    return (
      <button
        {...props}
        ref={mergeRefs(press.ref, forwardedRef)}
        type={type}
        disabled={disabled}
        aria-pressed={isSelected}
        data-ui="pill"
        data-active={isSelected ? "true" : "false"}
        className={`ui-pill ${isSelected ? "is-active" : ""} ${className}`.trim()}
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
        {icon}
        {!icon && (orbColor || orbHue) && (
          <Orb color={orbColor} hue={orbHue} size={20} />
        )}
        <span className="ui-pill-label">{children}</span>
        {typeof count === "number" && count > 0 && (
          <span className="ui-pill-count">{count}</span>
        )}
      </button>
    );
  },
);

export interface PillRowOption<T extends string = string> {
  value: T;
  label: string;
  count?: number;
  orbColor?: string | null;
  orbHue?: OrbHue;
  testId?: string;
}

export interface PillRowProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly PillRowOption<T>[];
  label?: string;
  ariaLabel?: string;
  className?: string;
}

export function PillRow<T extends string = string>({
  value,
  onChange,
  options,
  label,
  ariaLabel,
  className = "",
}: PillRowProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? label}
      data-ui="pill-row"
      className={`ui-pill-row no-scrollbar ${className}`.trim()}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pill
            key={opt.value}
            selected={active}
            orbColor={opt.orbColor}
            orbHue={opt.orbHue}
            count={opt.count}
            data-testid={opt.testId}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Pill>
        );
      })}
    </div>
  );
}

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  testId?: string;
}

export interface SegmentedProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  label?: string;
  ariaLabel?: string;
  className?: string;
}

export function Segmented<T extends string = string>({
  value,
  onChange,
  options,
  label,
  ariaLabel,
  className = "",
}: SegmentedProps<T>) {
  if (options.length > 4) {
    throw new Error("Segmented supports at most four options");
  }
  const { containerRef, thumbRef } = useSelectionThumb(value, {
    dynamicLayout: true,
    layoutKey: options.map((o) => o.value).join("|"),
  });

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      role="tablist"
      aria-label={ariaLabel ?? label}
      data-ui="segmented"
      className={`ui-segmented ${className}`.trim()}
    >
      <span ref={thumbRef} aria-hidden="true" className="ui-segmented-thumb" />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <SegmentedButton
            key={opt.value}
            active={active}
            label={opt.label}
            icon={opt.icon}
            testId={opt.testId}
            onSelect={() => onChange(opt.value)}
          />
        );
      })}
    </div>
  );
}

function SegmentedButton({
  active,
  label,
  icon,
  testId,
  onSelect,
}: {
  active: boolean;
  label: string;
  icon?: React.ReactNode;
  testId?: string;
  onSelect: () => void;
}) {
  const press = usePressFeedback<HTMLButtonElement>(true);
  return (
    <button
      ref={press.ref}
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active ? "true" : "false"}
      data-testid={testId}
      className={`ui-segmented-item ${active ? "is-active" : ""}`}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onPointerLeave={press.onPointerLeave}
      onClick={onSelect}
    >
      {icon && <span className="ui-segmented-icon">{icon}</span>}
      <span className="ui-segmented-label">{label}</span>
    </button>
  );
}
