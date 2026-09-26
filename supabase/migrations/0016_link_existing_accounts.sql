-- The Admin links an existing User as a Patient; Username + password for a
-- Patient who has none (#16; ADR-014, ADR-015, ADR-018). Both run in server
-- functions (link-patient, add-username-login) as the service role, which
-- authorize with the Account rules (mayLinkExistingAccount,
-- mayAddUsernameLogin); clients still insert no Link (0010) and write no
-- profile (0004).

-- ── add_username_login(): a Patient gets a Username and password ────────────
-- Stores what the database keeps of the new sign-in, once the server function
-- has decided the account may get it: the Username, the account's real email
-- as its contact email (p_contact_email, null when it has none), its new
-- internal login email (ADR-018) mirrored on the profile, and the password
-- copy (ADR-015), replacing the copy of a Clinician the Admin created. The
-- function then moves the account to that login email and password in Auth.
-- Locking the profile row serializes it with change_username() (0008), so an
-- account gets its first Username once. Raises has_username or not_linked
-- when that changed after the Account rules read it; a Username or contact
-- email another account took meanwhile fails on profiles_username_key or
-- profiles_contact_email_key. Runs with the caller's rights: only the service
-- role may write profiles and password copies.
create function public.add_username_login(
  p_user          uuid,
  p_username      text,
  p_contact_email text,
  p_login_email   text,
  p_password_copy text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_username text;
begin
  select username into v_username from public.profiles where user_id = p_user for update;
  if not found then
    raise exception 'add_username_login: no profile for %', p_user;
  end if;
  if v_username is not null then
    raise exception 'has_username';
  end if;
  if not exists (select 1 from public.patient_links where patient_id = p_user) then
    raise exception 'not_linked';
  end if;

  update public.profiles
     set username = p_username,
         contact_email = p_contact_email,
         email = p_login_email
   where user_id = p_user;

  insert into public.password_copies (user_id, ciphertext)
  values (p_user, p_password_copy)
  on conflict (user_id) do update
    set ciphertext = excluded.ciphertext,
        updated_at = now();
end;
$$;

revoke execute on function public.add_username_login(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.add_username_login(uuid, text, text, text, text)
  to service_role;

-- ── link_existing_patient(): the Admin links an existing User ───────────────
-- Creates the Link between p_patient, an account that already exists (a
-- Regular who signed up by magic link, or a Clinician: roles overlap), and
-- p_clinician, with the Premium grant on (0010). With p_username it also gives
-- the new Patient a Username and password in the same transaction
-- (add_username_login above). p_patient_limit is p_clinician's limit from the
-- Account rules (null = no limit, the Admin). Both profiles are locked in the
-- same order as transfer_patients() (0015), so linking, creating and
-- Transferring Patients into one Clinician take turns and the limit is checked
-- on the Links that are really there. Re-checks under that lock what the
-- Account rules decided from an earlier read, raising account_is_admin (the
-- Admin account never becomes a Patient), already_linked, target_is_account,
-- target_not_clinician (p_clinician lost the role meanwhile) or
-- patient_limit_reached. Runs with the caller's rights: only the service role
-- may insert Links.
create function public.link_existing_patient(
  p_clinician     uuid,
  p_patient       uuid,
  p_patient_limit integer,
  p_username      text,
  p_contact_email text,
  p_login_email   text,
  p_password_copy text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1
     from public.profiles
    where user_id in (p_clinician, p_patient)
    order by user_id
      for update;

  if not exists (select 1 from public.profiles where user_id = p_patient) then
    raise exception 'link_existing_patient: no profile for %', p_patient;
  end if;

  if exists (select 1 from public.profiles where user_id = p_patient and role = 'admin') then
    raise exception 'account_is_admin';
  end if;

  if exists (select 1 from public.patient_links where patient_id = p_patient) then
    raise exception 'already_linked';
  end if;

  if p_clinician = p_patient then
    raise exception 'target_is_account';
  end if;

  if not exists (
    select 1 from public.profiles
     where user_id = p_clinician
       and role in ('clinician', 'admin')
  ) then
    raise exception 'target_not_clinician';
  end if;

  if p_patient_limit is not null
     and (select count(*) from public.patient_links where clinician_id = p_clinician)
         >= p_patient_limit then
    raise exception 'patient_limit_reached';
  end if;

  insert into public.patient_links (clinician_id, patient_id)
  values (p_clinician, p_patient);

  if p_username is not null then
    perform public.add_username_login(p_patient, p_username, p_contact_email, p_login_email, p_password_copy);
  end if;
end;
$$;

revoke execute on function public.link_existing_patient(uuid, uuid, integer, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.link_existing_patient(uuid, uuid, integer, text, text, text, text)
  to service_role;

-- ── password_login_email(): a Username never resolves to a real email ──────
-- Replaces 0014. add_username_login() writes the profile before Auth moves the
-- account to its internal login email, so for a moment the account's contact
-- email is still its login email; the same holds if Auth refuses and the
-- profile cannot be put back. An account in that state has not finished
-- moving: its Username and contact email resolve to nothing, so a Username
-- never answers with the account's real email (ADR-018). Every other account
-- with a contact email signs in with a different, internal login email, so no
-- answer 0014 gave changes. Privileges stay as 0007 set them (service role
-- only).
create or replace function public.password_login_email(p_identifier text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
    from public.profiles p
    join auth.users u on u.id = p.user_id
   where (
           (p.username = p_identifier or p.contact_email = lower(p_identifier))
           and lower(u.email) is distinct from p.contact_email
         )
      or (
        lower(u.email) = lower(p_identifier)
        and exists (select 1 from public.password_copies c where c.user_id = p.user_id)
      )
   order by (p.username = p_identifier or p.contact_email = lower(p_identifier)) is true desc
   limit 1;
$$;
