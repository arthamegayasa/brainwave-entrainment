import { useEffect } from "react";
import { fetchUsernameSuggestion } from "../lib/accounts";
import { generatePassword, PASSWORD_MIN_LENGTH } from "../../supabase/functions/_shared/accountRules.ts";
import type { UsernameLoginInput, UsernameLoginRefusal } from "../../supabase/functions/_shared/accountRules.ts";
import { PASSWORD_REFUSALS } from "./passwordMessages";
import { USERNAME_REFUSALS } from "./usernameMessages";

/**
 * The Username and password an existing account gets (#16; ADR-018), when the
 * Admin links it as a Patient or its Clinician adds them later: the Username
 * suggested from the person's name (editable), the password typed or
 * generated. With them the account signs in with an internal login email and
 * keeps its email as the contact email.
 */

/** Why a Username login was refused beyond who may add it, for the forms that add one. */
export const USERNAME_LOGIN_REFUSALS = {
  ...USERNAME_REFUSALS,
  ...PASSWORD_REFUSALS,
  email_registered: "Their email is already another account's contact email.",
} satisfies Record<UsernameLoginRefusal, string>;

/** What the owner reads once the account signs in with a Username and password. */
export const USERNAME_LOGIN_NOTE =
  "From now on they sign in with this username, or with their email, and this password.";

/** The fields before anything is typed. */
export const EMPTY_LOGIN: UsernameLoginInput = { username: "", password: "" };

export function UsernameLoginFields({
  login,
  onChange,
  suggestFrom,
}: {
  login: UsernameLoginInput;
  /** Takes an update of the fields, like a state setter. */
  onChange: (update: (login: UsernameLoginInput) => UsernameLoginInput) => void;
  /** The person's name, to suggest a Username from; null without one. */
  suggestFrom: string | null;
}) {
  // One suggestion when the fields open; it never replaces a typed Username,
  // and a failed one leaves the field to fill in.
  useEffect(() => {
    if (suggestFrom === null) return;
    let cancelled = false;
    void fetchUsernameSuggestion(suggestFrom)
      .then((suggested) => {
        if (cancelled || suggested === null) return;
        onChange((current) => (current.username === "" ? { ...current, username: suggested } : current));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [suggestFrom, onChange]);

  return (
    <>
      <label>
        Username
        <input
          className="text-input"
          value={login.username}
          onChange={(e) => {
            const username = e.target.value;
            onChange((current) => ({ ...current, username }));
          }}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nadia"
          required
        />
        <span className="field-hint">3–30 lowercase letters, numbers or hyphens. It also opens their Personal URL.</span>
      </label>
      <label>
        Password
        <span className="field-row">
          <input
            className="text-input"
            value={login.password}
            onChange={(e) => {
              const password = e.target.value;
              onChange((current) => ({ ...current, password }));
            }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            required
          />
          <button
            type="button"
            className="chip"
            onClick={() => {
              const password = generatePassword();
              onChange((current) => ({ ...current, password }));
            }}
          >
            Generate
          </button>
        </span>
      </label>
    </>
  );
}
