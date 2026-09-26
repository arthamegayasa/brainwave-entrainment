// Serenade — open a Personal URL (ADR-016, ADR-018). Public (verify_jwt =
// false): the signed-out /p/<username> page asks whose Personal URL it is.
//
//   Username of a password account
//     → { firstName, loginEmail }   (first name only; the internal login email)
//   anything else → 404 { error: "not_found" }
//
// The page shows the first name and one password field, then calls Supabase's
// own password sign-in with loginEmail, so Auth's per-IP rate limits apply to
// every attempt. An invalid Username gets the same answer as an unknown one.

import { firstName, isValidUsername, normalizeUsername } from "../_shared/accountRules.ts";
import type { PersonalUrlError } from "../_shared/accountRules.ts";
import { json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";

const notFound = () => json({ error: "not_found" satisfies PersonalUrlError }, 404);

serve(async (req) => {
  const username = normalizeUsername(stringField(await readBody(req), "username"));
  if (!isValidUsername(username)) return notFound();

  const admin = serviceClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("display_name")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  if (profile === null) return notFound();

  const { data: loginEmail, error: loginError } = await admin.rpc("password_login_email", {
    p_identifier: username,
  });
  if (loginError) throw loginError;
  if (typeof loginEmail !== "string") return notFound();

  return json({ firstName: firstName(profile.display_name), loginEmail });
});
