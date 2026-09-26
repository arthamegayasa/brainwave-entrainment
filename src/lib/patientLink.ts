import { supabase } from "./supabase";
import { shownEmail } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * The Patient's side of a Link (ADR-014). A Patient cannot read their
 * Clinician's profile under the profiles RLS policy: the get_my_clinician()
 * definer function is the sanctioned path to the Clinician's name. Only the
 * Clinician or the Admin ends a Link; the Patient cannot.
 */

/** The signed-in User's Link, as its Patient sees it. */
export interface MyLink {
  /** The Clinician's name, else their email; null when neither is on file. */
  clinicianName: string | null;
  /** Whether the Link carries the Premium grant from the Clinician. */
  premiumGrant: boolean;
}

/**
 * The signed-in User's Link to their Clinician. Null when they are not a
 * Patient, are signed out, or the Link cannot be read right now.
 */
export async function fetchMyLink(): Promise<MyLink | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase.rpc("get_my_clinician");
  if (error || !data) return null;
  const link = data as {
    name: string | null;
    email: string | null;
    contact_email: string | null;
    premium_grant: boolean;
  };
  return {
    clinicianName:
      link.name ?? shownEmail({ loginEmail: link.email, contactEmail: link.contact_email }),
    premiumGrant: link.premium_grant,
  };
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
