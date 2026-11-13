import React from "react";
import { ShiftTemplate } from "../../domain/types";
import { Icon3D } from "../../ui/Icon3D";
import { Card } from "../../ui/cards";
import { Pill } from "../../ui/selection";
import { InlineChipKey } from "./editorTypes";

interface ShiftTemplatePickerProps {
  allShiftTemplates: readonly ShiftTemplate[];
  stampTool: string;
  setStampTool: React.Dispatch<React.SetStateAction<string>>;
  title: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  setOpenChip: React.Dispatch<React.SetStateAction<InlineChipKey | null>>;
  setActionTpl: React.Dispatch<React.SetStateAction<ShiftTemplate | null>>;
  tplLongPressTimerRef: React.RefObject<number | null>;
  openTemplateCreationSheet: () => void;
  actionTpl: ShiftTemplate | null;
  openEditTemplateSheet: (tpl: ShiftTemplate) => void;
  setDeletingTpl: React.Dispatch<React.SetStateAction<ShiftTemplate | null>>;
}

export function ShiftTemplatePicker({
  allShiftTemplates,
  stampTool,
  setStampTool,
  title,
  setTitle,
  setOpenChip,
  setActionTpl,
  tplLongPressTimerRef,
  openTemplateCreationSheet,
  actionTpl,
  openEditTemplateSheet,
  setDeletingTpl,
}: ShiftTemplatePickerProps) {
  return (
    <div
      className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)] space-y-2.5"
      data-testid="inline-panel-shift-template"
    >
      <div className="flex flex-wrap gap-2">
        {allShiftTemplates.map((tpl) => {
          const isNight = tpl.kind === "night" || tpl.endDateOffsetDays === 1;
          const startHm = (tpl.start ?? tpl.startLocalTime ?? "08:00").slice(
            0,
            5,
          );
          const endHm = (tpl.end ?? tpl.endLocalTime ?? "20:00").slice(0, 5);
          return (
            <Pill
              key={tpl.id}
              selected={stampTool === tpl.id}
              onClick={() => {
                setStampTool(tpl.id);
                if (!title.trim()) {
                  setTitle(tpl.name);
                }
                setOpenChip("shift_dates");
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setActionTpl(tpl);
              }}
              onPointerDown={() => {
                if (tplLongPressTimerRef.current) {
                  window.clearTimeout(tplLongPressTimerRef.current);
                }
                tplLongPressTimerRef.current = window.setTimeout(() => {
                  setActionTpl(tpl);
                }, 520);
              }}
              onPointerUp={() => {
                if (tplLongPressTimerRef.current) {
                  window.clearTimeout(tplLongPressTimerRef.current);
                  tplLongPressTimerRef.current = null;
                }
              }}
              onPointerCancel={() => {
                if (tplLongPressTimerRef.current) {
                  window.clearTimeout(tplLongPressTimerRef.current);
                  tplLongPressTimerRef.current = null;
                }
              }}
              data-testid={`shift-template-pill-${tpl.id}`}
            >
              <Icon3D
                name={isNight ? "moon" : "sun"}
                color={isNight ? "var(--color-purple)" : "var(--color-yellow)"}
                size={18}
              />
              <span>
                {tpl.name} · {startHm}-{endHm}
              </span>
            </Pill>
          );
        })}
        <Pill
          onClick={openTemplateCreationSheet}
          data-testid="shift-stamp-new-template-pill"
        >
          + Новий
        </Pill>
      </div>

      {actionTpl && (
        <Card className="p-3 flex items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-[var(--text-primary)] truncate">
            Шаблон «{actionTpl.name}»
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <Pill
              onClick={() => openEditTemplateSheet(actionTpl)}
              className="min-h-[36px] px-3 text-xs"
            >
              Редагувати
            </Pill>
            <Pill
              onClick={() => {
                setDeletingTpl(actionTpl);
                setActionTpl(null);
              }}
              className="min-h-[36px] px-3 text-xs text-[var(--accent-danger)]"
            >
              Видалити
            </Pill>
          </div>
        </Card>
      )}
    </div>
  );
}
