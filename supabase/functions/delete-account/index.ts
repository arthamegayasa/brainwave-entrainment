// SwaraSanti — the Admin deletes an account (#17; ADR-014, ADR-022).
// verify_jwt = true.
//
// Body: { accountId }.
//
// 1. mayDeleteAccount: only the Admin, never the Admin account, and not while
//    Patients are still Linked to the account (active or Inactive Clinician):
//    the Admin Transfers them first.
// 2. delete_account() deletes it in one transaction (0017): the account with
//    its Listening History, Link and password copy. Its Username stays locked
//    for 30 days, password views about it stay in the access log as a deleted
//    account, and its Custom Audio still in someone else's Library moves to
//    the Admin's Audio Bank.

import { mayDeleteAccount } from "../_shared/accountRules.ts";
import type { DeleteAccountError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { clinicianAccountOf } from "../_server/clinicians.ts";

const refuse = (error: DeleteAccountError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const account = await clinicianAccountOf(admin, stringField(await readBody(req), "accountId"));
  if (account === null) return refuse("not_allowed", 403);

  const allowed = mayDeleteAccount({ actor: caller, account });
  if (!allowed.ok) return refuse(allowed.reason, allowed.reason === "not_allowed" ? 403 : 409);

  const { error } = await admin.rpc("delete_account", { p_user: account.id, p_admin: caller.id });
  if (error) {
    // delete_account() re-checks under a lock what the Account rules read
    // earlier: the caller lost the Admin role, or the account became the
    // Admin or gained Patients, meanwhile.
    if (error.message === "not_allowed") return refuse("not_allowed", 403);
    if (error.message === "has_patients" || error.message === "account_is_admin") return refuse(error.message, 409);
    throw error;
  }

  return json({ ok: true });
});
