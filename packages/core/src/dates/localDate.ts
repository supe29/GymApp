// Calendar helpers in the device's local time zone. The food diary and the
// dashboard key "today" by local calendar date; toISOString() would give
// the UTC date, which is the wrong day for much of the evening or morning
// depending on the user's offset.

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The local calendar date as YYYY-MM-DD. */
export function localDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Monday 00:00 local time of the week containing `date`. */
export function startOfLocalWeek(date: Date = new Date()): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}
