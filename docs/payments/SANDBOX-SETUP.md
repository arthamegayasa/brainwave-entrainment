# Midtrans Sandbox — Setup & Test (Serenade)

Payment plumbing is **built and deployed**. This file lists the few manual steps
only you can do (they need your Midtrans + Supabase dashboards + your email), then
how to run an end-to-end sandbox payment.

## What's already done (by the build)

- Supabase project **Brainwave Audio Entrainment** (`pwvdobvbwoagvtzqyhfz`, region ap-southeast-1) wiped clean and rebuilt.
- Tables: `entitlements` (RLS: users read only their own), `payment_events` (idempotency), `app_config` (service-role only, holds the Midtrans keys).
- Edge functions deployed & ACTIVE:
  - `create-transaction` (JWT-required) — creates a Midtrans Snap transaction, price derived server-side.
  - `midtrans-webhook` (public, SHA-512 signature-verified) — the source of truth that activates entitlements.
- Verified: no-JWT → 401, forged signature → 403, valid signature → 200.
- Frontend: sign-in (magic link) → Subscribe → Snap checkout, wired in the **Premium** page. Public keys in `.env.local` (gitignored).

## Your manual steps

### 1. Register the webhook URL in Midtrans (required)
Midtrans Dashboard → **Settings → Configuration** (Sandbox environment) →
**Payment Notification URL**:

```
https://pwvdobvbwoagvtzqyhfz.supabase.co/functions/v1/midtrans-webhook
```

(Optionally set Finish/Unfinish/Error redirect URLs to your app URL.)

### 2. Allow your app URL in Supabase Auth (required for magic-link)
Supabase Dashboard → **Authentication → URL Configuration** → add your app origin to
**Site URL** and **Redirect URLs**, e.g. `http://localhost:5173` (dev) and your
deployed URL later. Email auth is on by default.

### 3. Run a sandbox payment
1. `npm run dev`, open the app → **Premium**.
2. Enter your email → **Sign in** → open the magic link in your inbox → you return signed in.
3. Pick Monthly/Annual → **Subscribe** → Snap opens.
4. Pay with a **sandbox test card**: `4811 1111 1111 1114`, any future expiry, CVV `123`, 3-DS OTP `112233`. (Or try QRIS/VA simulators in the Midtrans sandbox.)
5. The webhook fires → your `entitlements` row flips to `tier=premium, status=active`. The Premium page shows **"Premium active ✓"**.

You can watch it land in Supabase → Table Editor → `entitlements`, or via the SQL editor.

## Going live (later)

- **Enforce the paywall:** set `ALL_UNLOCKED = false` in `src/state/tier.ts` and wire
  `features()` to read the Supabase entitlement (see PAYMENTS-ARCHITECTURE.md §5).
  Right now everything is unlocked for launch, so a successful payment is recorded but
  doesn't change access yet — this is intentional.
- **Production keys:** swap the Sandbox Server/Client keys for Production in
  `app_config` + `.env.local`, change the Snap host in `src/lib/snap.ts`
  (auto-detects by `SB-` prefix), and register the production webhook URL. Production
  settlement needs an Indonesian business entity + IDR bank account.
- **Secret hardening:** move `midtrans_server_key` from `app_config` to Supabase Vault
  or edge-function secrets.
- **Recurring:** cards can auto-renew (Midtrans Subscription API); QRIS/VA/e-wallet are
  one-shot — renew via `current_period_end` expiry + reminder.

## Reference

- Project ref: `pwvdobvbwoagvtzqyhfz`
- Functions base: `https://pwvdobvbwoagvtzqyhfz.supabase.co/functions/v1/`
- Full design: `docs/payments/PAYMENTS-ARCHITECTURE.md`
