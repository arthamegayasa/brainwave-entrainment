// SwaraSanti — the Admin creates a Clinician account (#14; ADR-014, ADR-015,
// ADR-018). verify_jwt = true.
//
// 1. Check the form (name, email, password) and "may create a Clinician" (only
//    the Admin, and never with an email that already belongs to an account)
//    with the Account rules module.
// 2. Encrypt the password copy, so a missing key fails before any account
//    exists.
// 3. Create the Auth user with the Clinician's own email as their login email
//    (ADR-018) and the password: they sign in from the homepage with both.
// 4. complete_new_clinician() names the profile, grants the Clinician role
//    with the Admin as its origin (payments never touch it) and stores the
//    password copy, in one transaction. If it fails, the Auth user is deleted
//    again.

import { checkNewClinician, mayCreateClinician } from "../_shared/accountRules.ts";
import type { CreateClinicianError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { encryptPassword } from "../_server/passwordCopies.ts";

const refuse = (error: CreateClinicianError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const body = await readBody(req);
  const checked = checkNewClinician({
    name: stringField(body, "name"),
    email: stringField(body, "email"),
    password: stringField(body, "password"),
  });
  if (!checked.ok) return refuse(checked.error, 400);
  const clinician = checked.clinician;

  const registered = await admin.rpc("is_email_registered", { p_email: clinician.email });
  if (registered.error) throw registered.error;
  const decision = mayCreateClinician({ actor: caller, emailRegistered: registered.data === true });
  if (!decision.ok) return refuse(decision.reason, decision.reason === "not_allowed" ? 403 : 409);

  const passwordCopy = await encryptPassword(clinician.password);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: clinician.email,
    password: clinician.password,
    email_confirm: true,
  });
  // Someone signed up with that email since the check above.
  if (createError?.code === "email_exists") return refuse("email_registered", 409);
  if (createError) throw createError;

  const { error: completeError } = await admin.rpc("complete_new_clinician", {
    p_user: created.user.id,
    p_name: clinician.name,
    p_password_copy: passwordCopy,
  });
  if (completeError) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(created.user.id);
    if (deleteError) console.error("create-clinician: could not delete", created.user.id, deleteError);
    throw completeError;
  }

  return json({ clinicianId: created.user.id });
});
