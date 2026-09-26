// Clinicians (#14, #15; ADR-014) for the account server functions. Deno-only
// (the service-role client), so it lives outside _shared; who may promote a
// User, set a Patient limit, Transfer Patients or remove the Clinician role
// is decided in _shared/accountRules.ts.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AccountRole, TransferRefusal, TransferTarget } from "../_shared/accountRules.ts";
import { UUID_PATTERN } from "./endpoint.ts";

/**
 * The account with that id as the Clinician rules read it: its role, Patient
 * limit and the Patients Linked to it. Null when there is none.
 */
export async function clinicianAccountOf(
  admin: SupabaseClient,
  accountId: string,
): Promise<TransferTarget | null> {
  if (!UUID_PATTERN.test(accountId)) return null;
  const [profile, links] = await Promise.all([
    admin.from("profiles").select("role, patient_limit").eq("user_id", accountId).maybeSingle(),
    admin
      .from("patient_links")
      .select("patient_id", { count: "exact", head: true })
      .eq("clinician_id", accountId),
  ]);
  if (profile.error) throw profile.error;
  if (links.error) throw links.error;
  if (profile.data === null) return null;
  return {
    id: accountId,
    // profiles_role_check admits exactly the AccountRole values.
    role: profile.data.role as AccountRole,
    patientCount: links.count ?? 0,
    patientLimit: profile.data.patient_limit,
  };
}

/** The Patients Linked to a Clinician (an Inactive Clinician's included). */
export async function patientIdsOf(admin: SupabaseClient, clinicianId: string): Promise<string[]> {
  if (!UUID_PATTERN.test(clinicianId)) return [];
  const { data, error } = await admin.from("patient_links").select("patient_id").eq("clinician_id", clinicianId);
  if (error) throw error;
  return data.map((link) => link.patient_id);
}

/** What transfer_patients() (0015) raises; the Admin-only refusal never comes from the database. */
type RaisedTransferRefusal = Exclude<TransferRefusal, "not_allowed">;

const RAISED_TRANSFER_REFUSALS: Record<RaisedTransferRefusal, true> = {
  not_linked: true,
  target_not_clinician: true,
  same_clinician: true,
  target_is_patient: true,
  patient_limit_reached: true,
};

/**
 * The refusal transfer_patients() raised, also from inside
 * remove_clinician_role() (0015), when the Links or roles changed after the
 * Account rules read them; null for any other error.
 */
export function transferRefusalOf(error: { message?: string }): RaisedTransferRefusal | null {
  const message = error.message ?? "";
  return Object.hasOwn(RAISED_TRANSFER_REFUSALS, message) ? (message as RaisedTransferRefusal) : null;
}
