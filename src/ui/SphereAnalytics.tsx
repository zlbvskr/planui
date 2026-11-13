import { runInterruptibleAnimation, easings } from './motion';
import { useId, useEffect, useRef, type CSSProperties } from "react";
import type { LifeAreaAssessment, LifeAreaQuestion } from '../domain/types';
import { scoreColor } from '../domain/modelHelpers';
import { sphereWeeks } from '../domain/sphereInsights';
import { SphereTile, scoreText } from './spheres';

export function Sparkline({
  values,
  label,
  color = "var(--text-secondary)",
}: {
  values: readonly (number | null)[];
  label: string;
  color?: string;
}) {
  const numbers = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (!numbers.length)
    return (
      <figure className="sphere-sparkline">
        <p className="sphere-muted">Ще немає історії</p>
        <figcaption>{label}</figcaption>
      </figure>
    );
  const min = Math.min(...numbers),
    max = Math.max(...numbers),
    spread = max - min || 1;
  const point = (v: number, i: number) =>
    `${8 + (i / Math.max(1, values.length - 1)) * 284},${62 - ((v - min) / spread) * 48}`;
  const segments: string[][] = [[]];
  values.forEach((v, i) => {
    if (v == null) {
      if (segments.at(-1)!.length) segments.push([]);
    } else segments.at(-1)!.push(point(v, i));
  });
  return (
    <figure className="sphere-sparkline">
      <svg viewBox="0 0 300 76" role="img" aria-label={label}>
        {segments.map((segment, i) => (
          <polyline
            key={i}
            points={segment.join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {values.map(
          (v, i) =>
            v != null && (
              <circle
                key={i}
                cx={point(v, i).split(",")[0]}
                cy={point(v, i).split(",")[1]}
                r="3"
                fill={color}
              >
                <title>{v}</title>
              </circle>
            ),
        )}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
export function HeatMap({
  areas,
  history,
  today,
  zone,
  onSelect,
}: {
  areas: readonly LifeAreaQuestion[];
  history: readonly LifeAreaAssessment[];
  today: string;
  zone: string;
  onSelect: (id: string) => void;
}) {
  const weeks = sphereWeeks(areas, history, today, zone);
  return (
    <div
      className="sphere-heatmap"
      role="table"
      aria-label="Оцінки сфер за 12 тижнів"
    >
      <div className="sphere-heatmap-row" role="row">
        <span role="columnheader">Сфера</span>
        {weeks.map((w, i) => (
          <span key={w.start} role="columnheader" className="sphere-week-label" aria-label={`Тиждень ${w.start}`} title={`Тиждень ${w.start}`}>
            {i === 0 || i === 11
              ? `${w.start.slice(8)}.${w.start.slice(5, 7)}`
              : ""}
          </span>
        ))}
      </div>
      {areas.map((area, i) => (
        <div key={area.id} className="sphere-heatmap-row" role="row">
          <button
            type="button"
            role="rowheader"
            aria-label={area.questionTextUk}
            onClick={() => onSelect(area.id)}
          >
            <SphereTile area={area} size={24} />
          </button>
          {weeks.map((w) => {
            const score = w.scores[i],
              c = scoreColor(score);
            return (
              <span
                key={w.start}
                role="cell"
                className="sphere-heat-cell"
                aria-label={`${area.questionTextUk}, тиждень ${w.start}: ${scoreText(score)}`}
                title={`${w.start}: ${scoreText(score)}`}
                style={
                  score != null
                    ? {
                        background: `linear-gradient(145deg,${c.light},${c.base})`,
                      }
                    : undefined
                }
              >
                {score ?? ""}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
export function ScoreSlider({
  area,
  value,
  onChange,
  label = "Задоволеність",
}: {
  area: LifeAreaQuestion;
  value: number | null;
  onChange: (value: number | null) => void;
  label?: string;
}) {
  const toneRef=useRef<HTMLDivElement>(null);
  const previous=useRef(value);
  const previousColor=scoreColor(previous.current).base;
  const increase=value!=null && previous.current!=null && value-previous.current>=2;
  useEffect(()=>{previous.current=value;const animation=runInterruptibleAnimation(toneRef.current,[{opacity:1},{opacity:0}],{durationMs:300,easing:easings.out});return()=>animation?.cancel();},[value]);
  const id = useId(),
    c = scoreColor(value);
  return (
    <div
      className="sphere-score-slider"
      style={
        {
          "--score-base": c.base,
          "--score-light": c.light,
          "--score-deep": c.deep,
        } as CSSProperties
      }
    >
      <div ref={toneRef} className="score-tone-layer" style={{background:`linear-gradient(in oklab, ${previousColor}, var(--bg-input))`}} aria-hidden="true"/>
      {increase && <span key={value} className="score-rise-confetti" aria-hidden="true">✦ ✦ ✦</span>}
      <div className="sphere-slider-heading">
        <span key={value} className="sphere-slider-tile">
          <SphereTile area={area} size={52} />
        </span>
        <label htmlFor={id}>{label}</label>
        <strong className="sphere-slider-number">{scoreText(value)}</strong>
      </div>
      <input
        id={id}
        type="range"
        min="1"
        max="10"
        step="1"
        value={value ?? 5}
        aria-valuetext={scoreText(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="sphere-slider-scale">
        <span>1 · Потребує уваги</span>
        <span>10 · Мене влаштовує</span>
      </div>
      {value != null && (
        <button
          type="button"
          className="sphere-text-button"
          onClick={() => onChange(null)}
        >
          Залишити без оцінки
        </button>
      )}
    </div>
  );
}

