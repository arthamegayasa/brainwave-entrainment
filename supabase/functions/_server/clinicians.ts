// Clinicians (#14; ADR-014) for the account server functions. Deno-only (the
// service-role client), so it lives outside _shared; who may promote a User or
// set a Patient limit is decided in _shared/accountRules.ts.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AccountRole } from "../_shared/accountRules.ts";
import { UUID_PATTERN } from "./endpoint.ts";

/** An account's role and the Patients Linked to it, as the Clinician rules read them. */
export interface ClinicianAccount {
  role: AccountRole;
  patientCount: number;
}

/** The account with that id as the Clinician rules read it; null when there is none. */
export async function clinicianAccountOf(
  admin: SupabaseClient,
  accountId: string,
): Promise<ClinicianAccount | null> {
  if (!UUID_PATTERN.test(accountId)) return null;
  const [profile, links] = await Promise.all([
    admin.from("profiles").select("role").eq("user_id", accountId).maybeSingle(),
    admin
      .from("patient_links")
      .select("patient_id", { count: "exact", head: true })
      .eq("clinician_id", accountId),
  ]);
  if (profile.error) throw profile.error;
  if (links.error) throw links.error;
  if (profile.data === null) return null;
  // profiles_role_check admits exactly the AccountRole values.
  return { role: profile.data.role as AccountRole, patientCount: links.count ?? 0 };
}
