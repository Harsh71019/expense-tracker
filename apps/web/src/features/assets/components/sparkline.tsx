"use client";

import { useId } from "react";
import type { ReactNode } from "react";

import { sparklineAreaPath, sparklineLinePath, sparklinePoints } from "../model/sparkline-path";

type SparklineProps = Readonly<{
  values: readonly number[];
  color: string;
  width: number;
  height: number;
}>;

export function Sparkline({ values, color, width, height }: SparklineProps): ReactNode {
  const gradientId = useId();
  const points = sparklinePoints(values, width, height);
  const last = points.at(-1);
  if (last === undefined) return null;

  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={sparklineAreaPath(points, height)} fill={`url(#${gradientId})`} />
      <path
        d={sparklineLinePath(points)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}
