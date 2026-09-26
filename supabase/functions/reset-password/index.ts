// Serenade — a Clinician or the Admin resets an account's password (#8,
// ADR-015). verify_jwt = true.
//
// 1. The new password has at least PASSWORD_MIN_LENGTH characters.
// 2. mayRevealOrResetPassword: the same people who may reveal it.
// 3. setPassword stores the new password's copy and sets it in Auth, so the
//    next reveal shows exactly the password Auth accepts.

import { mayRevealOrResetPassword, PASSWORD_MIN_LENGTH } from "../_shared/accountRules.ts";
import type { ResetPasswordError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { passwordAccountOf, setPassword } from "../_server/passwordCopies.ts";

const refuse = (error: ResetPasswordError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const body = await readBody(req);
  const accountId = stringField(body, "accountId");
  const password = stringField(body, "password");
  if (password.length < PASSWORD_MIN_LENGTH) return refuse("password_too_short", 400);

  const account = await passwordAccountOf(admin, accountId);
  if (account === null) return refuse("not_allowed", 403);
  const allowed = mayRevealOrResetPassword({ actor: caller, account });
  if (!allowed.ok) return refuse(allowed.reason, 403);

  await setPassword(admin, accountId, account, password, null);
  return json({ ok: true });
});
