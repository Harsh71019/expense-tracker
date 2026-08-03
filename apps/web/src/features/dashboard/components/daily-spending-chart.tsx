import { formatMinor, type DailySpendingBucket } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { chartMaximum } from "../model/monthly-spending-chart";

const WIDTH = 960;
const HEIGHT = 180;
const TOP_PADDING = 16;
const BOTTOM_PADDING = 30;
const SIDE_PADDING = 8;
const BAR_GAP = 4;
const MIN_BAR_HEIGHT = 2;
const dayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric"
});
const fullDateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "long"
});

function shouldLabel(day: number, lastDay: number): boolean {
  return day === 1 || day === lastDay || day % 5 === 0;
}

export function DailySpendingChart({
  buckets,
  asOf,
  privacyMode
}: Readonly<{
  buckets: readonly DailySpendingBucket[];
  asOf: Date;
  privacyMode: boolean;
}>): ReactNode {
  if (buckets.length === 0) {
    return <p className="py-14 text-center text-sm text-foreground-muted">No calendar data yet.</p>;
  }

  const maximum = chartMaximum(buckets.map((bucket) => bucket.amountMinor));
  const availableWidth = WIDTH - SIDE_PADDING * 2;
  const barWidth = (availableWidth - BAR_GAP * (buckets.length - 1)) / buckets.length;
  const chartHeight = HEIGHT - TOP_PADDING - BOTTOM_PADDING;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="h-45 min-w-[680px] w-full"
      role="img"
      aria-label={`Daily spending across ${buckets.length} days in the current month`}
    >
      <line
        x1={SIDE_PADDING}
        x2={WIDTH - SIDE_PADDING}
        y1={HEIGHT - BOTTOM_PADDING}
        y2={HEIGHT - BOTTOM_PADDING}
        stroke="var(--color-border)"
        strokeWidth={1}
      />
      {buckets.map((bucket, index) => {
        const future = bucket.date.getTime() > asOf.getTime();
        const height =
          bucket.amountMinor === 0
            ? MIN_BAR_HEIGHT
            : Math.max(MIN_BAR_HEIGHT, (bucket.amountMinor / maximum) * chartHeight);
        const x = SIDE_PADDING + index * (barWidth + BAR_GAP);
        const day = Number(dayFormatter.format(bucket.date));
        const label = fullDateFormatter.format(bucket.date);
        return (
          <g key={bucket.date.toISOString()}>
            <rect
              x={x}
              y={HEIGHT - BOTTOM_PADDING - height}
              width={barWidth}
              height={height}
              rx={Math.min(3, barWidth / 2)}
              fill={
                future || bucket.amountMinor === 0 ? "var(--color-border)" : "var(--color-accent)"
              }
              opacity={future ? 0.38 : bucket.amountMinor === 0 ? 0.7 : 0.9}
            >
              <title>{privacyMode ? label : `${label}: ${formatMinor(bucket.amountMinor)}`}</title>
            </rect>
            {shouldLabel(day, buckets.length) ? (
              <text
                x={x + barWidth / 2}
                y={HEIGHT - 9}
                fill="var(--color-foreground-muted)"
                fontFamily="JetBrains Mono, monospace"
                fontSize={10}
                textAnchor="middle"
              >
                {day}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
