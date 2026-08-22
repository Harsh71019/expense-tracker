export function calendarDateInIndia(value: string): Date {
  return new Date(`${value}T00:00:00+05:30`);
}

export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function dueNotBeforeOpened(openedAt: string, dueAt: string): boolean {
  if (dueAt === "") return true;
  return calendarDateInIndia(dueAt).getTime() >= calendarDateInIndia(openedAt).getTime();
}

export function repaymentDefaultDescription(counterpartyName: string): string {
  return `Repayment from ${counterpartyName}`;
}
