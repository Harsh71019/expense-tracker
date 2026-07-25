export type GoalProgressRingGeometry = Readonly<{
  ratio: number;
  percentage: number;
  circumference: number;
  dashOffset: number;
}>;

export function goalProgressRingGeometry(
  progressMinor: number,
  targetMinor: number,
  radius: number
): GoalProgressRingGeometry {
  const ratio = targetMinor <= 0 ? 0 : Math.min(1, Math.max(0, progressMinor / targetMinor));
  const circumference = 2 * Math.PI * radius;
  return {
    ratio,
    percentage: Math.round(ratio * 100),
    circumference,
    dashOffset: circumference * (1 - ratio)
  };
}
