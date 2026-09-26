// Serenade — switch the Premium grant on a Patient's Link (#9, ADR-014).
// verify_jwt = true.
//
// 1. `premium` is true or false.
// 2. mayManageLink: the Patient's own Clinician while they hold the role, or
//    the Admin; never the Patient.
// 3. Update that Link. The app counts the Patient as Premium while the grant
//    is on or their own subscription is active.

import { mayManageLink } from "../_shared/accountRules.ts";
import type { SetPremiumGrantError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { linkedClinicianOf } from "../_server/links.ts";

const refuse = (error: SetPremiumGrantError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const body = await readBody(req);
  const patientId = stringField(body, "patientId");
  const premium = body.premium;
  if (typeof premium !== "boolean") return refuse("invalid_premium", 400);

  const clinicianId = await linkedClinicianOf(admin, patientId);

  const allowed = mayManageLink({ actor: caller, account: { clinicianId } });
  if (!allowed.ok) return refuse(allowed.reason, allowed.reason === "not_allowed" ? 403 : 409);

  // Only the Link just checked: one Transferred meanwhile is left alone.
  const { data, error } = await admin
    .from("patient_links")
    .update({ premium_grant: premium })
    .eq("patient_id", patientId)
    .eq("clinician_id", clinicianId)
    .select("premium_grant");
  if (error) throw error;
  if (data.length === 0) return refuse("not_linked", 409);

  return json({ premium });
});
