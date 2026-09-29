-- The Audio Bank workflow: private notes, Custom Audio made for one Patient,
-- and a save time the Audio Bank sorts by. The Studio edits one Custom Audio
-- at a time and the Audio Bank is where a Clinician finds it again; this
-- migration gives both the data they need and keeps the rules in the
-- database, whatever client writes.

-- ── Private notes leave custom_audios ───────────────────────────────────────
-- custom_audios.notes (0005) is the Clinician's private note, but every
-- assignee reads the whole row ("read templates and assigned", 0006), so the
-- notes reached each Patient's browser. RLS limits rows, not columns: the
-- notes move to their own table that only the audio's owner Clinician and the
-- Admin read or write. The Admin keeps full access as on custom_audios
-- ("admin all", 0005). An owner who loses the Clinician role loses the notes
-- with the rest of their Audio Bank (is_clinician(), 0005).
create table public.custom_audio_notes (
  audio_id uuid primary key references public.custom_audios(id) on delete cascade,
  notes    text not null
);

alter table public.custom_audio_notes enable row level security;

create policy "clinician manages notes of own audio"
  on public.custom_audio_notes for all
  to authenticated
  using (public.is_clinician() and public.is_audio_owner(audio_id))
  with check (public.is_clinician() and public.is_audio_owner(audio_id));

create policy "admin manages all notes"
  on public.custom_audio_notes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 0004 pattern: anon never reads the Audio Bank.
revoke all on public.custom_audio_notes from anon;

insert into public.custom_audio_notes (audio_id, notes)
select id, notes
  from public.custom_audios
 where btrim(coalesce(notes, '')) <> '';

alter table public.custom_audios drop column notes;

-- ── Made for one Patient; what a copy was based on ──────────────────────────
-- made_for: the Patient a Custom Audio was made for (personal audio), null for
-- general audio. Deleting the Patient's account deletes their personal audio
-- (and with it its Assignment and notes); nobody else ever plays it.
-- based_on: the name of the Custom Audio or Template it was copied from, a
-- snapshot shown in the Audio Bank ("Based on …"); it outlives its source.
-- A Template is in every User's Library, so it is never personal: the check's
-- name carries the personal_template error the app maps to copy.
alter table public.custom_audios
  add column made_for uuid references auth.users(id) on delete cascade,
  add column based_on text,
  add constraint custom_audios_personal_template
    check (not (is_template and made_for is not null));

-- Who may make audio for whom, checked whatever the client sends (RLS alone
-- cannot compare a column with another table's rows for the old and new
-- value):
--   * not_your_patient: a Clinician makes audio only for a Patient Linked to
--     them; the Admin for anyone. Only a new or changed made_for is checked,
--     so a Clinician still renames or edits personal audio of a Patient whose
--     Link ended;
--   * assigned_to_others: audio already assigned to anyone besides the old
--     and the new made_for cannot become personal (the app offers Duplicate).
-- security definer: a Clinician reads neither every Assignment of their audio
-- (the Admin may have assigned it) nor, once a Link ended, that Link.
create function public.check_audio_made_for()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.made_for is null
     or (tg_op = 'UPDATE' and new.made_for is not distinct from old.made_for) then
    return new;
  end if;

  if not public.is_admin()
     and not exists (
       select 1 from public.patient_links
        where clinician_id = auth.uid()
          and patient_id = new.made_for
     ) then
    raise exception 'not_your_patient';
  end if;

  if tg_op = 'UPDATE'
     and exists (
       select 1 from public.audio_assignments
        where audio_id = new.id
          and user_id <> new.made_for
          and user_id is distinct from old.made_for
     ) then
    raise exception 'assigned_to_others';
  end if;

  return new;
end;
$$;

create trigger check_made_for
  before insert or update of made_for on public.custom_audios
  for each row execute function public.check_audio_made_for();

-- Personal audio is in its Patient's Library from the moment it is saved:
-- the database assigns it, so no client can save it and forget the
-- Assignment. Moving it from Patient A to Patient B takes it out of A's
-- Library; making it general (A to null) keeps A's Assignment, now an
-- ordinary one. An unchanged made_for does nothing: "update of made_for"
-- fires whenever the column is in the SET list, and re-saving personal audio
-- of a Patient whose Link ended must not put it back in their Library.
-- security definer: the Admin's audio for another Clinician's Patient is
-- assigned too, which no Assignment policy allows a client.
create function public.assign_audio_made_for()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.made_for is not distinct from old.made_for then
    return null;
  end if;

  if tg_op = 'UPDATE'
     and old.made_for is not null
     and new.made_for is not null
     and old.made_for <> new.made_for then
    delete from public.audio_assignments
     where audio_id = new.id
       and user_id = old.made_for;
  end if;

  if new.made_for is not null then
    insert into public.audio_assignments (audio_id, user_id, assigned_by)
    values (new.id, new.made_for, auth.uid())
    on conflict (audio_id, user_id) do nothing;
  end if;

  return null;
end;
$$;

create trigger assign_made_for
  after insert or update of made_for on public.custom_audios
  for each row execute function public.assign_audio_made_for();

-- Personal audio stays personal: nobody, the Admin included, assigns it to
-- anyone but its Patient (the app offers Duplicate instead). security
-- definer: the check reads made_for of audio the assigning User may not read.
create function public.check_personal_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.custom_audios
     where id = new.audio_id
       and made_for is not null
       and made_for <> new.user_id
  ) then
    raise exception 'personal_audio';
  end if;
  return new;
end;
$$;

create trigger check_personal_assignment
  before insert or update on public.audio_assignments
  for each row execute function public.check_personal_assignment();

-- ── updated_at: when the Custom Audio was last saved ────────────────────────
-- The Audio Bank lists the most recently saved first. The database stamps it
-- on every update, so clients never send it and cannot back-date it.
create function public.touch_custom_audio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_updated_at
  before update on public.custom_audios
  for each row execute function public.touch_custom_audio();

-- Only their triggers run these (0018 pattern): no client needs EXECUTE.
revoke execute on function public.check_audio_made_for() from public, anon, authenticated;
revoke execute on function public.assign_audio_made_for() from public, anon, authenticated;
revoke execute on function public.check_personal_assignment() from public, anon, authenticated;
revoke execute on function public.touch_custom_audio() from public, anon, authenticated;

-- ── A Transfer takes the Patient's personal audio along ─────────────────────
-- Extends cleanup_patient_link() (0015; ADR-020). On a Transfer the Patient's
-- personal audio in the old Clinician's Audio Bank (with its notes) moves to
-- the new Clinician first, so its Assignment is no longer the old
-- Clinician's and survives the cleanup below: the Patient keeps it and the
-- new Clinician edits it. Everything else is as in 0015. When the Link ends,
-- personal audio stays with its maker and leaves the Patient's Library like
-- any other Assignment of the Clinician; delete_account() (0017) deletes it
-- with the rest of that Audio Bank, since no one else's Library holds it.
create or replace function public.cleanup_patient_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    update public.custom_audios
       set created_by = new.clinician_id
     where made_for = old.patient_id
       and created_by = old.clinician_id;
  end if;
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

-- create or replace keeps the privileges, but restate 0018's revoke.
revoke execute on function public.cleanup_patient_link() from public, anon, authenticated;
