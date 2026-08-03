import { formatMinor, type WeeklySpendingBucket } from "@treasury-ops/shared";
import { useId, type ReactNode } from "react";

import { lineChartPoints, linePath } from "../model/monthly-spending-chart";

const WIDTH = 720;
const HEIGHT = 184;
const HORIZONTAL_PADDING = 34;
const TOP_PADDING = 18;
const BOTTOM_PADDING = 38;
const dayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short"
});

function bucketLabel(bucket: WeeklySpendingBucket): string {
  return `${dayFormatter.format(bucket.startAt)}–${dayFormatter.format(bucket.endAt)}`;
}

export function WeeklySpendingChart({
  buckets,
  privacyMode
}: Readonly<{
  buckets: readonly WeeklySpendingBucket[];
  privacyMode: boolean;
}>): ReactNode {
  const gradientId = useId();
  const points = lineChartPoints(
    buckets.map((bucket) => bucket.amountMinor),
    WIDTH,
    HEIGHT,
    HORIZONTAL_PADDING,
    TOP_PADDING,
    BOTTOM_PADDING
  );
  const path = linePath(points);

  if (buckets.length === 0) {
    return <p className="py-14 text-center text-sm text-foreground-muted">No spending yet.</p>;
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="h-46 w-full overflow-visible"
      role="img"
      aria-label="Weekly spending for the current month"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-expense)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="var(--color-expense)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 1, 2].map((line) => {
        const y = TOP_PADDING + (line / 2) * (HEIGHT - TOP_PADDING - BOTTOM_PADDING);
        return (
          <line
            key={line}
            x1={HORIZONTAL_PADDING}
            x2={WIDTH - HORIZONTAL_PADDING}
            y1={y}
            y2={y}
            stroke="var(--color-border)"
            strokeWidth={1}
            strokeDasharray="3 5"
          />
        );
      })}
      {points.length > 1 ? (
        <path
          d={`${path} L ${points.at(-1)?.[0] ?? 0} ${HEIGHT - BOTTOM_PADDING} L ${points[0]?.[0] ?? 0} ${HEIGHT - BOTTOM_PADDING} Z`}
          fill={`url(#${gradientId})`}
        />
      ) : null}
      <path
        d={path}
        fill="none"
        stroke="var(--color-expense)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {buckets.map((bucket, index) => {
        const point = points[index];
        if (point === undefined) return null;
        const label = bucketLabel(bucket);
        return (
          <g key={bucket.startAt.toISOString()}>
            <circle
              cx={point[0]}
              cy={point[1]}
              r={5}
              fill="var(--color-surface-elevated)"
              stroke="var(--color-expense)"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            >
              <title>{privacyMode ? label : `${label}: ${formatMinor(bucket.amountMinor)}`}</title>
            </circle>
            <text
              x={point[0]}
              y={HEIGHT - 12}
              fill="var(--color-foreground-muted)"
              fontFamily="JetBrains Mono, monospace"
              fontSize={11}
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
