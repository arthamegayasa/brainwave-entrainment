import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { AccountError, linkPatient } from "../lib/accounts";
import { loadUserOverview } from "../lib/userOverview";
import type { UserOverview } from "../lib/userOverview";
import {
  accountLabel,
  checkUsernameLogin,
  mayLinkExistingAccount,
} from "../../supabase/functions/_shared/accountRules.ts";
import type {
  AccountRole,
  LinkPatientError,
  UsernameLoginInput,
} from "../../supabase/functions/_shared/accountRules.ts";
import { candidateLabel } from "./TransferForm";
import type { TransferCandidate } from "./TransferForm";
import {
  EMPTY_LOGIN,
  USERNAME_LOGIN_NOTE,
  USERNAME_LOGIN_REFUSALS,
  UsernameLoginFields,
} from "./UsernameLoginFields";

/**
 * "Link to clinician…" (#16; ADR-014): the Admin makes an existing User the
 * Patient of a Clinician (or of the Admin), from the User's drawer or from a
 * Clinician's list of Patients. Any User may become a Patient, a Clinician
 * too since roles overlap, never the Admin account. The Admin may add a
 * Username and password in the same step (ADR-018). Clinicians never link an
 * existing account: "+ New patient" tells them the email is registered. The
 * server decides; the Account rules here only give quick feedback.
 */

/** Someone in the people list, as "Link to clinician…" reads them. */
export interface LinkableAccount {
  id: string;
  role: AccountRole;
  /** The Clinician of their Link; null when they are nobody's Patient. */
  clinicianId: string | null;
  /** How the list shows them: name, else email, else @Username. */
  label: string;
  /** Their roles and email, to tell people with the same name apart. */
  detail: string;
  /** Their name as given, to suggest a Username from; null without one. */
  name: string | null;
  username: string | null;
}

/** A Link the Admin just made, with the sign-in it added (null without one). */
export interface MadeLink {
  account: LinkableAccount;
  clinician: TransferCandidate;
  login: UsernameLoginInput | null;
}

/** What went wrong with a Link, for the Admin to read. */
function linkErrorMessage(code: string, clinicianName: string): string {
  // Every refusal must have a message (satisfies); lookups take any server code.
  const messages: Partial<Record<string, string>> = {
    ...USERNAME_LOGIN_REFUSALS,
    not_allowed: "Only the Admin can link an existing account.",
    account_is_admin: "The Admin account can never be a patient.",
    already_linked: "They already have a clinician: Transfer them instead.",
    target_is_account: "Nobody can be their own patient: choose another clinician.",
    target_not_clinician: `${clinicianName} no longer holds the clinician role.`,
    patient_limit_reached: `${clinicianName} has no room for another patient. Raise their limit or choose someone else.`,
    has_username: "They already have a username: link them without a new one.",
  } satisfies Record<LinkPatientError, string>;
  return messages[code] ?? "Could not link them — try again later.";
}

/**
 * How the Account rules read a Link of `account` to `clinician` without a
 * Username login: allowed, refused only by the Clinician's limit (shown as
 * full), or refused.
 */
function linkCheck(account: LinkableAccount, clinician: TransferCandidate): "ok" | "full" | "refused" {
  const check = mayLinkExistingAccount({ actor: { role: "admin" }, account, clinician, usernameLogin: false });
  if (check.ok) return "ok";
  return check.reason === "patient_limit_reached" ? "full" : "refused";
}

/**
 * The part both entry points share: who is linked to whom (chosen through
 * `picker`), the optional Username and password, and the Link itself.
 */
