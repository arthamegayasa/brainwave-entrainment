// Links (ADR-014) for the account server functions. Deno-only (the
// service-role client), so it lives outside _shared; who may manage a Link is
// decided in _shared/accountRules.ts.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { LinkExistingAccountRefusal } from "../_shared/accountRules.ts";

/** The Clinician of the account's Link; null without a Link. */
export async function linkedClinicianOf(admin: SupabaseClient, accountId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("patient_links")
    .select("clinician_id")
    .eq("patient_id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data?.clinician_id ?? null;
}

/**
 * What link_existing_patient() (0016) raises itself; the Admin-only refusal
 * never comes from the database, and has_username comes from
 * add_username_login() inside it (usernameLoginRefusalOf).
 */
type RaisedLinkRefusal = Exclude<LinkExistingAccountRefusal, "not_allowed" | "has_username">;

const RAISED_LINK_REFUSALS: Record<RaisedLinkRefusal, true> = {
  account_is_admin: true,
  already_linked: true,
  target_is_account: true,
  target_not_clinician: true,
  patient_limit_reached: true,
};

/**
 * The refusal link_existing_patient() raised when the account, the Clinician
 * or their Links changed after the Account rules read them; null for any
 * other error.
 */
export function linkRefusalOf(error: { message?: string }): RaisedLinkRefusal | null {
  const message = error.message ?? "";
  return Object.hasOwn(RAISED_LINK_REFUSALS, message) ? (message as RaisedLinkRefusal) : null;
}
