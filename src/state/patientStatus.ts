/**
 * Listening core, Patient Status (ADR-017; CONTEXT.md "Patient Status"): one
 * label for how a Patient listens right now, derived from the per-Patient
 * aggregates of the patient activity read (0012) so the rules live in one
 * place. Pure TypeScript — NO React, NO Supabase: `now` and the time zone are
 * passed in. Days are calendar days in the Patient's time zone, like the
 * report's.
 */

import { daysAgo } from "./listeningReport";

/** Checked in this order; the first that applies wins. */
export type PatientStatus = "new" | "not-started" | "quiet" | "stops-early" | "on-track";

export const PATIENT_STATUSES: readonly PatientStatus[] = ["new", "not-started", "quiet", "stops-early", "on-track"];

/** Not started, Quiet and Stops early: the Patients a Clinician should reach out to first. */
export function needsAttention(status: PatientStatus): boolean {
  return status === "not-started" || status === "quiet" || status === "stops-early";
}

/** One Patient's Listening History in aggregate, as the server's patient activity read returns it. */
export interface PatientActivity {
  /** When the Patient's account was created (ISO instant). */
  accountCreatedAt: string;
  /** Start of their latest Play (ISO instant); null when they never had one. */
  lastPlayAt: string | null;
  /** Zone of their latest Play, else of their latest Download; null without either. */
  timeZone: string | null;
  /** Plays in the last 7 days: today and the 6 days before it, in the Patient's zone. */
  plays7: number;
  /** Those of them stopped before the end. */
  stopped7: number;
  /** Time heard in those 7 days, pauses excluded. */
  listenedSec7: number;
  /** Time heard on each of those 7 days, oldest first, today last. */
  dailySec7: number[];
}

export interface StatusOptions {
  /** Epoch milliseconds. */
  now: number;
  /** IANA zone the days are counted in: the Patient's. */
  timeZone: string;
}

/** A Patient added this many days ago or fewer is New, listening or not. */
const NEW_FOR_DAYS = 3;

/** A Patient whose last Play is this many days ago or more is Quiet. */
const QUIET_AFTER_DAYS = 3;

/** A Patient Stops early with at least this many Plays in the last 7 days… */
const STOPS_EARLY_MIN_PLAYS = 2;
/** …and at least this share of them stopped. */
const STOPS_EARLY_SHARE = 0.5;

/** The Patient Status of `activity` at `now`: the first rule that applies, in the order of `PatientStatus`. */
export function patientStatus(activity: PatientActivity, opts: StatusOptions): PatientStatus {
  const { now, timeZone } = opts;
  if (daysAgo(activity.accountCreatedAt, now, timeZone) <= NEW_FOR_DAYS) return "new";
  if (activity.lastPlayAt === null) return "not-started";
  if (daysAgo(activity.lastPlayAt, now, timeZone) >= QUIET_AFTER_DAYS) return "quiet";
  if (activity.plays7 >= STOPS_EARLY_MIN_PLAYS && activity.stopped7 >= STOPS_EARLY_SHARE * activity.plays7) {
    return "stops-early";
  }
  return "on-track";
}
