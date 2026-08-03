const DEFAULT_MAX = 1;

export type ChartPoint = readonly [number, number];

export function chartMaximum(values: readonly number[]): number {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, value);
  return Math.max(DEFAULT_MAX, maximum);
}

export function lineChartPoints(
  values: readonly number[],
  width: number,
  height: number,
  horizontalPadding: number,
  topPadding: number,
  bottomPadding: number
): ChartPoint[] {
  const maximum = chartMaximum(values);
  const drawableWidth = width - horizontalPadding * 2;
  const drawableHeight = height - topPadding - bottomPadding;
  return values.map((value, index) => {
    const x =
      values.length === 1
        ? width / 2
        : horizontalPadding + (index / (values.length - 1)) * drawableWidth;
    const y = topPadding + drawableHeight - (value / maximum) * drawableHeight;
    return [x, y];
  });
}

export function linePath(points: readonly ChartPoint[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
}
