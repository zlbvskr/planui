import type { PlanuiDomainSnapshot } from '../../domain/types';
import { areaIdentity } from '../../domain/modelHelpers';
import { sphereActivity, sphereWeeks, type SphereState } from '../../domain/sphereInsights';
import { HeatMap, Sparkline } from '../../ui/SphereAnalytics';
import { trendText } from '../../ui/spheres';
import { MeasureField } from './MeasureField';
export function SphereStatistics({
  snapshot,
  areas,
  today,
  zone,
  onSelect,
}: {
  snapshot: PlanuiDomainSnapshot;
  areas: readonly SphereState[];
  today: string;
  zone: string;
  onSelect: (id: string) => void;
}) {
  const now = new Date().toISOString(),
    activity = sphereActivity(
      snapshot,
      new Date(Date.now() - 30 * 86400000).toISOString(),
      now,
    );
  const weeks = sphereWeeks(areas, snapshot.lifeAreaAssessments, today, zone);
  const changes = areas
    .filter((a) => a.trend != null)
    .sort((a, b) => b.trend! - a.trend!);
  const rise = changes.find((a) => a.trend! > 0),
    fall = [...changes].reverse().find((a) => a.trend! < 0);
  const groups = [
    ...areas.map((a) => ({
      id: a.id,
      label: a.questionTextUk,
      color: areaIdentity(a),
      count: activity.completions.filter((e) => e.areaId === a.id).length,
    })),
    {
      id: "unassigned",
      label: "Без сфери",
      color: "var(--text-secondary)",
      count: activity.completions.filter(
        (e) => !e.areaId || !areas.some((a) => a.id === e.areaId),
      ).length,
    },
  ];
  return (
    <div className="sphere-statistics space-y-5" data-testid="statistics">
      <section>
        <h2>Оцінки за 12 тижнів</h2>
        <HeatMap
          areas={areas}
          history={snapshot.lifeAreaAssessments}
          today={today}
          zone={zone}
          onSelect={onSelect}
        />
        <p className="sphere-muted">
          Порожня клітинка: оцінки цього тижня не було.
        </p>
      </section>
      <section>
        <h2>Тренд балансу</h2>
        <Sparkline
          values={weeks.map((w) => w.balance)}
          label="Рівномірність оцінок · /10"
        />
        <p className="sphere-muted">
          Точки лише за тижні з оцінками принаймні двох сфер.
        </p>
      </section>
      <section>
        <h2>Зміни за 30 днів</h2>
        <div className="sphere-change-pair">
          {[
            ["Найбільше зросло", rise],
            ["Найбільше просіло", fall],
          ].map(([title, area]) => (
            <div key={String(title)}>
              <h3>{String(title)}</h3>
              {area && typeof area !== "string" ? (
                <button type="button" onClick={() => onSelect(area.id)}>
                  <strong>{area.questionTextUk}</strong>
                  <small>{trendText(area.trend)}</small>
                </button>
              ) : (
                <p className="sphere-muted">
                  Ще недостатньо історії або змін немає.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Виконано за сферами</h2>
        <p className="sphere-muted">
          Останні 30 днів:{" "}
          {activity.completions.filter((e) => e.kind === "task").length} завдань
          і {activity.completions.filter((e) => e.kind === "habit").length}{" "}
          виконань звичок.
        </p>
        {activity.completions.length ? (
          groups.map((g) => (
            <div key={g.id} className="sphere-distribution">
              <span>{g.label}</span>
              <strong>{g.count}</strong>
              <div>
                <i
                  style={{
                    width: `${(g.count / activity.completions.length) * 100}%`,
                    background: g.color,
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <p>Поки немає виконань за цей період.</p>
        )}
      </section>
      <section>
        <h2>Прогрес вимірів</h2>
        {activity.measures.length ? (
          activity.measures.map((m) => (
            <div key={m.id} className="sphere-evidence">
              <h3>{m.label}</h3>
              <MeasureField
                measure={m.measure}
                color={areaIdentity(areas.find((a) => a.id === m.areaId))}
              />
            </div>
          ))
        ) : (
          <p className="sphere-muted">Журнал вимірів поки порожній.</p>
        )}
      </section>
    </div>
  );
}
