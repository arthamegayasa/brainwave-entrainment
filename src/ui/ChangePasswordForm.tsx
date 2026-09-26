import { useState } from "react";
import type { FormEvent } from "react";
import { AccountError, changeOwnPassword } from "../lib/accounts";
import { PASSWORD_MIN_LENGTH } from "../../supabase/functions/_shared/accountRules.ts";
import type { ChangePasswordError } from "../../supabase/functions/_shared/accountRules.ts";
import { PASSWORD_REFUSALS } from "./passwordMessages";

/**
 * Account → Password, for Patients who sign in with a password (#8,
 * ADR-015). The change goes through the server so the password copy follows
 * it; the line under the field says the Clinician can see it, without a popup.
 */

// Every refusal must have a message (satisfies); lookups take any server code.
const ERRORS: Partial<Record<string, string>> = {
  ...PASSWORD_REFUSALS,
} satisfies Record<ChangePasswordError, string>;
const UNEXPECTED_ERROR = "Could not change your password — try again later.";

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < PASSWORD_MIN_LENGTH) {
      setMsg(PASSWORD_REFUSALS.password_too_short);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await changeOwnPassword(password);
      setPassword("");
      setMsg("Password changed ✓ Use it the next time you sign in.");
    } catch (err) {
      const code = err instanceof AccountError ? err.code : "";
      setMsg(ERRORS[code] ?? UNEXPECTED_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="account-section" onSubmit={(e) => void submit(e)} noValidate>
      <h3>Password</h3>
      <div className="save-row">
        <input
          className="text-input"
          type="password"
          autoComplete="new-password"
          placeholder="New password"
          aria-label="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="chip" type="submit" disabled={busy || password.length === 0}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </div>
      <p className="plan-note account-note">Your clinician can see this password.</p>
      {msg && (
        <p className="plan-note account-note" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
