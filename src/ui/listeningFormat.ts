/**
 * How Listening History reads on screen (ADR-017), shared by the report and
 * the Patients table. Times are always on the Patient's clock: pass their zone.
 */

const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** "22:14" on the clock of `timeZone`. */
export function formatTime(instant: string, timeZone: string): string {
  let f = timeFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    timeFormats.set(timeZone, f);
  }
  return f.format(Date.parse(instant));
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** A calendar day ("2026-09-22") as "Mon 22 Sep". */
export function formatDay(day: string): string {
  return dayFormat.format(Date.parse(`${day}T12:00:00Z`)).replace(",", "");
}

/** "28 min", "1 h", "1 h 35 min". */
export function formatMinutes(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 === 0 ? `${h} h` : `${h} h ${min % 60} min`;
}
