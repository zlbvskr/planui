import { useState, type CSSProperties } from "react";
import type { Measure } from '../../domain/types';
import { measurePercent, measureSeries, type MeasureDraft } from '../../domain/sphereInsights';
import { InputField } from '../../ui/primitives';
import { Pill } from '../../ui/selection';
import { Sparkline } from '../../ui/SphereAnalytics';

export const MEASURE_PRESETS = [
  "₴",
  "$",
  "€",
  "шт",
  "хв",
  "год",
  "стор.",
  "км",
  "кг",
  "слів",
  "разів",
  "%",
];
export type { MeasureDraft } from "../../domain/sphereInsights";
export function MeasureField({
  measure,
  color = "var(--mint-base)",
  draft,
  onDraftChange,
  onLog,
  onEdit,
  sparkline = false,
  step,
  onStepChange,
}: {
  measure?: Measure | null;
  color?: string;
  draft?: MeasureDraft;
  onDraftChange?: (draft: MeasureDraft) => void;
  onLog?: (delta: number) => Promise<void> | void;
  onEdit?: () => void;
  sparkline?: boolean;
  step?: string;
  onStepChange?: (step: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [celebrate, setCelebrate] = useState(false),
    [custom, setCustom] = useState("");
  const percent = measure ? measurePercent(measure) : null;
  const format = (n: number) =>
    new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(n);
  const log = async (delta: number) => {
    if (!onLog || busy || !measure || !Number.isFinite(delta) || !delta) return;
    setBusy(true);
    setError("");
    try {
      await onLog(delta);
      const next = {
        ...measure,
        current: Math.max(0, measure.current + delta),
        log: [
          ...measure.log,
          {
            ts: new Date().toISOString(),
            delta: Math.max(0, measure.current + delta) - measure.current,
          },
        ],
      };
      if ((percent ?? 0) < 100 && measurePercent(next) === 100) {
        setCelebrate(true);
        window.setTimeout(() => setCelebrate(false), 1000);
      }
    } catch {
      setError("Не вдалося зберегти вимір. Спробуй ще раз.");
    } finally {
      setBusy(false);
    }
  };
  const patch = (value: Partial<MeasureDraft>) =>
    draft && onDraftChange?.({ ...draft, ...value });
  const presets =
    measure && ["₴", "$", "€", "слів"].includes(measure.unit)
      ? [100, 500]
      : [1, 5];
  return (
    <section
      className="measure-field"
      style={{ "--measure-color": color } as CSSProperties}
      aria-label="Вимір"
    >
      {draft && (
        <>
          <div
            className="measure-unit-presets"
            role="group"
            aria-label="Одиниця виміру"
          >
            {MEASURE_PRESETS.map((unit) => (
              <Pill
                key={unit}
                selected={draft.unit === unit}
                onClick={() => patch({ unit })}
              >
                {unit}
              </Pill>
            ))}
          </div>
          <div className="measure-draft-grid">
            <InputField
              label="Одиниця"
              value={draft.unit}
              onChange={(e) => patch({ unit: e.target.value })}
            />
            <InputField
              label="Поточне"
              inputMode="decimal"
              value={draft.current}
              onChange={(e) => patch({ current: e.target.value })}
            />
            <InputField
              label="Ціль"
              inputMode="decimal"
              value={draft.target}
              onChange={(e) => patch({ target: e.target.value })}
            />
          </div>
          <div role="group" aria-label="Напрямок виміру" className="flex gap-2">
            <Pill
              selected={draft.direction === "more"}
              onClick={() => patch({ direction: "more" })}
            >
              Більше
            </Pill>
            <Pill
              selected={draft.direction === "less"}
              onClick={() => patch({ direction: "less" })}
            >
              Менше
            </Pill>
          </div>
          {onStepChange && (
            <InputField
              label="За виконання звички"
              inputMode="decimal"
              value={step ?? ""}
              onChange={(e) => onStepChange(e.target.value)}
            />
          )}
        </>
      )}
      {measure && (
        <>
          <div className="measure-value">
            {format(measure.current)}
            {measure.target != null && ` / ${format(measure.target)}`}{" "}
            {measure.unit}
            {percent != null && ` · ${Math.round(percent)}%`}
          </div>
          <small className="sphere-muted">
            {measure.direction === "less" ? "Менше до цілі" : "Більше до цілі"}
          </small>
          {percent != null && (
            <div
              className="measure-track"
              role="progressbar"
              aria-label="Прогрес виміру"
              aria-valuenow={Math.round(percent)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${percent}%` }} />
            </div>
          )}
          {onLog && (
            <>
              <div className="measure-log-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void log(-1)}
                  aria-label="Зменшити вимір на 1"
                >
                  −1
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void log(1)}
                  data-testid="measure-log-plus-1"
                >
                  +1
                </button>
                {presets
                  .filter((n) => n !== 1)
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={busy}
                      onClick={() => void log(n)}
                      data-testid={n === 5 ? "measure-log-plus-5" : undefined}
                    >
                      +{n}
                    </button>
                  ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCustom(custom ? "" : "0")}
                  data-testid="measure-log-custom-toggle"
                >
                  Своє
                </button>
              </div>
              {custom !== "" && (
                <div className="flex gap-2">
                  <InputField
                    label="Зміна (+ або −)"
                    inputMode="decimal"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ui-pill"
                    disabled={
                      busy ||
                      !Number.isFinite(Number(custom.replace(",", "."))) ||
                      !Number(custom.replace(",", "."))
                    }
                    onClick={() => void log(Number(custom.replace(",", ".")))}
                  >
                    Внести
                  </button>
                </div>
              )}
            </>
          )}
          {sparkline && (
            <Sparkline
              values={measureSeries(measure)}
              label={`Історія виміру · ${measure.unit}`}
              color={color}
            />
          )}
        </>
      )}
      {onEdit && (
        <button type="button" className="sphere-text-button" onClick={onEdit}>
          {measure ? "Налаштувати вимір" : "Додати вимір"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {celebrate && (
        <div className="measure-confetti" role="status">
          Цілі досягнуто!
          {Array.from({ length: 8 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--confetti-x": `${(i - 3.5) * 24}px`,
                  "--confetti-turn": `${i * 50}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
