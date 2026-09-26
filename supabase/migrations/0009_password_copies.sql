-- Password copies and the password access log (#8; ADR-015). Whenever the
-- server sets a Patient's password (created, reset by their Clinician or the
-- Admin, changed by the Patient in Account), it keeps a copy encrypted with a
-- key that lives outside the database, as a function secret
-- (PASSWORD_COPY_KEY). Every reveal is logged with viewer, target and time.
--
-- Both tables are for the server functions (service role) only: no policies
-- and no table privileges for clients (defence in depth, as 0004). The Admin
-- reads the access log through the password-access-log server function.

-- ── Clinician origin ────────────────────────────────────────────────────────
-- Where a Clinician's role came from (ADR-014): 'subscription', or 'admin'
-- when the Admin granted it. The Admin may reveal and reset the password of a
-- Clinician they created. Null when no origin is recorded.
alter table public.profiles
  add column clinician_origin text,
  add constraint profiles_clinician_origin_check
    check (clinician_origin in ('subscription', 'admin'));

-- ── Password copies ─────────────────────────────────────────────────────────
-- One copy per account: base64 of the AES-GCM nonce followed by the
-- ciphertext. Deleted with the account, and with the Patient's Link (below).
create table public.password_copies (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

alter table public.password_copies enable row level security;
revoke all on public.password_copies from anon, authenticated;

-- ── Password access log ─────────────────────────────────────────────────────
-- One row per reveal. Rows outlive the accounts they name: a deleted viewer
-- or target reads as null, a deleted account.
create table public.password_access_log (
  id          bigint generated always as identity primary key,
  viewer_id   uuid references auth.users(id) on delete set null,
  target_id   uuid references auth.users(id) on delete set null,
  revealed_at timestamptz not null default now()
);

create index password_access_log_revealed_at_idx
  on public.password_access_log (revealed_at desc);

alter table public.password_access_log enable row level security;
revoke all on public.password_access_log from anon, authenticated;

-- ── Removing a Link deletes the Patient's copy ──────────────────────────────
-- Extends the unlink cleanup of 0005: once the Link is gone, its former
-- Clinician must not see the Patient's password again. A Clinician the Admin
-- created keeps their copy, which the Admin may still reveal (keepsPasswordCopy
-- in the Account rules). A Transfer moves the Link instead of deleting it, so
-- the copy stays.
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
  delete from public.password_copies
   where user_id = old.patient_id
     and not exists (
       select 1 from public.profiles
        where user_id = old.patient_id
          and role = 'clinician'
          and clinician_origin = 'admin'
     );
  return old;
end;
$$;

-- ── Creating a Patient stores the copy ──────────────────────────────────────
-- link_new_patient() (0007) gains the new Patient's password copy, stored in
-- the same transaction as the profile and the Link, so no Patient created
-- through create-patient is ever without one.
drop function public.link_new_patient(uuid, uuid, text, text, text, integer);

create function public.link_new_patient(
  p_clinician     uuid,
  p_patient       uuid,
  p_name          text,
  p_username      text,
  p_contact_email text,
  p_patient_limit integer,
  p_password_copy text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.profiles where user_id = p_clinician for update;

  if p_patient_limit is not null
     and (select count(*) from public.patient_links where clinician_id = p_clinician)
         >= p_patient_limit then
    raise exception 'patient_limit_reached';
  end if;

  update public.profiles
     set display_name = p_name,
         username = p_username,
         contact_email = p_contact_email
   where user_id = p_patient;
  if not found then
    raise exception 'link_new_patient: no profile for %', p_patient;
  end if;

  insert into public.patient_links (clinician_id, patient_id)
  values (p_clinician, p_patient);

  insert into public.password_copies (user_id, ciphertext)
  values (p_patient, p_password_copy);
end;
$$;

revoke execute on function public.link_new_patient(uuid, uuid, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.link_new_patient(uuid, uuid, text, text, text, integer, text)
  to service_role;
