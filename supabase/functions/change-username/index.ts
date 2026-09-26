// Serenade — change a Username (#7, ADR-016). verify_jwt = true.
//
// 1. mayChangeUsername: the account's own Clinician or the Admin, never the
//    Patient themselves, and only for an account that has a Username.
// 2. mayClaimUsername: not a Username another account holds, nor one another
//    account released less than 30 days ago.
// 3. change_username() sets the new Username and records the released one in
//    the Username history, so the old Personal URL redirects to the new one.

import {
  isValidUsername,
  mayChangeUsername,
  mayClaimUsername,
  normalizeUsername,
} from "../_shared/accountRules.ts";
import type { ChangeUsernameError } from "../_shared/accountRules.ts";
import {
  callerOf,
  json,
  readBody,
  serve,
  serviceClient,
  stringField,
} from "../_server/endpoint.ts";
import { usernameStateOf } from "../_server/usernames.ts";

const refuse = (error: ChangeUsernameError, status: number) => json({ error }, status);

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);

  const body = await readBody(req);
  const accountId = stringField(body, "accountId");
  const username = normalizeUsername(stringField(body, "username"));
  if (!isValidUsername(username)) return refuse("invalid_username", 400);

  const [profile, link, state] = await Promise.all([
    admin.from("profiles").select("username").eq("user_id", accountId).maybeSingle(),
    admin.from("patient_links").select("clinician_id").eq("patient_id", accountId).maybeSingle(),
    usernameStateOf(admin, username),
  ]);
  if (profile.error) throw profile.error;
  if (link.error) throw link.error;

  const allowed = mayChangeUsername({
    actor: caller,
    account: {
      clinicianId: link.data?.clinician_id ?? null,
      username: profile.data?.username ?? null,
    },
  });
  if (!allowed.ok) return refuse(allowed.reason, allowed.reason === "not_allowed" ? 403 : 409);

  const claim = mayClaimUsername({ state, claimant: accountId, now: new Date() });
  if (!claim.ok) return refuse(claim.reason, 409);

  const { error } = await admin.rpc("change_username", {
    p_user: accountId,
    p_username: username,
  });
  // Another account took the Username since it was read.
  if (error?.code === "23505") return refuse("username_taken", 409);
  if (error) throw error;

  return json({ username });
});
