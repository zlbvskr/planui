import {Icon} from '../../ui/icons';
import React, { useMemo, useState } from "react";
import { Sheet, Section, Row, Toggle, RoundButton, ActionMenu } from "../../ui";
import { formatDate, formatTime } from "../../lib/format";
import { PlanuiDomainSnapshot } from "../../domain/types";
import { addDaysToLocalDate } from "../../domain/temporal";
import { PlanuiRepositories } from "../../storage/repositories";

const labels = ["Реальність", "Відновлення", "Напрями", "Розвантаження"];
type Props = {
  snapshot: PlanuiDomainSnapshot;
  today: string;
  repositories: PlanuiRepositories;
  onClose: () => void;
  onOpenPlan: (kind: "goal" | "project", id: string) => void;
  onPause: (project: PlanuiDomainSnapshot["projects"][number]) => void;
  onInspectEvent: (id: string) => void;
  onChanged: () => Promise<void> | void;
};
export function WeeklyReviewSheet({
  snapshot,
  today,
  repositories,
  onClose,
  onOpenPlan,
  onPause,
  onInspectEvent,
  onChanged,
}: Props) {
  const candidates = useMemo(
    () => [
      ...snapshot.goals
        .filter((g) => g.state === "active" && !g.archived)
        .map((g) => ({ ...g, key: "goal:" + g.id })),
      ...snapshot.projects
        .filter((p) => p.state === "active" && !p.archived)
        .map((p) => ({ ...p, key: "project:" + p.id })),
    ],
    [snapshot],
  );
  const plan = snapshot.settings.dailyPlans?.[today] ?? {
    focusTaskIds: [],
    focusNoteUk: null,
    minimalDay: false,
  };
  const previousLine =
    plan.focusNoteUk
      ?.split("\n")
      .find((line) => line.startsWith("Напрями тижня: ")) ?? "";
  const [drop, setDrop] = useState<
    PlanuiDomainSnapshot["projects"][number] | null
  >(null);
  const [step, setStep] = useState(0),
    [focus, setFocus] = useState<string[]>(() =>
      candidates
        .filter((c) =>
          previousLine
            .slice("Напрями тижня: ".length)
            .split(" · ")
            .includes(c.title),
        )
        .slice(0, 3)
        .map((c) => c.key),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const upcoming = snapshot.events
    .filter(
      (event) =>
        event.state === "active" &&
        (event.schedule.kind === "timed"
          ? event.schedule.interval.originEndLocalDate >= today &&
            event.schedule.interval.originStartLocalDate <
              addDaysToLocalDate(today, 7)
          : event.schedule.endLocalDateExclusive > today &&
            event.schedule.startLocalDate < addDaysToLocalDate(today, 7)),
    )
    .sort((a, b) =>
      (a.schedule.kind === "timed"
        ? a.schedule.interval.startInstant
        : a.schedule.startLocalDate
      ).localeCompare(
        b.schedule.kind === "timed"
          ? b.schedule.interval.startInstant
          : b.schedule.startLocalDate,
      ),
    );
  const recovery = upcoming.filter(
    (e) => e.type === "sleep" || e.type === "rest",
  );
  const nights = upcoming.filter(
    (e) =>
      e.type === "work_shift" &&
      e.schedule.kind === "timed" &&
      e.schedule.interval.originStartLocalDate !==
        e.schedule.interval.originEndLocalDate,
  );
  const unprotected = nights.filter((n) => {
    if (n.schedule.kind !== "timed") return false;
    const endDate = n.schedule.interval.originEndLocalDate;
    return !recovery.some((r) =>
      r.schedule.kind === "timed"
        ? r.schedule.interval.originStartLocalDate === endDate
        : r.schedule.startLocalDate <= endDate &&
          r.schedule.endLocalDateExclusive > endDate,
    );
  });
  const open = (work: () => void) => {
    onClose();
    work();
  };
  const eventRow = (event: (typeof upcoming)[number]) => (
    <Row
      key={event.id}
      title={event.title}
      secondary={
        event.schedule.kind === "timed"
          ? `${formatDate(event.schedule.interval.originStartLocalDate, { day: "numeric", month: "short" })} · ${formatTime(event.schedule.interval.originStartLocalTime)}–${formatTime(event.schedule.interval.originEndLocalTime)}`
          : formatDate(event.schedule.startLocalDate)
      }
      trailing={
        <RoundButton
          aria-label={`Відкрити: ${event.title}`}
          onClick={() => open(() => onInspectEvent(event.id))}
        >
          <Icon name="chevron-right"/>
        </RoundButton>
      }
    />
  );
  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      const current = (
        await repositories.captureCoherentSnapshot(new Date().toISOString())
      ).snapshot.settings.dailyPlans?.[today] ?? {
        focusTaskIds: [],
        focusNoteUk: null,
        minimalDay: false,
      };
      const note =
        current.focusNoteUk
          ?.split("\n")
          .filter((line) => !line.startsWith("Напрями тижня: "))
          .join("\n") ?? "";
      const chosen = candidates
        .filter((c) => focus.includes(c.key))
        .map((c) => c.title);
      const line = chosen.length ? "Напрями тижня: " + chosen.join(" · ") : "";
      await repositories.saveDailyPlan(
        today,
        {
          ...current,
          focusNoteUk: [note, line].filter(Boolean).join("\n") || null,
        },
        current,
      );
      await onChanged();
      onClose();
    } catch {
      setError("Не вдалося зберегти вибір. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Sheet isOpen title={labels[step]} onClose={onClose}>
        <div className="weekly-review" data-testid="weekly-review">
          <div
            className="review-dots"
            role="group"
            aria-label={`Крок ${step + 1} з 4`}
          >
            {labels.map((label, index) => (
              <span key={label} data-active={step === index} />
            ))}
            <small>{step + 1} з 4</small>
          </div>
          <div className="weekly-step">
            {step === 0 && (
              <Section title="Наступні сім днів">
                {upcoming.length ? (
                  upcoming.map(eventRow)
                ) : (
                  <Row title="Фіксованих подій не записано" />
                )}
              </Section>
            )}
            {step === 1 && (
              <>
                <Section title="Навколо нічних змін">
                  {[...nights, ...recovery].map(eventRow)}
                  {!nights.length && !recovery.length && (
                    <Row title="Блоків відновлення не записано" />
                  )}
                </Section>
                {unprotected.map((n) => (
                  <p className="review-amber" key={n.id}>
                    {n.title}: після зміни немає позначеного відновлення.
                  </p>
                ))}
              </>
            )}
            {step === 2 && (
              <Section title="Оберіть до трьох">
                {candidates.map((item) => (
                  <Row
                    key={item.key}
                    title={item.title}
                    trailing={
                      <Toggle
                        label={item.title}
                        checked={focus.includes(item.key)}
                        disabled={
                          !focus.includes(item.key) && focus.length >= 3
                        }
                        onChange={() =>
                          setFocus(
                            focus.includes(item.key)
                              ? focus.filter((id) => id !== item.key)
                              : [...focus, item.key],
                          )
                        }
                      />
                    }
                  />
                ))}
                {!candidates.length && (
                  <Row title="Активних цілей і проєктів поки немає" />
                )}
              </Section>
            )}
            {step === 3 && (
              <Section title="Що можна відкласти">
                {snapshot.projects
                  .filter((p) => p.state === "active" && !p.archived)
                  .map((project) => (
                    <Row
                      key={project.id}
                      title={project.title}
                      trailing={
                        <ActionMenu
                          label={`Розвантажити: ${project.title}`}
                          items={[
                            {
                              label: "Пауза",
                              onSelect: () => open(() => onPause(project)),
                            },
                            {
                              label: "Відмовитися",
                              onSelect: () => setDrop(project),
                            },
                            {
                              label: "Переглянути",
                              onSelect: () =>
                                open(() => onOpenPlan("project", project.id)),
                            },
                          ]}
                        />
                      }
                    />
                  ))}
                {!snapshot.projects.some(
                  (p) => p.state === "active" && !p.archived,
                ) && <Row title="Немає пропозицій для паузи" />}
              </Section>
            )}
          </div>
          {error && <p role="alert">{error}</p>}
          <footer className="weekly-controls">
            <RoundButton
              aria-label="Попередній крок"
              disabled={step === 0 || busy}
              onClick={() => setStep(step - 1)}
            >
              <Icon name="chevron-left"/>
            </RoundButton>
            {step < 3 ? (
              <button
                className="ui-primary"
                type="button"
                onClick={() => setStep(step + 1)}
              >
                Далі
              </button>
            ) : (
              <button
                className="ui-primary"
                type="button"
                disabled={busy}
                onClick={() => void finish()}
              >
                Завершити огляд
              </button>
            )}
          </footer>
        </div>
      </Sheet>
      <Sheet
        title="Відмовитися від проєкту?"
        isOpen={Boolean(drop)}
        onClose={() => setDrop(null)}
      >
        {drop && (
          <>
            <p>
              «{drop.title}» перейде в архів. Завдання й історія залишаться.
            </p>
            {error && <p role="alert">{error}</p>}
            <button
              className="ui-primary"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await repositories.archiveProjectTransactionally(
                    drop.id,
                    true,
                    "retain_planning",
                    new Date().toISOString(),
                    today,
                  );
                  await onChanged();
                  setDrop(null);
                } catch {
                  setError("Не вдалося змінити проєкт. Оновіть дані.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Відмовитися
            </button>
          </>
        )}
      </Sheet>
    </>
  );
}
