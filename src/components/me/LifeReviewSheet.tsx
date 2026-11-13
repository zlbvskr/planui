import React from "react";
import { ReviewAnswerDraft } from "../../domain/lifeAreas";
import { areaIdentity } from "../../domain/modelHelpers";
import type { SphereState } from "../../domain/sphereInsights";
import type { IsoInstantString, Measure } from "../../domain/types";
import { EntityId, PlanuiDomainSnapshot } from "../../domain/types";
import { GlossyButton } from "../../ui/buttons";
import { TextAreaField } from "../../ui/primitives";
import { Row } from "../../ui/rows";
import { Sheet } from "../../ui/sheets";
import { ScoreSlider } from "../../ui/SphereAnalytics";
import { BalanceWheel, ScoreRing, scoreText } from "../../ui/spheres";
import { Toggle } from "../../ui/Toggle";
import { createAreaSuggestions } from "../create/areaSuggestions";
import { SpherePicker } from "../create/SpherePicker";

interface LifeReviewSheetProps {
  lifeReviewOpen: boolean;
  reviewBusy: boolean;
  setLifeReviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setReviewDrafts: React.Dispatch<
    React.SetStateAction<Record<string, ReviewAnswerDraft>>
  >;
  setReviewError: React.Dispatch<React.SetStateAction<string>>;
  currentReviewArea: SphereState;
  reviewStep: number;
  setReviewStep: React.Dispatch<React.SetStateAction<number>>;
  reviewFocusCount: number;
  handleSavePeriodicReview: () => Promise<void>;
  reviewError: string;
  reviewMotionRef: React.RefObject<HTMLDivElement | null>;
  sphereData: SphereState[];
  snapshot: PlanuiDomainSnapshot;
  activeZone: string;
  reviewPreviousAt: string | undefined;
  changedTasks: number;
  changedHabits: { areaId: string | undefined; completed: boolean }[];
  changedMeasures: {
    id: string;
    label: string;
    areaId: string | undefined;
    measure: Measure;
    delta: number;
  }[];
  currentReviewAnswer: ReviewAnswerDraft;
  updateReviewDraft: (id: string, patch: Partial<ReviewAnswerDraft>) => void;
  reviewPreview: {
    score: 0 | 2 | 1 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | null;
    focus: boolean;
    stale: boolean;
    archived?: boolean;
    mergedIntoId?: EntityId | null;
    goodEnoughUk?: string | null;
    rating?: number | null;
    ratedAt?: IsoInstantString | null;
    goodEnough?: string | null;
    starterKeys?: string[];
    id: EntityId;
    order: number;
    questionTextUk: string;
    version: number;
    updatedAt: IsoInstantString;
    revision: number;
    trend: number | null;
    previousScore: number | null;
  }[];
}

