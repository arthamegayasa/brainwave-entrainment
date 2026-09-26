-- The Admin deletes an account (#17; ADR-014, ADR-016, ADR-022). Only the
-- delete-account server function (service role) deletes, after the Account
-- rules (mayDeleteAccount) allow it; clients delete no account.

-- ── An Assignment outlives the account that made it ─────────────────────────
-- Audio a deleted account assigned from someone else's Audio Bank stays in
-- the Library it was assigned to; only who assigned it is forgotten.
alter table public.audio_assignments
  drop constraint audio_assignments_assigned_by_fkey,
  add constraint audio_assignments_assigned_by_fkey
    foreign key (assigned_by) references auth.users(id) on delete set null;

-- ── delete_account(): the Admin deletes an account ──────────────────────────
-- Deletes p_user in one transaction, once delete-account has decided that the
-- Admin (p_admin) may:
--   * their Username goes into the Username history (0008), released now. The
--     row's owner turns null with the account, so no one may claim the
--     Username for 30 days and its Personal URL leads nowhere (ADR-016);
--   * Custom Audio they created that is still in someone else's Library (an
--     Assignment to another User, or a Template) moves to p_admin's Audio
--     Bank, so no User's Library loses audio; the rest of their Audio Bank is
--     deleted;
--   * their auth.users row goes, and with it (on delete cascade) their
--     profile, entitlement, Link (whose cleanup, 0015, runs as on a
--     disconnect), Plays and Downloads (0011), password copy (0009), and the
--     Assignments and Hidden Presets for them. Password access-log rows about
--     them stay, their viewer or target turned null: a deleted account (0009).
-- Locking their profile row serializes the deletion with link_new_patient()
-- (0009), transfer_patients() (0015) and link_existing_patient() (0016),
-- which lock a Clinician's profile before Linking a Patient to them, so no
-- Patient is ever Linked to an account being deleted. Re-checks under that
-- lock what the Account rules decided from an earlier read, raising
-- not_allowed (p_admin is not the Admin), account_is_admin or has_patients
-- (Patients still Linked to them, whether they hold the Clinician role or
-- are an Inactive Clinician). security definer: the service role cannot
-- delete from auth.users (as it cannot read it, 0007).
create function public.delete_account(p_user uuid, p_admin uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role     text;
  v_username text;
begin
  if not exists (select 1 from public.profiles where user_id = p_admin and role = 'admin') then
    raise exception 'not_allowed';
  end if;

  select role, username into v_role, v_username
    from public.profiles
   where user_id = p_user
     for update;
  if not found then
    raise exception 'delete_account: no profile for %', p_user;
  end if;
  if v_role = 'admin' then
    raise exception 'account_is_admin';
  end if;
  if exists (select 1 from public.patient_links where clinician_id = p_user) then
    raise exception 'has_patients';
  end if;

  if v_username is not null then
    insert into public.username_history (username, user_id) values (v_username, p_user);
  end if;

  update public.custom_audios ca
     set created_by = p_admin
   where ca.created_by = p_user
     and (
       ca.is_template
       or exists (
         select 1 from public.audio_assignments a
          where a.audio_id = ca.id
            and a.user_id <> p_user
       )
     );
  delete from public.custom_audios where created_by = p_user;

  delete from auth.users where id = p_user;
end;
$$;

revoke execute on function public.delete_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid, uuid) to service_role;
