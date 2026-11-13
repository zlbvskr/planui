import React from "react";
import { addDaysToLocalDate } from "../../domain/temporal";
import { ImplementedCreationActionKind } from "../../state/shellStore";
import { Toggle } from "../../ui/Toggle";
import { DateField, TimeField } from "../../ui/fields";
import { Section } from "../../ui/headers";
import { Row } from "../../ui/rows";
import { Pill } from "../../ui/selection";

interface EditorDateTimePanelProps {
  itemDate: string;
  todayDate: string;
  selectDate: (nextDate: string) => void;
  itemEndDate: string;
  setItemEndDate: React.Dispatch<React.SetStateAction<string>>;
  activeType: ImplementedCreationActionKind;
  setItemTime: React.Dispatch<React.SetStateAction<string>>;
  isAllDay: boolean;
  itemTime: string;
  setIsAllDay: React.Dispatch<React.SetStateAction<boolean>>;
  isMultiDay: boolean;
  setIsMultiDay: React.Dispatch<React.SetStateAction<boolean>>;
}

export function EditorDateTimePanel({
  itemDate,
  todayDate,
  selectDate,
  itemEndDate,
  setItemEndDate,
  activeType,
  setItemTime,
  isAllDay,
  itemTime,
  setIsAllDay,
  isMultiDay,
  setIsMultiDay,
}: EditorDateTimePanelProps) {
  return (
    <div
      className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)] space-y-2.5"
      data-testid="inline-panel-datetime"
    >
      <div className="flex flex-wrap gap-2">
        <Pill
          selected={itemDate === todayDate}
          onClick={() => {
            selectDate(todayDate);
            if (itemEndDate < todayDate) setItemEndDate(todayDate);
          }}
        >
          Сьогодні
        </Pill>
        <Pill
          selected={itemDate === addDaysToLocalDate(todayDate, 1)}
          onClick={() => {
            const tmr = addDaysToLocalDate(todayDate, 1);
            selectDate(tmr);
            if (itemEndDate < tmr) setItemEndDate(tmr);
          }}
        >
          Завтра
        </Pill>
        {activeType === "task" && (
          <Pill
            selected={!itemDate}
            onClick={() => {
              selectDate("");
              setItemTime("");
            }}
          >
            Без дати
          </Pill>
        )}
      </div>
      <Section>
        <DateField
          label="Дата"
          value={itemDate}
          onChange={(e) => {
            selectDate(e.target.value);
            if (itemEndDate < e.target.value) {
              setItemEndDate(e.target.value);
            }
          }}
        />
        {!isAllDay && itemDate && (
          <TimeField
            label="Час"
            value={itemTime}
            onChange={(e) => setItemTime(e.target.value.slice(0, 5))}
          />
        )}
        {activeType === "event" && (
          <>
            <Row
              title="Весь день"
              trailing={
                <Toggle
                  label="Весь день"
                  checked={isAllDay}
                  onChange={setIsAllDay}
                />
              }
            />
            <Row
              title="Кілька днів"
              trailing={
                <Toggle
                  label="Кілька днів"
                  checked={isMultiDay}
                  onChange={setIsMultiDay}
                />
              }
            />
            {isMultiDay && (
              <DateField
                label="Дата завершення"
                value={itemEndDate}
                onChange={(e) => setItemEndDate(e.target.value)}
              />
            )}
          </>
        )}
      </Section>
    </div>
  );
}
