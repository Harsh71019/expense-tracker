"use client";

import { formatMinor, type AccountCashflowPoint } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { usePrivacy } from "@/lib/privacy/privacy-context";

const WIDTH = 720;
const HEIGHT = 210;
const TOP = 16;
const BOTTOM = 32;

export function AccountCashflowChart({
  points
}: Readonly<{ points: readonly AccountCashflowPoint[] }>): ReactNode {
  const { privacyMode } = usePrivacy();
  if (points.length === 0) {
    return <p className="py-14 text-center text-sm text-foreground-muted">No cash movement yet.</p>;
  }

  let maximum = 0;
  for (const point of points) maximum = Math.max(maximum, point.incomeMinor, point.expenseMinor);
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const groupWidth = WIDTH / points.length;
  const barWidth = Math.max(1, Math.min(8, groupWidth * 0.32));
  const first = points[0];
  const middle = points[Math.floor((points.length - 1) / 2)];
  const last = points.at(-1);

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 font-mono text-2xs font-semibold text-foreground-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-income" aria-hidden="true" /> Money in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-expense" aria-hidden="true" /> Money out
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-48 w-full"
        role="img"
        aria-label={`Income and expenses across ${points.length} periods`}
      >
        {[0, 0.5, 1].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            x2={WIDTH}
            y1={TOP + ratio * plotHeight}
            y2={TOP + ratio * plotHeight}
            stroke="var(--color-border)"
            strokeDasharray="3 6"
          />
        ))}
        {points.map((point, index) => {
          const x = index * groupWidth + groupWidth / 2;
          const incomeHeight = maximum === 0 ? 0 : (point.incomeMinor / maximum) * plotHeight;
          const expenseHeight = maximum === 0 ? 0 : (point.expenseMinor / maximum) * plotHeight;
          const tooltip = `${point.period}: money in ${privacyMode ? "hidden" : formatMinor(point.incomeMinor)}, money out ${privacyMode ? "hidden" : formatMinor(point.expenseMinor)}`;
          return (
            <g key={point.period}>
              <title>{tooltip}</title>
              <rect
                x={x - barWidth - 1}
                y={TOP + plotHeight - incomeHeight}
                width={barWidth}
                height={incomeHeight}
                rx={Math.min(2, barWidth / 2)}
                fill="var(--color-income)"
              />
              <rect
                x={x + 1}
                y={TOP + plotHeight - expenseHeight}
                width={barWidth}
                height={expenseHeight}
                rx={Math.min(2, barWidth / 2)}
                fill="var(--color-expense)"
                opacity="0.82"
              />
            </g>
          );
        })}
        {[first, middle, last].map((point, index) =>
          point === undefined ? null : (
            <text
              key={`${point.period}-${index}`}
              x={index === 0 ? 0 : index === 1 ? WIDTH / 2 : WIDTH}
              y={HEIGHT - 7}
              textAnchor={index === 0 ? "start" : index === 1 ? "middle" : "end"}
              fill="var(--color-foreground-muted)"
              fontFamily="JetBrains Mono, monospace"
              fontSize="10"
            >
              {point.period.slice(5)}
            </text>
          )
        )}
      </svg>
      <table className="sr-only">
        <caption>Account money in and money out by period</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Money in</th>
            <th>Money out</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.period}>
              <td>{point.period}</td>
              <td>{privacyMode ? "Hidden" : formatMinor(point.incomeMinor)}</td>
              <td>{privacyMode ? "Hidden" : formatMinor(point.expenseMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
