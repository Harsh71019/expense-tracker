"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { goalProgressRingGeometry } from "../model/goal-progress-ring-path";

type GoalProgressRingProps = Readonly<{
  progressMinor: number;
  targetMinor: number;
  size?: number;
}>;

export function GoalProgressRing({
  progressMinor,
  targetMinor,
  size = 92
}: GoalProgressRingProps): ReactNode {
  const [mounted, setMounted] = useState(false);
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const geometry = goalProgressRingGeometry(progressMinor, targetMinor, radius);

  useEffect(() => setMounted(true), []);

  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      aria-label={`${geometry.percentage}% funded`}
      role="img"
    >
      <svg className="-rotate-90" width={size} height={size} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          strokeDasharray={geometry.circumference}
          strokeDashoffset={mounted ? geometry.dashOffset : geometry.circumference}
          className="text-accent transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute font-mono text-sm font-extrabold text-foreground">
        {geometry.percentage}%
      </span>
    </div>
  );
}
