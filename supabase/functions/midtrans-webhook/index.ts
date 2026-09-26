// Serenade — Midtrans HTTP notification (webhook). This is the SOURCE OF TRUTH
// for entitlement activation. verify_jwt = false: Midtrans has no user JWT; the
// endpoint authenticates the payload itself via the SHA-512 signature.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { clinicianRoleAfterPayment } from "../_shared/accountRules.ts";
import type { AccountRole, ClinicianOrigin, SettledPayment } from "../_shared/accountRules.ts";

async function sha512Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-512", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Add months/years on the UTC clock. */
function periodEnd(from: Date, period: string | null): string {
  const d = new Date(from);
  if (period === "annual") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1); // default monthly
  return d.toISOString();
}

/**
 * Applies what a settled payment does to the payer's Clinician role. The
 * decision is the Account rules' (clinicianRoleAfterPayment): only subscription
 * Clinicians are promoted or demoted, never a Clinician granted by the Admin
 * nor the Admin. The update only lands on the role it decided from, so a grant
 * by the Admin in the meantime is left alone. Role changes are service-role
 * only (0004).
 */
async function settleClinicianRole(
  admin: SupabaseClient,
  userId: string,
  payment: SettledPayment,
): Promise<void> {
  const { data: profile, error: readError } = await admin
    .from("profiles")
    .select("role, clinician_origin")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError || !profile) {
    if (readError) console.error("midtrans-webhook: could not read the role of", userId, readError);
    return;
  }
  // profiles_role_check and profiles_clinician_origin_check admit exactly these values.
  const current = {
    role: profile.role as AccountRole,
    clinicianOrigin: profile.clinician_origin as ClinicianOrigin | null,
  };
  const next = clinicianRoleAfterPayment(current, payment);
  if (next === null) return;

  const update = admin
    .from("profiles")
    .update({ role: next.role, clinician_origin: next.clinicianOrigin })
    .eq("user_id", userId)
    .eq("role", current.role);
  const { error } = await (current.clinicianOrigin === null
    ? update.is("clinician_origin", null)
    : update.eq("clinician_origin", current.clinicianOrigin));
  if (error) console.error("midtrans-webhook: could not change the role of", userId, error);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const body = await req.json().catch(() => null);
  if (!body) return new Response("bad_request", { status: 400 });

  const orderId: string = body.order_id ?? "";
  const statusCode: string = body.status_code ?? "";
  const grossAmount: string = body.gross_amount ?? "";
  const signature: string = body.signature_key ?? "";
  const txStatus: string = body.transaction_status ?? "";
  const fraudStatus: string = body.fraud_status ?? "";

  // Read the Server Key and verify the signature BEFORE any DB write.
  const { data: cfg } = await admin
    .from("app_config")
    .select("value")
    .eq("key", "midtrans_server_key")
    .single();
  if (!cfg) return new Response("config_missing", { status: 500 });

  const expected = await sha512Hex(orderId + statusCode + grossAmount + cfg.value);
  if (expected !== signature) {
    return new Response("invalid_signature", { status: 403 });
  }

  // Idempotency: skip if we've already processed this exact event.
  const eventId = `${orderId}:${statusCode}:${txStatus}`;
  const { error: dupeErr } = await admin.from("payment_events").insert({
    id: eventId,
    provider: "midtrans",
    order_ref: orderId,
    raw: body,
  });
  if (dupeErr) {
    // Duplicate primary key → already handled. Ack so Midtrans stops retrying.
    return new Response("already_processed", { status: 200 });
  }

  // Map Midtrans status → entitlement state.
  const isPaid =
    (txStatus === "capture" && fraudStatus === "accept") || txStatus === "settlement";
  const isPending = txStatus === "pending";

  // orderId formats:
  //   4+ parts (current): `${userId}:${plan}:${period}:${ts}`
  //   3 parts (legacy)  : `${userId}:${period}:${ts}` → plan 'premium'
  // Unknown plan strings coerce to 'premium' — never to 'clinician'.
  const parts = orderId.split(":");
  const userId = parts[0];
  let plan: "premium" | "clinician" = "premium";
  let period: string | null = null;
  if (parts.length >= 4) {
    plan = parts[1] === "clinician" ? "clinician" : "premium";
    period = parts[2] ?? null;
  } else {
    period = parts[1] ?? null;
  }
  if (!userId) return new Response("ok", { status: 200 });

  // The current entitlement on file. Failure/pending handling keys on its
  // provider_ref so an abandoned NEW checkout can never revoke a sub that a
  // DIFFERENT, already-paid order granted.
  const { data: current } = await admin
    .from("entitlements")
    .select("provider_ref, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (isPaid) {
    await admin.from("entitlements").upsert(
      {
        user_id: userId,
        tier: plan,
        status: "active",
        provider: "midtrans",
        provider_ref: orderId,
        billing_period: period ?? "monthly",
        current_period_end: periodEnd(new Date(), period),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    await settleClinicianRole(admin, userId, { plan, outcome: "paid" });
  } else if (isPending) {
    // Don't push an active sub back to pending for an unrelated new checkout.
    if (!current || current.status !== "active" || current.provider_ref === orderId) {
      await admin
        .from("entitlements")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    }
  } else if (current && current.provider_ref === orderId) {
    // deny / cancel / expire / failure → revoke ONLY when the failed order is
    // the one currently on file. Abandoning a new checkout must not revoke a
    // subscription earned by a prior, successful order.
    await admin
      .from("entitlements")
      .update({ tier: "free", status: "inactive", updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    await settleClinicianRole(admin, userId, { plan, outcome: "failed" });
  }

  return new Response("ok", { status: 200 });
});
