import type { Goal, GoalPlan } from "@treasury-ops/shared";

export type GoalVerdict = Readonly<{
  label: string;
  tone: "success" | "neutral" | "muted";
}>;

const targetDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

export function goalVerdict(goal: Goal, plan: GoalPlan | undefined, now: Date): GoalVerdict {
  if (goal.status === "achieved") return { label: "Achieved 🎉", tone: "success" };
  if (goal.status === "abandoned") return { label: "Abandoned", tone: "muted" };

  if (goal.targetDate !== undefined) {
    return {
      label: `On track for ${targetDateFormatter.format(goal.targetDate)}`,
      tone: "neutral"
    };
  }

  const projected = plan?.projectedCompletionDate;
  if (projected === null || projected === undefined) {
    return { label: "Build a contribution rate", tone: "muted" };
  }

  const months = Math.max(0, monthDistance(now, projected));
  if (months === 0) return { label: "Target reached", tone: "success" };
  return {
    label: `${months} ${months === 1 ? "month" : "months"} at current rate`,
    tone: "neutral"
  };
}

function monthDistance(from: Date, to: Date): number {
  const fromParts = calendarParts(from);
  const toParts = calendarParts(to);
  return (toParts.year - fromParts.year) * 12 + toParts.month - fromParts.month;
}

function calendarParts(date: Date): Readonly<{ year: number; month: number }> {
  const value = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit"
  }).format(date);
  const [year, month] = value.split("-").map(Number);
  if (year === undefined || month === undefined) {
    throw new Error("Could not format the India calendar month.");
  }
  return { year, month };
}
