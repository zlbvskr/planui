import { useEffect, useRef } from "react";
import type { PlanuiDomainSnapshot } from '../../domain/types';
import type { PlanuiRepositories } from '../../storage/repositories';
import { areaIdentity, logMeasure, resolveItemAreaId } from '../../domain/modelHelpers';
import { sphereActivity, sphereWeeks, type SphereState } from '../../domain/sphereInsights';
import { registerPushedScreen } from '../../ui/overlayStack';
import { ScoreRing, trendText } from '../../ui/spheres';
import { Sparkline } from '../../ui/SphereAnalytics';
import { MeasureField } from './MeasureField';

export function SphereDetail({
  area,
  snapshot,
  today,
  zone,
  repositories,
  onBack,
  onEdit,
  onCreate,
  onPlan,
  onChanged,
}: {
  area: SphereState;
  snapshot: PlanuiDomainSnapshot;
  today: string;
  zone: string;
  repositories: PlanuiRepositories;
  onBack: () => void;
  onEdit: () => void;
  onCreate: () => void;
  onPlan: (kind: "project" | "goal", id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const back = useRef(onBack);
  back.current = onBack;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const release = registerPushedScreen(`sphere:${area.id}`, () =>
      back.current(),
    );
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
    return release;
  }, [area.id]);
  const context = {
    folders: snapshot.folders,
    projects: snapshot.projects,
    goals: snapshot.goals,
  };
  const belongs = (entity: Parameters<typeof resolveItemAreaId>[0]) =>
    resolveItemAreaId(entity, context) === area.id;
  const series = sphereWeeks(
    [area],
    snapshot.lifeAreaAssessments,
    today,
    zone,
  ).map((w) => w.scores[0]);
  const activity = sphereActivity(
    snapshot,
    new Date(Date.now() - 30 * 86400000).toISOString(),
    new Date().toISOString(),
  );
  const measures = [
    ...snapshot.tasks
      .filter(belongs)
      .filter((e) => e.measure)
      .map((e) => ({
        id: e.id,
        label: e.title,
        measure: e.measure!,
        save: async (delta: number) => {
          await repositories.saveTask(logMeasure(e, delta), e.revision);
          await onChanged();
        },
      })),
    ...snapshot.habits
      .filter(belongs)
      .filter((e) => e.measure)
      .map((e) => ({
        id: e.id,
        label: e.name,
        measure: e.measure!,
        save: async (delta: number) => {
          await repositories.saveHabit(logMeasure(e, delta), e.revision);
          await onChanged();
        },
      })),
    ...snapshot.projects
      .filter(belongs)
      .filter((e) => e.measure)
      .map((e) => ({
        id: e.id,
        label: e.title,
        measure: e.measure!,
        save: async (delta: number) => {
          await repositories.saveProject(logMeasure(e, delta), e.revision);
          await onChanged();
        },
      })),
    ...snapshot.goals
      .filter(belongs)
      .filter((e) => e.measure)
      .map((e) => ({
        id: e.id,
        label: e.title,
        measure: e.measure!,
        save: async (delta: number) => {
          await repositories.saveGoal(logMeasure(e, delta), e.revision);
          await onChanged();
        },
      })),
    ...snapshot.wishes
      .filter(belongs)
      .filter((e) => e.measure)
      .map((e) => ({
        id: e.id,
        label: e.title,
        measure: e.measure!,
        save: async (delta: number) => {
          await repositories.saveWishItem(logMeasure(e, delta), e.revision);
          await onChanged();
        },
      })),
  ];
  return (
    <section className="sphere-detail space-y-4" data-testid="area-detail">
      <button type="button" className="sphere-text-button" onClick={onBack}>
        ‹ Назад до сфер
      </button>
      <h1 ref={heading} tabIndex={-1} className="ui-page-header-large-title">
        {area.questionTextUk}
      </h1>
      <div className="sphere-detail-hero">
        <ScoreRing area={area} size={112} />
        <div>
          <strong>{trendText(area.trend)}</strong>
          <p className="sphere-muted">
            {area.stale ? "Час оновити оцінку" : "Поточна оцінка сфери"}
          </p>
          {area.focus && <span className="sphere-focus-label">✦ У фокусі</span>}
        </div>
      </div>
      <Sparkline values={series} label="Оцінки за 12 тижнів" />
      <section>
        <h2>Мій 10 це…</h2>
        <p>
          {area.goodEnoughUk || "Додай свій орієнтир під час оновлення оцінки."}
        </p>
      </section>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ui-pill" onClick={onEdit}>
          Оновити оцінку
        </button>
        <button type="button" className="ui-pill" onClick={onCreate}>
          Додати крок у цю сферу
        </button>
      </div>
      <section>
        <h2>Що підтримує цю сферу</h2>
        {[
          ["Цілі", snapshot.goals.filter(belongs), "goal"],
          ["Проєкти", snapshot.projects.filter(belongs), "project"],
        ].map(([label, entities, kind]) => (
          <div key={String(label)}>
            <h3>{String(label)}</h3>
            {(entities as typeof snapshot.projects).length ? (
              (entities as typeof snapshot.projects).map((e) => (
                <button
                  className="sphere-related-row"
                  type="button"
                  key={e.id}
                  onClick={() => onPlan(kind as "goal" | "project", e.id)}
                >
                  {e.title} ›
                </button>
              ))
            ) : (
              <p className="sphere-muted">Ще немає</p>
            )}
          </div>
        ))}
        <h3>Завдання</h3>
        {snapshot.tasks
          .filter(belongs)
          .filter((t) => t.state !== "canceled")
          .map((t) => (
            <p key={t.id}>
              {t.state === "completed" ? "✓ " : ""}
              {t.title}
            </p>
          ))}
        <h3>Звички</h3>
        {snapshot.habits
          .filter(belongs)
          .filter((h) => h.state !== "archived")
          .map((h) => (
            <p key={h.id}>{h.name}</p>
          ))}
        <small className="sphere-muted">
          {activity.completions.filter((e) => e.areaId === area.id).length}{" "}
          виконань за 30 днів
        </small>
      </section>
      <section>
        <h2>Докази прогресу</h2>
        {measures.length ? (
          measures.map((e) => (
            <div className="sphere-evidence" key={e.id}>
              <h3>{e.label}</h3>
              <MeasureField
                measure={e.measure}
                color={areaIdentity(area)}
                onLog={e.save}
                sparkline
              />
            </div>
          ))
        ) : (
          <p className="sphere-muted">
            Додай вимір до завдання, звички, проєкту, цілі чи бажання.
          </p>
        )}
      </section>
    </section>
  );
}
