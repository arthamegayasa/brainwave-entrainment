import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type {
  NewClinicianInput,
  NewPatientInput,
  PersonalUrlError,
  UsernameLoginInput,
} from "../../supabase/functions/_shared/accountRules.ts";

/**
 * Account server functions (ADR-014, ADR-016, ADR-018). Each authorizes on
 * the server through the shared Account rules module; a refusal arrives as an
 * AccountError carrying the function's error code (e.g. "username_taken").
 */

export class AccountError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AccountError";
  }
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Accounts not configured");
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error instanceof FunctionsHttpError) {
    const payload: unknown = await error.context.json().catch(() => null);
    const code = (payload as { error?: unknown } | null)?.error;
    throw new AccountError(typeof code === "string" ? code : "server_error");
  }
  if (error) throw error;
  return data as T;
}

export type LoginMethod = { method: "password"; loginEmail: string } | { method: "magic_link" };

/**
 * How a typed Username or email signs in. "password" carries the login email
 * for Supabase's own password sign-in (so Auth's rate limits apply); an
 * unknown Username throws AccountError("unknown_username").
 */
export function resolveLogin(identifier: string): Promise<LoginMethod> {
  return invoke<LoginMethod>("resolve-login", { identifier });
}

export async function signInWithPassword(loginEmail: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Accounts not configured");
  const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
  if (error) throw error;
}

/** Whose Personal URL it is: the first name to greet and the login email. */
export interface PersonalUrlLogin {
  /**
   * The Username that opened: the requested one, or, for the old Username of
   * a renamed account, that account's current one (the page redirects).
   */
  username: string;
  firstName: string | null;
  loginEmail: string;
}

/**
 * The account a Personal URL opens, or null when no account has that Username
 * (the page shows "Link not found"). Any other failure throws, so an offline
 * device never reads as "not found".
 */
export async function openPersonalUrl(username: string): Promise<PersonalUrlLogin | null> {
  try {
    return await invoke<PersonalUrlLogin>("personal-url", { username });
  } catch (err) {
    const notFound: PersonalUrlError = "not_found";
    if (err instanceof AccountError && err.code === notFound) return null;
    throw err;
  }
}

/** A free Username for a new Patient's name; null when the name gives none. */
export async function fetchUsernameSuggestion(name: string): Promise<string | null> {
  const { username } = await invoke<{ username: string | null }>("suggest-username", { name });
  return username;
}

/** Creates the Patient account and its Link to the signed-in Clinician or Admin. */
export function createPatient(
  input: NewPatientInput,
): Promise<{ patientId: string; username: string }> {
  return invoke("create-patient", { ...input });
}

/**
 * Gives an account a new Username; its old Personal URL redirects to the new
 * one until another account claims it. Refusals arrive as AccountError with a
 * ChangeUsernameError code.
 */
export function changeUsername(accountId: string, username: string): Promise<{ username: string }> {
  return invoke("change-username", { accountId, username });
}

/**
 * An account's current password, decrypted from its password copy on the
 * server, which logs every reveal (ADR-015). Refusals arrive as AccountError
 * with a RevealPasswordError code.
 */
export async function revealPassword(accountId: string): Promise<string> {
  const { password } = await invoke<{ password: string }>("reveal-password", { accountId });
  return password;
}

/**
 * Gives an account a new password, and its password copy with it; Auth signs
 * the account out everywhere. Refusals arrive as AccountError with a
 * ResetPasswordError code.
 */
export async function resetPassword(accountId: string, password: string): Promise<void> {
  await invoke("reset-password", { accountId, password });
}

/**
 * Changes the signed-in User's own password through the server, never the
 * client's own Auth update, so a Patient's password copy changes with it.
 * This device stays signed in; the account's other sessions end. Refusals
 * arrive as AccountError with a ChangePasswordError code.
 */
export async function changeOwnPassword(password: string): Promise<void> {
  await invoke("change-password", { password });
}

/** Someone in the password access log; null in a view when their account was deleted. */
export interface PasswordLogPerson {
  id: string;
  name: string | null;
  username: string | null;
  /** The email to show; never an internal login email (ADR-018). */
  email: string | null;
}

