-- Serenade roles + custom audio library (quick-260707-a47).
-- Two roles: 'user' (default) and 'admin'. Admins design sessions in the
-- Studio and publish them as shared templates or assign them to specific
-- users; users see templates + audios assigned to them via RLS.

-- ── Profiles: one row per auth user, carries the role ───────────────────────
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text,
  role         text not null default 'user' check (role in ('user', 'admin')),
  display_name text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users who signed up before this migration.
insert into public.profiles (user_id, email)
select id, email from auth.users
on conflict do nothing;

-- security definer: profiles' own select policy calls this function; without
-- definer rights the policy would recurse into profiles RLS and loop forever.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- ── Custom audios: admin-designed sessions (templates or per-user) ──────────
create table if not exists public.custom_audios (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid references auth.users(id),
  name         text not null,
  goal_tagline text,
  spec         jsonb not null,
  is_template  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Assignments: which users see which custom audios ────────────────────────
create table if not exists public.audio_assignments (
  audio_id    uuid references public.custom_audios(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  primary key (audio_id, user_id)
);

-- ── Row level security ───────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.custom_audios enable row level security;
alter table public.audio_assignments enable row level security;

-- Profiles: users read their own row; admins read all (for the assign flow).
-- NO insert/update/delete policies — role changes happen ONLY via SQL editor
-- or the service role (prevents client-side privilege escalation).
drop policy if exists "read own profile or admin" on public.profiles;
create policy "read own profile or admin"
  on public.profiles for select
  using (auth.uid() = user_id or public.is_admin());

-- Custom audios: admins get full CRUD; users read templates + assigned rows.
drop policy if exists "admin full access" on public.custom_audios;
create policy "admin full access"
  on public.custom_audios for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "read templates and assigned" on public.custom_audios;
create policy "read templates and assigned"
  on public.custom_audios for select
  to authenticated
  using (
    is_template = true
    or exists (
      select 1 from public.audio_assignments a
      where a.audio_id = id and a.user_id = auth.uid()
    )
  );

-- Assignments: admins manage; users can only see their own rows.
drop policy if exists "admin manage assignments" on public.audio_assignments;
create policy "admin manage assignments"
  on public.audio_assignments for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "read own assignments" on public.audio_assignments;
create policy "read own assignments"
  on public.audio_assignments for select
  using (auth.uid() = user_id);
