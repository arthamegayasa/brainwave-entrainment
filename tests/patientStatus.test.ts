import { describe, it, expect } from "vitest";
import { PATIENT_STATUSES, needsAttention, patientStatus } from "../src/state/patientStatus";
import type { PatientActivity } from "../src/state/patientStatus";

const WIB = "Asia/Jakarta";

/** Saturday 26 September 2026, 21:30 WIB. */
const NOW = Date.parse("2026-09-26T21:30:00+07:00");

/** A Patient's activity as the roster read returns it: added at `added`, no Play unless given. */
function activity(added: string, rest: Partial<Omit<PatientActivity, "accountCreatedAt">> = {}): PatientActivity {
  return {
    accountCreatedAt: added,
    lastPlayAt: null,
    timeZone: WIB,
    plays7: 0,
    stopped7: 0,
    listenedSec7: 0,
    dailySec7: [0, 0, 0, 0, 0, 0, 0],
    ...rest,
  };
}

const statusOf = (a: PatientActivity, timeZone = WIB) => patientStatus(a, { now: NOW, timeZone });

describe("Patient Status", () => {
  it("is New up to 3 days after the account was added, and Not started from the 4th day without a Play", () => {
    expect(statusOf(activity("2026-09-26T08:00:00+07:00"))).toBe("new");
    expect(statusOf(activity("2026-09-23T00:05:00+07:00"))).toBe("new");
    expect(statusOf(activity("2026-09-22T23:55:00+07:00"))).toBe("not-started");
  });

  it("is Quiet once the last Play is 3 days ago, and On track while it is 2 days ago", () => {
    const added = "2026-09-01T10:00:00+07:00";
    expect(statusOf(activity(added, { lastPlayAt: "2026-09-24T23:50:00+07:00", plays7: 1 }))).toBe("on-track");
    expect(statusOf(activity(added, { lastPlayAt: "2026-09-23T23:50:00+07:00", plays7: 1 }))).toBe("quiet");
  });

  it("Stops early from 2 Plays in the last 7 days with half or more of them stopped", () => {
    const listening = (plays7: number, stopped7: number) =>
      statusOf(activity("2026-09-01T10:00:00+07:00", { lastPlayAt: "2026-09-26T20:00:00+07:00", plays7, stopped7 }));
    expect(listening(1, 1)).toBe("on-track");
    expect(listening(2, 1)).toBe("stops-early");
    expect(listening(2, 2)).toBe("stops-early");
    expect(listening(3, 1)).toBe("on-track");
    expect(listening(4, 2)).toBe("stops-early");
    expect(listening(5, 2)).toBe("on-track");
  });

  it("checks New, Not started, Quiet, Stops early in that order: the first that applies wins", () => {
    const quietAndStopping = { lastPlayAt: "2026-09-23T20:00:00+07:00", plays7: 2, stopped7: 2 };
    // Added 3 days ago and silent for 3 days, with every Play stopped: still New.
    expect(statusOf(activity("2026-09-23T19:00:00+07:00", quietAndStopping))).toBe("new");
    // Added long ago: Quiet comes before Stops early.
    expect(statusOf(activity("2026-09-01T10:00:00+07:00", quietAndStopping))).toBe("quiet");
  });

  it("counts days in the Patient's zone: a Play at 23:30 WIB is already the next day in WITA", () => {
    // Tuesday 22 Sep 23:30 WIB = Wednesday 23 Sep 00:30 WITA. On Friday 25 Sep at
    // 21:30 WIB (22:30 WITA) that is 3 days ago in WIB but 2 days ago in WITA.
    const a = activity("2026-09-01T10:00:00+07:00", { lastPlayAt: "2026-09-22T23:30:00+07:00", plays7: 1 });
    const friday = Date.parse("2026-09-25T21:30:00+07:00");
    expect(patientStatus(a, { now: friday, timeZone: WIB })).toBe("quiet");
    expect(patientStatus(a, { now: friday, timeZone: "Asia/Makassar" })).toBe("on-track");
  });

  it("Needs attention when Not started, Quiet or Stops early; not when New or On track", () => {
    expect(PATIENT_STATUSES.filter(needsAttention)).toEqual(["not-started", "quiet", "stops-early"]);
  });
});
