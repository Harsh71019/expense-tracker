export const exportFilename = "treasury-ops-export.csv";

export function indiaCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00+05:30`);
}

export function indiaCalendarDateStart(value: string): Date {
  return new Date(`${value}T00:00:00.000+05:30`);
}

export function indiaCalendarDateEnd(value: string): Date {
  return new Date(`${value}T23:59:59.999+05:30`);
}
