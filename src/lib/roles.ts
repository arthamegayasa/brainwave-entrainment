import { supabase } from "./supabase";

/**
 * Three-role system (quick-260714-a8a): clinicians manage patients + an Audio
 * Bank; admins inherit clinician powers plus template publishing.
 */
export type Role = "user" | "clinician" | "admin";

/**
 * Read the signed-in user's profile (role + email) from Supabase.
 * Returns null when Supabase isn't configured or the user is signed out.
 * Any unexpected role value coerces to "user" — the client never grants
 * itself privileges the server didn't state explicitly.
 */
export async function fetchProfile(): Promise<{
  role: Role;
  email: string | null;
} | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("role, email")
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
    email: typeof data.email === "string" ? data.email : null,
  };
}
