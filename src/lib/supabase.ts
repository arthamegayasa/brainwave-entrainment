import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client — created only when payment env vars are present. The app runs
 * fully standalone without them (payments are additive); UI branches on
 * `isPaymentsConfigured` so nothing breaks when the backend isn't wired.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isPaymentsConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isPaymentsConfigured
  ? createClient(url!, anonKey!)
  : null;

export const MIDTRANS_CLIENT_KEY = import.meta.env.VITE_MIDTRANS_CLIENT_KEY as
  | string
  | undefined;

/** Sandbox vs production Snap.js host (sandbox client keys start with "SB-"). */
export const MIDTRANS_IS_SANDBOX = (MIDTRANS_CLIENT_KEY ?? "").startsWith("SB-");
