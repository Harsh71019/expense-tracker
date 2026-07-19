import type { ReactNode } from "react";

import { donutArcs, type DonutSlice } from "../model/donut-path";

type DonutChartProps = Readonly<{
  slices: readonly DonutSlice[];
  size: number;
  centerValue: string;
  centerLabel: string;
}>;

export function DonutChart({ slices, size, centerValue, centerLabel }: DonutChartProps): ReactNode {
  const arcs = donutArcs(slices, size);

  return (
    <div className="relative mx-auto my-2" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block drop-shadow-lg">
        {arcs.map((arc, index) => (
          <path
            key={`${arc.color}-${index}`}
            d={arc.path}
            fill="none"
            stroke={arc.color}
            strokeWidth={22}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="font-mono text-[22px] font-bold tracking-tight text-foreground">
          {centerValue}
        </div>
        <div className="mt-0.5 text-[11px] font-medium text-foreground-muted">{centerLabel}</div>
      </div>
    </div>
  );
}
