-- Serenade clinician platform (quick-260714-a8a).
-- 3-role model: 'user' (default), 'clinician' (paid professional tier), and
-- 'admin'. Clinicians link patients via single-use invite codes, curate which
-- built-in presets each patient sees, and manage a personal Audio Bank of
-- Studio sessions (with category + notes) assignable to linked patients.

-- ── D-01: widen the role check to user / clinician / admin ──────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'clinician', 'admin'));

-- is_clinician(): true for clinicians AND admins (admins inherit clinician
-- powers). security definer + stable, mirroring is_admin() from 0002; the
-- 0004 hardening pattern applies — anon/public lose EXECUTE, authenticated
-- keeps it because RLS policies evaluate the function as the querying role.
create or replace function public.is_clinician()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role in ('clinician', 'admin')
  );
$$;

revoke execute on function public.is_clinician() from public, anon;

-- ── D-02: patient linking tables ─────────────────────────────────────────────

-- One row per clinician↔patient link. unique(patient_id) enforces at most ONE
-- clinician per patient.
create table if not exists public.patient_links (
  clinician_id uuid references auth.users(id) on delete cascade,
  patient_id   uuid references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (clinician_id, patient_id),
  unique (patient_id)
);

-- Single-use invite codes: 8 uppercase hex chars from gen_random_uuid(),
-- 30-day expiry, consumed by the redeem_invite_code() definer RPC.
create table if not exists public.invite_codes (
  code         text primary key default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  clinician_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 days'),
  -- on delete set null: a redeemed code records used_by, but deleting that
  -- patient's auth.users row (dashboard/GDPR erasure) must not FK-fail — keep
  -- the code marked consumed while dropping the dangling reference.
  used_by      uuid references auth.users(id) on delete set null,
  used_at      timestamptz
);

-- Per-patient curation of built-in presets. A row present means that built-in
-- preset is HIDDEN for that patient (default = everything visible).
create table if not exists public.template_visibility (
  clinician_id uuid references auth.users(id) on delete cascade,
  patient_id   uuid references auth.users(id) on delete cascade,
  preset_id    text not null,
  created_at   timestamptz not null default now(),
  primary key (clinician_id, patient_id, preset_id)
);

-- ── D-02: Audio Bank metadata on custom_audios ──────────────────────────────
alter table public.custom_audios
  add column category text not null default 'other'
    check (category in ('sleep', 'meditation', 'relaxation', 'anxiety', 'focus', 'energy', 'creativity', 'other')),
  add column notes text;

