-- The Admin manages Clinicians (#14; ADR-014, ADR-015, ADR-018). From the
-- Clinicians & Patients tab the Admin creates Clinician accounts, promotes
-- Users to Clinician and raises a Clinician's Patient limit, all through server
-- functions (service role) that authorize with the Account rules; profiles
-- stay non-writable from the client (0004). Every Clinician's role now records
-- its origin (0009): 'subscription' or 'admin' (granted by the Admin). The
-- payment webhook only promotes or demotes subscription Clinicians.

-- ── Existing Clinicians get an origin ───────────────────────────────────────
-- A Clinician with an active clinician subscription holds the role through
-- it; every other Clinician (for example one made by hand, like
-- arthamegayasa@gmail.com) now holds it as granted by the Admin, which
-- payments never touch.
update public.profiles p
   set clinician_origin = case
         when exists (
           select 1
             from public.entitlements e
            where e.user_id = p.user_id
              and e.tier = 'clinician'
              and e.status = 'active'
         ) then 'subscription'
         else 'admin'
       end
 where p.role = 'clinician'
   and p.clinician_origin is null;

-- ── complete_new_clinician(): a Clinician the Admin creates ─────────────────
-- Completes the account the create-clinician server function just created in
-- Auth with the Clinician's real email and password (ADR-018): names the
-- profile, grants the Clinician role with the Admin as its origin, and stores
-- the password copy the Admin may reveal (ADR-015), in one transaction. Only a
-- plain User's profile qualifies, so an account the signup trigger made the
-- Admin never becomes a Clinician. Runs with the caller's rights: only the
-- service role may write profiles and password copies.
create function public.complete_new_clinician(
  p_user          uuid,
  p_name          text,
  p_password_copy text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.profiles
     set display_name = p_name,
         role = 'clinician',
         clinician_origin = 'admin'
   where user_id = p_user
     and role = 'user';
  if not found then
    raise exception 'complete_new_clinician: no new profile for %', p_user;
  end if;

  insert into public.password_copies (user_id, ciphertext)
  values (p_user, p_password_copy);
end;
$$;

revoke execute on function public.complete_new_clinician(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_new_clinician(uuid, text, text)
  to service_role;

-- ── password_login_email(): Clinicians the Admin created use a password ─────
-- Extends 0007. Besides a Username or a contact email, an account's own login
-- email resolves to "password" once the account keeps a password copy: every
-- Clinician the Admin created (their login email is their real email,
-- ADR-018), and a User the Admin promoted once the Admin has set their
-- password. Every other email still gets a magic link. A direct magic-link
-- sign-up can make an account whose login email is a Patient's contact email
-- (ADR-018); the Username or contact email match wins, so this never changes
-- an answer 0007 gave. Privileges stay as 0007 set them (service role only).
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
      or p.contact_email = lower(p_identifier)
      or (
        lower(u.email) = lower(p_identifier)
        and exists (select 1 from public.password_copies c where c.user_id = p.user_id)
      )
   order by (p.username = p_identifier or p.contact_email = lower(p_identifier)) is true desc
   limit 1;
$$;
