export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function dateInputToUtc(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) throw new RangeError("Choose a valid target date.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("Choose a valid target date.");
  }
  return date;
}

export function dateToInput(value: Date | undefined): string {
  return value === undefined || Number.isNaN(value.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(value);
}
