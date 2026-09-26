-- Patient activity (0012, #12): the Dashboard's aggregate read returns one
-- row per Patient of the caller only (never another Clinician's Patients),
-- nothing to an Inactive Clinician, a Patient or a Regular, and is closed to
-- signed-out visitors. Its 7 days are the calendar days up to today in the
-- Patient's zone: the IANA zone of their latest Play (else latest Download)
-- that the database knows.
begin;
\ir fixtures.psql
select plan(11);

select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('inactive_clinician', 'clinician');
select tests.create_user('admin', 'admin');
select tests.create_user('patient_a1');
select tests.create_user('patient_a2');
select tests.create_user('patient_a3');
select tests.create_user('patient_a4');
select tests.create_user('patient_b');
select tests.create_user('patient_i');
select tests.create_user('patient_admin');
select tests.create_user('regular');
select tests.link('clinician_a', 'patient_a1');
select tests.link('clinician_a', 'patient_a2');
select tests.link('clinician_a', 'patient_a3');
select tests.link('clinician_a', 'patient_a4');
select tests.link('clinician_b', 'patient_b');
select tests.link('inactive_clinician', 'patient_i');
select tests.link('admin', 'patient_admin');
update public.profiles set role = 'user'
 where user_id = tests.user_id('inactive_clinician');
update public.profiles set created_at = '2026-09-01 10:00+07'
 where user_id = tests.user_id('patient_a1');

-- The instant of p_time on the calendar day p_days_ago days before today, on
-- the wall clock of p_zone.
create function tests.local_at(p_zone text, p_days_ago integer, p_time time)
returns timestamptz
language sql
stable
as $$
  select (((now() at time zone p_zone)::date - p_days_ago) + p_time) at time zone p_zone;
$$;

-- A Play by p_user started at p_at, heard for p_min minutes, recorded on a
-- device in p_zone. 'stopped' Plays were planned for 30 minutes.
create function tests.add_play(p_user text, p_at timestamptz, p_min integer,
                               p_outcome text, p_zone text)
returns void
language sql
as $$
  insert into public.plays (id, user_id, audio_kind, audio_id, audio_name, started_at,
                            ended_at, listened_sec, planned_min, outcome, time_zone)
  values (gen_random_uuid(), tests.user_id(p_user), 'preset', 'sleeping', 'Sleeping', p_at,
          p_at + make_interval(mins => p_min), p_min * 60,
          case p_outcome when 'stopped' then 30 else p_min end, p_outcome, p_zone);
$$;

-- patient_a1, in WIB: today, 2 and 6 days ago count; 7 days ago does not.
select tests.add_play('patient_a1', tests.local_at('Asia/Jakarta', 0, '00:00'), 20, 'completed', 'Asia/Jakarta');
select tests.add_play('patient_a1', tests.local_at('Asia/Jakarta', 2, '00:00'), 15, 'stopped', 'Asia/Jakarta');
select tests.add_play('patient_a1', tests.local_at('Asia/Jakarta', 6, '00:00'), 10, 'stopped', 'Asia/Jakarta');
select tests.add_play('patient_a1', tests.local_at('Asia/Jakarta', 7, '23:00'), 30, 'completed', 'Asia/Jakarta');

-- patient_a2 now listens in WITA: an older Play at 23:30 WIB, the day before
-- the 7 days on the WIB calendar, is 00:30 WITA on the first of them there.
select tests.add_play('patient_a2', tests.local_at('Asia/Makassar', 1, '00:00'), 5, 'completed', 'Asia/Makassar');
select tests.add_play('patient_a2', tests.local_at('Asia/Makassar', 6, '00:30'), 10, 'completed', 'Asia/Jakarta');

-- patient_a3's latest Plays come from zones that are no IANA name the
-- database knows (one AT TIME ZONE would accept); their Download's stands in.
select tests.add_play('patient_a3', tests.local_at('Asia/Jayapura', 1, '00:00'), 5, 'completed', 'Nowhere/Unknown');
select tests.add_play('patient_a3', tests.local_at('Asia/Jayapura', 2, '00:00'), 5, 'completed', 'UTC+7');
insert into public.downloads (id, user_id, audio_kind, audio_id, audio_name, length_min,
                              downloaded_at, time_zone)
values (gen_random_uuid(), tests.user_id('patient_a3'), 'preset', 'sleeping', 'Sleeping', 15,
        tests.local_at('Asia/Jayapura', 3, '09:00'), 'Asia/Jayapura');

-- Patients of the other Clinicians listen too.
select tests.add_play('patient_b', tests.local_at('Asia/Jakarta', 0, '00:00'), 20, 'completed', 'Asia/Jakarta');
select tests.add_play('patient_i', tests.local_at('Asia/Jakarta', 0, '00:00'), 20, 'completed', 'Asia/Jakarta');
select tests.add_play('patient_admin', tests.local_at('Asia/Jakarta', 0, '00:00'), 20, 'completed', 'Asia/Jakarta');

-- ── A Clinician reads their own Patients ────────────────────────────────────

select tests.act_as('clinician_a');

select set_eq(
  $$ select patient_id from public.patient_activity() $$,
  $$ values (tests.user_id('patient_a1')), (tests.user_id('patient_a2')),
            (tests.user_id('patient_a3')), (tests.user_id('patient_a4')) $$,
  'a Clinician reads one row per Patient of their own'
);

select results_eq(
  $$ select account_created_at, last_play_at, time_zone, plays_7d, stopped_7d,
            listened_sec_7d, daily_listened_sec
       from public.patient_activity() where patient_id = tests.user_id('patient_a1') $$,
  $$ values ('2026-09-01 10:00+07'::timestamptz, tests.local_at('Asia/Jakarta', 0, '00:00'),
             'Asia/Jakarta', 3, 2, 45 * 60, array[600, 0, 0, 0, 900, 0, 1200]) $$,
  'the aggregates cover today and the 6 days before it, oldest day first'
);

select results_eq(
  $$ select time_zone, plays_7d, daily_listened_sec
       from public.patient_activity() where patient_id = tests.user_id('patient_a2') $$,
  $$ values ('Asia/Makassar', 2, array[600, 0, 0, 0, 0, 300, 0]) $$,
  'the days are those of the zone of the latest Play'
);

select results_eq(
  $$ select time_zone, plays_7d, daily_listened_sec
       from public.patient_activity() where patient_id = tests.user_id('patient_a3') $$,
  $$ values ('Asia/Jayapura', 2, array[0, 0, 0, 0, 300, 300, 0]) $$,
  'zones that are no IANA name the database knows are skipped, down to the latest Download''s'
);

select results_eq(
  $$ select last_play_at, time_zone, plays_7d, stopped_7d, listened_sec_7d, daily_listened_sec
       from public.patient_activity() where patient_id = tests.user_id('patient_a4') $$,
  $$ values (null::timestamptz, null::text, 0, 0, 0, array[0, 0, 0, 0, 0, 0, 0]) $$,
  'a Patient who never listened reads as no Play and 7 empty days'
);

-- ── Nobody else's Patients ──────────────────────────────────────────────────

select tests.act_as('clinician_b');

select set_eq(
  $$ select patient_id from public.patient_activity() $$,
  $$ values (tests.user_id('patient_b')) $$,
  'another Clinician reads only their own Patient, never clinician_a''s'
);

select tests.act_as('admin');

select set_eq(
  $$ select patient_id from public.patient_activity() $$,
  $$ values (tests.user_id('patient_admin')) $$,
  'the Admin reads their own Patients here, not everyone''s'
);

select tests.act_as('inactive_clinician');

select is_empty(
  $$ select * from public.patient_activity() $$,
  'an Inactive Clinician reads nothing about the Patients still linked to them'
);

select tests.act_as('patient_a1');

select is_empty(
  $$ select * from public.patient_activity() $$,
  'a Patient reads nothing'
);

select tests.act_as('regular');

select is_empty(
  $$ select * from public.patient_activity() $$,
  'a Regular reads nothing'
);

select tests.act_as_anon();

select throws_ok(
  $$ select * from public.patient_activity() $$,
  '42501', 'permission denied for function patient_activity',
  'a signed-out visitor cannot call it'
);

select * from finish();
rollback;
