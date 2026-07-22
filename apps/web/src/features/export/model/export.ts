export const exportFilename = "treasury-ops-export.csv";

export function indiaCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00+05:30`);
}
