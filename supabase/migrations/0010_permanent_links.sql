-- Permanent Links, Invite Codes removed, Premium per Patient (#9; ADR-014).
-- Supersedes the linking path of 0005 (ADR-012): Links are created only by
-- the server functions (create-patient), the Patient can no longer end theirs,
-- and Invite Codes are gone. Existing Links stay.

-- ── Invite Codes are removed ────────────────────────────────────────────────
-- Unused codes go with the table.
drop function public.redeem_invite_code(text);
drop table public.invite_codes;

-- ── The Premium grant lives on the Link ─────────────────────────────────────
-- On for every new Link and, through the default, for every Link that exists
-- at release. It ends with the Link and moves with it on a Transfer. Only the
-- server functions (service role) switch it: clients cannot update Links.
alter table public.patient_links
  add column premium_grant boolean not null default true;

revoke update on public.patient_links from authenticated;

-- ── Links are permanent from the Patient's side ─────────────────────────────
drop policy "patient removes own link" on public.patient_links;

-- The owning Clinician disconnects a Patient only while they hold the role:
-- an Inactive Clinician's Patients stay linked until the role returns or the
-- Admin Transfers them.
drop policy "clinician removes own links" on public.patient_links;
create policy "clinician removes own links"
  on public.patient_links for delete
  using (public.is_clinician() and clinician_id = auth.uid());

-- The Admin ends any Link. A delete that filters rows also checks the select
-- policies, so the Admin reads every Link too.
create policy "admin reads all links"
  on public.patient_links for select
  using (public.is_admin());

create policy "admin removes any link"
  on public.patient_links for delete
  using (public.is_admin());

-- ── get_my_clinician(): the Patient's Clinician and Premium grant ───────────
-- A Patient cannot read their Clinician's profile (0005), so this is how the
-- app shows the Clinician's name (the email when there is no name, never an
-- internal login email: the app decides with shownEmail) and learns whether
-- the Link carries the Premium grant. Null for a User without a Link.
create or replace function public.get_my_clinician()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', p.display_name,
    'email', p.email,
    'contact_email', p.contact_email,
    'premium_grant', l.premium_grant
  )
    from public.patient_links l
    left join public.profiles p on p.user_id = l.clinician_id
   where l.patient_id = auth.uid();
$$;
