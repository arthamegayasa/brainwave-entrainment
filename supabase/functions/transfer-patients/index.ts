// Serenade — the Admin Transfers one Patient, or every Patient of a
// Clinician, to another Clinician (#15; ADR-014). verify_jwt = true.
//
// Body: { patientId, targetId } moves one Patient; { clinicianId, targetId }
// moves every Patient of that Clinician, an Inactive Clinician's included.
//
// 1. mayTransferPatients: only the Admin; the target holds the Clinician role
//    or is the Admin, is not the Patients' current Clinician nor one of them,
//    and their Patient limit takes every moving Patient (all or none).
// 2. transfer_patients() moves the Links in one transaction, re-checking all
//    of that under a lock. The Premium grant stays on each Link; each Patient
//    keeps their Listening History, password copy and Username; the old
//    Clinician's Assignments and Hidden Presets go (0015). The new Clinician
//    reads the Patients at once, the old one no longer.

import { mayTransferPatients, patientLimitOf } from "../_shared/accountRules.ts";
import type { TransferPatientsError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { clinicianAccountOf, patientIdsOf, transferRefusalOf } from "../_server/clinicians.ts";
import { linkedClinicianOf } from "../_server/links.ts";

const refuse = (error: TransferPatientsError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const body = await readBody(req);
  const patientId = stringField(body, "patientId");
  const clinicianId = stringField(body, "clinicianId");
  const target = await clinicianAccountOf(admin, stringField(body, "targetId"));
  if (target === null) return refuse("not_allowed", 403);

  const moving =
    patientId !== ""
      ? { fromClinicianId: await linkedClinicianOf(admin, patientId), patientIds: [patientId] }
      : { fromClinicianId: clinicianId, patientIds: await patientIdsOf(admin, clinicianId) };
  const allowed = mayTransferPatients({ actor: caller, ...moving, target });
  if (!allowed.ok) return refuse(allowed.reason, allowed.reason === "not_allowed" ? 403 : 409);

  const { data: moved, error } = await admin.rpc("transfer_patients", {
    p_from: moving.fromClinicianId,
    p_patient: patientId === "" ? null : patientId,
    p_to: target.id,
    p_patient_limit: patientLimitOf(target),
  });
  if (error) {
    const refusal = transferRefusalOf(error);
    if (refusal === null) throw error;
    return refuse(refusal, 409);
  }

  return json({ moved });
});
