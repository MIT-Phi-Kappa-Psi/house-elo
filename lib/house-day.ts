/**
 * A "day" in the house runs 6am to 6am, so anything logged after midnight
 * counts toward the night it belongs to rather than the calendar date.
 *
 * The boundary is wall-clock local time, not UTC — 6am in Cambridge, whatever
 * the server's timezone happens to be. Postgres does the conversion; this
 * constant and the SQL fragment below are the single definition of it.
 */
export const HOUSE_TIMEZONE = "America/New_York";
export const DAY_STARTS_AT_HOUR = 6;

/**
 * SQL expression mapping a timestamptz column to the house day it belongs to.
 * Shifting back six hours before taking the date moves 00:00–05:59 onto the
 * previous day and leaves 06:00 as the first moment of a new one.
 */
export function houseDayExpr(column: string): string {
  return `(((${column} at time zone '${HOUSE_TIMEZONE}') - interval '${DAY_STARTS_AT_HOUR} hours')::date)`;
}

/** Milliseconds the given instant is offset from UTC in `timeZone`. */
function offsetMs(at: Date, timeZone: string): number {
  const asUtc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  const asZone = new Date(at.toLocaleString("en-US", { timeZone }));
  return asZone.getTime() - asUtc.getTime();
}

/**
 * Interpret a `datetime-local` value as house wall-clock time.
 *
 * The browser sends "2026-09-15T08:00" with no zone, and `new Date(...)` reads
 * it in the *server's* zone — UTC in production. Somebody entering 8am would
 * land four hours early, which is enough to cross the 6am boundary and file a
 * strikeout under the wrong night. Resolve it against the house zone instead.
 *
 * Within the hour a DST change repeats or skips, the offset is taken from the
 * naive reading and can be an hour out; that is the usual trade for not
 * carrying a timezone library.
 */
export function fromHouseLocal(value: string, timeZone = HOUSE_TIMEZONE): Date {
  const naive = new Date(`${value}Z`);
  if (Number.isNaN(naive.getTime())) return new Date(NaN);
  return new Date(naive.getTime() - offsetMs(naive, timeZone));
}

/** The same mapping in JS, for labelling and for tests. */
export function houseDayOf(when: Date, timeZone = HOUSE_TIMEZONE): string {
  const local = new Date(
    when.toLocaleString("en-US", { timeZone }),
  );
  local.setHours(local.getHours() - DAY_STARTS_AT_HOUR);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Normalise whatever the driver hands back for a `date` column to YYYY-MM-DD.
 * node-postgres parses `date` into a JS Date at *local* midnight, so the local
 * getters give the right calendar day where toISOString would shift it.
 */
export function toHouseDayString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/** "Fri, Jul 10, 2026" style label for a house day. */
export function formatHouseDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    // The Date below is UTC midnight; format it in UTC or a timezone behind
    // UTC renders the previous day.
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
