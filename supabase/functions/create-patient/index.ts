// Serenade — a Clinician or the Admin creates a Patient account (ADR-014,
// ADR-016, ADR-018). verify_jwt = true.
//
// 1. Check the form and "may create Patient" with the Account rules module
//    (role, Patient limit, email not already registered).
// 2. Create the Auth user with an internal login email and the password.
// 3. link_new_patient() sets the name, Username and contact email and creates
//    the Link in one transaction, re-checking the limit under a lock. If it
//    fails, the Auth user is deleted again.

import {
  checkNewPatient,
  internalLoginEmail,
  mayCreatePatient,
  patientLimitOf,
} from "../_shared/accountRules.ts";
import type { CreatePatientError } from "../_shared/accountRules.ts";
import {
  callerOf,
  json,
  readBody,
  serve,
  serviceClient,
  stringField,
} from "../_server/endpoint.ts";

/** Refusals link_new_patient() raises, by Postgres error. */
function refusalOf(error: { code?: string; message?: string }): CreatePatientError | null {
  const message = error.message ?? "";
  if (message === "patient_limit_reached") return "patient_limit_reached";
  if (error.code === "23505" && message.includes("profiles_username_key")) return "username_taken";
  if (error.code === "23505" && message.includes("profiles_contact_email_key")) return "email_registered";
  return null;
}

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const body = await readBody(req);
  const checked = checkNewPatient({
    name: stringField(body, "name"),
    email: stringField(body, "email"),
    username: stringField(body, "username"),
    password: stringField(body, "password"),
  });
  if (!checked.ok) return json({ error: checked.error }, 400);
  const patient = checked.patient;

  const [links, registered, holder] = await Promise.all([
    admin
      .from("patient_links")
      .select("patient_id", { count: "exact", head: true })
      .eq("clinician_id", caller.id),
    patient.email === null
      ? Promise.resolve({ data: false, error: null })
      : admin.rpc("is_email_registered", { p_email: patient.email }),
    admin.from("profiles").select("user_id").eq("username", patient.username).maybeSingle(),
  ]);
  if (links.error) throw links.error;
  if (registered.error) throw registered.error;
  if (holder.error) throw holder.error;

  const creator = { role: caller.role, patientLimit: caller.patientLimit, patientCount: links.count ?? 0 };
  const decision = mayCreatePatient({ creator, emailRegistered: registered.data === true });
  if (!decision.ok) {
    return json({ error: decision.reason }, decision.reason === "not_clinician" ? 403 : 409);
  }
  if (holder.data !== null) return json({ error: "username_taken" }, 409);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: internalLoginEmail(crypto.randomUUID()),
    password: patient.password,
    email_confirm: true,
  });
  if (createError) throw createError;

  const { error: linkError } = await admin.rpc("link_new_patient", {
    p_clinician: caller.id,
    p_patient: created.user.id,
    p_name: patient.name,
    p_username: patient.username,
    p_contact_email: patient.email,
    p_patient_limit: patientLimitOf(creator),
  });
  if (linkError) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(created.user.id);
    if (deleteError) console.error("create-patient: could not delete", created.user.id, deleteError);
    const refusal = refusalOf(linkError);
    if (refusal === null) throw linkError;
    return json({ error: refusal }, 409);
  }

  return json({ patientId: created.user.id, username: patient.username });
});
