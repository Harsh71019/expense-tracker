import type { ReactNode } from "react";

import { pieWedges, type PieSlice } from "../model/pie-path";

type PieChartProps = Readonly<{
  slices: readonly PieSlice[];
  size: number;
}>;

export function PieChart({ slices, size }: PieChartProps): ReactNode {
  const wedges = pieWedges(slices, size);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: "visible" }}
      className="mx-auto my-2 block drop-shadow-lg"
    >
      {wedges.map((wedge, index) => (
        <path key={`${wedge.color}-${index}`} d={wedge.path} fill={wedge.color} stroke="none" />
      ))}
    </svg>
  );
}
