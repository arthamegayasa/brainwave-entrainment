// SwaraSanti — suggest a free Username for a new Patient's name (ADR-016): the
// first name, then first-last, then the first name numbered, skipping every
// Username an account holds or another account released less than 30 days ago
// (#7). Only a Clinician or the Admin may ask; the client cannot read other
// Users' profiles or the Username history, so the lookups run here with the
// service role.

import {
  hasClinicianPowers,
  suggestUsername,
  takenOrLockedUsernames,
  usernameStem,
} from "../_shared/accountRules.ts";
import {
  callerOf,
  json,
  readBody,
  serve,
  serviceClient,
  stringField,
} from "../_server/endpoint.ts";
import { releasesStartingWith } from "../_server/usernames.ts";

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);
  if (!hasClinicianPowers(caller.role)) return json({ error: "not_clinician" }, 403);

  const name = stringField(await readBody(req), "name");
  const stem = usernameStem(name);
  if (stem === null) return json({ username: null });

  // The stem is a–z/0–9 only, so it holds no LIKE wildcards.
  const [held, releases] = await Promise.all([
    admin.from("profiles").select("username").like("username", `${stem}%`),
    releasesStartingWith(admin, stem),
  ]);
  if (held.error) throw held.error;

  const taken = takenOrLockedUsernames({
    held: (held.data as Array<{ username: string }>).map((row) => row.username),
    releases,
    now: new Date(),
  });
  return json({ username: suggestUsername(name, taken) });
});
