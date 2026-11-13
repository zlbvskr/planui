import React, { useState } from "react";

import { Icon, type IconName } from "./icons";

import { ModalSheet } from "./primitives";

import { GlossyButton } from "./buttons";

import { RoundButton } from "./buttons";

import { Row } from "./rows";

/**
 * Sheet & AlertSheet (unified over ModalSheet with both `open` and `isOpen` props)
 */
export interface SheetProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: string;
  quickAdd?: boolean;
  morphFromRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
    right?: number;
    bottom?: number;
  } | null;
  detent?: string;
  isDirty?: boolean;
  transitionName?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Sheet({
  open,
  isOpen,
  onClose,
  title,
  subtitle,
  quickAdd = false,
  morphFromRect = null,
  isDirty = false,
  transitionName,
  footer,
  children,
}: SheetProps) {
  const resolvedOpen = Boolean(isOpen ?? open);
  return (
    <ModalSheet
      isOpen={resolvedOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      quickAdd={quickAdd}
      morphFromRect={morphFromRect}
      isDirty={isDirty}
      transitionName={transitionName}
      footer={footer}
    >
      {children}
    </ModalSheet>
  );
}

export interface AlertSheetProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}

export function AlertSheet({
  open,
  isOpen,
  onClose,
  title,
  description,
  confirmLabel = "Підтвердити",
  cancelLabel = "Не зараз",
  destructive = true,
  onConfirm,
  children,
}: AlertSheetProps) {
  const resolvedOpen = Boolean(isOpen ?? open);
  return (
    <Sheet
      isOpen={resolvedOpen}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex flex-col gap-2.5 w-full">
          <GlossyButton
            variant={destructive ? "destructive" : "primary"}
            fullWidth
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </GlossyButton>
          <GlossyButton variant="secondary" fullWidth onClick={onClose}>
            {cancelLabel}
          </GlossyButton>
        </div>
      }
    >
      <div className="space-y-2">
        {description && (
          <p className="text-[15px] leading-snug text-[var(--text-secondary)] m-0 truncate">
            {description}
          </p>
        )}
        {children}
      </div>
    </Sheet>
  );
}

/**
 * ActionMenu, InfoSheet, InfoButton, Disclosure, ItemCard, TintedCard, WeekStrip
 */
export interface ActionMenuItem {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  disabled?: boolean;
  testId?: string;
  onSelect: () => void;
}

export interface ActionMenuProps {
  label?: string;
  items: readonly ActionMenuItem[];
  testId?: string;
  children?: React.ReactNode;
}

export function ActionMenu({
  label = "Дії",
  items,
  testId,
  children,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {children ? (
        <button
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid={testId}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="inline-flex items-center bg-transparent border-0 p-0 cursor-pointer"
        >
          {children}
        </button>
      ) : (
        <RoundButton
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          size={36}
          data-testid={testId}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Icon name="more-horizontal" size={18} />
        </RoundButton>
      )}
      <Sheet isOpen={open} onClose={() => setOpen(false)} title={label}>
        <div className="space-y-2.5" role="menu">
          {items.map((item, idx) => (
            <Row
              key={`${item.label}-${idx}`}
              hideOrb
              leading={
                item.icon ? <Icon name={item.icon} size={18} /> : undefined
              }
              title={item.label}
              disabled={item.disabled}
              data-testid={item.testId}
              className={item.destructive ? "text-[var(--accent-danger)]" : ""}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            />
          ))}
        </div>
      </Sheet>
    </>
  );
}

export interface InfoSheetProps {
  title?: string;
  label?: string;
  testId?: string;
  children: React.ReactNode;
}

export function InfoSheet({
  title = "Пояснення",
  label,
  testId,
  children,
}: InfoSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <RoundButton
        aria-label={label ?? title}
        size={36}
        data-testid={testId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Icon name="info" size={16} />
      </RoundButton>
      <Sheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={
          <GlossyButton fullWidth onClick={() => setOpen(false)}>
            Зрозуміло
          </GlossyButton>
        }
      >
        <div className="text-[16px] leading-relaxed text-[var(--text-primary)]">
          {children}
        </div>
      </Sheet>
    </>
  );
}
