-- Serenade payments schema (ADR-009). Indonesia-first via Midtrans.
-- Only edge functions (service-role) write to these tables; clients read only
-- their own entitlement via RLS.

-- ── Entitlements: server-owned source of truth for who has premium ──────────
create table if not exists public.entitlements (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  tier               text not null default 'free',      -- 'free' | 'premium'
  status             text not null default 'inactive',  -- 'active' | 'inactive' | 'pending' | 'expired'
  provider           text,                              -- 'midtrans' | 'stripe'
  provider_ref       text,                              -- Midtrans order_id
  billing_period     text,                              -- 'monthly' | 'annual'
  current_period_end timestamptz,
  updated_at         timestamptz not null default now()
);

alter table public.entitlements enable row level security;

-- A signed-in user may read ONLY their own entitlement row.
drop policy if exists "read own entitlement" on public.entitlements;
create policy "read own entitlement"
  on public.entitlements for select
  using (auth.uid() = user_id);
-- No insert/update/delete policies → only the service-role (edge functions) mutate.

-- ── Payment events: idempotency + audit trail for gateway callbacks ─────────
create table if not exists public.payment_events (
  id           text primary key,   -- idempotency key (order_id:status_code)
  provider     text not null,
  order_ref    text,
  raw          jsonb not null,
  processed_at timestamptz not null default now()
);

alter table public.payment_events enable row level security;
-- No policies → service-role only.

-- ── App config: server-only config/secrets read by edge functions ──────────
-- NOTE (production hardening): move Midtrans keys to Supabase Vault or edge
-- function secrets. This table is service-role-only (RLS, no policies) and is
-- acceptable for the sandbox build.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

alter table public.app_config enable row level security;
-- No policies → service-role only.

revoke all on public.app_config from anon, authenticated;
revoke all on public.payment_events from anon, authenticated;
