// Serenade — the password access log, for the Admin only (#8, ADR-015).
// verify_jwt = true.
//
// Answers the newest reveals first: who revealed whose password, and when.
// A viewer or target whose account was deleted reads as null. The log table
// itself stays unreachable for every client, the Admin included.

import { mayReadPasswordAccessLog, shownEmail } from "../_shared/accountRules.ts";
import type { PasswordAccessLogError } from "../_shared/accountRules.ts";
import { callerOf, json, serve, serviceClient } from "../_server/endpoint.ts";

/** Reveals per answer: PostgREST's max_rows (config.toml) caps any read here. */
const ACCESS_LOG_LIMIT = 1000;

interface LogRow {
  viewer_id: string | null;
  target_id: string | null;
  revealed_at: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  contact_email: string | null;
}

serve(async (req) => {
  const admin = serviceClient();
  const caller = await callerOf(req, admin);
  if (caller === null) return json({ error: "unauthorized" }, 401);
  if (!mayReadPasswordAccessLog(caller.role)) {
    return json({ error: "not_allowed" satisfies PasswordAccessLogError }, 403);
  }

  const { data: log, error } = await admin
    .from("password_access_log")
    .select("viewer_id, target_id, revealed_at")
    .order("revealed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACCESS_LOG_LIMIT);
  if (error) throw error;
  const rows = log as LogRow[];

  const ids = [
    ...new Set(rows.flatMap((row) => [row.viewer_id, row.target_id]).filter((id) => id !== null)),
  ];
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("user_id, display_name, username, email, contact_email")
    .in("user_id", ids);
  if (profileError) throw profileError;
  const people = new Map(
    (profiles as ProfileRow[]).map((p) => [
      p.user_id,
      {
        id: p.user_id,
        name: p.display_name,
        username: p.username,
        email: shownEmail({ loginEmail: p.email, contactEmail: p.contact_email }),
      },
    ]),
  );
  const person = (id: string | null) => (id === null ? null : (people.get(id) ?? null));

  return json({
    entries: rows.map((row) => ({
      revealedAt: row.revealed_at,
      viewer: person(row.viewer_id),
      target: person(row.target_id),
    })),
  });
});
