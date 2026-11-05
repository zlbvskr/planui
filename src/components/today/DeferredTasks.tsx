import React, { useState } from "react";
import type { Task } from "../../domain/types";
import type { PlanuiRepositories } from "../../storage/repositories";
import { Section, Row, Sheet, ActionMenu } from "../../ui";
export function DeferredTasks({
  tasks,
  repositories,
  onChanged,
  onPlan,
}: {
  tasks: readonly Task[];
  repositories: PlanuiRepositories;
  onChanged: () => Promise<void> | void;
  onPlan: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  if (!tasks.length) return null;
  return (
    <>
      <button
        type="button"
        className="ui-disclosure"
        onClick={() => setOpen(true)}
      >
        Відкладені справи ›
      </button>
      <Sheet
        title="Можна відкласти"
        isOpen={open}
        onClose={() => setOpen(false)}
      >
        {error && <p role="alert">{error}</p>}
        <Section>
          {tasks.map((task) => (
            <Row
              key={task.id}
              title={task.title}
              trailing={
                <>
                  <button
                    type="button"
                    className="ui-pill"
                    onClick={async () => {
                      try {
                        await repositories.setTaskDateOnlyPlanningTransactionally(
                          task.id,
                          null,
                          new Date().toISOString(),
                          task.revision,
                        );
                        await onChanged();
                      } catch {
                        setError("Не вдалося повернути справу до списку.");
                      }
                    }}
                  >
                    До списку
                  </button>
                  <ActionMenu
                    label={`Перенести: ${task.title}`}
                    items={[
                      {
                        label: "Завтра",
                        onSelect: () => {
                          setOpen(false);
                          onPlan(task);
                        },
                      },
                      {
                        label: "Інша дата",
                        onSelect: () => {
                          setOpen(false);
                          onPlan(task);
                        },
                      },
                    ]}
                  />
                </>
              }
            />
          ))}
        </Section>
      </Sheet>
    </>
  );
}
