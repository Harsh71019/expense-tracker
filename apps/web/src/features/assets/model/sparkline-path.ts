export type SparklinePoint = readonly [number, number];

export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
  pad = 3
): SparklinePoint[] {
  if (values.length === 0) return [];
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });
}

export function sparklineLinePath(points: readonly SparklinePoint[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
}

export function sparklineAreaPath(
  points: readonly SparklinePoint[],
  height: number,
  pad = 3
): string {
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) return "";
  const floor = (height - pad).toFixed(1);
  return `${sparklineLinePath(points)} L${last[0].toFixed(1)} ${floor} L${first[0].toFixed(1)} ${floor} Z`;
}
