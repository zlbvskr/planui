import React from "react";
import {
  NEUTRAL_SLATE,
  itemColor,
  resolveArea,
} from "../../domain/modelHelpers";
import {
  EntityId,
  Folder,
  Goal,
  LifeAreaAssessment,
  LifeAreaQuestion,
  Project,
  Task,
} from "../../domain/types";
import {
  DestinationContextMap,
  ImplementedCreationActionKind,
} from "../../state/shellStore";
import { HeroArt } from "../../ui/art";
import { RoundButton } from "../../ui/buttons";
import { EmptyState } from "../../ui/EmptyState";
import { SearchBar } from "../../ui/fields";
import { Section } from "../../ui/headers";
import { Icon3D } from "../../ui/Icon3D";
import { Icon } from "../../ui/icons";
import { ProgressRing } from "../../ui/ProgressRing";
import { Row } from "../../ui/rows";
import { PillRow } from "../../ui/selection";
import {
  STATE_LABELS_PROJECT,
  formatTaskDeadline,
  pluralizeProjects,
  pluralizeTasks,
} from "./planPresentation";

interface ProjectListProps {
  filteredProjects: Project[];
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  onUpdatePlansContext: (
    patch: Partial<DestinationContextMap["plans"]>,
  ) => void;
  statusFilter: "active" | "idea" | "paused" | "completed";
  setStatusFilter: React.Dispatch<
    React.SetStateAction<"active" | "idea" | "paused" | "completed">
  >;
  activeFolderId: string | null;
  currentFolder: Folder | null;
  folderChain: Folder[];
  currentChildFolders: Folder[];
  modelContext: {
    folders: Folder[];
    projects: Project[];
    goals: Goal[];
    areas: readonly LifeAreaQuestion[];
    lifeAreas: readonly LifeAreaQuestion[];
    lifeAreaAssessments: readonly LifeAreaAssessment[];
  };
  projects: Project[];
  tasks: Task[];
  didTriggerLongPressRef: React.RefObject<boolean>;
  dragStartYRef: React.RefObject<number | null>;
  dragIndexRef: React.RefObject<number | null>;
  clearLongPress: () => void;
  longPressTimerRef: React.RefObject<number | null>;
  setContextMenuTarget: React.Dispatch<
    React.SetStateAction<
      | { kind: "folder"; folder: Folder }
      | { kind: "project"; project: Project }
      | null
    >
  >;
  handleReorderFolders: (fromIdx: number, toIdx: number) => Promise<void>;
  openFieldEditor: (
    entity: Project | Goal,
    kind: "project" | "goal",
    field:
      | "purpose"
      | "criteria"
      | "nextStep"
      | "targetDate"
      | "area"
      | "icon"
      | "measure",
  ) => void;
  handleReorderProjects: (fromIdx: number, toIdx: number) => Promise<void>;
  currentFolderTasks: Task[];
  onToggleTaskState: ((taskId: EntityId) => Promise<void> | void) | undefined;
  onOpenGlobalCreation: (
    preferredAction?: ImplementedCreationActionKind,
  ) => void;
}

