import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type {
  NewPatientInput,
  PersonalUrlError,
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