export function LifeReviewSheet({
  lifeReviewOpen,
  reviewBusy,
  setLifeReviewOpen,
  setReviewDrafts,
  setReviewError,
  currentReviewArea,
  reviewStep,
  setReviewStep,
  reviewFocusCount,
  handleSavePeriodicReview,
  reviewError,
  reviewMotionRef,
  sphereData,
  snapshot,
  activeZone,
  reviewPreviousAt,
  changedTasks,
  changedHabits,
  changedMeasures,
  currentReviewAnswer,
  updateReviewDraft,
  reviewPreview,
}: LifeReviewSheetProps) {
  return (
    <Sheet
      isOpen={lifeReviewOpen}
      onClose={() => {
        if (!reviewBusy) {
          setLifeReviewOpen(false);
          setReviewDrafts({});
          setReviewError("");
        }
      }}
      title={currentReviewArea ? "Огляд сфер життя" : "Обери 1-3 фокуси"}
      footer={
        <div className="flex gap-3 w-full">
          {reviewStep > 0 && (
            <button
              type="button"
              className="ui-pill"
              disabled={reviewBusy}
              onClick={() => setReviewStep((step) => step - 1)}
            >
              Назад
            </button>
          )}
          <GlossyButton
            className="flex-1 justify-center sphere-review-action"
            variant="mint"
            style={{ color: "var(--ink-on-mint)" }}
            disabled={
              reviewBusy ||
              (!currentReviewArea &&
                (reviewFocusCount < 1 || reviewFocusCount > 3))
            }
            onClick={() =>
              currentReviewArea
                ? setReviewStep((step) => step + 1)
                : void handleSavePeriodicReview()
            }
          >
            {reviewBusy
              ? "Зберігаю…"
              : currentReviewArea
                ? "Далі"
                : "Зберегти Огляд"}
          </GlossyButton>
        </div>
      }
    >
      {reviewError && <p role="alert">{reviewError}</p>}
      {currentReviewArea ? (
        <div
          ref={reviewMotionRef}
          key={reviewStep}
          className="sphere-review-step space-y-4"
          style={{
            background: `color-mix(in oklab, ${areaIdentity(currentReviewArea)} 6%, var(--surface-sheet))`,
          }}
          data-testid="review-step"
        >
          <p className="sphere-muted">
            Сфера {reviewStep + 1} з {sphereData.length}
          </p>
          <h2>{currentReviewArea.questionTextUk}</h2>
          <details>
            <summary>Перейти до сфери</summary>
            <SpherePicker
              areas={createAreaSuggestions(
                snapshot,
                new Date().toISOString(),
                activeZone,
              )}
              history={snapshot.lifeAreaAssessments}
              value={currentReviewArea.id}
              onChange={(id) => {
                const index = sphereData.findIndex((a) => a.id === id);
                if (index >= 0) setReviewStep(index);
              }}
            />
          </details>
          <div className="sphere-detail-hero">
            <ScoreRing area={currentReviewArea} size={80} />
            <p>
              Минула оцінка:{" "}
              <strong>{scoreText(currentReviewArea.score)}</strong>
              <small className="block sphere-muted">
                {reviewPreviousAt
                  ? new Intl.DateTimeFormat("uk-UA", {
                      dateStyle: "medium",
                      timeZone: activeZone,
                    }).format(new Date(reviewPreviousAt))
                  : "Ще не оцінювали"}
              </small>
            </p>
          </div>
          <section className="sphere-review-changes">
            <h3>Що змінилось</h3>
            <p>{changedTasks} виконаних завдань</p>
            <p>
              {changedHabits.length
                ? `${Math.round((changedHabits.filter((e) => e.completed).length / changedHabits.length) * 100)}% завершених записів звичок`
                : "Нових записів звичок немає"}
            </p>
            {changedMeasures.map((m) => (
              <p key={m.id}>
                {m.label}: {m.delta > 0 ? "+" : ""}
                {m.delta} {m.measure.unit}
              </p>
            ))}
            <small className="sphere-muted">
              {reviewPreviousAt ? "Від минулої оцінки" : "За останні 14 днів"}
            </small>
          </section>
          <ScoreSlider
            area={currentReviewArea}
            value={currentReviewAnswer.score}
            onChange={(score) =>
              updateReviewDraft(currentReviewArea.id, {
                score: score as ReviewAnswerDraft["score"],
              })
            }
          />
          <p className="sphere-good-enough">
            <strong>Мій 10 це… </strong>
            {currentReviewArea.goodEnoughUk ||
              "Сформулюй свій орієнтир в екрані сфери."}
          </p>
          <Row
            title="✦ Потребує уваги зараз"
            trailing={
              <Toggle
                label="✦ Потребує уваги зараз"
                checked={!!currentReviewAnswer.attentionNow}
                onChange={(attentionNow) =>
                  updateReviewDraft(currentReviewArea.id, { attentionNow })
                }
              />
            }
          />
          <TextAreaField
            label="Нотатка"
            placeholder="Що помітив і що хочеш змінити?"
            value={currentReviewAnswer.usefulChangeUk ?? ""}
            onChange={(e) =>
              updateReviewDraft(currentReviewArea.id, {
                usefulChangeUk: e.target.value || null,
              })
            }
            rows={2}
          />
        </div>
      ) : (
        <div
          className="sphere-review-finish space-y-4"
          data-testid="review-finish"
        >
          <BalanceWheel
            areas={reviewPreview}
            onSelect={(id) =>
              setReviewStep(sphereData.findIndex((a) => a.id === id))
            }
          />
          <p>
            Обери 1-3 фокуси на наступний період. Обрано: {reviewFocusCount}.
          </p>
          <div className="create-sphere-options">
            {reviewPreview.map((area) => (
              <button
                type="button"
                className="sphere-focus-chip"
                key={area.id}
                aria-pressed={!!area.focus}
                disabled={!area.focus && reviewFocusCount >= 3}
                onClick={() =>
                  updateReviewDraft(area.id, { attentionNow: !area.focus })
                }
              >
                <ScoreRing area={area} size={44} />
                <span>
                  {area.focus ? "✦ " : ""}
                  {area.questionTextUk}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
