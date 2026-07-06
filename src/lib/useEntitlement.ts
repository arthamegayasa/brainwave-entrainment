import { useCallback, useEffect, useState } from "react";
import { supabase, isPaymentsConfigured } from "./supabase";
import { fetchEntitlement, getUserEmail } from "./payments";
import type { Entitlement } from "./payments";
import { fetchProfile } from "./roles";
import type { Role } from "./roles";

export interface AuthEntitlementState {
  configured: boolean;
  loading: boolean;
  email: string | null;
  entitlement: Entitlement | null;
  isPremium: boolean;
  role: Role;
  refresh: () => Promise<void>;
}

/**
 * Local/demo role override: `localStorage.setItem("serenade.role.override",
 * "admin")` enables the Studio without a backend. This is a UI convenience
 * only — it is IGNORED when Supabase is configured (the server profile wins,
 * and RLS blocks all data access regardless of client UI state).
 */
function localRoleOverride(): Role {
  try {
    return localStorage.getItem("serenade.role.override") === "admin"
      ? "admin"
      : "user";
  } catch {
    return "user";
  }
}

/** Tracks auth session + the user's entitlement + role, reacting to sign-in/out. */
export function useEntitlement(): AuthEntitlementState {
  const [loading, setLoading] = useState(isPaymentsConfigured);
  const [email, setEmail] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [role, setRole] = useState<Role>(() =>
    isPaymentsConfigured ? "user" : localRoleOverride(),
  );

  const refresh = useCallback(async () => {
    if (!isPaymentsConfigured) return;
    const [mail, ent, profile] = await Promise.all([
      getUserEmail(),
      fetchEntitlement(),
      fetchProfile(),
    ]);
    setEmail(mail);
    setEntitlement(ent);
    setRole(profile?.role ?? "user");
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
    role,
    refresh,
  };
}
