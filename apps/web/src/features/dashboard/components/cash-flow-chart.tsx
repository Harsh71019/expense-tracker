"use client";

import type { CashflowBucket } from "@treasury-ops/shared";
import { useId } from "react";
import type { ReactNode } from "react";

import {
  CASH_FLOW_DIMENSIONS,
  cashFlowMax,
  cashFlowPoints,
  cashFlowSeriesPaths
} from "../model/cash-flow-path";

type CashFlowChartProps = Readonly<{ buckets: readonly CashflowBucket[] }>;

export function CashFlowChart({ buckets }: CashFlowChartProps): ReactNode {
  const expenseGradientId = useId();
  const incomeGradientId = useId();
  const { width, height } = CASH_FLOW_DIMENSIONS;

  if (buckets.length === 0) {
    return (
      <p className="py-14 text-center text-sm text-foreground-muted">No cash flow data yet.</p>
    );
  }

  const max = cashFlowMax(buckets.flatMap((bucket) => [bucket.incomeMinor, bucket.expenseMinor]));
  const incomePoints = cashFlowPoints(
    buckets.map((bucket) => bucket.incomeMinor),
    max
  );
  const expensePoints = cashFlowPoints(
    buckets.map((bucket) => bucket.expenseMinor),
    max
  );
  const income = cashFlowSeriesPaths(incomePoints);
  const expense = cashFlowSeriesPaths(expensePoints);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="block"
      role="img"
      aria-label="Income versus spending over time"
    >
      <defs>
        <linearGradient id={expenseGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-expense)" stopOpacity={0.26} />
          <stop offset="100%" stopColor="var(--color-expense)" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={incomeGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-income)" stopOpacity={0.26} />
          <stop offset="100%" stopColor="var(--color-income)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={expense.area} fill={`url(#${expenseGradientId})`} />
      <path
        d={expense.line}
        fill="none"
        stroke="var(--color-expense)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d={income.area} fill={`url(#${incomeGradientId})`} />
      <path
        d={income.line}
        fill="none"
        stroke="var(--color-income)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {expensePoints.map(([x, y], index) => (
        <circle
          key={`expense-${index}-${buckets[index]?.label ?? ""}`}
          cx={x}
          cy={y}
          r={3}
          fill="var(--color-expense)"
        />
      ))}
      {incomePoints.map(([x, y], index) => (
        <circle
          key={`income-${index}-${buckets[index]?.label ?? ""}`}
          cx={x}
          cy={y}
          r={3}
          fill="var(--color-income)"
        />
      ))}
      {buckets.map((bucket, index) => {
        const point = incomePoints[index];
        if (point === undefined) return null;
        return (
          <text
            key={`cashflow-label-${bucket.label}-${index}`}
            x={point[0]}
            y={height - 8}
            fill="var(--color-foreground-muted)"
            fontSize={11}
            fontFamily="JetBrains Mono, monospace"
            textAnchor="middle"
          >
            {bucket.label}
          </text>
        );
      })}
    </svg>
  );
}
