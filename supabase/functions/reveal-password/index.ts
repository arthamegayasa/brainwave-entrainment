// Serenade — reveal an account's current password (#8, ADR-015).
// verify_jwt = true.
//
// 1. mayRevealOrResetPassword: the Patient's own Clinician (unless that
//    Patient is a Clinician too, active or Inactive, ADR-021), or the Admin
//    for any Patient and any Clinician they created.
// 2. Decrypt the password copy: the password the account has now, including
//    one its owner chose in Account.
// 3. Log the reveal (viewer, target, time) before answering, so no password
//    leaves the server without an access-log row.

import { mayRevealOrResetPassword } from "../_shared/accountRules.ts";
import type { RevealPasswordError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { passwordAccountOf, passwordFromCopy } from "../_server/passwordCopies.ts";

const refuse = (error: RevealPasswordError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const accountId = stringField(await readBody(req), "accountId");
  const account = await passwordAccountOf(admin, accountId);
  if (account === null) return refuse("not_allowed", 403);
  const allowed = mayRevealOrResetPassword({ actor: caller, account });
  if (!allowed.ok) return refuse(allowed.reason, 403);

  const password = await passwordFromCopy(admin, accountId);
  if (password === null) return refuse("no_password_copy", 404);

  const { error } = await admin
    .from("password_access_log")
    .insert({ viewer_id: caller.id, target_id: accountId });
  if (error) throw error;

  return json({ password });
});
