// SwaraSanti — the signed-in User changes their own password in Account (#8,
// ADR-015). verify_jwt = true.
//
// Patients change their password here, never with the client's own Auth
// update, so their password copy changes with it: their Clinician and the
// Admin keep seeing the password the Patient actually uses. An account that
// keeps no copy (keepsPasswordCopy) only has its Auth password set. Auth gets
// the password through the caller's own session, so this device stays signed
// in and the account's other sessions end.

import { PASSWORD_MIN_LENGTH } from "../_shared/accountRules.ts";
import type { ChangePasswordError } from "../_shared/accountRules.ts";
import {
  callerOf,
  json,
  readBody,
  serve,
  serviceClient,
  sessionTokenOf,
  stringField,
} from "../_server/endpoint.ts";
import { passwordAccountOf, setPassword } from "../_server/passwordCopies.ts";

const refuse = (error: ChangePasswordError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const password = stringField(await readBody(req), "password");
  if (password.length < PASSWORD_MIN_LENGTH) return refuse("password_too_short", 400);

  const account = await passwordAccountOf(admin, caller.id);
  // callerOf read this profile a moment ago.
  if (account === null) throw new Error(`change-password: no profile for ${caller.id}`);

  await setPassword(admin, caller.id, account, password, sessionTokenOf(req));
  return json({ ok: true });
});
