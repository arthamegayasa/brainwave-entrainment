# Payments Architecture — Serenade

> **Status:** Design blueprint (not yet built). Execution-ready once the user provides
> Midtrans **Sandbox** credentials and greenlights creating a Supabase project.
> Decisions: [ADR-008 (pricing)](../../DECISIONS.md), [ADR-009 (payments)](../../DECISIONS.md).

This document specifies how Serenade goes from a backendless, fully-unlocked PWA
(`ALL_UNLOCKED = true`) to a real subscription product, **Indonesia-first via
Midtrans (IDR)**, designed so a **global gateway (Stripe / Merchant-of-Record)**
slots in later without reworking the frontend.

---

## 1. Why a backend is mandatory

A payment gateway can **never** be integrated securely from a pure client-side PWA:

- The Midtrans **Server Key** is a secret. If it ships in the browser bundle, anyone
  can create/refund charges. It must live only on a server.
- Entitlement (who paid, until when) must be **verified server-side**. The current
  `localStorage` tier (`serenade.tier.v1`) is trivially editable in DevTools — fine
  as a launch scaffold, unacceptable as a paywall.
- Payment confirmation is **asynchronous**: the truth arrives via Midtrans's
  server-to-server **HTTP notification (webhook)**, which needs a public endpoint that
  verifies a signature — not something a static site can do.

**Conclusion:** payments introduce a backend + accounts + a server-owned entitlement
store. This **supersedes ADR-003 ("no backend")** for the monetization surface only;
the audio engine and all synthesis stay 100% client-side.

---

## 2. Backend: Supabase

Supabase is already connected to this workspace (MCP) and covers everything needed:

| Need | Supabase piece |
|------|----------------|
| Accounts (entitlement tied to a person, not a device) | **Auth** (email magic-link / OAuth) |
| Server-owned entitlement store | **Postgres** table `entitlements` + **RLS** |
| Secret-holding server endpoints | **Edge Functions** (Deno) with env secrets |
| Client reads own entitlement | Supabase JS client + RLS policy |

### 2.1 Schema — `entitlements`

```sql
create table public.entitlements (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  tier               text not null default 'free',      -- 'free' | 'premium'
  status             text not null default 'inactive',  -- 'active' | 'inactive' | 'pending' | 'expired'
  provider           text,                              -- 'midtrans' | 'stripe'
  provider_ref       text,                              -- order_id / subscription_id
  billing_period     text,                              -- 'monthly' | 'annual'
  current_period_end timestamptz,                       -- when premium lapses
  updated_at         timestamptz not null default now()
);

alter table public.entitlements enable row level security;

-- A user may read ONLY their own entitlement. No client writes — only the
-- service-role (edge functions) mutate this table.
create policy "read own entitlement"
  on public.entitlements for select
  using (auth.uid() = user_id);
```

Also log raw gateway events for idempotency + audit:

```sql
create table public.payment_events (
  id           text primary key,        -- gateway event/order id (idempotency key)
  provider     text not null,
  raw          jsonb not null,
  processed_at timestamptz not null default now()
);
```

### 2.2 Trust model

- **Only edge functions** (service-role key) write to `entitlements` / `payment_events`.
- Clients get **read-only** access to their own row via RLS.
- Frontend never sees the Midtrans Server Key or the Supabase service-role key.

---

## 3. Provider abstraction (multi-gateway ready)

Both gateways implement one interface so the frontend and entitlement logic never
branch on provider. Midtrans ships first; Stripe/MoR is added for the global phase.

```ts
// supabase/functions/_shared/provider.ts
export interface PaymentProvider {
  readonly name: "midtrans" | "stripe";
  /** Create a checkout for a plan; returns what the client needs to open it. */
  createCheckout(input: {
    userId: string;
    period: "monthly" | "annual";
  }): Promise<{ token?: string; redirectUrl?: string; orderRef: string }>;
  /** Parse + verify an incoming webhook; return a normalized entitlement update. */
  handleWebhook(req: Request): Promise<{
    orderRef: string;
    userId: string;
    status: "active" | "pending" | "failed";
    periodEnd: string | null;
    eventId: string; // idempotency key
  }>;
}
```

Adding Stripe later = one new file implementing this interface + one webhook route.
No change to `create-transaction`'s contract with the client or to gating.

---

## 4. Midtrans integration (Indonesia, IDR)

Reference: Midtrans **Snap** + **HTTP notification** + **Subscription API**.
Prices come from `src/state/tier.ts → PRICING.IDR` (Rp49,000/mo · Rp249,000/yr).

