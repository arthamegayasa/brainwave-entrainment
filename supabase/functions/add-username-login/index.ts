// Serenade — a Patient without a Username gets a Username and password
// (#16; ADR-014, ADR-015, ADR-018). verify_jwt = true.
//
// Body: { accountId, username, password }
//
// 1. Check the Username + password and mayAddUsernameLogin: the Patient's own
//    Clinician (while holding the role, unless the Patient also holds the
//    Clinician role) or the Admin, only for a Patient, only one without a
//    Username; then planUsernameLogin (the Username is free to claim, the
//    Patient's email is no other account's contact email).
// 2. add_username_login() stores the Username, the Patient's email as their
//    contact email, the new internal login email and the password copy in
//    one transaction that re-checks under a lock.
// 3. Auth moves the Patient to the internal login email and the password; if
//    Auth refuses, the profile and the password copy are put back. From then
//    on the homepage asks for a password for their email (ADR-018).

import { checkUsernameLogin, mayAddUsernameLogin } from "../_shared/accountRules.ts";
import type { AddUsernameLoginError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import {
  existingAccountOf,
  moveToUsernameLogin,
  planUsernameLogin,
  usernameLoginRefusalOf,
} from "../_server/usernameLogins.ts";

const refuse = (error: AddUsernameLoginError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const body = await readBody(req);
  const checked = checkUsernameLogin({ username: stringField(body, "username"), password: stringField(body, "password") });
  if (!checked.ok) return refuse(checked.error, 400);

  const account = await existingAccountOf(admin, stringField(body, "accountId"));
  if (account === null) return refuse("not_allowed", 403);
  const allowed = mayAddUsernameLogin({ actor: caller, account });
  if (!allowed.ok) return refuse(allowed.reason, allowed.reason === "not_allowed" ? 403 : 409);

  const planned = await planUsernameLogin(admin, account, checked.login);
  if (!planned.ok) return refuse(planned.error, 409);
  const { plan } = planned;

  const { error } = await admin.rpc("add_username_login", {
    p_user: account.id,
    p_username: plan.username,
    p_contact_email: plan.contactEmail,
    p_login_email: plan.loginEmail,
    p_password_copy: plan.passwordCopy,
  });
  if (error) {
    const refusal = usernameLoginRefusalOf(error);
    if (refusal === null) throw error;
    return refuse(refusal, 409);
  }

  await moveToUsernameLogin(admin, account, plan, { undoLink: false });

  return json({ username: plan.username });
});
