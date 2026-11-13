import React, { useId } from "react";

import { Icon } from "./icons";

import { useHeaderScrollCollapse } from "./motion";

import { ClayBadgeShape } from "./ClayBadge";

import { RoundButton } from "./buttons";

import { InfoSheet } from "./sheets";

import { ClayBadge } from "./ClayBadge";

export interface SectionProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  action?: string | React.ReactNode;
  trailing?: React.ReactNode;
  count?: number;
}

export function Section({
  title,
  actionLabel,
  onAction,
  action,
  trailing,
  count,
  children,
  className = "",
  ...props
}: SectionProps) {
  const headingId = useId();
  const stringAction =
    actionLabel ?? (typeof action === "string" ? action : undefined);
  const nodeAction =
    trailing ?? (typeof action !== "string" ? action : undefined);

  return (
    <section
      {...props}
      aria-labelledby={title ? headingId : undefined}
      data-ui="section"
      className={`ui-section ${className}`.trim()}
    >
      {(title ||
        stringAction ||
        nodeAction ||
        (typeof count === "number" && count > 0)) && (
        <div className="ui-section-header">
          <div className="ui-section-title-wrap">
            {title && (
              <h2 id={headingId} className="ui-section-title">
                {title}
              </h2>
            )}
            {typeof count === "number" && count > 0 && (
              <span className="ui-section-count">{count}</span>
            )}
          </div>
          {stringAction && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="ui-section-link"
            >
              <span>{stringAction}</span>
              <span aria-hidden="true">›</span>
            </button>
          ) : (
            nodeAction
          )}
        </div>
      )}
      <div data-ui="group" className="ui-section-body">
        {children}
      </div>
    </section>
  );
}

export interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  badgeShape?: ClayBadgeShape | null;
  badgeDayNumber?: number | string;
  infoText?: string;
  infoTitle?: string;
  className?: string;
  children?: React.ReactNode;
}

function resolveHeaderBadgeShape(title: string): ClayBadgeShape | null {
  const normalized = title.trim().toLowerCase();
  if (normalized === "сьогодні") return "today";
  if (normalized === "проєкти") return "projects";
  if (normalized === "цілі") return "goals";
  if (normalized === "я") return "me";
  if (normalized === "статистика") return "stats";
  if (normalized === "список бажань" || normalized === "бажання")
    return "wishlist";
  if (normalized === "налаштування") return "settings";
  if (normalized === "календар") return "calendar";
  return null;
}

export function PageHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Назад",
  actions,
  badgeShape,
  badgeDayNumber,
  infoText,
  infoTitle,
  className = "",
  children,
}: PageHeaderProps) {
  const { headerRef } = useHeaderScrollCollapse(64);
  const resolvedBadge =
    badgeShape !== undefined ? badgeShape : resolveHeaderBadgeShape(title);

  return (
    <header
      ref={headerRef as React.RefObject<HTMLElement>}
      data-ui="page-header"
      data-compact="false"
      data-pushed={onBack ? "true" : "false"}
      className={`ui-page-header ${className}`.trim()}
    >
      <div className="ui-page-header-large-row">
        <div className="ui-page-header-titles">
          <div className="ui-page-header-title-inline flex items-center gap-2">
            {onBack && (
              <RoundButton
                label={backLabel}
                onClick={onBack}
                data-testid="page-header-back"
                className="mr-1 shrink-0"
                size={40}
                variant="frosted"
              >
                <Icon name="chevron-left" size={18} />
              </RoundButton>
            )}
            <h1 className="ui-page-header-large-title truncate">{title}</h1>
            {infoText && (
              <InfoSheet title={infoTitle || title} label={infoTitle || title}>
                {infoText}
              </InfoSheet>
            )}
          </div>
          {subtitle && (
            <div className="ui-page-header-subtitle mt-0.5">{subtitle}</div>
          )}
        </div>
        <div className="ui-page-header-right">
          {actions && <div className="ui-page-header-actions">{actions}</div>}
          {resolvedBadge && (
            <ClayBadge
              shape={resolvedBadge}
              dayNumber={badgeDayNumber}
              size={52}
            />
          )}
        </div>
      </div>
      {children && <div className="mt-2">{children}</div>}
    </header>
  );
}

export interface SubHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  onBack: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function SubHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Назад",
  actions,
  className = "",
}: SubHeaderProps) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      backLabel={backLabel}
      actions={actions}
      className={className}
    />
  );
}
