import { useCallback, useEffect, useState } from "react";
import { supabase, isPaymentsConfigured } from "./supabase";
import { fetchEntitlement, getUserEmail } from "./payments";
import type { Entitlement } from "./payments";

export interface AuthEntitlementState {
  configured: boolean;
  loading: boolean;
  email: string | null;
  entitlement: Entitlement | null;
  isPremium: boolean;
  refresh: () => Promise<void>;
}

/** Tracks auth session + the user's entitlement, reacting to sign-in/out. */
export function useEntitlement(): AuthEntitlementState {
  const [loading, setLoading] = useState(isPaymentsConfigured);
  const [email, setEmail] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  const refresh = useCallback(async () => {
    if (!isPaymentsConfigured) return;
    const [mail, ent] = await Promise.all([getUserEmail(), fetchEntitlement()]);
    setEmail(mail);
    setEntitlement(ent);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isPaymentsConfigured || !supabase) return;
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const isPremium =
    entitlement?.tier === "premium" && entitlement?.status === "active";

  return {
    configured: isPaymentsConfigured,
    loading,
    email,
    entitlement,
    isPremium,
    refresh,
  };
}
