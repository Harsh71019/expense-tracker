export type DonutSlice = Readonly<{ value: number; color: string }>;
export type DonutArc = Readonly<{ path: string; color: string }>;

/** Arcs for a ring chart, starting at 12 o'clock and proceeding clockwise. */
export function donutArcs(slices: readonly DonutSlice[], size: number, inset = 6): DonutArc[] {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - inset;
  let angle = -Math.PI / 2;

  return slices.map((slice) => {
    const fraction = slice.value / total;
    const start = angle;
    const end = start + fraction * Math.PI * 2;
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;
    const x0 = (cx + r * Math.cos(start)).toFixed(2);
    const y0 = (cy + r * Math.sin(start)).toFixed(2);
    const x1 = (cx + r * Math.cos(end)).toFixed(2);
    const y1 = (cy + r * Math.sin(end)).toFixed(2);
    return { path: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`, color: slice.color };
  });
}