### 4.1 Checkout flow (Snap)

```
Client (signed-in)                 Edge fn: create-transaction         Midtrans
    │  POST { period }  ───────────────►                                  │
    │  (Supabase JWT in header)         │  build order_id, gross_amount    │
    │                                   │  (from PRICING.IDR, server-side) │
    │                                   │  POST /snap/v1/transactions ────►│
    │                                   │  (Basic auth: Server Key)        │
    │                                   │  ◄──────────── { token }         │
    │  ◄───────── { token } ────────────┤  upsert entitlement status=pending
    │  window.snap.pay(token)  ───────────────────────────────────────────►│  user pays
```

- `gross_amount` and the plan are **derived on the server** from `PRICING`, never
  trusted from the client (prevents price tampering).
- `order_id` is unique (`uid:period:timestamp`) and stored as `provider_ref`.
- Client loads Snap.js with the **Client Key** (public — safe in the browser).

### 4.2 Confirmation flow (webhook — the source of truth)

```
Midtrans  ──POST notification──►  Edge fn: midtrans-webhook  ──►  Supabase
                                   1. verify SHA512 signature
                                   2. idempotency: skip if event id seen
                                   3. map status → entitlement
                                   4. upsert entitlements + payment_events
```

**Signature verification (mandatory):**

```
expected = sha512( order_id + status_code + gross_amount + SERVER_KEY )
reject if expected !== body.signature_key
```

**Status mapping:** `settlement` / `capture (accept)` → `status=active`,
`current_period_end = now + (monthly ? 1 month : 1 year)`; `pending` → `pending`;
`deny` / `cancel` / `expire` → `failed`/`inactive`. Processing is **idempotent**
(Midtrans may retry) via `payment_events.id`.

### 4.3 Recurring reality (important)

- **Cards:** true auto-renew via Midtrans **Subscription API** (saved card token +
  schedule). This is the only method with hands-off recurring.
- **QRIS / Virtual Account / GoPay / ShopeePay:** effectively **one-shot**. There is
  no silent auto-charge. Handle renewal as: watch `current_period_end`, email/notify a
  few days before lapse, and send the user back through checkout. The entitlement
  simply flips to `expired` at period end if not renewed.
- Product implication: annual is doubly attractive here — one payment covers 12 months,
  sidestepping the non-card renewal gap.

---

## 5. Frontend changes at go-live

Minimal, because the scaffold already centralizes gating:

- Add a light **auth gate** (Supabase magic-link sign-in) before checkout.
- `src/state/tier.ts`:
  - `getTier()` / `features()` read the entitlement from Supabase (cached in memory;
    `localStorage` becomes a stale-tolerant fallback, no longer the source of truth).
  - Flip **`ALL_UNLOCKED → false`** to switch the paywall on.
- `src/ui/Upgrade.tsx`: replace the local "Activate Premium" button with
  `createCheckout(period)` → open Snap. Everything else (prices, toggle, copy) already
  reads from `PRICING`.

No changes to the audio engine, presets, player, studio, or science pages.

---

## 6. Security checklist

- [ ] Server Key + Supabase service-role key only in edge-function env — never bundled.
- [ ] Webhook SHA512 signature verified before any DB write.
- [ ] `gross_amount` / plan derived server-side from `PRICING`, never from the client.
- [ ] Idempotent webhook via `payment_events.id`.
- [ ] RLS: users read only their own entitlement; no client writes.
- [ ] HTTPS-only webhook endpoint; log + alert on signature failures.

---

## 7. Go-live checklist / what's needed from the user

1. **Midtrans Sandbox** account → Server Key + Client Key (test), later Production keys.
   Requires an Indonesian business entity for production settlement (IDR bank account).
2. A **Supabase project** (or approval to create one) — URL + anon key + service-role key.
3. Deploy the two edge functions; register the webhook URL in the Midtrans dashboard.
4. Migrate the schema (§2.1); enable Auth providers.
5. QA in Sandbox (test VA/QRIS/card), verify webhook + entitlement flip, then flip
   `ALL_UNLOCKED = false` and switch to Production keys.

## 8. Global phase (later)

When foreign revenue matters (>~20% of sales, or billing USD/EUR), add **Stripe** or a
**Merchant-of-Record** (Paddle / Lemon Squeezy — they handle global VAT/tax) by
implementing the `PaymentProvider` interface (§3) and adding a `USD` block to
`PRICING`. Frontend and entitlement logic stay unchanged.
