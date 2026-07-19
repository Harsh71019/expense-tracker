/** Formats a Date for a `<input type="datetime-local">` value in local wall-clock time (not UTC). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
