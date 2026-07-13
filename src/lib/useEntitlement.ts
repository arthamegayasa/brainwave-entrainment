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
  /** True for clinicians AND admins — admins inherit clinician powers. */
  isClinician: boolean;
  role: Role;
  refresh: () => Promise<void>;
}

/**
 * Local/demo role override: `localStorage.setItem("serenade.role.override",
 * "admin")` (or "clinician") enables the Studio/Dashboard without a backend.
 * This is a UI convenience only — it is IGNORED when Supabase is configured
 * (the server profile wins, and RLS blocks all data access regardless of
 * client UI state).
 */
function localRoleOverride(): Role {
  try {
    const stored = localStorage.getItem("serenade.role.override");
    if (stored === "admin") return "admin";
    if (stored === "clinician") return "clinician";
    return "user";
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

  // Clinician entitlement counts as premium — a paid clinician gets everything
  // Premium has (D-04); the extra clinician surface is ROLE-gated below.
  const isPremium =
    (entitlement?.tier === "premium" || entitlement?.tier === "clinician") &&
    entitlement?.status === "active";
  const isClinician = role === "clinician" || role === "admin";

  return {
    configured: isPaymentsConfigured,
    loading,
    email,
    entitlement,
    isPremium,
    isClinician,
    role,
    refresh,
  };
}
