"use client";

import { formatSignedCompactMinor, type AccountBalancePoint } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { usePrivacy } from "@/lib/privacy/privacy-context";

const WIDTH = 720;
const HEIGHT = 230;
const LEFT = 18;
const RIGHT = 18;
const TOP = 20;
const BOTTOM = 34;

function periodLabel(period: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Kolkata"
  }).format(new Date(`${period}T00:00:00+05:30`));
}

export function AccountBalanceChart({
  points
}: Readonly<{ points: readonly AccountBalancePoint[] }>): ReactNode {
  const { privacyMode } = usePrivacy();
  if (points.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-foreground-muted">No balance history yet.</p>
    );
  }

  let minimum = points[0]?.balanceMinor ?? 0;
  let maximum = minimum;
  for (const point of points) {
    minimum = Math.min(minimum, point.balanceMinor);
    maximum = Math.max(maximum, point.balanceMinor);
  }
  const padding = Math.max(Math.round(Math.max(Math.abs(minimum), Math.abs(maximum)) * 0.08), 100);
  const chartMinimum = minimum === maximum ? minimum - padding : minimum - padding;
  const chartMaximum = minimum === maximum ? maximum + padding : maximum + padding;
  const valueSpan = chartMaximum - chartMinimum;
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const coordinates = points.map((point, index) => {
    const x =
      LEFT + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const y = TOP + ((chartMaximum - point.balanceMinor) / valueSpan) * plotHeight;
    return { x, y, point };
  });
  const polyline = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `${LEFT},${HEIGHT - BOTTOM} ${polyline} ${WIDTH - RIGHT},${HEIGHT - BOTTOM}`;
  const first = points[0];
  const middle = points[Math.floor((points.length - 1) / 2)];
  const last = points.at(-1);
  const formatAxisMoney = (minor: number): string =>
    privacyMode ? "₹••••" : formatSignedCompactMinor(minor);

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-56 w-full overflow-visible"
        role="img"
        aria-label={`Running account balance from ${first?.period ?? "start"} to ${last?.period ?? "end"}`}
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = TOP + ratio * plotHeight;
          const value = Math.round(chartMaximum - ratio * valueSpan);
          return (
            <g key={ratio}>
              <line
                x1={LEFT}
                x2={WIDTH - RIGHT}
                y1={y}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth="1"
                strokeDasharray="3 6"
              />
              <text
                x={LEFT + 4}
                y={y - 5}
                fill="var(--color-foreground-muted)"
                fontFamily="JetBrains Mono, monospace"
                fontSize="10"
              >
                {formatAxisMoney(value)}
              </text>
            </g>
          );
        })}
        <polygon points={area} fill="var(--color-accent-glow)" />
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {coordinates.length > 1 ? (
          <>
            <circle
              cx={coordinates[0]?.x}
              cy={coordinates[0]?.y}
              r="4"
              fill="var(--color-surface-elevated)"
              stroke="var(--color-accent)"
              strokeWidth="2"
            />
            <circle
              cx={coordinates.at(-1)?.x}
              cy={coordinates.at(-1)?.y}
              r="5"
              fill="var(--color-accent)"
              stroke="var(--color-surface-elevated)"
              strokeWidth="2"
            />
          </>
        ) : null}
        {[first, middle, last].map((point, index) =>
          point === undefined ? null : (
            <text
              key={`${point.period}-${index}`}
              x={index === 0 ? LEFT : index === 1 ? WIDTH / 2 : WIDTH - RIGHT}
              y={HEIGHT - 8}
              textAnchor={index === 0 ? "start" : index === 1 ? "middle" : "end"}
              fill="var(--color-foreground-muted)"
              fontFamily="JetBrains Mono, monospace"
              fontSize="10"
            >
              {periodLabel(point.period)}
            </text>
          )
        )}
      </svg>
      <table className="sr-only">
        <caption>Running account balance by period</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.period}>
              <td>{point.period}</td>
              <td>{privacyMode ? "Hidden" : formatSignedCompactMinor(point.balanceMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
