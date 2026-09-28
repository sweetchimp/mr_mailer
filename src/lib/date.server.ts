/**
 * Date-window helpers for the daily digest.
 *
 * "Today" means the server's local calendar day, which is also what
 * `getTodaysEvents` uses for the calendar query. `User` has no timezone column,
 * so on a host running in a different zone than the user the digest window will
 * be off. That is a known limitation rather than an oversight: the fix is a
 * per-user timezone (schema migration plus a settings control), which is too
 * broad to smuggle into a date-filter fix.
 */

export interface DateWindow {
  /** Inclusive start of the local calendar day. */
  start: Date;
  /** Exclusive end, i.e. now. Emails cannot arrive in the future. */
  end: Date;
}

export function startOfLocalDay(reference: Date = new Date()): Date {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function currentDayWindow(reference: Date = new Date()): DateWindow {
  return { start: startOfLocalDay(reference), end: new Date(reference) };
}

export function isWithinWindow(value: Date, window: DateWindow): boolean {
  const time = value.getTime();
  return time >= window.start.getTime() && time <= window.end.getTime();
}

/**
 * `YYYY/MM/DD` in local time, for Gmail's `after:` search operator.
 *
 * Gmail evaluates bare date operators in Pacific Time, not the server's zone,
 * so a local-midnight boundary lands on the wrong side of it depending on the
 * offset. Callers use this to build a deliberately generous lower bound and
 * narrow the result themselves; it is not an exact boundary on its own.
 */
export function toGmailDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/** The zone every user-facing timestamp in this app is rendered in. */
export const DISPLAY_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Wall-clock time of an instant, in the same local zone the rest of the app
 * treats as "the user's" time.
 *
 * Google returns event starts as absolute instants carrying the event's own UTC
 * offset (a meeting at 12:30+03:00 comes back as `12:30:00+03:00`). Rendering
 * that with `timeZone: "UTC"` showed 09:30 for a 12:30 meeting — a three-hour
 * error on every row. Passing no `timeZone` uses the runtime default, which is
 * the server's zone and matches every other timestamp on the dashboard.
 */
export function formatLocalTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: DISPLAY_TIMEZONE,
  });
}
