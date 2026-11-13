import { useMotionEntrance, useMotionNumber } from "./motion";

import React, { useId, useMemo } from "react";

import { ORB_PALETTE, orbVars } from "../domain/modelHelpers";

export interface ProgressRingProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  value?: number;
  max?: number;
  current?: number;
  target?: number;
  size?: number;
  strokeWidth?: number;
  color?: string | null;
  label?: string;
  showValue?: boolean;
}

export function ProgressRing({
  value,
  max,
  current,
  target,
  size = 44,
  strokeWidth = 11,
  color,
  label,
  showValue = true,
  className = "",
  style,
  ...props
}: ProgressRingProps) {
  const uid = useId().replace(/:/g, "");
  const resolvedCurrent = current ?? value ?? 0;
  const resolvedTarget = target ?? max ?? 100;
  const ratio =
    resolvedTarget > 0
      ? Math.max(0, Math.min(1, resolvedCurrent / resolvedTarget))
      : 0;
  const effectiveStroke =
    size < 38 && strokeWidth >= 9
      ? Math.max(6.5, Math.round(size * 0.205))
      : strokeWidth;
  const radius = (size - effectiveStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedRatio = ratio;
  const countedRatio = useMotionNumber(ratio);
  const entrance = useMotionEntrance<HTMLSpanElement>(ratio);
  const dashOffset = circumference * (1 - animatedRatio);
  const highlightRatio = Math.min(animatedRatio, 0.38);
  const highlightDashOffset = circumference * (1 - highlightRatio);
  const vars = useMemo(() => orbVars(color ?? ORB_PALETTE.mint), [color]);
  const gradId = `pring-grad-${uid}`;
  const pct = Math.round(countedRatio * 100);
  const displayText =
    label !== undefined && label.includes("%") ? label : `${pct}%`;

  return (
    <span
      {...props}
      ref={entrance}
      data-complete={ratio === 1 || undefined}
      data-ui="progress-ring"
      className={`ui-progress-ring ${className}`.trim()}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        ...vars,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--c-light)" />
            <stop offset="100%" stopColor="var(--c-dark)" />
          </linearGradient>
        </defs>
        {/* Inner track with inset shadow */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-track)"
          strokeWidth={effectiveStroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={Math.max(1, radius + effectiveStroke * 0.34)}
          fill="none"
          stroke="rgba(100, 80, 150, 0.16)"
          strokeWidth={1.1}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={Math.max(1, radius - effectiveStroke * 0.36)}
          fill="none"
          stroke="rgba(255, 255, 255, 0.72)"
          strokeWidth={1}
        />
        {(ratio > 0 || animatedRatio > 0) && (
          <>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={effectiveStroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius - effectiveStroke * 0.18}
              fill="none"
              stroke="rgba(255, 255, 255, 0.68)"
              strokeWidth={Math.max(1.5, effectiveStroke * 0.24)}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={highlightDashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </>
        )}
      </svg>
      {showValue && (
        <span className="ui-progress-ring-label">{displayText}</span>
      )}
    </span>
  );
}