/** One password view (ADR-015): who revealed whose password, and when. */
export interface PasswordView {
  revealedAt: string;
  viewer: PasswordLogPerson | null;
  target: PasswordLogPerson | null;
}

/**
 * The Admin's password access log, newest view first (the server answers up
 * to 1000). Anyone else gets AccountError("not_allowed").
 */
export async function loadPasswordViews(): Promise<PasswordView[]> {
  const { entries } = await invoke<{ entries: PasswordView[] }>("password-access-log", {});
  return entries;
}

/**
 * Switches the Premium grant on a Patient's Link (ADR-014). Refusals arrive
 * as AccountError with a SetPremiumGrantError code.
 */
export async function setPremiumGrant(patientId: string, premium: boolean): Promise<void> {
  await invoke("set-premium-grant", { patientId, premium });
}

/**
 * Ends a Patient's Link (ADR-014): they become a Regular who still signs in
 * with their Username and password, without the Premium grant, and the
 * Clinician no longer sees their data. Refusals arrive as AccountError with a
 * DisconnectPatientError code.
 */
export async function disconnectPatient(patientId: string): Promise<void> {
  await invoke("disconnect-patient", { patientId });
}

/**
 * The Admin creates a Clinician account (#14): they sign in from the homepage
 * with that email and password, and the Admin may reveal or reset the
 * password. Refusals arrive as AccountError with a CreateClinicianError code.
 */
export function createClinician(input: NewClinicianInput): Promise<{ clinicianId: string }> {
  return invoke("create-clinician", { ...input });
}

/**
 * The Admin gives a User the Clinician role, granted by the Admin, which
 * payments never take away. Refusals arrive as AccountError with a
 * PromoteToClinicianError code.
 */
export async function promoteToClinician(accountId: string): Promise<void> {
  await invoke("promote-clinician", { accountId });
}

/**
 * The Admin sets how many Patients a Clinician may have. Refusals arrive as
 * AccountError with a SetPatientLimitError code.
 */
export async function setPatientLimit(accountId: string, limit: number): Promise<void> {
  await invoke("set-patient-limit", { accountId, limit });
}

/**
 * The Admin Transfers one Patient (`{ patientId }`), or every Patient of a
 * Clinician (`{ clinicianId }`), to the Clinician `targetId` (ADR-014), and
 * learns how many moved. They keep their Listening History, Premium grant,
 * password copy and Username; the old Clinician's Assignments and Hidden
 * Presets go. Refusals arrive as AccountError with a TransferPatientsError
 * code.
 */
export async function transferPatients(
  from: { patientId: string } | { clinicianId: string },
  targetId: string,
): Promise<number> {
  const { moved } = await invoke<{ moved: number }>("transfer-patients", { ...from, targetId });
  return moved;
}

/**
 * The Admin takes someone's Clinician role away, first Transferring their
 * Patients to `targetId` (required while they have Patients). Refusals arrive
 * as AccountError with a RemoveClinicianRoleError code.
 */
export async function removeClinicianRole(accountId: string, targetId: string | null): Promise<void> {
  await invoke("remove-clinician-role", targetId === null ? { accountId } : { accountId, targetId });
}

/**
 * The Admin links an existing User as a Patient of `clinicianId` (#16;
 * ADR-014), optionally with a Username and password: the account then signs
 * in with an internal login email and keeps its email as the contact email
 * (ADR-018). Refusals arrive as AccountError with a LinkPatientError code.
 */
export function linkPatient(
  accountId: string,
  clinicianId: string,
  login: UsernameLoginInput | null,
): Promise<{ username: string | null }> {
  return invoke("link-patient", { accountId, clinicianId, ...login });
}

/**
 * Gives a Patient without a Username a Username and password (#16; ADR-018),
 * for their Clinician or the Admin. Refusals arrive as AccountError with an
 * AddUsernameLoginError code.
 */
export function addUsernameLogin(accountId: string, login: UsernameLoginInput): Promise<{ username: string }> {
  return invoke("add-username-login", { accountId, ...login });
}
