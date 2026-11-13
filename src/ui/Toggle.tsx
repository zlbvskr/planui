import { usePressFeedback } from "./motion";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  testId?: string;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  testId,
  className = "",
}: ToggleProps) {
  const press = usePressFeedback<HTMLButtonElement>(!disabled);

  return (
    <button
      ref={press.ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-ui="toggle"
      data-checked={checked ? "true" : "false"}
      data-testid={testId}
      className={`ui-toggle ${checked ? "is-on" : ""} ${className}`.trim()}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onPointerLeave={press.onPointerLeave}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="ui-toggle-thumb" />
    </button>
  );
}
