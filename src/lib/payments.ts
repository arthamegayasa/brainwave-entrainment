import { supabase } from "./supabase";
import type { BillingPeriod } from "../state/tier";

export interface Entitlement {
  tier: "free" | "premium" | "clinician";
  status: "active" | "inactive" | "pending" | "expired";
  billingPeriod: string | null;
  currentPeriodEnd: string | null;
}

/** Send a magic-link sign-in email (no passwords). */
export async function signInWithEmail(email: string): Promise<void> {
  if (!supabase) throw new Error("Payments not configured");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export async function getUserEmail(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

/** Read the signed-in user's entitlement row (null if none / signed out). */
export async function fetchEntitlement(): Promise<Entitlement | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("entitlements")
    .select("tier, status, billing_period, current_period_end")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    tier: data.tier,
    status: data.status,
    billingPeriod: data.billing_period,
    currentPeriodEnd: data.current_period_end,
  };
}

/**
 * Ask the backend to create a Midtrans Snap transaction for `plan` × `period`.
 * Returns the Snap token the client opens. Price is derived server-side.
 */
export async function createCheckout(
  plan: "premium" | "clinician",
  period: BillingPeriod,
): Promise<{ token: string; orderId: string }> {
  if (!supabase) throw new Error("Payments not configured");
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Please sign in first");

  const { data, error } = await supabase.functions.invoke("create-transaction", {
    body: { plan, period },
  });
  if (error) throw error;
  return { token: data.token, orderId: data.order_id };
}
