import {
  Goal,
  LifeAreaQuestion,
  Project,
  TaskEffort,
} from "../../domain/types";
import {
  DateField,
  DurationField,
  SelectField,
  TimeField,
} from "../../ui/fields";
import { Section } from "../../ui/headers";
import { Pill } from "../../ui/selection";
import { ParamRow } from "../create/ParamRow";
import { SphereField } from "../create/SphereField";
import { WhenField } from "../create/WhenField";

interface TaskOptionsPanelProps {
  openChip: string | null;
  whenDate: string;
  setWhenDate: React.Dispatch<React.SetStateAction<string>>;
  whenTime: string;
  setWhenTime: React.Dispatch<React.SetStateAction<string>>;
  durationMinutes: number;
  setDurationMinutes: React.Dispatch<React.SetStateAction<number>>;
  activeAreas: LifeAreaQuestion[];
  areaId: string;
  setAreaId: React.Dispatch<React.SetStateAction<string>>;
  parentKey: string;
  connectionOptions: { value: string; label: string }[];
  setParentKey: React.Dispatch<React.SetStateAction<string>>;
  projects: readonly Project[];
  goals: readonly Goal[];
  effort: TaskEffort | null;
  setEffort: React.Dispatch<React.SetStateAction<TaskEffort | null>>;
  deadlineDate: string;
  setDeadlineDate: React.Dispatch<React.SetStateAction<string>>;
}

export function TaskOptionsPanel({
  openChip,
  whenDate,
  setWhenDate,
  whenTime,
  setWhenTime,
  durationMinutes,
  setDurationMinutes,
  activeAreas,
  areaId,
  setAreaId,
  parentKey,
  connectionOptions,
  setParentKey,
  projects,
  goals,
  effort,
  setEffort,
  deadlineDate,
  setDeadlineDate,
}: TaskOptionsPanelProps) {
  return (
    <div
      key={openChip}
      className="create-inline-panel"
      data-create-inline-panel={openChip}
    >
      {openChip === "datetime" && (
        <WhenField>
          <Section>
            <DateField
              label="Дата"
              value={whenDate}
              onChange={(e) => setWhenDate(e.target.value)}
              data-testid="task-sheet-date-field"
            />
            <TimeField
              label="Час"
              value={whenTime}
              onChange={(e) => setWhenTime(e.target.value.slice(0, 5))}
              data-testid="task-sheet-time-field"
            />
          </Section>
        </WhenField>
      )}
      {openChip === "duration" && (
        <DurationField
          label="Тривалість"
          value={durationMinutes}
          onChange={(next) => setDurationMinutes(next ?? 30)}
        />
      )}
      {openChip === "area" && (
        <SphereField
          areas={activeAreas}
          value={areaId}
          onChange={setAreaId}
          expanded
        />
      )}
      {openChip === "parent" && (
        <ParamRow label="Куди">
          <SelectField
            label="Проєкт/Папка"
            value={parentKey}
            options={connectionOptions}
            onChange={(e) => {
              const key = e.target.value;
              setParentKey(key);
              const project = projects.find(
                (project) => key === `project:${project.id}`,
              );
              const goal = goals.find(
                (goal) =>
                  key === `goal:${goal.id}` || goal.id === project?.goalId,
              );
              const inherited =
                project?.areaId ||
                project?.lifeAreaId ||
                goal?.areaId ||
                goal?.lifeAreaId;
              if (inherited) setAreaId(inherited);
            }}
          />
        </ParamRow>
      )}
      {openChip === "effort" && (
        <ParamRow label="Зусилля">
          {(
            [
              ["small", "Невеликі"],
              ["medium", "Середні"],
              ["large", "Значні"],
            ] as const
          ).map(([key, label]) => (
            <Pill
              key={key}
              selected={effort === key}
              onClick={() =>
                setEffort((current) => (current === key ? null : key))
              }
            >
              {label}
            </Pill>
          ))}
        </ParamRow>
      )}
      {openChip === "deadline" && (
        <DateField
          label="Дедлайн"
          value={deadlineDate}
          onChange={(e) => setDeadlineDate(e.target.value)}
          data-testid="task-sheet-deadline-field"
        />
      )}
    </div>
  );
}
