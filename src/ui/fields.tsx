import React, { useId, useMemo, useState } from "react";

import { formatDayMonth, formatDuration, formatTime } from "../lib/format";

import { Icon } from "./icons";

import { Orb } from "./Orb";

import { RoundButton } from "./buttons";

import { Tile3D } from "./cards";

export type FieldChangeEvent = React.ChangeEvent<HTMLInputElement> &
  React.ChangeEvent<HTMLSelectElement> &
  string;

export interface SearchBarProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}

export function SearchBar({
  value,
  onChange,
  onClear,
  placeholder = "Пошук",
  className = "",
  ...props
}: SearchBarProps) {
  return (
    <div data-ui="search-bar" className={`ui-search-bar ${className}`.trim()}>
      <svg
        viewBox="0 0 20 20"
        width="18"
        height="18"
        aria-hidden="true"
        className="ui-search-bar-icon"
      >
        <circle
          cx="9"
          cy="9"
          r="5.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M13.5 13.5L17 17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <input
        {...props}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="ui-search-bar-input"
      />
      {value.length > 0 && (
        <button
          type="button"
          aria-label="Очистити пошук"
          className="ui-search-bar-clear"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export interface DateFieldProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "value"
  > {
  label?: string;
  value?: string;
  onChange?: (e: FieldChangeEvent) => void;
}

function createFieldEvent(
  val: string,
  nativeEvent?: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
): FieldChangeEvent {
  if (nativeEvent) {
    const strObj = Object.assign(new String(val), {
      target: nativeEvent.target,
      currentTarget: nativeEvent.currentTarget,
      preventDefault: () => nativeEvent.preventDefault(),
      stopPropagation: () => nativeEvent.stopPropagation(),
      valueOf: () => val,
      toString: () => val,
    });
    return strObj as FieldChangeEvent;
  }
  const fakeTarget = { value: val } as HTMLInputElement &
    HTMLSelectElement & { value: string };
  return Object.assign(new String(val), {
    target: fakeTarget,
    currentTarget: fakeTarget,
    preventDefault: () => {},
    stopPropagation: () => {},
    valueOf: () => val,
    toString: () => val,
  }) as FieldChangeEvent;
}

export function DateField({
  label = "Дата",
  value = "",
  onChange,
  className = "",
  id,
  ...props
}: DateFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const formatted = value ? formatDayMonth(value) : "Не заповнено";

  return (
    <label
      htmlFor={inputId}
      className={`ui-soft-row ui-row ui-soft-row-interactive relative cursor-pointer ${className}`.trim()}
    >
      <Orb hue="pink" size={20} />
      <span className="ui-soft-row-body">
        <span className="ui-soft-row-title">{label}</span>
      </span>
      <span className="ui-soft-row-trailing">
        <span className="ui-soft-row-value">{formatted}</span>
      </span>
      <input
        {...props}
        id={inputId}
        type="date"
        aria-label={props["aria-label"] ?? label}
        value={value}
        data-ui="native-overlay"
        onChange={(e) => {
          onChange?.(createFieldEvent(e.target.value, e));
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </label>
  );
}

export interface TimeFieldProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "value"
  > {
  label?: string;
  value?: string;
  onChange?: (e: FieldChangeEvent) => void;
}

export function TimeField({
  label = "Час",
  value = "",
  onChange,
  className = "",
  id,
  ...props
}: TimeFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const formatted = value ? formatTime(value) : "Не заповнено";

  return (
    <label
      htmlFor={inputId}
      className={`ui-soft-row ui-row ui-soft-row-interactive relative cursor-pointer ${className}`.trim()}
    >
      <Orb hue="blue" size={20} />
      <span className="ui-soft-row-body">
        <span className="ui-soft-row-title">{label}</span>
      </span>
      <span className="ui-soft-row-trailing">
        <span className="ui-soft-row-value">{formatted}</span>
      </span>
      <input
        {...props}
        id={inputId}
        type="time"
        aria-label={props["aria-label"] ?? label}
        value={value}
        data-ui="native-overlay"
        onChange={(e) => {
          onChange?.(createFieldEvent(e.target.value, e));
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </label>
  );
}

export interface SelectFieldOption {
  value: string;
  label: string;
}

export interface SelectFieldProps
  extends Omit<
    React.SelectHTMLAttributes<HTMLSelectElement>,
    "onChange" | "value"
  > {
  label?: string;
  value?: string;
  options: readonly SelectFieldOption[];
  onChange?: (e: FieldChangeEvent) => void;
}

export function SelectField({
  label = "Вибір",
  value = "",
  options,
  onChange,
  className = "",
  id,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? (value || "Не заповнено");

  return (
    <label
      htmlFor={selectId}
      className={`ui-soft-row ui-row ui-soft-row-interactive relative cursor-pointer ${className}`.trim()}
    >
      <span className="ui-soft-row-body">
        <span className="ui-soft-row-title">{label}</span>
      </span>
      <span className="ui-soft-row-trailing">
        <span className="ui-soft-row-value">{selectedLabel}</span>
        <Icon
          name="chevron-down"
          size={16}
          className="text-[var(--text-tertiary)]"
        />
      </span>
      <select
        {...props}
        id={selectId}
        aria-label={props["aria-label"] ?? label}
        value={value}
        data-ui="native-overlay"
        onChange={(e) => {
          onChange?.(createFieldEvent(e.target.value, e));
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface DurationFieldProps {
  value?: number | null;
  valueMinutes?: number | null;
  onChange: (minutes: number | null) => void;
  label?: string;
  presets?: readonly number[];
  testId?: string;
  className?: string;
}

const DEFAULT_DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;

export function DurationField({
  value,
  valueMinutes,
  onChange,
  label = "Тривалість",
  presets = DEFAULT_DURATION_PRESETS,
  testId,
  className = "",
}: DurationFieldProps) {
  const current = value ?? valueMinutes ?? null;

  return (
    <div
      data-ui="duration-field"
      data-testid={testId}
      className={`space-y-2 ${className}`.trim()}
    >
      {label && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[15px] font-bold text-[var(--text-primary)]">
            {label}
          </span>
          <div className="flex items-center gap-1.5">
            <RoundButton
              size={36}
              aria-label="Зменшити тривалість"
              data-testid="duration-step-minus"
              onClick={() => onChange(Math.max(15, (current || 30) - 15))}
            >
              −
            </RoundButton>
            <span className="text-[14px] font-extrabold text-[var(--text-secondary)] min-w-[64px] text-center tabular-nums">
              {current && current > 0
                ? formatDuration(current)
                : "Не заповнено"}
            </span>
            <RoundButton
              size={36}
              aria-label="Збільшити тривалість"
              data-testid="duration-step-plus"
              onClick={() => onChange(Math.min(720, (current || 15) + 15))}
            >
              +
            </RoundButton>
          </div>
        </div>
      )}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        {presets.map((mins) => (
          <Tile3D
            key={mins}
            selected={current === mins}
            radius={14}
            onClick={() => onChange(current === mins ? null : mins)}
            className="px-3 py-1.5 text-xs font-bold shrink-0 min-h-[36px]"
          >
            {formatDuration(mins)}
          </Tile3D>
        ))}
      </div>
    </div>
  );
}

export interface AmountFieldCurrencyOption {
  value: string;
  label?: string;
}

export interface AmountFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
  currencies?: readonly AmountFieldCurrencyOption[];
  placeholder?: string;
  amountTestId?: string;
  currencyTestId?: string;
  currencyAriaLabel?: string;
  className?: string;
}

const DEFAULT_CURRENCY_OPTIONS: readonly AmountFieldCurrencyOption[] = [
  { value: "UAH", label: "UAH" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

export function formatAmountDisplayUk(raw: string, isFocused = false): string {
  if (!raw) return "";
  const cleaned = String(raw).replace(/\s+/g, "").replace(",", ".");
  if (!cleaned) return "";
  const parts = cleaned.split(".");
  const intRaw = parts[0] ?? "";
  const decRaw = parts.length > 1 ? parts.slice(1).join("") : undefined;
  const intDigits = intRaw.replace(/[^\d]/g, "");
  if (!intDigits && decRaw === undefined) return "";
  const intNum = intDigits ? Number(intDigits) : 0;
  const formattedInt = Number.isFinite(intNum)
    ? new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(
        intNum,
      )
    : intDigits;
  if (decRaw !== undefined) {
    const decDigits = decRaw.replace(/[^\d]/g, "").slice(0, 2);
    if (!isFocused && (!decDigits || Number(decDigits) === 0)) {
      return formattedInt;
    }
    return `${formattedInt},${decDigits}`;
  }
  return formattedInt;
}

function sanitizeAmountInput(raw: string): string {
  const withoutSpaces = raw.replace(/[\s\u00A0\u202F]+/g, "").replace(",", ".");
  let result = "";
  let hasDot = false;
  let decCount = 0;
  for (let i = 0; i < withoutSpaces.length; i++) {
    const ch = withoutSpaces[i];
    if (ch >= "0" && ch <= "9") {
      if (hasDot) {
        if (decCount < 2) {
          result += ch;
          decCount++;
        }
      } else {
        result += ch;
      }
    } else if (ch === "." && !hasDot) {
      hasDot = true;
      result += ".";
    }
  }
  return result;
}

export function AmountField({
  label,
  value,
  onChange,
  currency,
  onCurrencyChange,
  currencies = DEFAULT_CURRENCY_OPTIONS,
  placeholder = "0",
  amountTestId,
  currencyTestId,
  currencyAriaLabel = "Валюта",
  className = "",
}: AmountFieldProps) {
  const inputId = useId();
  const selectId = useId();
  const [focused, setFocused] = useState(false);

  const displayValue = useMemo(
    () => formatAmountDisplayUk(value, focused),
    [value, focused],
  );

  return (
    <div
      data-ui="amount-field"
      className={`ui-amount-field-wrap ${className}`.trim()}
    >
      {label && (
        <label htmlFor={inputId} className="ui-amount-field-label">
          {label}
        </label>
      )}
      <div className="ui-amount-field-grid">
        <div className="ui-amount-input-pill">
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            aria-label={label ?? "Сума"}
            placeholder={placeholder}
            value={displayValue}
            data-testid={amountTestId}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              if (
                value.endsWith(".00") ||
                value.endsWith(".0") ||
                value.endsWith(".")
              ) {
                const n = Number(value);
                if (Number.isFinite(n)) {
                  onChange(String(n));
                }
              }
            }}
            onChange={(e) => {
              const sanitized = sanitizeAmountInput(e.target.value);
              onChange(sanitized);
            }}
            className="ui-amount-input"
          />
        </div>
        <label htmlFor={selectId} className="ui-amount-currency-pill">
          <span className="ui-amount-currency-text" aria-hidden="true">
            {currency} ⌄
          </span>
          <select
            id={selectId}
            aria-label={currencyAriaLabel}
            value={currency}
            data-testid={currencyTestId}
            data-ui="native-overlay"
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="ui-amount-currency-select"
          >
            {currencies.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label ?? opt.value}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
