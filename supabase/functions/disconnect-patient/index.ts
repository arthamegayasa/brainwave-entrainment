// Serenade — a Clinician disconnects a Patient, or the Admin ends any Link
// (#9, ADR-014). verify_jwt = true.
//
// 1. mayManageLink: the Patient's own Clinician while they hold the role, or
//    the Admin; never the Patient, whose Link is permanent from their side.
// 2. Delete that Link. The Premium grant ends with it, and the Link's cleanup
//    trigger (0005, 0009) removes the Clinician's Assignments and Hidden
//    Presets for the Patient and the Patient's password copy. The former
//    Patient keeps their Username and password: a Regular who signs in the
//    same way.

import { mayManageLink } from "../_shared/accountRules.ts";
import type { DisconnectPatientError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { linkedClinicianOf } from "../_server/links.ts";

const refuse = (error: DisconnectPatientError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const patientId = stringField(await readBody(req), "patientId");
  const clinicianId = await linkedClinicianOf(admin, patientId);

  const allowed = mayManageLink({ actor: caller, account: { clinicianId } });
  if (!allowed.ok) return refuse(allowed.reason, allowed.reason === "not_allowed" ? 403 : 409);

  // Only the Link just checked: one Transferred meanwhile stays.
  const { data, error } = await admin
    .from("patient_links")
    .delete()
    .eq("patient_id", patientId)
    .eq("clinician_id", clinicianId)
    .select("patient_id");
  if (error) throw error;
  if (data.length === 0) return refuse("not_linked", 409);

  return json({ ok: true });
});
