// Links (ADR-014) for the account server functions. Deno-only (the
// service-role client), so it lives outside _shared; who may manage a Link is
// decided in _shared/accountRules.ts.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

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
