import { Pill } from '../../ui/selection';
import type { LifeAreaQuestion, LifeAreaAssessment } from '../../domain/types';
import { ScoreRing } from '../../ui/spheres';
import { sphereStates } from '../../domain/sphereInsights';
type Option = LifeAreaQuestion & { priority?: number; priorityReason?: string };
export function SpherePicker({
  areas,
  history = [],
  value,
  onChange,
}: {
  areas: readonly Option[];
  history?: readonly LifeAreaAssessment[];
  value: string;
  onChange: (id: string) => void;
}) {
  const states = sphereStates(areas, history, new Date().toISOString());
  const recommendations = [...areas]
    .filter((a) => a.priority != null && !a.archived && !a.mergedIntoId)
    .sort((a, b) => b.priority! - a.priority!)
    .slice(0, 3);
  return (
    <div className="sphere-picker">
      <div>
        {recommendations.length > 0 && (
          <>
            <h3>Рекомендовано</h3>
            <div className="sphere-picker-recommendations">
              {recommendations.map((area) => (
                <button
                  className="sphere-focus-chip"
                  type="button"
                  key={area.id}
                  onClick={() => onChange(area.id)}
                >
                  <ScoreRing
                    area={states.find((a) => a.id === area.id)!}
                    size={44}
                  />
                  <span>
                    ✦ {area.questionTextUk}
                    <small className="block sphere-muted">
                      {area.priorityReason}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div
        className="create-sphere-options"
        data-testid="inline-panel-area"
        role="group"
        aria-label="Усі сфери життя"
      >
        {states.map((area) => (
          <Pill
            key={area.id}
            selected={value === area.id}
            onClick={() => onChange(area.id)}
            data-testid={`area-orb-option-${area.id}`}
          >
            <ScoreRing area={area} size={44} />
            <span>
              {area.focus && <span aria-label="У фокусі">✦ </span>}
              {area.questionTextUk}
            </span>
          </Pill>
        ))}
        <Pill selected={!value} onClick={() => onChange("")}>
          Без сфери
        </Pill>
      </div>
    </div>
  );
}
