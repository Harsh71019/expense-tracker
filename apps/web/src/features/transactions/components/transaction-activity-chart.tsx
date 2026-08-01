import type { TransactionActivityDay } from "@treasury-ops/shared";
import type { ReactNode } from "react";

const CHART_WIDTH = 320;
const CHART_HEIGHT = 52;
const BAR_GAP = 3;
const MIN_BAR_HEIGHT = 3;

export function TransactionActivityChart({
  activity
}: Readonly<{ activity: readonly TransactionActivityDay[] }>): ReactNode {
  let maximum = 0;
  for (const day of activity) maximum = Math.max(maximum, day.transactionCount);

  if (activity.length === 0) return null;

  const barWidth = (CHART_WIDTH - BAR_GAP * (activity.length - 1)) / activity.length;
  const availableHeight = CHART_HEIGHT - MIN_BAR_HEIGHT;
  const total = activity.reduce((sum, day) => sum + day.transactionCount, 0);

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-13 w-full"
      role="img"
      aria-label={`Daily transaction activity: ${total} transactions across ${activity.length} days`}
    >
      {activity.map((day, index) => {
        const height =
          day.transactionCount === 0 || maximum === 0
            ? MIN_BAR_HEIGHT
            : Math.max(MIN_BAR_HEIGHT, (day.transactionCount / maximum) * availableHeight);
        return (
          <rect
            key={day.date}
            x={index * (barWidth + BAR_GAP)}
            y={CHART_HEIGHT - height}
            width={barWidth}
            height={height}
            rx={Math.min(2, barWidth / 2)}
            fill={day.transactionCount === 0 ? "var(--color-border)" : "var(--color-accent)"}
            opacity={day.transactionCount === 0 ? 0.65 : 0.9}
          />
        );
      })}
    </svg>
  );
}