export function ProjectList({
  filteredProjects,
  searchQuery,
  setSearchQuery,
  onUpdatePlansContext,
  statusFilter,
  setStatusFilter,
  activeFolderId,
  currentFolder,
  folderChain,
  currentChildFolders,
  modelContext,
  projects,
  tasks,
  didTriggerLongPressRef,
  dragStartYRef,
  dragIndexRef,
  clearLongPress,
  longPressTimerRef,
  setContextMenuTarget,
  handleReorderFolders,
  openFieldEditor,
  handleReorderProjects,
  currentFolderTasks,
  onToggleTaskState,
  onOpenGlobalCreation,
}: ProjectListProps) {
  return (
    <div className="projects-container min-w-0 space-y-3.5">
      <header className="workspace-projects-heading">
        <h1>Проєкти</h1>
        <span className="directory-count">
          {pluralizeProjects(filteredProjects.length)}
        </span>
        <HeroArt name="folders" size={64} />
      </header>

      <SearchBar
        value={searchQuery}
        onChange={(val) => {
          setSearchQuery(val);
          onUpdatePlansContext({ searchQuery: val });
        }}
        onClear={() => {
          setSearchQuery("");
          onUpdatePlansContext({ searchQuery: "" });
        }}
        placeholder="Пошук проєктів"
      />

      <PillRow
        label="Статус проєктів"
        className="justify-start"
        value={statusFilter}
        options={[
          { value: "active", label: "Активні", orbHue: "pink" },
          { value: "idea", label: "Ідеї", orbHue: "yellow" },
          { value: "paused", label: "На паузі", orbHue: "purple" },
          { value: "completed", label: "Завершені", orbHue: "mint" },
        ]}
        onChange={(v) => setStatusFilter(v)}
      />

      <div className="h-3" />

      {activeFolderId && currentFolder && (
        <div className="flex items-center gap-2.5 py-1">
          <RoundButton
            size={36}
            aria-label="Назад"
            onClick={() =>
              onUpdatePlansContext({
                activeFolderId: currentFolder.parentId ?? null,
              })
            }
          >
            <Icon name="chevron-left" size={18} />
          </RoundButton>
          <div className="flex items-center gap-1.5 text-[14px] font-bold text-secondary overflow-x-auto no-scrollbar">
            <button
              type="button"
              className="hover:text-ink cursor-pointer flex-shrink-0"
              onClick={() => onUpdatePlansContext({ activeFolderId: null })}
            >
              Проєкти
            </button>
            {folderChain.map((f, i) => (
              <React.Fragment key={f.id}>
                <span className="opacity-50">/</span>
                <button
                  type="button"
                  className={`cursor-pointer flex-shrink-0 ${
                    i === folderChain.length - 1
                      ? "text-ink font-extrabold"
                      : "hover:text-ink"
                  }`}
                  onClick={() => onUpdatePlansContext({ activeFolderId: f.id })}
                >
                  {f.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {currentChildFolders.length > 0 && (
        <section className="workspace-folders">
          <h2>Папки</h2>
          <div className="projects-folder-grid">
            {currentChildFolders.map((folder, idx) => {
              const folderArea = resolveArea(folder, modelContext);
              const folderColor = folderArea
                ? itemColor(folder, modelContext)
                : NEUTRAL_SLATE;
              const pCount = projects.filter(
                (p) => p.folderId === folder.id,
              ).length;
              const tCount = tasks.filter(
                (t) => t.folderId === folder.id,
              ).length;
              const countParts: string[] = [];
              if (pCount > 0) countParts.push(pluralizeProjects(pCount));
              if (tCount > 0) countParts.push(pluralizeTasks(tCount));
              const countStr = countParts.join(" · ");

              return (
                <Row
                  key={folder.id}
                  leading={
                    <div className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-white/70 shadow-sm border border-black/5 flex-shrink-0">
                      <Icon3D
                        name={folder.iconKey || "folder"}
                        color={folderColor}
                        size={24}
                      />
                    </div>
                  }
                  title={folder.name}
                  meta={countStr || undefined}
                  chevron
                  className="min-h-[56px]"
                  onPointerDown={(e) => {
                    didTriggerLongPressRef.current = false;
                    dragStartYRef.current = e.clientY;
                    dragIndexRef.current = idx;
                    clearLongPress();
                    longPressTimerRef.current = window.setTimeout(() => {
                      didTriggerLongPressRef.current = true;
                      setContextMenuTarget({ kind: "folder", folder });
                    }, 450);
                  }}
                  onPointerMove={(e) => {
                    if (
                      dragStartYRef.current === null ||
                      dragIndexRef.current === null
                    )
                      return;
                    const dy = e.clientY - dragStartYRef.current;
                    if (Math.abs(dy) > 14 && !didTriggerLongPressRef.current) {
                      clearLongPress();
                    }
                    if (didTriggerLongPressRef.current && Math.abs(dy) > 48) {
                      setContextMenuTarget(null);
                      const stepDir = dy > 0 ? 1 : -1;
                      const targetIdx = dragIndexRef.current + stepDir;
                      dragStartYRef.current = e.clientY;
                      dragIndexRef.current = targetIdx;
                      void handleReorderFolders(idx, targetIdx);
                    }
                  }}
                  onPointerUp={clearLongPress}
                  onPointerCancel={clearLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    clearLongPress();
                    setContextMenuTarget({ kind: "folder", folder });
                  }}
                  onClick={() => {
                    if (didTriggerLongPressRef.current) {
                      didTriggerLongPressRef.current = false;
                      return;
                    }
                    onUpdatePlansContext({ activeFolderId: folder.id });
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {filteredProjects.length > 0 && (
        <div className="projects-active-list space-y-2">
          <h2>Проєкти</h2>
          {filteredProjects.map((p, idx) => {
            const pColor = itemColor(p, modelContext);
            const pTasks = tasks.filter(
              (t) =>
                t.ownership.kind === "project" &&
                t.ownership.projectId === p.id,
            );
            const tCount = pTasks.length;
            const statusText = `${tCount > 0 ? `${pluralizeTasks(tCount)} · ` : ""}${STATE_LABELS_PROJECT[p.state]}`;
            const hasMeasure = Boolean(p.measure && p.measure.unit);

            const nextStepTask = p.nextActionTaskId
              ? tasks.find((t) => t.id === p.nextActionTaskId)
              : pTasks.find((t) => t.state === "open");
            const nextStepLabel =
              p.nextStepUk ??
              nextStepTask?.title ??
              (p.nextActionTaskId ? p.nextActionTaskId : null);

            const metaNode = hasMeasure ? (
              <span>{statusText}</span>
            ) : (
              <span className="flex flex-col gap-0.5 min-w-0">
                <span>{statusText}</span>
                {nextStepLabel ? (
                  <span className="truncate text-[12px] leading-[16px] font-medium text-[var(--text-secondary)]">
                    {nextStepLabel}
                  </span>
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    className="text-[12.5px] leading-[16px] font-bold text-[var(--color-coral)] hover:opacity-80 w-fit cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFieldEditor(p, "project", "nextStep");
                    }}
                  >
                    Додати наступний крок
                  </span>
                )}
              </span>
            );

            return (
              <Row
                key={p.id}
                leading={
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-white/70 shadow-sm border border-black/5 flex-shrink-0">
                    <Icon3D
                      name={p.icon || p.iconKey || "folder"}
                      color={pColor}
                      size={24}
                    />
                  </div>
                }
                title={p.title}
                meta={metaNode}
                trailing={
                  hasMeasure && p.measure ? (
                    <ProgressRing
                      current={p.measure.current}
                      target={p.measure.target || 100}
                      color={pColor}
                      size={44}
                      strokeWidth={5}
                    />
                  ) : undefined
                }
                chevron
                className="min-h-[56px]"
                onPointerDown={(e) => {
                  didTriggerLongPressRef.current = false;
                  dragStartYRef.current = e.clientY;
                  dragIndexRef.current = idx;
                  clearLongPress();
                  longPressTimerRef.current = window.setTimeout(() => {
                    didTriggerLongPressRef.current = true;
                    setContextMenuTarget({ kind: "project", project: p });
                  }, 450);
                }}
                onPointerMove={(e) => {
                  if (
                    dragStartYRef.current === null ||
                    dragIndexRef.current === null
                  )
                    return;
                  const dy = e.clientY - dragStartYRef.current;
                  if (Math.abs(dy) > 14 && !didTriggerLongPressRef.current) {
                    clearLongPress();
                  }
                  if (didTriggerLongPressRef.current && Math.abs(dy) > 48) {
                    setContextMenuTarget(null);
                    const stepDir = dy > 0 ? 1 : -1;
                    const targetIdx = dragIndexRef.current + stepDir;
                    dragStartYRef.current = e.clientY;
                    dragIndexRef.current = targetIdx;
                    void handleReorderProjects(idx, targetIdx);
                  }
                }}
                onPointerUp={clearLongPress}
                onPointerCancel={clearLongPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  clearLongPress();
                  setContextMenuTarget({ kind: "project", project: p });
                }}
                onClick={() => {
                  if (didTriggerLongPressRef.current) {
                    didTriggerLongPressRef.current = false;
                    return;
                  }
                  onUpdatePlansContext({ activeProjectId: p.id });
                }}
              />
            );
          })}
        </div>
      )}

      {activeFolderId && currentFolderTasks.length > 0 && (
        <Section title="Завдання">
          <div className="space-y-2">
            {currentFolderTasks.map((t) => {
              const taskColor = itemColor(t, modelContext);
              return (
                <Row
                  key={t.id}
                  orbColor={taskColor}
                  title={t.title}
                  meta={t.deadline ? formatTaskDeadline(t.deadline) : undefined}
                  checked={t.state === "completed"}
                  done={t.state === "completed"}
                  glowColor={taskColor}
                  onToggleCheck={() => onToggleTaskState?.(t.id)}
                />
              );
            })}
          </div>
        </Section>
      )}

      {currentChildFolders.length === 0 &&
        filteredProjects.length === 0 &&
        currentFolderTasks.length === 0 && (
          <EmptyState
            context="projects"
            testId="projects-empty"
            title="Тут з'являться ваші проєкти"
            primaryAction={{
              label: "Створити проєкт",
              variant: "mint",
              onClick: () => onOpenGlobalCreation("project"),
            }}
            secondaryAction={{
              label: "Створити папку",
              variant: "secondary",
              onClick: () => onOpenGlobalCreation("folder"),
            }}
          />
        )}
    </div>
  );
}
