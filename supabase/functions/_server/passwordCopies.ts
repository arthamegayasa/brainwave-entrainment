// Password copies (#8, ADR-015) for the account server functions. Deno-only
// (Deno.env, the service-role client), so it lives outside _shared; who may
// reveal or reset a password, and whose password keeps a copy, is decided in
// _shared/accountRules.ts.
//
// A copy is the password encrypted with AES-256-GCM under PASSWORD_COPY_KEY:
// a function secret (32 random bytes, base64) that never reaches the database
// or the app. It is stored as base64 of the 12-byte nonce + the ciphertext.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { keepsPasswordCopy } from "../_shared/accountRules.ts";
import type { AccountRole, ClinicianOrigin, PasswordAccount } from "../_shared/accountRules.ts";
import { UUID_PATTERN } from "./endpoint.ts";

const KEY_SECRET = "PASSWORD_COPY_KEY";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;

/** The copy key from the function secret; throws when it is missing or malformed. */
async function copyKey(): Promise<CryptoKey> {
  const encoded = Deno.env.get(KEY_SECRET);
  if (!encoded) throw new Error(`${KEY_SECRET} is not set`);
  const raw = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  if (raw.length !== KEY_BYTES) throw new Error(`${KEY_SECRET} must be ${KEY_BYTES} bytes, base64`);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypts a password into the stored form of its copy. */
export async function encryptPassword(password: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await copyKey(),
    new TextEncoder().encode(password),
  );
  return btoa(String.fromCharCode(...nonce, ...new Uint8Array(sealed)));
}

async function decryptPassword(ciphertext: string): Promise<string> {
  const stored = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: stored.subarray(0, NONCE_BYTES) },
    await copyKey(),
    stored.subarray(NONCE_BYTES),
  );
  return new TextDecoder().decode(plain);
}

/**
 * The account as the password rules read it (role, Clinician origin, the
 * Clinician of its Link); null when no account has that id.
 */
export async function passwordAccountOf(
  admin: SupabaseClient,
  userId: string,
): Promise<PasswordAccount | null> {
  if (!UUID_PATTERN.test(userId)) return null;
  const [profile, link] = await Promise.all([
    admin.from("profiles").select("role, clinician_origin").eq("user_id", userId).maybeSingle(),
    admin.from("patient_links").select("clinician_id").eq("patient_id", userId).maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (link.error) throw link.error;
  if (profile.data === null) return null;
  return {
    // profiles_role_check and profiles_clinician_origin_check admit exactly these values.
    role: profile.data.role as AccountRole,
    clinicianOrigin: profile.data.clinician_origin as ClinicianOrigin | null,
    clinicianId: link.data?.clinician_id ?? null,
  };
}

/** The account's current password, read from its copy; null when it has none. */
export async function passwordFromCopy(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("password_copies")
    .select("ciphertext")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data === null ? null : await decryptPassword(data.ciphertext);
}

/**
 * Sets the password in Auth. Without a session token (a reset) the admin API
 * sets it and Auth ends every session of the account. With the account's own
 * session token (a change in Account) the account sets it itself, so Auth
 * keeps that session and ends only the others: the device the password was
 * changed on stays signed in.
 */
async function setAuthPassword(
  admin: SupabaseClient,
  userId: string,
  password: string,
  ownSession: string | null,
): Promise<void> {
  if (ownSession === null) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
    return;
  }
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      Authorization: `Bearer ${ownSession}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  if (response.ok) return;
  const body: { error_code?: string } | null = await response.json().catch(() => null);
  // The account already has this password: nothing changes.
  if (body?.error_code === "same_password") return;
  throw new Error(`Auth refused the password change: ${response.status} ${body?.error_code ?? ""}`);
}

/**
 * Sets an account's Auth password and, when the account keeps one
 * (keepsPasswordCopy), its copy, so a revealed password is always the one
 * Auth accepts. The copy is written first and put back if Auth refuses the
 * new password. `ownSession` is the account's own session token when the
 * account changes its own password, null for a reset (see setAuthPassword).
 *
 * Nothing locks the copy and Auth together: two sets of one account's
 * password at the same instant can leave the copy on the other one, until
 * the next reset.
 */
export async function setPassword(
  admin: SupabaseClient,
  userId: string,
  account: PasswordAccount,
  password: string,
  ownSession: string | null,
): Promise<void> {
  if (!keepsPasswordCopy(account)) {
    await setAuthPassword(admin, userId, password, ownSession);
    return;
  }

  const ciphertext = await encryptPassword(password);
  const copies = () => admin.from("password_copies");
  const { data: previous, error: readError } = await copies()
    .select("ciphertext")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  const { error: writeError } = await copies().upsert({
    user_id: userId,
    ciphertext,
    updated_at: new Date().toISOString(),
  });
  if (writeError) throw writeError;

  try {
    await setAuthPassword(admin, userId, password, ownSession);
  } catch (error) {
    const { error: restoreError } =
      previous === null
        ? await copies().delete().eq("user_id", userId)
        : await copies().update({ ciphertext: previous.ciphertext }).eq("user_id", userId);
    if (restoreError) console.error("setPassword: could not put back the copy of", userId, restoreError);
    throw error;
  }
}
