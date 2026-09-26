-- The Admin's Clinicians & Patients tab (#13; ADR-014): one aggregate read of
-- every User for the Admin, and the Admin curating any Patient's Hidden
-- Presets exactly as that Patient's Clinician would. Links keep what 0010
-- gave the Admin (read and end any Link): creating, moving and switching a
-- Link stay with the server functions, which enforce the Account rules.

-- ── listening_week(): the 7-day aggregates of the Dashboard's tables ───────
-- Moved out of patient_activity() (0012) so the Admin's read counts the same
-- days the same way. For each User in p_users:
--   - the start of their latest Play;
--   - their time zone: that of their latest Play, else of their latest
--     Download, among the IANA zone names the database knows (null without
--     either). Zones are device-reported text: 'UTC+7' or 'PST' would pass
--     AT TIME ZONE but are no IANA name, which the app's clock (Intl) needs;
--   - Plays, stopped Plays and seconds heard in the last 7 days: today and the
--     6 days before it in their zone (UTC without one), a Play belonging to
--     the day it started on, as in the report;
--   - the seconds heard on each of those 7 days, oldest first.
--
-- security invoker: the caller's row-level security decides which Plays and
-- Downloads count, so it reveals nothing the caller could not read anyway.
create function public.listening_week(p_users uuid[])
returns table (
  user_id            uuid,
  last_play_at       timestamptz,
  time_zone          text,
  plays_7d           integer,
  stopped_7d         integer,
  listened_sec_7d    integer,
  daily_listened_sec integer[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- Read once per call: the view scans the zone files on disk.
  with iana_zones as materialized (
    select name
      from pg_catalog.pg_timezone_names
     where name not like 'posix/%' and name not like 'right/%'
  )
  select
    u.id,
    last_play.started_at,
    zone.name,
    week.plays,
    week.stopped,
    week.listened_sec,
    week.daily_sec
  from unnest(p_users) as u(id)
  left join lateral (
    select p.started_at
      from public.plays p
     where p.user_id = u.id
     order by p.started_at desc
     limit 1
  ) last_play on true
  cross join lateral (
    select coalesce(
      (select p.time_zone
         from public.plays p
        where p.user_id = u.id and p.time_zone in (select name from iana_zones)
        order by p.started_at desc
        limit 1),
      (select d.time_zone
         from public.downloads d
        where d.user_id = u.id and d.time_zone in (select name from iana_zones)
        order by d.downloaded_at desc
        limit 1)
    ) as name
  ) zone
  cross join lateral (
    select
      sum(day.plays)::integer as plays,
      sum(day.stopped)::integer as stopped,
      sum(day.listened_sec)::integer as listened_sec,
      array_agg(day.listened_sec order by day.ago desc) as daily_sec
    from (
      select
        ago.n as ago,
        count(p.id) as plays,
        count(p.id) filter (where p.outcome = 'stopped') as stopped,
        coalesce(sum(p.listened_sec), 0)::integer as listened_sec
      from generate_series(0, 6) as ago(n)
      left join public.plays p
        on p.user_id = u.id
       -- Bounds the index scan; the day test below decides.
       and p.started_at >= now() - interval '8 days'
       and (p.started_at at time zone coalesce(zone.name, 'UTC'))::date
           = (now() at time zone coalesce(zone.name, 'UTC'))::date - ago.n
      group by ago.n
    ) day
  ) week;
$$;

revoke execute on function public.listening_week(uuid[]) from public, anon;
grant execute on function public.listening_week(uuid[]) to authenticated;

-- ── patient_activity(): unchanged, on top of listening_week() ─────────────
-- Still one row per Patient of the calling Clinician (the Admin gets their own
-- Patients here), and nothing while the caller does not hold the role.
create or replace function public.patient_activity()
returns table (
  patient_id         uuid,
  account_created_at timestamptz,
  last_play_at       timestamptz,
  time_zone          text,
  plays_7d           integer,
  stopped_7d         integer,
  listened_sec_7d    integer,
  daily_listened_sec integer[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.patient_id,
    pr.created_at,
    week.last_play_at,
    week.time_zone,
    week.plays_7d,
    week.stopped_7d,
    week.listened_sec_7d,
    week.daily_listened_sec
  from public.patient_links l
  join public.profiles pr on pr.user_id = l.patient_id
  join public.listening_week(array(
    select own.patient_id
      from public.patient_links own
     where own.clinician_id = auth.uid()
       and public.is_clinician()
  )) week on week.user_id = l.patient_id
  where l.clinician_id = auth.uid()
    and public.is_clinician()
  order by l.created_at;
$$;

-- ── user_overview(): every User, for the Admin ────────────────────────────
-- One row per User with what the Clinicians & Patients tab shows: their
-- profile (name, Username, emails, role, Clinician origin, Patient limit,
-- account creation), their Link if they are a Patient (the Clinician, since
-- when, the Premium grant), how much Custom Audio is assigned to them, and
-- their week of listening. A Clinician's caseload, Inactive Clinicians and
-- Regulars all follow from these rows in the app (Account rules), so the
-- roles are derived in one place.
--
-- security invoker: the Admin's row-level security reads every profile, Link,
-- Assignment and Play; anyone else gets no rows at all.
create function public.user_overview()
returns table (
  user_id            uuid,
  display_name       text,
  username           text,
  email              text,
  contact_email      text,
  role               text,
  clinician_origin   text,
  patient_limit      integer,
  account_created_at timestamptz,
  clinician_id       uuid,
  linked_at          timestamptz,
  premium_grant      boolean,
  assigned_count     integer,
  last_play_at       timestamptz,
  time_zone          text,
  plays_7d           integer,
  stopped_7d         integer,
  listened_sec_7d    integer,
  daily_listened_sec integer[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pr.user_id,
    pr.display_name,
    pr.username,
    pr.email,
    pr.contact_email,
    pr.role,
    pr.clinician_origin,
    pr.patient_limit,
    pr.created_at,
    l.clinician_id,
    l.created_at,
    l.premium_grant,
    (select count(*)::integer from public.audio_assignments a where a.user_id = pr.user_id),
    week.last_play_at,
    week.time_zone,
    week.plays_7d,
    week.stopped_7d,
    week.listened_sec_7d,
    week.daily_listened_sec
  from public.profiles pr
  left join public.patient_links l on l.patient_id = pr.user_id
  join public.listening_week(array(
    select everyone.user_id from public.profiles everyone where public.is_admin()
  )) week on week.user_id = pr.user_id
  where public.is_admin()
  -- A stable order, so the app can read it a page at a time.
  order by pr.created_at, pr.user_id;
$$;

revoke execute on function public.user_overview() from public, anon;
grant execute on function public.user_overview() to authenticated;

-- ── Hidden Presets: the Admin curates any Patient ─────────────────────────
-- The Admin reads, adds and removes the Hidden Presets of every Patient. A
-- row the Admin adds belongs to an existing Link and carries that Link's
-- Clinician, as if the Clinician had hidden it: the Clinician sees it in
-- their Dashboard, and ending or Transferring the Link removes it
-- (cleanup_patient_link). Nobody else gains anything: a Clinician still
-- curates only their own Patients while holding the role (0005).
create policy "admin curates any patient"
  on public.template_visibility for all
  to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    and exists (
      select 1 from public.patient_links pl
       where pl.clinician_id = template_visibility.clinician_id
         and pl.patient_id = template_visibility.patient_id
    )
  );
