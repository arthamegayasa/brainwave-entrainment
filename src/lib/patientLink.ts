import { supabase } from "./supabase";

/**
 * Patient-side clinician linking (quick-260714-a8a). Patients cannot read
 * their clinician's profile under the profiles RLS policy — the SECURITY
 * DEFINER RPCs (redeem_invite_code, get_my_clinician) are the only sanctioned
 * paths to the clinician's email.
 */

/**
 * Redeem an invite code. Success returns the clinician's email; failures come
 * back as `{ error }` with one of: invalid_code, expired, already_used,
 * already_linked, not_signed_in.
 */
export async function redeemInviteCode(
  code: string,
): Promise<{ clinicianEmail: string } | { error: string }> {
  if (!supabase) throw new Error("Clinician linking not configured");
  const { data, error } = await supabase.rpc("redeem_invite_code", {
    invite_code: code,
  });
  if (error) throw error;
  const result = data as { clinician_email?: string | null; error?: string } | null;
  if (result?.error) return { error: result.error };
  return { clinicianEmail: result?.clinician_email ?? "" };
}

/** The caller's linked clinician, or null when unlinked. */
export async function getMyClinician(): Promise<{ clinicianEmail: string } | null> {
  if (!supabase) throw new Error("Clinician linking not configured");
  const { data, error } = await supabase.rpc("get_my_clinician");
  if (error) throw error;
  const result = data as { clinician_email?: string | null } | null;
  if (!result) return null;
  return { clinicianEmail: result.clinician_email ?? "" };
}

/** Sever the link with the clinician (RLS permits deleting the own row). */
export async function unlinkMyClinician(): Promise<void> {
  if (!supabase) throw new Error("Clinician linking not configured");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("patient_links")
    .delete()
    .eq("patient_id", userData.user.id);
  if (error) throw error;
}

/**
 * Preset ids the linked clinician hid for this patient. Deliberately returns
 * [] instead of throwing when Supabase isn't configured or the user is signed
 * out, so Home can call it unconditionally with zero behavior change in
 * standalone builds.
 */
export async function getMyHiddenPresetIds(): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];
    const { data, error } = await supabase
      .from("template_visibility")
      .select("preset_id")
      .eq("patient_id", userData.user.id);
    if (error) return [];
    return ((data ?? []) as Array<{ preset_id: string }>).map((r) => r.preset_id);
  } catch {
    return [];
  }
}
