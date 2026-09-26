-- Clinician-created Patient accounts with a Username (#5; ADR-014, ADR-016,
-- ADR-018). A Clinician or the Admin creates the account through the
-- create-patient server function, which runs as the service role; the
-- Patient then signs in with Username (or contact email) + password.
--
-- Profiles stay non-writable from the client (0004): every column added here
-- is written only by server functions.

-- ── Profile fields ──────────────────────────────────────────────────────────
--   username:      platform-wide, a–z 0–9 and hyphen, 3–30 characters. The
--                  format admits lowercase only, so the unique constraint is
--                  case-insensitive; the app and server normalize input first.
--   contact_email: the person's real email when their login email is an
--                  internal one (ADR-018). Stored lowercase, so its unique
--                  constraint is case-insensitive too.
--   patient_limit: how many Patients this Clinician may have. The Admin has
--                  no limit (decided in the Account rules module).
alter table public.profiles
  add column username text,
  add column contact_email text,
  add column patient_limit integer not null default 30;

alter table public.profiles
  add constraint profiles_username_format
    check (username ~ '^[a-z0-9-]{3,30}$'),
  add constraint profiles_username_key unique (username),
  add constraint profiles_contact_email_lowercase
    check (contact_email = lower(contact_email)),
  add constraint profiles_contact_email_key unique (contact_email),
  add constraint profiles_patient_limit_check
    check (patient_limit >= 0);

-- ── Server-function helpers (service role only) ─────────────────────────────

-- True when p_email is any account's login email (Auth) or contact email.
-- "Email already registered" for create Patient (ADR-014). security definer:
-- the service role cannot read auth.users.
create or replace function public.is_email_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email))
      or exists (select 1 from public.profiles where contact_email = lower(p_email));
$$;

-- The login email of the account whose Username or contact email is
-- p_identifier, or null: the resolve-login endpoint answers "password, with
-- this login email" for exactly these accounts (ADR-018). Usernames never
-- contain "@", so the two lookups cannot match different accounts.
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
   where p.username = p_identifier
      or p.contact_email = lower(p_identifier);
$$;

-- Completes a Patient account the server function just created in Auth: sets
-- the profile's name, Username and contact email, and creates the Link.
-- p_patient_limit is the creator's limit from the Account rules module (null
-- = no limit). Locking the creator's profile row serializes one Clinician's
-- creations, so parallel requests cannot pass the limit together. Runs with
-- the caller's rights: only the service role may write profiles and Links.
create or replace function public.link_new_patient(
  p_clinician     uuid,
  p_patient       uuid,
  p_name          text,
  p_username      text,
  p_contact_email text,
  p_patient_limit integer
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
end;
$$;

revoke execute on function public.is_email_registered(text) from public, anon, authenticated;
revoke execute on function public.password_login_email(text) from public, anon, authenticated;
revoke execute on function public.link_new_patient(uuid, uuid, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.is_email_registered(text) to service_role;
grant execute on function public.password_login_email(text) to service_role;
grant execute on function public.link_new_patient(uuid, uuid, text, text, text, integer)
  to service_role;
