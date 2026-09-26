import { isAuthError } from "@supabase/supabase-js";

/** Shown when signing in fails for a reason the person cannot fix. */
export const SIGN_IN_UNAVAILABLE = "Sign-in is unavailable right now — try again later.";

/**
 * What a refused password sign-in tells the person, and nothing more: a wrong
 * password, or too many attempts (Supabase Auth's rate limit). Null for any
 * other failure.
 */
export function passwordRefusal(err: unknown): string | null {
  if (!isAuthError(err)) return null;
  if (err.code === "invalid_credentials") return "Wrong password — try again.";
  if (err.status === 429) return "Too many attempts — wait a moment and try again.";
  return null;
}
