import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useEntitlement } from "../lib/useEntitlement";
import { openPersonalUrl, signInWithPassword } from "../lib/accounts";
import type { PersonalUrlLogin } from "../lib/accounts";
import { passwordRefusal, SIGN_IN_UNAVAILABLE } from "./signInMessages";
import { personalUrlPath } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * Personal URL page (ADR-016): /p/<username> greets the Patient by first name
 * and asks for one password; signing in opens their Library. A device already
 * signed in to that account skips the password. The old Username of a renamed
 * account redirects to its current one (#7). A Username nobody has shows a
 * neutral "Link not found" that never hints whether it ever existed.
 */

type Lookup =
  | { state: "loading" }
  | { state: "found"; login: PersonalUrlLogin }
  | { state: "not_found" }
  | { state: "unavailable" };

interface PersonalUrlProps {
  /** The Username the path names; null when it names no valid one. */
  username: string | null;
  /** Opens the Library: the owner of this Personal URL is signed in here. */
  onEnter: () => void;
  /** Leaves the page for the SwaraSanti homepage. */
  onLeave: () => void;
}

export function PersonalUrl({ username, onEnter, onLeave }: PersonalUrlProps) {
  const ent = useEntitlement();
  const [lookup, setLookup] = useState<Lookup>({ state: "loading" });
  // Bumped by "Try again" after the lookup could not reach the server.
  const [attempt, setAttempt] = useState(0);
  // The Username that opened: after a redirect, the account's current one.
  const openedUsername = lookup.state === "found" ? lookup.login.username : username;
  const signedInHere =
    openedUsername !== null && ent.signedIn && ent.username === openedUsername;

  useEffect(() => {
    if (signedInHere) onEnter();
  }, [signedInHere, onEnter]);

  useEffect(() => {
    if (!ent.configured || username === null) return;
    let cancelled = false;
    openPersonalUrl(username)
      .then((login) => {
        if (!cancelled) setLookup(login ? { state: "found", login } : { state: "not_found" });
      })
      .catch(() => {
        if (!cancelled) setLookup({ state: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [ent.configured, username, attempt]);

  // Redirect: the address shows the current Username, so a reload or a
  // bookmark goes straight there.
  useEffect(() => {
    if (openedUsername !== null && openedUsername !== username) {
      window.history.replaceState(null, "", personalUrlPath(openedUsername));
    }
  }, [openedUsername, username]);

  const retry = () => {
    setLookup({ state: "loading" });
    setAttempt((n) => n + 1);
  };

  let content;
  if (!ent.configured) {
    content = (
      <Notice
        title="Sign-in isn't available here"
        text="Signing in needs the cloud backend — this build runs fully offline."
        action="Go to SwaraSanti"
        onAction={onLeave}
      />
    );
  } else if (username === null || lookup.state === "not_found") {
    content = (
      <Notice
        title="Link not found"
        text="This address doesn't open a SwaraSanti account. Check it with the person who sent it."
        action="Go to SwaraSanti"
        onAction={onLeave}
      />
    );
  } else if (ent.loading || signedInHere || lookup.state === "loading") {
    content = (
      <p className="personal-url-text" role="status">
        One moment…
      </p>
    );
  } else if (lookup.state === "unavailable") {
    content = (
      <Notice
        title="Can't reach SwaraSanti right now"
        text="Check your connection and try again."
        action="Try again"
        onAction={retry}
      />
    );
  } else {
    content = (
      <PasswordForm
        login={lookup.login}
        signedInAs={ent.signedIn ? (ent.accountName ?? "another account") : null}
        onSignedIn={onEnter}
      />
    );
  }

  return <section className="personal-url">{content}</section>;
}

function Notice({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <>
      <h1>{title}</h1>
      <p className="personal-url-text">{text}</p>
      <button className="start-btn compact" onClick={onAction}>
        {action}
      </button>
    </>
  );
}

function PasswordForm({
  login,
  signedInAs,
  onSignedIn,
}: {
  login: PersonalUrlLogin;
  /** Who this device is signed in as, when that is another account. */
  signedInAs: string | null;
  onSignedIn: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(login.loginEmail, password);
      onSignedIn();
    } catch (err) {
      setError(passwordRefusal(err) ?? SIGN_IN_UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="personal-url-form" onSubmit={(e) => void submit(e)}>
      <h1>{login.firstName ? `Hi, ${login.firstName}` : "Welcome"}</h1>
      <p className="personal-url-text">Enter your password to open your Library.</p>
      {signedInAs && (
        <p className="personal-url-text">
          This device is signed in as {signedInAs}. Signing in here switches accounts.
        </p>
      )}
      {/* Lets password managers file the password under this Username. */}
      <input type="text" autoComplete="username" value={login.username} readOnly hidden />
      <input
        className="text-input"
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        aria-label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
      />
      <button className="start-btn" type="submit" disabled={busy || password.length === 0}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error && (
        <p className="personal-url-alert form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
