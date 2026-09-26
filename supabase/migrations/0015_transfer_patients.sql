-- Transfer Patients and remove the Clinician role (#15; ADR-014). Only the
-- Admin does either, through the transfer-patients and remove-clinician-role
-- server functions (service role), which authorize with the Account rules
-- (mayTransferPatients, mayRemoveClinicianRole). Clients still update no Link
-- (0010) and write no profile (0004).

-- ── Moving a Link cleans up after the old Clinician ─────────────────────────
-- A Transfer moves the Patient's Link to the new Clinician: the Link keeps its
-- Premium grant and created_at, and the Patient keeps their Listening
-- History, Username and password copy. The old Clinician's Assignments and
-- Hidden Presets for the Patient go, as on a disconnect (0005, 0009), so the
-- new Clinician starts curation from a clean state. The Admin's Hidden
-- Presets for the Patient carry the old Clinician's id (0013) and go too;
-- Assignments of audio from anyone else's Audio Bank stay. Extends
-- cleanup_patient_link() (0009): only a deleted Link takes the password copy.
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
  if tg_op = 'DELETE' then
    delete from public.password_copies
     where user_id = old.patient_id
       and not exists (
         select 1 from public.profiles
          where user_id = old.patient_id
            and role = 'clinician'
            and clinician_origin = 'admin'
       );
  end if;
  return old;
end;
$$;

create trigger on_patient_link_moved
  after update of clinician_id on public.patient_links
  for each row
  when (old.clinician_id is distinct from new.clinician_id)
  execute function public.cleanup_patient_link();

-- ── transfer_patients(): the Admin Transfers Patients ───────────────────────
-- Moves the Link of one Patient of p_from (p_patient), or of every Patient of
-- p_from (p_patient null), to p_to, all of them or none. p_patient_limit is
-- p_to's limit from the Account rules (null = no limit, the Admin). Both
-- profiles are locked, always in the same order so two Transfers never
-- deadlock; link_new_patient() (0009) locks its creator's profile too, so
-- Patient creation and Transfers into one Clinician take turns and the limit
-- is checked on the Links that are really there. Re-checks under that lock
-- what the Account rules decided from an earlier read, raising not_linked
-- (nothing of p_from's to move: a Link moved or ended meanwhile),
-- same_clinician, target_not_clinician (p_to lost the role meanwhile),
-- target_is_patient or patient_limit_reached. Returns how many Patients
-- moved. Runs with the caller's rights: only the service role may update
-- Links.
create function public.transfer_patients(
  p_from          uuid,
  p_patient       uuid,
  p_to            uuid,
  p_patient_limit integer
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_moving integer;
begin
  perform 1
     from public.profiles
    where user_id in (p_from, p_to)
    order by user_id
      for update;

  select count(*) into v_moving
    from public.patient_links
   where clinician_id = p_from
     and (p_patient is null or patient_id = p_patient);
  if v_moving = 0 then
    raise exception 'not_linked';
  end if;

  if p_to = p_from then
    raise exception 'same_clinician';
  end if;

  if not exists (
    select 1 from public.profiles
     where user_id = p_to
       and role in ('clinician', 'admin')
  ) then
    raise exception 'target_not_clinician';
  end if;

  if exists (
    select 1 from public.patient_links
     where clinician_id = p_from
       and patient_id = p_to
       and (p_patient is null or patient_id = p_patient)
  ) then
    raise exception 'target_is_patient';
  end if;

  if p_patient_limit is not null
     and (select count(*) from public.patient_links where clinician_id = p_to) + v_moving
         > p_patient_limit then
    raise exception 'patient_limit_reached';
  end if;

  update public.patient_links
     set clinician_id = p_to
   where clinician_id = p_from
     and (p_patient is null or patient_id = p_patient);

  return v_moving;
end;
$$;

revoke execute on function public.transfer_patients(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.transfer_patients(uuid, uuid, uuid, integer)
  to service_role;

-- ── remove_clinician_role(): the Admin removes the Clinician role ───────────
-- In one transaction: Transfers every Patient of p_clinician to p_to (when
-- p_to is given), then takes the role and its origin away. The role never
-- goes while a Patient is still Linked to them (transfer_target_required),
-- so no Patient is left unmonitored. Afterwards they are a Regular, or still
-- the Patient of their own Clinician. A Regular keeps no password copy
-- (keepsPasswordCopy in the Account rules): the copy of a Clinician the Admin
-- created goes unless they are someone's Patient, and they sign in with a
-- magic link again, like every Regular. Their Patient limit stays for a later
-- promotion. p_patient_limit is p_to's limit from the Account rules (null =
-- no limit, the Admin). Raises not_clinician (they no longer hold the role),
-- transfer_target_required, or what transfer_patients() raises. Runs with the
-- caller's rights: only the service role may write profiles and Links.
create function public.remove_clinician_role(
  p_clinician     uuid,
  p_to            uuid,
  p_patient_limit integer
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1
     from public.profiles
    where user_id in (p_clinician, p_to)
    order by user_id
      for update;

  if not exists (
    select 1 from public.profiles
     where user_id = p_clinician
       and role = 'clinician'
  ) then
    raise exception 'not_clinician';
  end if;

  if p_to is not null
     and exists (select 1 from public.patient_links where clinician_id = p_clinician) then
    perform public.transfer_patients(p_clinician, null, p_to, p_patient_limit);
  end if;

  if exists (select 1 from public.patient_links where clinician_id = p_clinician) then
    raise exception 'transfer_target_required';
  end if;

  update public.profiles
     set role = 'user',
         clinician_origin = null
   where user_id = p_clinician;

  delete from public.password_copies
   where user_id = p_clinician
     and not exists (select 1 from public.patient_links where patient_id = p_clinician);
end;
$$;

revoke execute on function public.remove_clinician_role(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.remove_clinician_role(uuid, uuid, integer)
  to service_role;
