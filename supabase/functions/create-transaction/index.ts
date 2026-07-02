// Serenade — create a Midtrans Snap transaction for a signed-in user.
// verify_jwt = true: the Supabase gateway requires a valid user JWT before this
// runs, so checkout is always tied to an authenticated account.
//
// Flow: read plan → derive price SERVER-SIDE (never trust the client) → create a
// Snap transaction with the Midtrans Server Key → mark the entitlement pending →
// return the Snap token. The webhook is the source of truth for activation.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MIDTRANS_SNAP_URL = "https://app.sandbox.midtrans.com/snap/v1/transactions";

// Prices mirror src/state/tier.ts → PRICING.IDR (keep in sync). Server-owned so a
// tampered client can't change what it's charged.
const PLANS = {
  monthly: { amount: 49000, label: "Serenade Premium — Monthly" },
  annual: { amount: 249000, label: "Serenade Premium — Annual" },
} as const;

type Period = keyof typeof PLANS;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Identify the caller from their JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
  const user = userData.user;

  // Parse + validate the requested plan.
  let period: Period;
  try {
    const body = await req.json();
    period = body.period;
    if (period !== "monthly" && period !== "annual") throw new Error("bad period");
  } catch {
    return json({ error: "invalid_plan" }, 400);
  }
  const plan = PLANS[period];

  // Read the Midtrans Server Key (service-role only).
  const { data: cfg, error: cfgErr } = await admin
    .from("app_config")
    .select("value")
    .eq("key", "midtrans_server_key")
    .single();
  if (cfgErr || !cfg) return json({ error: "config_missing" }, 500);
  const serverKey: string = cfg.value;

  const orderId = `${user.id}:${period}:${Date.now()}`;

  const snapRes = await fetch(MIDTRANS_SNAP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${btoa(serverKey + ":")}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: plan.amount },
      item_details: [
        { id: `premium-${period}`, price: plan.amount, quantity: 1, name: plan.label },
      ],
      customer_details: { email: user.email },
      credit_card: { secure: true },
    }),
  });

  if (!snapRes.ok) {
    const detail = await snapRes.text();
    return json({ error: "midtrans_error", detail }, 502);
  }
  const snap = await snapRes.json();

  // Mark the entitlement pending (idempotent upsert by user_id).
  await admin.from("entitlements").upsert(
    {
      user_id: user.id,
      tier: "free",
      status: "pending",
      provider: "midtrans",
      provider_ref: orderId,
      billing_period: period,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return json({ token: snap.token, order_id: orderId, redirect_url: snap.redirect_url });
});
