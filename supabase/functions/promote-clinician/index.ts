// Serenade — the Admin promotes a User to Clinician (#14; ADR-014).
// verify_jwt = true.
//
// 1. mayPromoteToClinician: only the Admin, for a User without the Clinician
//    role (a Regular, a Patient or an Inactive Clinician), never the Admin.
// 2. Grant the role with the Admin as its origin, so payments never take it
//    away. The update only lands while the profile holds no role, so a
//    promotion by the payment webhook meanwhile stays a subscription.
//
// The User signs in as before: with a magic link until the Admin sets their
// password, then with it (password_login_email, 0014).

import { mayPromoteToClinician } from "../_shared/accountRules.ts";
import type { PromoteToClinicianError } from "../_shared/accountRules.ts";
import { callerOf, json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { clinicianAccountOf } from "../_server/clinicians.ts";

const refuse = (error: PromoteToClinicianError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const accountId = stringField(await readBody(req), "accountId");
  const account = await clinicianAccountOf(admin, accountId);
  if (account === null) return refuse("not_allowed", 403);
  const allowed = mayPromoteToClinician({ actor: caller, account });
  if (!allowed.ok) return refuse(allowed.reason, allowed.reason === "not_allowed" ? 403 : 409);

  const { data, error } = await admin
    .from("profiles")
    .update({ role: "clinician", clinician_origin: "admin" })
    .eq("user_id", accountId)
    .eq("role", "user")
    .select("user_id");
  if (error) throw error;
  if (data.length === 0) return refuse("already_clinician", 409);

  return json({ ok: true });
});
