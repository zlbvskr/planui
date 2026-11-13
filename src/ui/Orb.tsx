import React, { useMemo } from "react";

import {
  NEUTRAL_SLATE,
  ORB_PALETTE,
  orbVars,
  type OrbHue,
} from "../domain/modelHelpers";

export type OrbSize = 18 | 20 | 24 | 32 | 44 | 72 | 80 | number;

export interface OrbProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  color?: string | null;
  hue?: OrbHue;
  size?: OrbSize;
  glow?: boolean;
}

export function Orb({
  color,
  hue,
  size = 32,
  glow = false,
  className = "",
  style,
  children,
  ...props
}: OrbProps) {
  const resolvedColor = color ?? (hue ? ORB_PALETTE[hue] : NEUTRAL_SLATE);
  const vars = useMemo(() => orbVars(resolvedColor), [resolvedColor]);

  return (
    <span
      {...props}
      aria-hidden="true"
      data-ui="orb"
      data-size={size}
      data-glow={glow ? "true" : undefined}
      className={`ui-orb inline-flex items-center justify-center ${glow ? "ui-orb-glow" : ""} ${className}`.trim()}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        ...vars,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
