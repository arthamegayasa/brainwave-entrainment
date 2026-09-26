-- Fix: infinite recursion between the Custom Audio and Assignment policies
-- (#19). 0002's custom_audios "read templates and assigned" policy reads
-- audio_assignments, and 0005's audio_assignments "clinician assign own audio
-- to own patient" policy reads custom_audios. Postgres applies each table's
-- policies inside the other's subquery, so every signed-in read of either
-- table failed with "infinite recursion detected in policy".
--
-- Both cross-table reads now go through security definer helpers that read
-- the other table without its RLS (as is_admin() reads profiles), so neither
-- table's policies expand the other's. Visibility is unchanged, because each
-- helper only matches rows the signed-in User could already read there:
--   - is_audio_assignee(): their own Assignments ("read own assignments");
--   - is_audio_owner(): their own Custom Audio, always combined with
--     is_clinician(), and a Clinician reads all of it ("clinician manage own").
-- Policy names, commands and roles stay as 0002/0005 created them.

-- True when Custom Audio p_audio_id is assigned to the signed-in User.
create or replace function public.is_audio_assignee(p_audio_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.audio_assignments
    where audio_id = p_audio_id and user_id = auth.uid()
  );
$$;

-- True when the signed-in User created Custom Audio p_audio_id.
create or replace function public.is_audio_owner(p_audio_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.custom_audios
    where id = p_audio_id and created_by = auth.uid()
  );
$$;

-- 0004 pattern: no RPC entry point for anon; authenticated MUST keep EXECUTE
-- because the policies below evaluate these as the querying role.
revoke execute on function public.is_audio_assignee(uuid) from public, anon;
revoke execute on function public.is_audio_owner(uuid) from public, anon;
grant execute on function public.is_audio_assignee(uuid) to authenticated;
grant execute on function public.is_audio_owner(uuid) to authenticated;

alter policy "read templates and assigned" on public.custom_audios
  using (
    is_template = true
    or public.is_audio_assignee(id)
  );

alter policy "clinician assign own audio to own patient" on public.audio_assignments
  using (
    public.is_clinician()
    and public.is_audio_owner(audio_id)
    and exists (
      select 1 from public.patient_links pl
      where pl.clinician_id = auth.uid() and pl.patient_id = audio_assignments.user_id
    )
  )
  with check (
    public.is_clinician()
    and public.is_audio_owner(audio_id)
    and exists (
      select 1 from public.patient_links pl
      where pl.clinician_id = auth.uid() and pl.patient_id = audio_assignments.user_id
    )
  );
