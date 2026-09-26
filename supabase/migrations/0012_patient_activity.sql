-- Patient activity for the Dashboard's Patients table (#12; ADR-017). One row
-- per Patient of the calling Clinician with the aggregates of their Listening
-- History that the table shows and that Patient Status is derived from (by
-- the Listening core, src/state/patientStatus.ts, so the rules live in one
-- place). The Dashboard never downloads every Play of every Patient:
--   - when the account was created;
--   - the start of the latest Play;
--   - the Patient's time zone: that of their latest Play, else of their latest
--     Download, among the IANA zone names the database knows (null without
--     either). Zones are device-reported text: 'UTC+7' or 'PST' would pass
--     AT TIME ZONE but are no IANA name, which the app's clock (Intl) needs;
--   - Plays, stopped Plays and seconds heard in the last 7 days: today and the
--     6 days before it in the Patient's zone (UTC without one), a Play
--     belonging to the day it started on, as in the report;
--   - the seconds heard on each of those 7 days, oldest first.
--
-- security invoker: the caller's row-level security applies, so it reads
-- nothing the caller could not read anyway. Only the caller's own Links count
-- (the Admin gets their own Patients here, not everyone), and only while the
-- caller holds the Clinician role: an Inactive Clinician gets no rows.
create function public.patient_activity()
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
  -- Read once per call: the view scans the zone files on disk.
  with iana_zones as materialized (
    select name
      from pg_catalog.pg_timezone_names
     where name not like 'posix/%' and name not like 'right/%'
  )
  select
    l.patient_id,
    pr.created_at,
    last_play.started_at,
    zone.name,
    week.plays,
    week.stopped,
    week.listened_sec,
    week.daily_sec
  from public.patient_links l
  join public.profiles pr on pr.user_id = l.patient_id
  left join lateral (
    select p.started_at
      from public.plays p
     where p.user_id = l.patient_id
     order by p.started_at desc
     limit 1
  ) last_play on true
  cross join lateral (
    select coalesce(
      (select p.time_zone
         from public.plays p
        where p.user_id = l.patient_id and p.time_zone in (select name from iana_zones)
        order by p.started_at desc
        limit 1),
      (select d.time_zone
         from public.downloads d
        where d.user_id = l.patient_id and d.time_zone in (select name from iana_zones)
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
        on p.user_id = l.patient_id
       -- Bounds the index scan; the day test below decides.
       and p.started_at >= now() - interval '8 days'
       and (p.started_at at time zone coalesce(zone.name, 'UTC'))::date
           = (now() at time zone coalesce(zone.name, 'UTC'))::date - ago.n
      group by ago.n
    ) day
  ) week
  where l.clinician_id = auth.uid()
    and public.is_clinician()
  order by l.created_at;
$$;

revoke execute on function public.patient_activity() from public, anon;
grant execute on function public.patient_activity() to authenticated;