function LinkPatientForm({
  account,
  clinician,
  picker,
  missingChoice,
  onLinked,
  onClose,
}: {
  /** The account to link; null until chosen. */
  account: LinkableAccount | null;
  /** Their new Clinician; null until chosen. */
  clinician: TransferCandidate | null;
  /** The field that chooses the side not fixed. */
  picker: ReactNode;
  /** What to ask for while a side is missing. */
  missingChoice: string;
  onLinked: (link: MadeLink) => Promise<void>;
  onClose: () => void;
}) {
  const [withLogin, setWithLogin] = useState(false);
  const [login, setLogin] = useState(EMPTY_LOGIN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Another account starts from empty fields and its own Username suggestion.
  const [loginFor, setLoginFor] = useState(account?.id ?? null);
  if ((account?.id ?? null) !== loginFor) {
    setLoginFor(account?.id ?? null);
    setLogin(EMPTY_LOGIN);
    setError(null);
  }
  const addsLogin = withLogin && account?.username === null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (account === null || clinician === null) {
      setError(missingChoice);
      return;
    }
    const checked = addsLogin ? checkUsernameLogin(login) : { ok: true as const, login: null };
    if (!checked.ok) {
      setError(USERNAME_LOGIN_REFUSALS[checked.error]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await linkPatient(account.id, clinician.id, checked.login);
      const added = checked.login && result.username ? { ...checked.login, username: result.username } : null;
      await onLinked({ account, clinician, login: added });
    } catch (err) {
      setError(linkErrorMessage(err instanceof AccountError ? err.code : "", clinician.name));
      setBusy(false);
    }
  };

  return (
    <form className="new-patient-form" onSubmit={(e) => void submit(e)} noValidate>
      {picker}
      {account?.username ? (
        <p className="library-note">They keep their username @{account.username} and their own password.</p>
      ) : (
        <label className="check-row">
          <input type="checkbox" checked={withLogin} onChange={(e) => setWithLogin(e.target.checked)} />
          Also give them a username and password
        </label>
      )}
      {addsLogin && account !== null && (
        <>
          <UsernameLoginFields key={account.id} login={login} onChange={setLogin} suggestFrom={account.name} />
          <p className="library-note">{USERNAME_LOGIN_NOTE}</p>
        </>
      )}
      {error && (
        <p className="library-note form-error" role="alert">
          {error}
        </p>
      )}
      <div className="save-row">
        <button type="submit" className="chip" disabled={busy}>
          {busy ? "Linking…" : "Link as patient"}
        </button>
        <button type="button" className="chip" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The sign-in a Link added, for the Admin to pass on. */
export function LinkedCredentials({ login }: { login: UsernameLoginInput }) {
  return (
    <>
      <dl>
        <dt>Username</dt>
        <dd>{login.username}</dd>
        <dt>Password</dt>
        <dd>{login.password}</dd>
      </dl>
      <p className="library-note">{USERNAME_LOGIN_NOTE} Share these with them.</p>
    </>
  );
}

/**
 * "Patient" in the drawer of a User who is nobody's Patient: "Link to
 * clinician…" chooses their Clinician; once linked, the drawer shows them as
 * a Patient (their password is revealed there). Nothing for an account the
 * Account rules never link, the Admin's.
 */
export function LinkToClinician({
  account,
  clinicians,
  flash,
  onChange,
}: {
  account: LinkableAccount;
  /** Who may take a Patient: the Clinicians and the Admin. */
  clinicians: readonly TransferCandidate[];
  flash: (msg: string) => void;
  /** The Link was made: the table reloads. */
  onChange: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [clinicianId, setClinicianId] = useState("");

  const options = clinicians.flatMap((c) => {
    const check = linkCheck(account, c);
    return check === "refused" ? [] : [{ clinician: c, full: check === "full" }];
  });
  const clinician = options.find((o) => o.clinician.id === clinicianId && !o.full)?.clinician ?? null;

  if (options.length === 0) return null;
  return (
    <div className="detail-block">
      <h4>Patient</h4>
      {open ? (
        <LinkPatientForm
          account={account}
          clinician={clinician}
          missingChoice="Choose their clinician."
          picker={
            <label>
              Clinician
              <select
                className="select"
                value={clinicianId}
                onChange={(e) => setClinicianId(e.target.value)}
                autoFocus
                required
              >
                <option value="">Choose a clinician…</option>
                {options.map(({ clinician: c, full }) => (
                  <option key={c.id} value={c.id} disabled={full}>
                    {candidateLabel(c, full)}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                They keep their account and listening history. Their clinician sees their listening and curates
                their sessions; the link carries Premium.
              </span>
            </label>
          }
          onLinked={async (link) => {
            await onChange();
            flash(`${link.account.label} is now ${link.clinician.name}'s patient ✓`);
          }}
          onClose={() => setOpen(false)}
        />
      ) : (
        <div className="save-row">
          <span className="library-note">Nobody's patient.</span>
          <button className="chip small" onClick={() => setOpen(true)}>
            Link to clinician…
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "+ Link existing user…" on a Clinician's list of Patients: the Admin finds
 * someone who is nobody's Patient, links them, and sees the sign-in the Link
 * added. A Clinician without room says so before anyone is chosen.
 */
export function LinkExistingUser({
  clinician,
  accounts,
  onChange,
  onClose,
}: {
  clinician: TransferCandidate;
  /** Everyone; the Account rules keep those who may become their Patient. */
  accounts: readonly LinkableAccount[];
  /** A Link was made: the table reloads. */
  onChange: () => Promise<void>;
  onClose: () => void;
}) {
  const [made, setMade] = useState<MadeLink | null>(null);
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState("");

  if (made) {
    return (
      <div className="new-patient-done" role="status">
        <p>
          <strong>{made.account.label}</strong> is now {made.clinician.name}'s patient.
        </p>
        {made.login ? (
          <LinkedCredentials login={made.login} />
        ) : (
          <p className="library-note">They keep signing in as before.</p>
        )}
        <div className="save-row">
          <button
            className="chip"
            onClick={() => {
              setMade(null);
              setAccountId("");
            }}
          >
            Link another
          </button>
          <button className="chip" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const linkable = accounts.flatMap((a) => {
    const check = linkCheck(a, clinician);
    return check === "refused" ? [] : [{ account: a, full: check === "full" }];
  });
  if (linkable.length > 0 && linkable.every((l) => l.full)) {
    return (
      <div className="new-patient-form">
        <p className="library-note">
          {clinician.name} has no room for another patient. Raise their limit first.
        </p>
        <div className="save-row">
          <button type="button" className="chip" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }
  const q = query.trim().toLowerCase().replace(/^@/, "");
  const options = linkable
    .map((l) => l.account)
    .filter((a) => !q || `${a.label} ${a.detail} ${a.username ?? ""}`.toLowerCase().includes(q));

  return (
    <LinkPatientForm
      account={options.find((a) => a.id === accountId) ?? null}
      clinician={clinician}
      missingChoice="Choose who becomes their patient."
      picker={
        <>
          <label>
            Find someone
            <input
              className="text-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, @username or email"
              autoComplete="off"
              autoFocus
            />
          </label>
          <label>
            New patient of {clinician.name}
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              <option value="">{options.length === 0 ? "Nobody matches" : `Choose someone… (${options.length})`}</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} · {a.detail}
                </option>
              ))}
            </select>
            <span className="field-hint">Regulars and clinicians who are nobody's patient yet.</span>
          </label>
        </>
      }
      onLinked={async (link) => {
        setMade(link);
        await onChange();
      }}
      onClose={onClose}
    />
  );
}

/** The account an email belongs to, as "+ New patient" found it for the Admin. */
type Registered =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "found"; user: UserOverview; label: string; clinicianLabel: string | null }
  | { state: "missing" };

/** What "+ New patient" shows once the Admin linked the account instead. */
export type LinkedInstead =
  | { label: string; login: UsernameLoginInput }
  | { label: string; keptUsername: string };

/**
 * Under the Admin's "email already registered" in "+ New patient": whose
 * account it is, and "Link as my patient" instead (ADR-014). An account
 * without a Username gets the Username and password typed above; one with a
 * Username keeps it and its own password.
 */
export function LinkRegisteredAccount({
  email,
  login,
  adminId,
  onLinked,
}: {
  /** The email as typed, lowercase. */
  email: string;
  /** The Username and password typed for the new Patient. */
  login: UsernameLoginInput;
  /** The Admin, who becomes the account's Clinician. */
  adminId: string;
  onLinked: (linked: LinkedInstead) => void;
}) {
  const [registered, setRegistered] = useState<Registered>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadUserOverview()
      .then((users) => {
        if (cancelled) return;
        const user = users.find((u) => u.email?.toLowerCase() === email);
        if (!user) {
          setRegistered({ state: "missing" });
          return;
        }
        const clinician = user.link ? users.find((u) => u.userId === user.link?.clinicianId) : undefined;
        setRegistered({
          state: "found",
          user,
          label: accountLabel(user) ?? email,
          clinicianLabel: clinician ? accountLabel(clinician) : null,
        });
      })
      .catch(() => {
        if (!cancelled) setRegistered({ state: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  if (registered.state === "loading") return <p className="library-note">Looking up that account…</p>;
  if (registered.state === "failed") {
    return <p className="library-note">Could not look up that account — try again later.</p>;
  }
  if (registered.state === "missing") return null;

  const { user, label, clinicianLabel } = registered;
  if (user.role === "admin") {
    return <p className="library-note">That is the Admin account: it can never be a patient.</p>;
  }
  if (user.link) {
    return (
      <p className="library-note">
        {label} is already {clinicianLabel ? `${clinicianLabel}'s` : "someone's"} patient. Transfer them from
        Clinicians &amp; Patients.
      </p>
    );
  }

  const keptUsername = user.username;
  const link = async () => {
    let linked: LinkedInstead;
    if (keptUsername !== null) {
      linked = { label, keptUsername };
    } else {
      const checked = checkUsernameLogin(login);
      if (!checked.ok) {
        setError(USERNAME_LOGIN_REFUSALS[checked.error]);
        return;
      }
      linked = { label, login: checked.login };
    }
    setBusy(true);
    setError(null);
    try {
      await linkPatient(user.userId, adminId, "login" in linked ? linked.login : null);
      onLinked(linked);
    } catch (err) {
      setError(linkErrorMessage(err instanceof AccountError ? err.code : "", "You"));
      setBusy(false);
    }
  };

  return (
    <div className="new-patient-link-instead">
      <p className="library-note">
        It belongs to <strong>{label}</strong>.{" "}
        {keptUsername === null
          ? "Link them as your patient instead: they get the username and password above."
          : `Link them as your patient instead: they keep their username @${keptUsername} and their own password.`}
      </p>
      {error && (
        <p className="library-note form-error" role="alert">
          {error}
        </p>
      )}
      <div className="save-row">
        <button type="button" className="chip" onClick={() => void link()} disabled={busy}>
          {busy ? "Linking…" : "Link as my patient"}
        </button>
      </div>
    </div>
  );
}
