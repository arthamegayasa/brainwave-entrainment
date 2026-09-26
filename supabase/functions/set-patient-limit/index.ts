// SwaraSanti — the Admin sets a Clinician's Patient limit (#14; ADR-014).
// verify_jwt = true.
//
// 1. maySetPatientLimit: only the Admin, for someone who holds the Clinician
//    role, to a whole number from their current Patient count up to
//    PATIENT_LIMIT_MAX.
// 2. Store it on their profile. create-patient reads the limit from there on
//    every request, so the new cap holds from the Clinician's next Patient on.
//
// Nothing locks this write against a Patient being created at the same
// instant: lowering the limit to the current count then can leave the
// Clinician one Patient over it. They add no more until they are under it.

import { maySetPatientLimit } from "../_shared/accountRules.ts";
import type { SetPatientLimitError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { clinicianAccountOf } from "../_server/clinicians.ts";

const refuse = (error: SetPatientLimitError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const body = await readBody(req);
  const accountId = stringField(body, "accountId");
  const limit = typeof body.limit === "number" ? body.limit : Number.NaN;

  const account = await clinicianAccountOf(admin, accountId);
  if (account === null) return refuse("not_allowed", 403);
  const allowed = maySetPatientLimit({ actor: caller, account, limit });
  if (!allowed.ok) {
    const status = { not_allowed: 403, invalid_limit: 400, not_clinician: 409 }[allowed.reason];
    return refuse(allowed.reason, status);
  }

  // Only while they still hold the role just checked.
  const { data, error } = await admin
    .from("profiles")
    .update({ patient_limit: limit })
    .eq("user_id", accountId)
    .eq("role", "clinician")
    .select("patient_limit");
  if (error) throw error;
  if (data.length === 0) return refuse("not_clinician", 409);

  return json({ patientLimit: limit });
});
