import { useEffect, useState } from "react";
import { useEntitlement } from "../lib/useEntitlement";
import { signInWithEmail, signOut } from "../lib/payments";
import { getMyClinician, unlinkMyClinician } from "../lib/patientLink";
import { resetProgress } from "../state/progress";
import { resetPrefs } from "../state/prefs";

/**
 * AccountSheet (quick-260714-dc3): the single identity surface, opened from
 * the topbar account button. Hosts magic-link sign-in (moved here from the
 * Premium page), profile with plan/role chips, subscription with "Manage
 * plan", clinician connection status, settings resets, and sign out — the
 * Premium page stays a pure checkout surface.
 */

interface AccountSheetProps {
  onClose: () => void;
  /** Navigate to the Premium view (the caller closes the sheet). */
  onManagePlan: () => void;
  /** Navigate to the Library view (the caller closes the sheet). */
  onOpenLibrary: () => void;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function AccountSheet({
  onClose,
  onManagePlan,
  onOpenLibrary,
}: AccountSheetProps) {
  const ent = useEntitlement();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [clinician, setClinician] = useState<{ clinicianEmail: string } | null>(
    null,
  );

  const signedIn = ent.configured && ent.email !== null;

  // Fetch the linked clinician while signed in. Cancellation guard: a
  // sign-out mid-flight must not repopulate the previous account's link.
  useEffect(() => {
    if (!signedIn) {
      setClinician(null);
      return;
    }
    let cancelled = false;
    void getMyClinician()
      .then((c) => {
        if (!cancelled) setClinician(c);
      })
      .catch(() => {
        if (!cancelled) setClinician(null);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const flash = (text: string) => setNote(text);

  const sendLink = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await signInWithEmail(email.trim());
      setMsg("Check your email for a sign-in link.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not send the link");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (
      !window.confirm(
        "Disconnect from your clinician? Sessions they assigned will no longer appear.",
      )
    ) {
      return;
    }
    try {
      await unlinkMyClinician();
      setClinician(null);
      void ent.refresh();
      // The Library can stay mounted under this sheet with its own clinician
      // + assigned-audio state — tell it to refetch so it doesn't keep
      // showing "Connected" with stale, still-playable assigned sessions.
      window.dispatchEvent(new Event("serenade:clinician-changed"));
      flash("Disconnected.");
    } catch (e) {
      flash(
        e instanceof Error ? e.message : "Could not disconnect — try again later.",
      );
    }
  };

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

  // Plan chip: the entitlement tier when active, otherwise Free.
  const planLabel =
    ent.entitlement?.status === "active" &&
    (ent.entitlement.tier === "premium" || ent.entitlement.tier === "clinician")
      ? capitalize(ent.entitlement.tier)
      : "Free";

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

        {/* Signed out: magic-link sign-in (moved here from the Premium page). */}
        {ent.configured && !ent.loading && !ent.email && (
          <div className="account-section">
            <p className="account-copy">
              Sign in to sync your plan and receive sessions from your clinician
              — no password needed.
            </p>
            <div className="save-row">
              <input
                className="text-input"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email for sign-in"
              />
              <button
                className="chip"
                disabled={busy}
                onClick={() => void sendLink()}
              >
                {busy ? "Sending…" : "Send sign-in link"}
              </button>
            </div>
            {msg && <p className="plan-note account-note">{msg}</p>}
          </div>
        )}

        {/* Signed in: profile → subscription → clinician → settings → sign out. */}
        {ent.configured && !ent.loading && ent.email && (
          <>
            <div className="account-section">
              <h3>Profile</h3>
              <div className="account-row">
                <span className="account-avatar" aria-hidden>
                  {ent.email.charAt(0).toUpperCase()}
                </span>
                <span className="account-email">{ent.email}</span>
                <span className="chip small">{planLabel}</span>
                {(ent.role === "clinician" || ent.role === "admin") && (
                  <span className="chip small">{capitalize(ent.role)}</span>
                )}
              </div>
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
                  : "No active subscription — you're on Free."}
              </p>
              <button className="pill-btn" onClick={onManagePlan}>
                Manage plan
              </button>
            </div>

            {ent.role === "user" && (
              <div className="account-section">
                <h3>My clinician</h3>
                {clinician ? (
                  <>
                    <p className="account-copy">
                      Connected to {clinician.clinicianEmail || "your clinician"}
                    </p>
                    <button
                      className="chip small danger"
                      onClick={() => void disconnect()}
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <p className="account-copy">
                      Have an invite code from your clinician? Connect from your
                      Library.
                    </p>
                    <button className="pill-btn" onClick={onOpenLibrary}>
                      Open Library
                    </button>
                  </>
                )}
              </div>
            )}

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
