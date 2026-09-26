// SwaraSanti — resolve login (ADR-018). Public (verify_jwt = false): the signed-
// out sign-in form asks which way an identifier signs in before it asks for
// anything else.
//
//   Username or contact email of a password account
//     → { method: "password", loginEmail }   (the internal login email)
//   login email of an account with a password copy (a Clinician the Admin
//   created, 0014)
//     → { method: "password", loginEmail }   (the email just typed)
//   any other email → { method: "magic_link" }
//   unknown Username → 404 { error: "unknown_username" }
//
// The browser then calls Supabase's own password sign-in with loginEmail, so
// Auth's per-IP rate limits apply to every attempt. The answer never contains
// a real email that was not typed: an account with a Username or contact
// email always signs in with an internal login email.

import { parseLoginIdentifier } from "../_shared/accountRules.ts";
import type { ResolveLoginError } from "../_shared/accountRules.ts";
import { json, readBody, serve, serviceClient, stringField } from "../_server/endpoint.ts";

serve(async (req) => {
  const identifier = parseLoginIdentifier(stringField(await readBody(req), "identifier"));
  if (identifier === null) {
    return json({ error: "invalid_identifier" satisfies ResolveLoginError }, 400);
  }

  const { data: loginEmail, error } = await serviceClient().rpc("password_login_email", {
    p_identifier: identifier.kind === "email" ? identifier.email : identifier.username,
  });
  if (error) throw error;

  if (typeof loginEmail === "string") return json({ method: "password", loginEmail });
  if (identifier.kind === "email") return json({ method: "magic_link" });
  return json({ error: "unknown_username" satisfies ResolveLoginError }, 404);
});
