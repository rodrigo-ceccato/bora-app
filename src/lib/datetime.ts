const pad = (value: number) => String(value).padStart(2, '0');

/**
 * IonDatetime has no timezone concept: it reads and emits offset-less wall clock
 * strings ("2026-07-31T18:00:00"). Feeding it a UTC "...Z" value makes it show the
 * UTC hour, and handing its output straight to the API makes Postgres resolve the
 * wall clock against the server session zone (UTC). Both sides of the picker have
 * to be converted explicitly.
 */
export function toPickerValue(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Resolve a picker value (or any date string) to an absolute UTC instant. */
export function toInstantIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

/** Local calendar day as YYYY-MM-DD — `toISOString().slice(0, 10)` gives the UTC day. */
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
