// Request plumbing for the account server functions. Deno-only (jsr import,
// Deno.serve, Deno.env), so it lives outside _shared: the app shares only
// _shared/accountRules.ts with the functions.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AccountRole } from "../_shared/accountRules.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/**
 * Serves a POST-only JSON endpoint callable from the browser: answers the CORS
 * preflight, refuses other methods, and turns an unexpected error into a 500
 * that reveals nothing.
 */
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      return await handler(req);
    } catch (error) {
      console.error(error);
      return json({ error: "server_error" }, 500);
    }
  });
}

/** The request's JSON body as an object; empty when it is missing or not JSON. */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => null);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/** A string field of the body; "" when it is missing or not a string. */
export function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

/** An account id; the database rejects any other id before a lookup. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The service-role client: bypasses row-level security, server only. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

export interface Caller {
  id: string;
  role: AccountRole;
  /** The per-Clinician Patient limit on the caller's profile. */
  patientLimit: number;
}

/** The session token the request was sent with; "" without one. */
export function sessionTokenOf(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
}

/** The signed-in User who sent the request, or null without a valid session. */
export async function callerOf(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const token = sessionTokenOf(req);
  if (token.length === 0) return null;
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return null;

  const { data: profile, error } = await admin
    .from("profiles")
    .select("role, patient_limit")
    .eq("user_id", userData.user.id)
    .single();
  if (error) throw error;
  // profiles_role_check admits exactly the AccountRole values.
  return { id: userData.user.id, role: profile.role as AccountRole, patientLimit: profile.patient_limit };
}
