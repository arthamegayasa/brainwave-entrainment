import { daysAgo } from "../state/listeningReport";
import { patientStatus } from "../state/patientStatus";
import type { PatientActivity, PatientStatus } from "../state/patientStatus";

/**
 * How a Patient Status reads on screen (#12): its name and colour, and a
 * longer line with the days behind it, in the table and in the drawer.
 */

/** A Patient's Patient Status and how it reads in full ("Quiet for 5 days"). */
export interface StatusReading {
  status: PatientStatus;
  detail: string;
}

export const STATUS_NAMES: Record<PatientStatus, { label: string; tone: "ok" | "warn" | "alert" | "muted" }> = {
  new: { label: "New", tone: "muted" },
  "not-started": { label: "Not started", tone: "alert" },
  quiet: { label: "Quiet", tone: "warn" },
  "stops-early": { label: "Stops early", tone: "alert" },
  "on-track": { label: "On track", tone: "ok" },
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** The Patient Status of `activity` at `now`, with its days counted on the clock of `timeZone`. */
export function readStatus(activity: PatientActivity, now: number, timeZone: string): StatusReading {
  const status = patientStatus(activity, { now, timeZone });
  const addedDays = daysAgo(activity.accountCreatedAt, now, timeZone);
  switch (status) {
    case "new":
      return { status, detail: addedDays <= 0 ? "New · added today" : `New · added ${plural(addedDays, "day")} ago` };
    case "not-started":
      return { status, detail: `Not started · added ${plural(addedDays, "day")} ago` };
    case "quiet": {
      const quietDays = activity.lastPlayAt === null ? 0 : daysAgo(activity.lastPlayAt, now, timeZone);
      return { status, detail: `Quiet for ${plural(quietDays, "day")}` };
    }
    case "stops-early":
      return { status, detail: `Stopped early ${activity.stopped7} of ${activity.plays7}` };
    case "on-track":
      return { status, detail: "On track" };
  }
}

/** A coloured Patient Status pill: the status name (`short`), or how it reads in full. */
export function StatusPill({ reading, short = false }: { reading: StatusReading; short?: boolean }) {
  const { label, tone } = STATUS_NAMES[reading.status];
  return (
    <span className={`status-pill status-pill--${tone}`} title={reading.detail}>
      {short ? label : reading.detail}
    </span>
  );
}
