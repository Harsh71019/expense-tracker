export type PieSlice = Readonly<{ value: number; color: string }>;
export type PieWedge = Readonly<{ path: string; color: string }>;

const FULL_CIRCLE = Math.PI * 2;
const FULL_CIRCLE_EPSILON = 1e-6;

function point(cx: number, cy: number, r: number, angle: number): { x: string; y: string } {
  return {
    x: (cx + r * Math.cos(angle)).toFixed(2),
    y: (cy + r * Math.sin(angle)).toFixed(2)
  };
}

/** Filled wedges for a solid pie chart, starting at 12 o'clock and proceeding clockwise. */
export function pieWedges(slices: readonly PieSlice[], size: number): PieWedge[] {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  let angle = -Math.PI / 2;

  return slices.map((slice) => {
    const fraction = slice.value / total;
    const start = angle;
    const end = start + fraction * FULL_CIRCLE;
    angle = end;
    const p0 = point(cx, cy, r, start);

    // A slice spanning the entire circle has coincident start/end points, which SVG
    // renders as an invisible zero-length arc — split it into two half-circle arcs instead.
    if (end - start >= FULL_CIRCLE - FULL_CIRCLE_EPSILON) {
      const mid = point(cx, cy, r, start + Math.PI);
      return {
        path: `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 1 1 ${mid.x} ${mid.y} A ${r} ${r} 0 1 1 ${p0.x} ${p0.y} Z`,
        color: slice.color
      };
    }

    const large = end - start > Math.PI ? 1 : 0;
    const p1 = point(cx, cy, r, end);
    return {
      path: `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`,
      color: slice.color
    };
  });
}
