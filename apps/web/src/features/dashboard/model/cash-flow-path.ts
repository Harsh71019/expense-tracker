export type CashFlowPoint = readonly [number, number];
export type CashFlowSeriesPaths = Readonly<{ line: string; area: string }>;

export const CASH_FLOW_DIMENSIONS = {
  width: 1080,
  height: 210,
  padL: 8,
  padR: 8,
  padT: 12,
  padB: 26
} as const;

export function cashFlowMax(values: readonly number[]): number {
  return Math.max(...values, 0) * 1.1 || 1;
}

export function cashFlowPoints(values: readonly number[], max: number): CashFlowPoint[] {
  const { width, height, padL, padR, padT, padB } = CASH_FLOW_DIMENSIONS;
  const n = values.length;
  return values.map((value, index) => {
    const x = padL + (n <= 1 ? 0 : (index / (n - 1)) * (width - padL - padR));
    const y = padT + (1 - value / max) * (height - padT - padB);
    return [x, y] as const;
  });
}

export function cashFlowSeriesPaths(points: readonly CashFlowPoint[]): CashFlowSeriesPaths {
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) return { line, area: "" };
  const floor = (CASH_FLOW_DIMENSIONS.height - CASH_FLOW_DIMENSIONS.padB).toFixed(1);
  const area = `${line} L${last[0].toFixed(1)} ${floor} L${first[0].toFixed(1)} ${floor} Z`;
  return { line, area };
}
