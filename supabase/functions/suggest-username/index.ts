// Serenade — suggest a free Username for a new Patient's name (ADR-016): the
// first name, then first-last, then the first name numbered. Only a Clinician
// or the Admin may ask; the client cannot read other Users' profiles, so the
// lookup of taken Usernames runs here with the service role.

import { hasClinicianPowers, suggestUsername, usernameStem } from "../_shared/accountRules.ts";
import {
  callerOf,
  json,
  readBody,
  serve,
  serviceClient,
  stringField,
} from "../_server/endpoint.ts";

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);
  if (!hasClinicianPowers(caller.role)) return json({ error: "not_clinician" }, 403);

  const name = stringField(await readBody(req), "name");
  const stem = usernameStem(name);
  if (stem === null) return json({ username: null });

  // The stem is a–z/0–9 only, so it holds no LIKE wildcards.
  const { data, error } = await admin.from("profiles").select("username").like("username", `${stem}%`);
  if (error) throw error;
  const taken = new Set((data as Array<{ username: string }>).map((row) => row.username));
  return json({ username: suggestUsername(name, taken) });
});
