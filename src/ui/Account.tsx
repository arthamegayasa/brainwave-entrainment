import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useEntitlement } from "../lib/useEntitlement";
import { signInWithEmail, signOut } from "../lib/payments";
import { AccountError, resolveLogin, signInWithPassword } from "../lib/accounts";
import { resetProgress } from "../state/progress";
import { resetPrefs } from "../state/prefs";
import { activeSubscriptionTier } from "../state/tier";
import { parseLoginIdentifier } from "../../supabase/functions/_shared/accountRules.ts";
import type { ResolveLoginError } from "../../supabase/functions/_shared/accountRules.ts";
import { passwordRefusal, SIGN_IN_UNAVAILABLE } from "./signInMessages";
import { ChangePasswordForm } from "./ChangePasswordForm";

/**
 * AccountSheet (quick-260714-dc3): the single identity surface, opened from
 * the topbar account button. Hosts sign-in (email or Username; ADR-018),
 * profile with plan/role chips, subscription with "Manage plan", the
 * Patient's Clinician (read-only), settings resets, and sign out — the
 * Premium page stays a pure checkout surface.
 */

interface AccountSheetProps {
  onClose: () => void;
  /** Navigate to the Premium view (the caller closes the sheet). */
  onManagePlan: () => void;
  /** Navigate to the privacy policy (the caller closes the sheet). */
  onOpenPrivacy: () => void;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function AccountSheet({
  onClose,
  onManagePlan,
  onOpenPrivacy,
}: AccountSheetProps) {
  const ent = useEntitlement();
  const [note, setNote] = useState<string | null>(null);
  const flash = (text: string) => setNote(text);

  const handleResetProgress = () => {
    if (
      !window.confirm(
        "Reset your journey, streaks and completed sessions? This cannot be undone.",
      )
    ) {
      return;
    }
    resetProgress();
    flash("Progress reset.");
  };

  const handleResetPrefs = () => {
    if (
      !window.confirm(
        "Reset your preferences (volumes, duration, listening mode)?",
      )
    ) {
      return;
    }
    resetPrefs();
    flash("Preferences reset.");
  };

  // Plan chip: the subscription tier when active, else Premium from the
  // Clinician's grant, otherwise Free.
  const subscribedTier = activeSubscriptionTier(ent.entitlement);
  const planLabel = subscribedTier ? capitalize(subscribedTier) : ent.isPremium ? "Premium" : "Free";
  const premiumFromClinician = ent.link?.premiumGrant === true;

  const settingsSection = (
    <div className="account-section">
      <h3>Settings</h3>
      <div className="save-row">
        <button className="chip small danger" onClick={handleResetProgress}>
          Reset journey &amp; progress
        </button>
        <button className="chip small danger" onClick={handleResetPrefs}>
          Reset preferences
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Account">
        <h2>Your account</h2>

        {/* Standalone build: no cloud backend, identity is unavailable. */}
        {!ent.configured && (
          <>
            <p className="account-copy">
              Accounts need the cloud backend — this build runs fully offline.
            </p>
            {settingsSection}
          </>
        )}

        {ent.configured && ent.loading && <p className="account-copy">Loading…</p>}

        {/* Signed out: email or Username sign-in (ADR-018). */}
        {ent.configured && !ent.loading && !ent.signedIn && (
          <SignInForm onOpenPrivacy={onOpenPrivacy} />
        )}

        {/* Signed in: profile → subscription → clinician → settings → sign out. */}
        {ent.configured && !ent.loading && ent.signedIn && (
          <>
            <div className="account-section">
              <h3>Profile</h3>
              <div className="account-row">
                <span className="account-avatar" aria-hidden>
                  {(ent.accountName ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="account-email">
                  {ent.accountName}
                  {ent.username && (
                    <span className="account-username">
                      @{ent.username}
                      {ent.email && ent.email !== ent.accountName && ` · ${ent.email}`}
                    </span>
                  )}
                </span>
                <span className="chip small">{planLabel}</span>
                {(ent.role === "clinician" || ent.role === "admin") && (
                  <span className="chip small">{capitalize(ent.role)}</span>
                )}
              </div>
              {premiumFromClinician && (
                <p className="account-copy">Premium from your clinician</p>
              )}
            </div>

            <div className="account-section">
              <h3>Subscription</h3>
              <p className="account-copy">
                {/* Key on status too: a canceled/expired sub keeps its old
                    current_period_end — that date must not read as "Active"
                    right under a plan chip that says Free. */}
                {ent.entitlement?.status === "active" &&
                ent.entitlement.currentPeriodEnd
                  ? `Active until ${new Date(ent.entitlement.currentPeriodEnd).toLocaleDateString()}`
                  : premiumFromClinician
                    ? "No active subscription."
                    : "No active subscription — you're on Free."}
              </p>
              <button className="pill-btn" onClick={onManagePlan}>
                Manage plan
              </button>
            </div>

            {ent.link && (
              <div className="account-section">
                <h3>My clinician</h3>
                <p className="account-copy">
                  Connected to {ent.link.clinicianName ?? "your clinician"}
                </p>
              </div>
            )}

            {/* Patients who sign in with a password (ADR-015, ADR-018). */}
            {ent.link && ent.username !== null && <ChangePasswordForm />}

            {settingsSection}

            <div className="account-section">
              <button
                className="pill-btn"
                onClick={() => {
                  // useEntitlement's auth listener updates every instance
                  // app-wide — closing is all the sheet needs to do.
                  void signOut();
                  onClose();
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}

        {note && <p className="plan-note account-note">{note}</p>}
      </div>
    </div>
  );
}

// Every resolve-login refusal must have a message (satisfies).
const SIGN_IN_ERRORS: Partial<Record<string, string>> = {
  unknown_username: "No account uses that username.",
  invalid_identifier: "Enter your email or username.",
} satisfies Record<ResolveLoginError, string>;

/**
 * Email-or-Username sign-in. The resolve-login endpoint says how the account
 * signs in: password accounts (Patients with a Username, even when they type
 * their contact email) get a password step and Supabase's own password
 * sign-in; everyone else gets a magic link, as before.
 */
function SignInForm({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  const [identifier, setIdentifier] = useState("");
  // Set once the identifier resolved to a password account.
  const [loginEmail, setLoginEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loginEmail !== null) passwordRef.current?.focus();
  }, [loginEmail]);

  const changeIdentifier = (value: string) => {
    setIdentifier(value);
    setLoginEmail(null);
    setPassword("");
    setMsg(null);
  };

  const continueWithIdentifier = async () => {
    const parsed = parseLoginIdentifier(identifier);
    if (parsed === null) {
      setMsg(SIGN_IN_ERRORS.invalid_identifier ?? SIGN_IN_UNAVAILABLE);
      return;
    }
    const login = await resolveLogin(identifier);
    if (login.method === "password") {
      setLoginEmail(login.loginEmail);
    } else if (parsed.kind === "email") {
      await signInWithEmail(parsed.email);
      setMsg("Check your email for a sign-in link.");
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      if (loginEmail === null) {
        await continueWithIdentifier();
      } else {
        // Success needs no handling: every useEntitlement instance re-reads
        // on the auth state change and this form unmounts.
        await signInWithPassword(loginEmail, password);
      }
    } catch (err) {
      if (err instanceof AccountError) {
        setMsg(SIGN_IN_ERRORS[err.code] ?? SIGN_IN_UNAVAILABLE);
      } else {
        setMsg(passwordRefusal(err) ?? (err instanceof Error ? err.message : "Could not sign in"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="account-section" onSubmit={(e) => void submit(e)}>
      <p className="account-copy">
        Sign in to sync your plan and receive sessions from your clinician.
        Most accounts get a sign-in link by email; if your clinician gave you a
        username, you'll use your password.
      </p>
      <div className="save-row">
        <input
          className="text-input"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Email or username"
          value={identifier}
          onChange={(e) => changeIdentifier(e.target.value)}
          aria-label="Email or username"
        />
        {loginEmail === null && (
          <button className="chip" type="submit" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        )}
      </div>
      {loginEmail !== null && (
        <div className="save-row">
          <input
            ref={passwordRef}
            className="text-input"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
          />
          <button className="chip" type="submit" disabled={busy || password.length === 0}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      )}
      {msg && (
        <p className="plan-note account-note" role="status">
          {msg}
        </p>
      )}
      <p className="plan-note account-note">
        How we handle your data:{" "}
        <button type="button" className="link-btn" onClick={onOpenPrivacy}>
          Privacy policy
        </button>
      </p>
    </form>
  );
}
