// Serenade — the Admin links an existing User as a Patient (#16; ADR-014,
// ADR-015, ADR-018). verify_jwt = true.
//
// Body: { accountId, clinicianId, username?, password? }
//
// 1. Check the optional Username + password (both or neither) and
//    mayLinkExistingAccount: only the Admin; never the Admin account, nor an
//    account that already has a Clinician; the Clinician holds the role or is
//    the Admin, is not the account itself and has room under their Patient
//    limit; a Username login only for an account without a Username. Then
//    planUsernameLogin: the Username is free to claim and the account's email
//    is no other account's contact email.
// 2. link_existing_patient() creates the Link, with the Premium grant on, and
//    with a Username login stores the Username, the contact email, the new
//    internal login email and the password copy, all in one transaction that
//    re-checks under a lock.
// 3. With a Username login, Auth moves the account to the internal login
//    email and the password; if Auth refuses, the Link and the profile are
//    put back. Without one, the account keeps signing in as before.

import { checkLinkLogin, mayLinkExistingAccount, patientLimitOf } from "../_shared/accountRules.ts";
import type { LinkPatientError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { clinicianAccountOf } from "../_server/clinicians.ts";
import { linkRefusalOf } from "../_server/links.ts";
import {
  existingAccountOf,
  moveToUsernameLogin,
  planUsernameLogin,
  usernameLoginRefusalOf,
} from "../_server/usernameLogins.ts";
import type { UsernameLoginPlan } from "../_server/usernameLogins.ts";

const refuse = (error: LinkPatientError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const body = await readBody(req);
  const checked = checkLinkLogin({ username: stringField(body, "username"), password: stringField(body, "password") });
  if (!checked.ok) return refuse(checked.error, 400);

  const [account, clinician] = await Promise.all([
    existingAccountOf(admin, stringField(body, "accountId")),
    clinicianAccountOf(admin, stringField(body, "clinicianId")),
  ]);
  if (account === null || clinician === null) return refuse("not_allowed", 403);
  const allowed = mayLinkExistingAccount({ actor: caller, account, clinician, usernameLogin: checked.login !== null });
  if (!allowed.ok) return refuse(allowed.reason, allowed.reason === "not_allowed" ? 403 : 409);

  let plan: UsernameLoginPlan | null = null;
  if (checked.login !== null) {
    const planned = await planUsernameLogin(admin, account, checked.login);
    if (!planned.ok) return refuse(planned.error, 409);
    plan = planned.plan;
  }

  const { error } = await admin.rpc("link_existing_patient", {
    p_clinician: clinician.id,
    p_patient: account.id,
    p_patient_limit: patientLimitOf(clinician),
    p_username: plan?.username ?? null,
    p_contact_email: plan?.contactEmail ?? null,
    p_login_email: plan?.loginEmail ?? null,
    p_password_copy: plan?.passwordCopy ?? null,
  });
  if (error) {
    const refusal = linkRefusalOf(error) ?? usernameLoginRefusalOf(error);
    // The Link was created in the same transaction: "not_linked" cannot be the answer.
    if (refusal === null || refusal === "not_linked") throw error;
    return refuse(refusal, 409);
  }

  if (plan !== null) await moveToUsernameLogin(admin, account, plan, { undoLink: true });

  return json({ username: plan?.username ?? null });
});