-- ── D-05: redeem_invite_code() — the ONLY path that inserts patient_links ───
-- security definer: the patient can neither read invite_codes (clinician-only
-- RLS) nor insert into patient_links (no insert policy) — this RPC does both
-- atomically after validating the code.
create or replace function public.redeem_invite_code(invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text := upper(trim(invite_code));
  v_row   public.invite_codes%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;

  -- FOR UPDATE locks the code row so two patients redeeming the same code
  -- concurrently serialize: the second waits, then sees used_by set and is
  -- rejected. Without the lock both could pass the used_by IS NULL check.
  select * into v_row from public.invite_codes where code = v_code for update;
  if not found then
    return jsonb_build_object('error', 'invalid_code');
  end if;

  if v_row.used_by is not null then
    return jsonb_build_object('error', 'already_used');
  end if;

  if v_row.expires_at < now() then
    return jsonb_build_object('error', 'expired');
  end if;

  if exists (select 1 from public.patient_links where patient_id = auth.uid()) then
    return jsonb_build_object('error', 'already_linked');
  end if;

  -- Self-link guard: a clinician redeeming their own code gets the same
  -- uniform error shape as a bad code (no oracle about code ownership).
  if v_row.clinician_id = auth.uid() then
    return jsonb_build_object('error', 'invalid_code');
  end if;

  insert into public.patient_links (clinician_id, patient_id)
  values (v_row.clinician_id, auth.uid());

  update public.invite_codes
  set used_by = auth.uid(), used_at = now()
  where code = v_code;

  select email into v_email
  from public.profiles
  where user_id = v_row.clinician_id;

  return jsonb_build_object('clinician_email', v_email);
end;
$$;

revoke execute on function public.redeem_invite_code(text) from public, anon;
grant execute on function public.redeem_invite_code(text) to authenticated;

-- ── D-05: get_my_clinician() — patient-side lookup of the linked clinician ──
-- The profiles select policy does NOT let a patient read their clinician's
-- profile row; this definer RPC is the single sanctioned path to the email.
create or replace function public.get_my_clinician()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinician uuid;
  v_email     text;
begin
  select clinician_id into v_clinician
  from public.patient_links
  where patient_id = auth.uid();

  if not found then
    return null;
  end if;

  select email into v_email
  from public.profiles
  where user_id = v_clinician;

  return jsonb_build_object('clinician_email', v_email);
end;
$$;

revoke execute on function public.get_my_clinician() from public, anon;
grant execute on function public.get_my_clinician() to authenticated;

-- ── Unlink cleanup: sever the link, sever its curation and access ───────────
-- template_visibility and audio_assignments are NOT FK-tied to patient_links,
-- and the clinician RLS policies require the link to EXIST — so once the link
-- is gone (either side can delete it) neither party could remove the orphans:
-- hidden presets would stay hidden forever and the ex-patient would keep
-- playing the clinician's assigned audio. This definer trigger does the
-- cascade the schema can't express, running regardless of who severed the link.
create or replace function public.cleanup_patient_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.template_visibility
   where clinician_id = old.clinician_id
     and patient_id = old.patient_id;
  delete from public.audio_assignments
   where user_id = old.patient_id
     and audio_id in (
       select id from public.custom_audios where created_by = old.clinician_id
     );
  return old;
end;
$$;

drop trigger if exists on_patient_link_deleted on public.patient_links;
create trigger on_patient_link_deleted
  after delete on public.patient_links
  for each row execute function public.cleanup_patient_link();

-- ── D-02: row level security on the new tables ──────────────────────────────
alter table public.patient_links enable row level security;
alter table public.invite_codes enable row level security;
alter table public.template_visibility enable row level security;

-- patient_links: both sides can read and sever their own link. NO insert
-- policy — links are created exclusively by the redeem_invite_code() RPC.
drop policy if exists "clinician reads own links" on public.patient_links;
create policy "clinician reads own links"
  on public.patient_links for select
  using (clinician_id = auth.uid());

drop policy if exists "clinician removes own links" on public.patient_links;
create policy "clinician removes own links"
  on public.patient_links for delete
  using (clinician_id = auth.uid());

drop policy if exists "patient reads own link" on public.patient_links;
create policy "patient reads own link"
  on public.patient_links for select
  using (patient_id = auth.uid());

drop policy if exists "patient removes own link" on public.patient_links;
create policy "patient removes own link"
  on public.patient_links for delete
  using (patient_id = auth.uid());

-- invite_codes: clinicians manage their own codes (select / insert / delete).
drop policy if exists "clinician reads own codes" on public.invite_codes;
create policy "clinician reads own codes"
  on public.invite_codes for select
  using (public.is_clinician() and clinician_id = auth.uid());

drop policy if exists "clinician creates own codes" on public.invite_codes;
create policy "clinician creates own codes"
  on public.invite_codes for insert
  with check (public.is_clinician() and clinician_id = auth.uid());

drop policy if exists "clinician deletes own codes" on public.invite_codes;
create policy "clinician deletes own codes"
  on public.invite_codes for delete
  using (public.is_clinician() and clinician_id = auth.uid());

-- template_visibility: a clinician curates only their own linked patients;
-- patients read the rows that hide presets from them.
drop policy if exists "clinician curates own patients" on public.template_visibility;
create policy "clinician curates own patients"
  on public.template_visibility for all
  using (
    public.is_clinician()
    and clinician_id = auth.uid()
    and exists (
      select 1 from public.patient_links pl
      where pl.clinician_id = auth.uid()
        and pl.patient_id = template_visibility.patient_id
    )
  )
  with check (
    public.is_clinician()
    and clinician_id = auth.uid()
    and exists (
      select 1 from public.patient_links pl
      where pl.clinician_id = auth.uid()
        and pl.patient_id = template_visibility.patient_id
    )
  );

drop policy if exists "patient reads own visibility" on public.template_visibility;
create policy "patient reads own visibility"
  on public.template_visibility for select
  using (patient_id = auth.uid());

-- ── D-02: replace admin-era policies with clinician-aware ones ──────────────

-- custom_audios: clinicians own their rows; admins keep full access.
-- The 0002 "read templates and assigned" select policy stays untouched.
drop policy if exists "admin full access" on public.custom_audios;

-- with check forbids is_template = true: templates are visible to EVERY
-- authenticated user via 0002's "read templates and assigned" policy, so
-- publishing them is an admin-only privilege. Without this, any paying
-- clinician could POST/PATCH is_template=true and inject audio app-wide.
-- (USING stays unrestricted so a clinician can still read/delete their own
-- rows; they can never own an is_template=true row in the first place.)
drop policy if exists "clinician manage own" on public.custom_audios;
create policy "clinician manage own"
  on public.custom_audios for all
  using (public.is_clinician() and created_by = auth.uid())
  with check (public.is_clinician() and created_by = auth.uid() and is_template = false);

drop policy if exists "admin all" on public.custom_audios;
create policy "admin all"
  on public.custom_audios for all
  using (public.is_admin())
  with check (public.is_admin());

-- audio_assignments: a clinician may only assign audio they created to
-- patients they are linked with (both existence-checked — no IDOR).
-- The 0002 "read own assignments" select policy stays untouched.
drop policy if exists "admin manage assignments" on public.audio_assignments;

drop policy if exists "clinician assign own audio to own patient" on public.audio_assignments;
create policy "clinician assign own audio to own patient"
  on public.audio_assignments for all
  using (
    public.is_clinician()
    and exists (
      select 1 from public.custom_audios ca
      where ca.id = audio_id and ca.created_by = auth.uid()
    )
    and exists (
      select 1 from public.patient_links pl
      where pl.clinician_id = auth.uid() and pl.patient_id = user_id
    )
  )
  with check (
    public.is_clinician()
    and exists (
      select 1 from public.custom_audios ca
      where ca.id = audio_id and ca.created_by = auth.uid()
    )
    and exists (
      select 1 from public.patient_links pl
      where pl.clinician_id = auth.uid() and pl.patient_id = user_id
    )
  );

drop policy if exists "admin all assignments" on public.audio_assignments;
create policy "admin all assignments"
  on public.audio_assignments for all
  using (public.is_admin())
  with check (public.is_admin());

-- profiles: own row, admins see all, clinicians see ONLY their linked
-- patients (clinicians lose the listAllUsers breadth admins have).
drop policy if exists "read own profile or admin" on public.profiles;
create policy "read own profile or admin"
  on public.profiles for select
  using (
    auth.uid() = user_id
    or public.is_admin()
    or (
      -- is_clinician() gate: a user demoted from clinician (failed/lapsed
      -- order) must lose patient-PII access even while stale patient_links
      -- rows persist until each patient disconnects.
      public.is_clinician()
      and exists (
        select 1 from public.patient_links pl
        where pl.clinician_id = auth.uid() and pl.patient_id = user_id
      )
    )
  );

-- ── Grants: hide the new tables from anon entirely (0004 pattern). ──────────
-- authenticated keeps default table privileges — RLS gates every row.
revoke all on public.patient_links, public.invite_codes, public.template_visibility from anon;
