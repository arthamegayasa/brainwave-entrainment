// SwaraSanti — the Admin removes someone's Clinician role (#15; ADR-014).
// verify_jwt = true.
//
// Body: { accountId, targetId? }. targetId is where their Patients are
// Transferred first; it is required while they have Patients.
//
// 1. mayRemoveClinicianRole: only the Admin, for someone who holds the role
//    (never the Admin account); with Patients, only together with a Transfer
//    the Admin may make (mayTransferPatients).
// 2. remove_clinician_role() Transfers every Patient to the target and takes
//    the role and its origin away in one transaction, refusing while a
//    Patient would be left behind. Afterwards they are a Regular, or still
//    their own Clinician's Patient; a Regular keeps no password copy, so a
//    Clinician the Admin created signs in with a magic link again (0015).

import { mayRemoveClinicianRole, patientLimitOf } from "../_shared/accountRules.ts";
import type { RemoveClinicianRoleError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { clinicianAccountOf, patientIdsOf, transferRefusalOf } from "../_server/clinicians.ts";

const refuse = (error: RemoveClinicianRoleError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const body = await readBody(req);
  const accountId = stringField(body, "accountId");
  const targetId = stringField(body, "targetId");
  const [account, patientIds, target] = await Promise.all([
    clinicianAccountOf(admin, accountId),
    patientIdsOf(admin, accountId),
    targetId === "" ? Promise.resolve(null) : clinicianAccountOf(admin, targetId),
  ]);
  if (account === null || (targetId !== "" && target === null)) return refuse("not_allowed", 403);

  const allowed = mayRemoveClinicianRole({
    actor: caller,
    account: { id: account.id, role: account.role, patientIds },
    target,
  });
  if (!allowed.ok) return refuse(allowed.reason, allowed.reason === "not_allowed" ? 403 : 409);

  const { error } = await admin.rpc("remove_clinician_role", {
    p_clinician: account.id,
    p_to: target?.id ?? null,
    p_patient_limit: target === null ? null : patientLimitOf(target),
  });
  if (error) {
    const refusal = refusalOf(error);
    if (refusal === null) throw error;
    return refuse(refusal, 409);
  }

  return json({ ok: true });
});

/** What remove_clinician_role() raised when the roles or Links changed after the Account rules read them. */
function refusalOf(error: { message?: string }): RemoveClinicianRoleError | null {
  if (error.message === "not_clinician" || error.message === "transfer_target_required") return error.message;
  return transferRefusalOf(error);
}
