import { useMotionEntrance, useMotionNumber } from './motion';
import { useId, type CSSProperties } from 'react';
import type { LifeAreaQuestion, Task } from '../domain/types';
import { areaIdentity, resolveItemAreaId, scoreColor, type ModelContext } from '../domain/modelHelpers';
import { ArtIcon, HeroArt } from './art';
import { type Icon3DName } from './Icon3D';

export { sphereStates, sphereBalance, type SphereState } from '../domain/sphereInsights';
import { sphereBalance } from '../domain/sphereInsights';
import type { SphereState } from '../domain/sphereInsights';
export const scoreText = (n: number | null) => n == null ? 'Оцінити' : `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(n)}/10`;
export const trendText = (n: number | null) => n == null ? 'Немає історії за 30 днів' : n === 0 ? 'Без змін за 30 днів' : `${n > 0 ? '▲ +' : '▼ '}${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(n)} за 30 днів`;

export function needsSphereStep(task: Task, areas: readonly SphereState[], context: ModelContext): boolean {
  const area = areas.find(a => a.id === resolveItemAreaId(task, context));
  return !!area && (!!area.focus || (area.score != null && area.score <= 4));
}
export function SphereStepMarker() { return <span className="sphere-step-marker" aria-label="Підтягує сферу" title="Підтягує слабку сферу або сферу у фокусі">✦</span>; }
const sphereGlyphs: Icon3DName[] = ['leaf', 'lotus', 'hourglass', 'people', 'palette', 'briefcase', 'wallet', 'book', 'house', 'compass'];
const glyphKeys = ['physical', 'mental', 'recovery', 'relationships', 'creativity', 'work', 'finances', 'learning', 'home', 'meaning'];
export function SphereTile({ area, size = 36 }: { area: LifeAreaQuestion; size?: number }) {
  const key = area.starterKeys?.map(key => glyphKeys.indexOf(key)).find(index => index >= 0);
  const glyph = sphereGlyphs[key ?? Math.abs(area.order) % sphereGlyphs.length];
  return <span className="sphere-tile" style={{ '--sphere-identity': areaIdentity(area), width: size, height: size } as CSSProperties}><ArtIcon name={glyph} size={size * .82} shape="squircle" /></span>;
}
export function ScoreRing({ area, size = 52 }: { area: SphereState; size?: number }) {
  const id = useId().replace(/:/g, '');
  const number = useMotionNumber(area.score ?? 0);
  const entrance = useMotionEntrance<HTMLSpanElement>(area.score);
  const c = scoreColor(area.score), circumference = 2 * Math.PI * 23;
  return <span ref={entrance} className="sphere-score-ring" data-stale={area.stale || undefined} style={{ width: size, height: size }} role="img" aria-label={`${area.questionTextUk}: ${scoreText(area.score)}${area.stale ? ', оновити' : ''}`}>
    <svg viewBox="0 0 60 60" aria-hidden="true"><defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={c.light}/><stop offset=".55" stopColor={c.base}/><stop offset="1" stopColor={c.deep}/></linearGradient></defs><circle cx="30" cy="30" r="23" fill="none" stroke="var(--bg-track)" strokeWidth="6" strokeDasharray={area.score == null ? '3 4' : undefined} />{area.score != null && <circle cx="30" cy="30" r="23" fill="none" stroke={`url(#${id})`} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${circumference * area.score / 10} ${circumference}`} transform="rotate(-90 30 30)" />}</svg>
    <span className="sphere-ring-tile"><SphereTile area={area} size={size * .53} /></span><span className="sphere-score-bead">{area.score == null ? '?' : Math.round(number)}</span>
  </span>;
}
export function ScoreBar({ area }: { area: SphereState }) {
  const c = scoreColor(area.score);
  return <span className="sphere-score-bar" data-stale={area.stale || undefined} aria-label={`Оцінка: ${scoreText(area.score)}${area.stale ? ', оновити' : ''}`}>
    <span className="sphere-score-segments" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={area.score != null && i < area.score ? { background: `linear-gradient(180deg, ${c.light}, ${c.base} 65%, ${c.deep})` } : undefined} />)}</span>
    <strong>{scoreText(area.score)}</strong>{area.stale && area.score != null && <small>оновити</small>}
  </span>;
}
export function BalanceWheel({ areas, onSelect }: { areas: readonly SphereState[]; onSelect: (id: string) => void }) {
  const entrance = useMotionEntrance<HTMLDivElement>(areas.map(a=>a.score).join(','),true);
  const id = useId().replace(/:/g, '');
  const displayed = areas.slice(0, 10), balance = sphereBalance(areas), previous = sphereBalance(areas, true);
  const weakest = [...displayed].filter(a => a.score != null).sort((a,b) => a.score! - b.score!)[0]?.id;
  return <svg ref={entrance as unknown as React.Ref<SVGSVGElement>} viewBox="0 0 360 360" className="sphere-balance-wheel" aria-label="Колесо балансу сфер життя" role="group">
    <defs>{displayed.map((area,i) => { const c = scoreColor(area.score); return <linearGradient key={area.id} id={`${id}-${i}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={c.light}/><stop offset=".55" stopColor={c.base}/><stop offset="1" stopColor={c.deep}/></linearGradient>; })}</defs>
    {displayed.map((area,i) => {
      const angle = i * 360 / displayed.length, radians = (angle - 90) * Math.PI / 180;
      const x = 180 + Math.cos(radians) * 150, y = 180 + Math.sin(radians) * 150;
      const length = area.score == null ? 15 : area.score * 6.3;
      return <g key={area.id} role="button" tabIndex={0} aria-label={`${area.questionTextUk}: ${scoreText(area.score)}${area.stale ? ', оновити' : ''}`} onClick={() => onSelect(area.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(area.id); } }}>
        <g transform={`rotate(${angle} 180 180)`} opacity={area.stale ? .65 : 1}>
          <rect x="168" y="53" width="24" height="63" rx="12" fill="var(--bg-track)" />
          <rect className={area.id === weakest ? 'sphere-weakest-petal' : undefined} x="168" y={116-length} width="24" height={length} rx="12" fill={area.score == null ? 'none' : `url(#${id}-${i})`} stroke={area.score == null ? 'var(--text-secondary)' : 'none'} strokeDasharray={area.score == null ? '3 4' : undefined}/>
        </g>
        <foreignObject x={x-22} y={y-22} width="44" height="44"><span className="sphere-wheel-glyph"><SphereTile area={area} size={32} /><small>{area.score ?? '?'}</small></span></foreignObject>
        <title>{area.questionTextUk}: {scoreText(area.score)}</title>
      </g>;
    })}
    <foreignObject x="128" y="117" width="104" height="104" pointerEvents="none"><HeroArt name="pearl" size={104}/></foreignObject>
    <text x="180" y="177" textAnchor="middle" className="sphere-wheel-label">Баланс</text>
    <text x="180" y="198" textAnchor="middle" className="sphere-wheel-number">{balance == null ? 'Оцінити' : new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(balance)}</text>
    <text x="180" y="228" textAnchor="middle" className="sphere-wheel-label">{balance != null && previous != null ? `${balance >= previous ? '▲' : '▼'} ${Math.abs(balance-previous).toFixed(1)} за 30 дн.` : 'Рівномірність · /10'}</text>
  </svg>;
}
export function HeatStrip({ areas, onSelect }: { areas: readonly SphereState[]; onSelect: (id: string) => void }) {
  const weakest = [...areas].filter(a => a.score != null).sort((a,b) => a.score! - b.score!)[0]?.id;
  return <div className="sphere-heat-strip" role="group" aria-label="Оцінки сфер життя">{areas.slice(0,10).map(area => {
    const c = scoreColor(area.score);
    return <button key={area.id} type="button" onClick={() => onSelect(area.id)} aria-label={`${area.questionTextUk}: ${scoreText(area.score)}${area.stale ? ', оновити' : ''}`} className="sphere-heat-hit"><span className="sphere-heat-bead" data-weakest={area.id === weakest || undefined} data-unrated={area.score == null || undefined} data-stale={area.stale || undefined} style={area.score != null ? { background: `linear-gradient(155deg,${c.light},${c.base} 65%,${c.deep})` } : undefined}>{area.score ?? '?'}</span></button>;
  })}</div>;
}
