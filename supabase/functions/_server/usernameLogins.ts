// Username logins (#16; ADR-018) for the account server functions: moving an
// existing account to a Username, an internal login email and a password.
// Deno-only (the service-role client), so it lives outside _shared; who may
// do it, and what the new sign-in is, is decided in _shared/accountRules.ts.
//
// The database takes the new sign-in first (add_username_login, 0016, locked
// and re-checked), then Auth moves the account to the new login email and
// password. Until then, and if Auth refuses and the profile cannot be put
// back, password_login_email() (0016) resolves the Username to nothing, never
// to the account's real email.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { mayClaimUsername, usernameLogin } from "../_shared/accountRules.ts";
import type {
  AccountRole,
  ClinicianOrigin,
  PasswordAccount,
  UsernameLoginInput,
  UsernameLoginRefusal,
} from "../_shared/accountRules.ts";
import { UUID_PATTERN } from "./endpoint.ts";
import { encryptPassword } from "./passwordCopies.ts";
import { usernameStateOf } from "./usernames.ts";

/** An account the Admin links or gives a Username login, as the server reads it. */
export interface ExistingAccount extends PasswordAccount {
  id: string;
  username: string | null;
  contactEmail: string | null;
  /** The login email its profile mirrors (profiles.email), put back if Auth refuses. */
  profileEmail: string | null;
  /** The ciphertext of its password copy, put back if Auth refuses; null without one. */
  passwordCopy: string | null;
}

/** The account with that id, or null when there is none. */
export async function existingAccountOf(admin: SupabaseClient, accountId: string): Promise<ExistingAccount | null> {
  if (!UUID_PATTERN.test(accountId)) return null;
  const [profile, link, patients, copy] = await Promise.all([
    admin
      .from("profiles")
      .select("role, clinician_origin, username, email, contact_email")
      .eq("user_id", accountId)
      .maybeSingle(),
    admin.from("patient_links").select("clinician_id").eq("patient_id", accountId).maybeSingle(),
    admin.from("patient_links").select("patient_id", { count: "exact", head: true }).eq("clinician_id", accountId),
    admin.from("password_copies").select("ciphertext").eq("user_id", accountId).maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (link.error) throw link.error;
  if (patients.error) throw patients.error;
  if (copy.error) throw copy.error;
  if (profile.data === null) return null;
  return {
    id: accountId,
    // profiles_role_check and profiles_clinician_origin_check admit exactly these values.
    role: profile.data.role as AccountRole,
    clinicianOrigin: profile.data.clinician_origin as ClinicianOrigin | null,
    clinicianId: link.data?.clinician_id ?? null,
    patientCount: patients.count ?? 0,
    username: profile.data.username,
    contactEmail: profile.data.contact_email,
    profileEmail: profile.data.email,
    passwordCopy: copy.data?.ciphertext ?? null,
  };
}

/** Everything the database and Auth take for one account's new Username login. */
export interface UsernameLoginPlan {
  username: string;
  password: string;
  /** The new internal login email. */
  loginEmail: string;
  /** The email the account kept, now its contact email; null when it had none. */
  contactEmail: string | null;
  /** The encrypted password copy. */
  passwordCopy: string;
}

/**
 * Plans the move of `account` to a Username login (usernameLogin, from its
 * login email in Auth): refused when the Username is held or locked for this
 * account (mayClaimUsername), or when another account already keeps the
 * account's email as its contact email. Encrypts the password copy, so a
 * missing key fails before anything changes.
 */
export async function planUsernameLogin(
  admin: SupabaseClient,
  account: ExistingAccount,
  login: UsernameLoginInput,
): Promise<{ ok: true; plan: UsernameLoginPlan } | { ok: false; error: UsernameLoginRefusal }> {
  const { data: auth, error: authError } = await admin.auth.admin.getUserById(account.id);
  if (authError) throw authError;
  const { loginEmail, contactEmail } = usernameLogin(
    { loginEmail: auth.user.email ?? null, contactEmail: account.contactEmail },
    crypto.randomUUID(),
  );
  const [state, holders] = await Promise.all([
    usernameStateOf(admin, login.username),
    contactEmail === null
      ? Promise.resolve({ data: [], error: null })
      : admin.from("profiles").select("user_id").eq("contact_email", contactEmail).neq("user_id", account.id),
  ]);
  if (holders.error) throw holders.error;

  const claim = mayClaimUsername({ state, claimant: account.id, now: new Date() });
  if (!claim.ok) return { ok: false, error: claim.reason };
  if (holders.data.length > 0) return { ok: false, error: "email_registered" };

  return {
    ok: true,
    plan: { ...login, loginEmail, contactEmail, passwordCopy: await encryptPassword(login.password) },
  };
}

/** What add_username_login() (0016) raises; everything else is unexpected. */
type RaisedUsernameLoginRefusal = "has_username" | "not_linked" | "username_taken" | "email_registered";

/**
 * The refusal add_username_login() raised, also from inside
 * link_existing_patient() (0016), when the account changed after it was read,
 * or another account took the Username or contact email meanwhile; null for
 * any other error.
 */
export function usernameLoginRefusalOf(error: { code?: string; message?: string }): RaisedUsernameLoginRefusal | null {
  const message = error.message ?? "";
  if (message === "has_username" || message === "not_linked") return message;
  if (error.code === "23505" && message.includes("profiles_username_key")) return "username_taken";
  if (error.code === "23505" && message.includes("profiles_contact_email_key")) return "email_registered";
  return null;
}

/**
 * Moves the account to its new login email and password in Auth, once the
 * database has taken the plan. If Auth refuses, the database is put back as
 * `account` read it (and the Link the same request created is removed, with
 * `undoLink`) before the error is thrown again.
 */
export async function moveToUsernameLogin(
  admin: SupabaseClient,
  account: ExistingAccount,
  plan: UsernameLoginPlan,
  { undoLink }: { undoLink: boolean },
): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(account.id, {
    email: plan.loginEmail,
    password: plan.password,
    email_confirm: true,
  });
  if (!error) return;
  try {
    await putBack(admin, account, undoLink);
  } catch (putBackError) {
    // The Username resolves to nothing meanwhile (password_login_email, 0016).
    console.error("moveToUsernameLogin: could not put back", account.id, putBackError);
  }
  throw error;
}

/** Puts the profile, the Link and the password copy back as `account` read them. */
async function putBack(admin: SupabaseClient, account: ExistingAccount, undoLink: boolean): Promise<void> {
  const profile = await admin
    .from("profiles")
    .update({ username: account.username, contact_email: account.contactEmail, email: account.profileEmail })
    .eq("user_id", account.id);
  if (profile.error) throw profile.error;
  if (undoLink) {
    const link = await admin.from("patient_links").delete().eq("patient_id", account.id);
    if (link.error) throw link.error;
  }
  const copy =
    account.passwordCopy === null
      ? await admin.from("password_copies").delete().eq("user_id", account.id)
      : await admin.from("password_copies").upsert({ user_id: account.id, ciphertext: account.passwordCopy });
  if (copy.error) throw copy.error;
}
