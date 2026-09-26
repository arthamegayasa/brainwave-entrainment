import { supabase } from "./supabase";
import { shownEmail } from "../../supabase/functions/_shared/accountRules.ts";
import type { AccountRole } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * Three-role system (quick-260714-a8a): clinicians manage patients + an Audio
 * Bank; admins inherit clinician powers plus template publishing. "Patient"
 * and "Regular" derive from Links, not from the role.
 */
export interface Profile {
  role: AccountRole;
  /**
   * The email to show: the contact email, or the login email unless it is an
   * internal one (ADR-018). Null for a Username account without an email.
   */
  email: string | null;
  displayName: string | null;
  username: string | null;
  /** The per-Clinician Patient limit on this profile. */
  patientLimit: number;
}

/**
 * Read the signed-in user's profile from Supabase.
 * Returns null when Supabase isn't configured or the user is signed out.
 * Any unexpected role value coerces to "user" — the client never grants
 * itself privileges the server didn't state explicitly.
 */
export async function fetchProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("role, email, display_name, username, contact_email, patient_limit")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    role:
      data.role === "admin"
        ? "admin"
        : data.role === "clinician"
          ? "clinician"
          : "user",
    email: shownEmail({ loginEmail: data.email, contactEmail: data.contact_email }),
    displayName: data.display_name,
    username: data.username,
    patientLimit: data.patient_limit,
  };
}
