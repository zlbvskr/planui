import React, { useState } from "react";

import { Row } from "./rows";

import { MilkyCard } from "./cards";

export interface DisclosureProps {
  title: React.ReactNode;
  secondary?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  defaultOpen?: boolean;
  testId?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Disclosure({
  title,
  secondary,
  trailing,
  onClick,
  defaultOpen = false,
  testId,
  children,
  className = "",
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div data-ui="disclosure" className={`space-y-2 ${className}`.trim()}>
      <Row
        hideOrb
        title={title}
        secondary={secondary}
        trailing={trailing}
        chevron
        data-testid={testId}
        onClick={() => {
          if (onClick) onClick();
          else if (children) setOpen((v) => !v);
        }}
      />
      {children && open && (
        <MilkyCard className="space-y-3">{children}</MilkyCard>
      )}
    </div>
  );
}
