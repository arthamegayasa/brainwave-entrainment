// SwaraSanti — open a Personal URL (ADR-016, ADR-018). Public (verify_jwt =
// false): the signed-out /p/<username> page asks whose Personal URL it is.
//
//   Username of a password account
//     → { username, firstName, loginEmail }   (first name only; the internal
//                                               login email)
//   old Username of a renamed account, while no other account holds it (#7)
//     → the same for the owner's current Username: the page redirects there
//   anything else → 404 { error: "not_found" }
//
// The page shows the first name and one password field, then calls Supabase's
// own password sign-in with loginEmail, so Auth's per-IP rate limits apply to
// every attempt. An invalid Username gets the same answer as an unknown one.

import {
  firstName,
  isValidUsername,
  normalizeUsername,
  personalUrlTarget,
} from "../_shared/accountRules.ts";
import type { PersonalUrlError } from "../_shared/accountRules.ts";
import { json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";
import { usernameStateOf } from "../_server/usernames.ts";

const notFound = () => json({ error: "not_found" satisfies PersonalUrlError }, 404);

serve(async (req) => {
  const requested = normalizeUsername(stringField(await readBody(req), "username"));
  if (!isValidUsername(requested)) return notFound();

  const admin = serviceClient();
  const username = personalUrlTarget(requested, await usernameStateOf(admin, requested));
  if (username === null) return notFound();

  const [profile, login] = await Promise.all([
    admin.from("profiles").select("display_name").eq("username", username).maybeSingle(),
    admin.rpc("password_login_email", { p_identifier: username }),
  ]);
  if (profile.error) throw profile.error;
  if (login.error) throw login.error;
  if (profile.data === null || typeof login.data !== "string") return notFound();

  return json({ username, firstName: firstName(profile.data.display_name), loginEmail: login.data });
});
