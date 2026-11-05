import React, { useState } from "react";
import { Section, Row, ActionMenu, Sheet, RoundButton } from "../ui";
import { formatShortDate } from "../lib/format";
import { PlanuiSettings } from "../domain/types";
import {
  RoadmapSource,
  projectRoadmap,
  roadmapMarkers,
  RoadmapItem,
} from "../domain/roadmap";
import { addDaysToLocalDate } from "../domain/temporal";
import { PlanuiRepositories } from "../storage/repositories";
import { RoadmapItemEditor } from "./RoadmapView";
export function RoadmapCalendarLayer({
  source,
  settings,
  repositories,
  startDate,
  endDateExclusive,
  selectedDate,
  onChanged,
  controlsOnly = false,
}: {
  source: RoadmapSource;
  settings: PlanuiSettings;
  repositories: PlanuiRepositories;
  startDate: string;
  endDateExclusive: string;
  selectedDate: string;
  onChanged: () => Promise<void> | void;
  controlsOnly?: boolean;
}) {
  const [editing, setEditing] = useState<RoadmapItem | null>(null),
    [error, setError] = useState("");
  const layer = settings.roadmapLayer ?? "hidden",
    items = projectRoadmap(source);
  const groups = [];
  for (
    let date = startDate;
    date < endDateExclusive;
    date = addDaysToLocalDate(date, 1)
  ) {
    const markers = roadmapMarkers(items, date, layer);
    if (markers.length) groups.push({ date, markers });
  }
  if (controlsOnly)
    return (
      <ActionMenu
        label="Плани"
        items={(
          [
            { value: "key_dates", label: "Лише ключові дати" },
            { value: "periods", label: "Етапи й дати" },
            { value: "hidden", label: "Приховати плани" },
          ] as const
        ).map((option) => ({
          label: option.label,
          onSelect: async () => {
            try {
              await repositories.saveSettings(
                { ...settings, roadmapLayer: option.value },
                settings.revision,
              );
              await onChanged();
            } catch {
              setError("Не вдалося змінити вигляд.");
            }
          },
        }))}
      >
        Плани
      </ActionMenu>
    );
  if (layer === "hidden") return null;
  return (
    <div className="calendar-roadmap" data-testid="calendar-roadmap-layer">
      {error && <p role="alert">{error}</p>}
      {groups.map((group) => (
        <Section
          key={group.date}
          title={`Плани · ${formatShortDate(group.date)}`}
        >
          {group.markers.map((marker) => (
            <Row
              key={marker.key}
              title={`◆ ${marker.labelUk}`}
              trailing={
                <RoundButton
                  aria-label={`Переглянути: ${marker.labelUk}`}
                  onClick={() => setEditing(marker.item)}
                >
                  ›
                </RoundButton>
              }
            />
          ))}
        </Section>
      ))}
      <Sheet
        title={editing?.title ?? "План"}
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <RoadmapItemEditor
            key={`${editing.owner.kind}:${editing.owner.id}:${editing.record.revision}`}
            item={editing}
            relatedTasks={source.tasks}
            relatedItems={projectRoadmap(source, [
              "active",
              "idea",
              "paused",
              "completed",
            ])}
            repositories={repositories}
            onChanged={onChanged}
            onCancel={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}
