-- Username changes, redirects and 30-day locks (#7; ADR-016). A Clinician (for
-- their own Patients) or the Admin changes a Username through the
-- change-username server function, which runs as the service role and decides
-- with the Account rules module; this migration keeps the history those
-- decisions read.

-- ── Username history ────────────────────────────────────────────────────────
-- One row per release of a Username: the Username, the account that held it
-- and when it let go. The latest release of an unclaimed Username decides where
-- its old Personal URL redirects (the owner's current Username) and until when
-- no other account may claim it (30 days after the release).
--
-- A deleted account's rows stay, with a null owner, so its released Usernames
-- stay locked for their full 30 days.
create table public.username_history (
  id          bigint generated always as identity primary key,
  username    text not null check (username ~ '^[a-z0-9-]{3,30}$'),
  user_id     uuid references auth.users(id) on delete set null,
  released_at timestamptz not null default now()
);

create index username_history_username_idx
  on public.username_history (username, released_at desc);

-- Only the server functions (service role) read and write it: no policies, and
-- no table privileges for clients (defence in depth, as 0004).
alter table public.username_history enable row level security;
revoke all on public.username_history from anon, authenticated;

-- ── Server-function helpers (service role only) ─────────────────────────────

-- One Username as the server functions decide on it, read in one snapshot so a
-- rename committing in between cannot hide both its holder and its release:
-- the account holding it, and its latest release with that owner's current
-- Username. released_at is null when it was never released; owner_id is null
-- when it was never released or its owner's account is deleted.
create or replace function public.username_state(p_username text)
returns table (
  holder_id      uuid,
  owner_id       uuid,
  released_at    timestamptz,
  owner_username text
)
language sql
stable
set search_path = ''
as $$
  select
    (select p.user_id from public.profiles p where p.username = p_username),
    h.user_id,
    h.released_at,
    (select p.username from public.profiles p where p.user_id = h.user_id)
  from (select 1) as one
  left join lateral (
    select user_id, released_at
      from public.username_history
     where username = p_username
     order by released_at desc, id desc
     limit 1
  ) h on true;
$$;

-- Gives an account a new Username and records the one it releases, in one
-- transaction, once change-username has decided the change is allowed.
-- Locking the account's profile row serializes changes to one account, so the
-- released Username recorded is the one it really held. A Username another
-- account took meanwhile fails on profiles_username_key. Runs with the
-- caller's rights: only the service role may write profiles.
create or replace function public.change_username(p_user uuid, p_username text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_old text;
begin
  select username into v_old from public.profiles where user_id = p_user for update;
  if v_old is null then
    raise exception 'change_username: % has no Username', p_user;
  end if;
  if v_old = p_username then
    return;
  end if;

  update public.profiles set username = p_username where user_id = p_user;
  insert into public.username_history (username, user_id) values (v_old, p_user);
end;
$$;

revoke execute on function public.username_state(text) from public, anon, authenticated;
revoke execute on function public.change_username(uuid, text) from public, anon, authenticated;
grant execute on function public.username_state(text) to service_role;
grant execute on function public.change_username(uuid, text) to service_role;
