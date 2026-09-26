import { useCallback, useEffect, useState } from "react";
import { supabase, isPaymentsConfigured } from "./supabase";
import { fetchEntitlement } from "./payments";
import type { Entitlement } from "./payments";
import { fetchProfile } from "./roles";
import type { Profile } from "./roles";
import { hasClinicianPowers, patientLimitOf } from "../../supabase/functions/_shared/accountRules.ts";
import type { AccountRole } from "../../supabase/functions/_shared/accountRules.ts";

export interface AuthEntitlementState {
  configured: boolean;
  loading: boolean;
  signedIn: boolean;
  /**
   * The signed-in account's email to show, never its internal login email
   * (ADR-018): null for a Username account without a contact email.
   */
  email: string | null;
  /** How the signed-in account reads to its owner: name, else email, else Username. */
  accountName: string | null;
  username: string | null;
  entitlement: Entitlement | null;
  isPremium: boolean;
  /** True for clinicians AND admins — admins inherit clinician powers. */
  isClinician: boolean;
  role: AccountRole;
  /** Most Patients this Clinician may have; null means no limit (the Admin). */
  patientLimit: number | null;
  refresh: () => Promise<void>;
}

/**
 * Local/demo role override: `localStorage.setItem("serenade.role.override",
 * "admin")` (or "clinician") enables the Studio/Dashboard without a backend.
 * This is a UI convenience only — it is IGNORED when Supabase is configured
 * (the server profile wins, and RLS blocks all data access regardless of
 * client UI state).
 */
function localRoleOverride(): AccountRole {
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
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [demoRole] = useState<AccountRole>(() =>
    isPaymentsConfigured ? "user" : localRoleOverride(),
  );

  const refresh = useCallback(async () => {
    if (!isPaymentsConfigured || !supabase) return;
    const [user, ent, prof] = await Promise.all([
      supabase.auth.getUser(),
      fetchEntitlement(),
      fetchProfile(),
    ]);
    setSignedIn(user.data.user !== null);
    setEntitlement(ent);
    setProfile(prof);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isPaymentsConfigured || !supabase) return;
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const role = isPaymentsConfigured ? (profile?.role ?? "user") : demoRole;
  const username = profile?.username ?? null;

  // Clinician entitlement counts as premium — a paid clinician gets everything
  // Premium has (D-04); the extra clinician surface is ROLE-gated below.
  const isPremium =
    (entitlement?.tier === "premium" || entitlement?.tier === "clinician") &&
    entitlement?.status === "active";

  return {
    configured: isPaymentsConfigured,
    loading,
    signedIn,
    email: profile?.email ?? null,
    accountName: profile?.displayName ?? profile?.email ?? username,
    username,
    entitlement,
    isPremium,
    isClinician: hasClinicianPowers(role),
    role,
    patientLimit: profile === null ? null : patientLimitOf(profile),
    refresh,
  };
}
