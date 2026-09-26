import { supabase } from "./supabase";
import { activityFromRow } from "./listening";
import type { ActivityRow } from "./listening";
import type { PatientActivity } from "../state/patientStatus";
import { shownEmail } from "../../supabase/functions/_shared/accountRules.ts";
import type { AccountRole, ClinicianOrigin } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * The Admin's aggregate read of every User (user_overview, 0013) for the
 * Clinicians & Patients tab: profile, role, Link and a week of listening per
 * User, without downloading anyone's Plays. Anyone but the Admin reads no rows.
 */

/** One User as the Admin's Clinicians & Patients tab lists them. */
export interface UserOverview {
  userId: string;
  /** Their name (profile display name); null when none was given. */
  name: string | null;
  username: string | null;
  /** The email to show; never an internal login email (ADR-018). */
  email: string | null;
  role: AccountRole;
  /** Where their Clinician role came from; null when none is recorded. */
  clinicianOrigin: ClinicianOrigin | null;
  /** The Patient limit on their profile (the Admin has none). */
  patientLimit: number;
  /** Their Link when they are a Patient; null otherwise. */
  link: { clinicianId: string; linkedAt: string; premiumGrant: boolean } | null;
  /** Custom Audio assigned to them. */
  assigned: number;
  activity: PatientActivity;
}

interface UserOverviewRow extends ActivityRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  contact_email: string | null;
  role: AccountRole;
  clinician_origin: ClinicianOrigin | null;
  patient_limit: number;
  clinician_id: string | null;
  linked_at: string | null;
  premium_grant: boolean | null;
  assigned_count: number;
}

/** Rows per request, within PostgREST's row cap (max_rows). */
const PAGE_ROWS = 500;

function toUserOverview(row: UserOverviewRow): UserOverview {
  return {
    userId: row.user_id,
    name: row.display_name,
    username: row.username,
    email: shownEmail({ loginEmail: row.email, contactEmail: row.contact_email }),
    role: row.role,
    clinicianOrigin: row.clinician_origin,
    patientLimit: row.patient_limit,
    link:
      row.clinician_id !== null && row.linked_at !== null
        ? { clinicianId: row.clinician_id, linkedAt: row.linked_at, premiumGrant: row.premium_grant === true }
        : null,
    assigned: row.assigned_count,
    activity: activityFromRow(row),
  };
}

/** Every User, a page at a time in the read's stable order. */
export async function loadUserOverview(): Promise<UserOverview[]> {
  if (!supabase) throw new Error("The Admin overview needs Supabase");
  const users: UserOverview[] = [];
  for (;;) {
    const { data, error } = await supabase
      .rpc("user_overview")
      .range(users.length, users.length + PAGE_ROWS - 1);
    if (error) throw error;
    const page = data as UserOverviewRow[];
    users.push(...page.map(toUserOverview));
    if (page.length < PAGE_ROWS) return users;
  }
}
