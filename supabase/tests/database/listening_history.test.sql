-- Listening History (0011, #10; ADR-017): a User inserts and reads only their
-- own Plays and Downloads, and re-sending one with the same id never makes a
-- second row. Nobody updates or deletes them through the client. A Clinician
-- reads the rows of their linked Patients only while holding the Clinician
-- role; the Admin reads all. Rows go with the account.
begin;
\ir fixtures.psql
select plan(31);

select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('inactive_clinician', 'clinician');
select tests.create_user('admin', 'admin');
select tests.create_user('patient_a');
select tests.create_user('patient_b');
select tests.create_user('patient_i');
select tests.create_user('regular');
select tests.link('clinician_a', 'patient_a');
select tests.link('clinician_b', 'patient_b');
select tests.link('inactive_clinician', 'patient_i');
update public.profiles set role = 'user'
 where user_id = tests.user_id('inactive_clinician');

-- A 20-minute Play of the Sleeping Preset by p_user, as sent by the app: a
-- re-send with the same id is ignored. Runs with the acting User's rights.
create function tests.send_play(p_id uuid, p_user text)
returns void
language sql
as $$
  insert into public.plays (id, user_id, audio_kind, audio_id, audio_name, audio_emoji,
                            audio_band, started_at, ended_at, listened_sec, planned_min,
                            outcome, time_zone)
  values (p_id, tests.user_id(p_user), 'preset', 'sleeping', 'Sleeping', '🌙', 'delta',
          '2026-09-26 21:00+07', '2026-09-26 21:20+07', 1200, 20, 'completed', 'Asia/Jakarta')
  on conflict (id) do nothing;
$$;

-- A 15-minute MP3 of the Sleeping Preset by p_user, as sent by the app.
create function tests.send_download(p_id uuid, p_user text)
returns void
language sql
as $$
  insert into public.downloads (id, user_id, audio_kind, audio_id, audio_name, audio_emoji,
                                audio_band, length_min, downloaded_at, time_zone)
  values (p_id, tests.user_id(p_user), 'preset', 'sleeping', 'Sleeping', '🌙', 'delta',
          15, '2026-09-26 22:00+08', 'Asia/Makassar')
  on conflict (id) do nothing;
$$;

-- Play ids: 1x patient_a, 2x patient_b, 3x patient_i, 4x regular.
-- Download ids use the same digits under d….

-- ── A User records their own ────────────────────────────────────────────────

select tests.act_as('patient_a');

select lives_ok(
  $$ select tests.send_play('00000000-0000-4000-8000-000000000011', 'patient_a') $$,
  'a User records their own Play'
);

select lives_ok(
  $$ select tests.send_play('00000000-0000-4000-8000-000000000011', 'patient_a') $$,
  'a User re-sends the same Play without an error'
);

select lives_ok(
  $$ select tests.send_download('d0000000-0000-4000-8000-000000000011', 'patient_a');
     select tests.send_download('d0000000-0000-4000-8000-000000000011', 'patient_a') $$,
  'a User records their own Download and may re-send it'
);

select results_eq(
  $$ select audio_kind, audio_id, audio_name, audio_emoji, audio_band, listened_sec,
            planned_min, outcome, time_zone
       from public.plays $$,
  $$ values ('preset', 'sleeping', 'Sleeping', '🌙', 'delta', 1200, 20, 'completed',
             'Asia/Jakarta') $$,
  'the re-sent Play is one row, with its audio snapshot and time zone'
);

select results_eq(
  $$ select audio_name, length_min, time_zone from public.downloads $$,
  $$ values ('Sleeping', 15, 'Asia/Makassar') $$,
  'the re-sent Download is one row, with its audio snapshot and time zone'
);

select throws_ok(
  $$ select tests.send_play('00000000-0000-4000-8000-000000000019', 'patient_b') $$,
  '42501', 'new row violates row-level security policy for table "plays"',
  'a User cannot record a Play for another User'
);

select throws_ok(
  $$ select tests.send_download('d0000000-0000-4000-8000-000000000019', 'patient_b') $$,
  '42501', 'new row violates row-level security policy for table "downloads"',
  'a User cannot record a Download for another User'
);

select throws_ok(
  $$ insert into public.plays (id, user_id, audio_kind, audio_id, audio_name, started_at,
                               ended_at, listened_sec, planned_min, outcome, time_zone,
                               created_at)
     values ('00000000-0000-4000-8000-000000000016', tests.user_id('patient_a'), 'preset',
             'sleeping', 'Sleeping', '2026-09-26 21:00+07', '2026-09-26 21:20+07', 1200, 20,
             'completed', 'Asia/Jakarta', '2020-01-01') $$,
  '42501', 'permission denied for table plays',
  'a User cannot set when the server received their Play'
);

select throws_ok(
  $$ insert into public.plays (id, user_id, audio_kind, audio_id, audio_name, started_at,
                               ended_at, listened_sec, planned_min, outcome, time_zone)
     values ('00000000-0000-4000-8000-000000000018', tests.user_id('patient_a'), 'preset',
             'sleeping', 'Sleeping', '2026-09-26 21:00+07', '2026-09-26 21:00:29+07', 29, 20,
             'stopped', 'Asia/Jakarta') $$,
  '23514', null,
  'a playback under 30 seconds is not a Play'
);

-- Everyone else records theirs.
select tests.act_as('patient_b');
select tests.send_play('00000000-0000-4000-8000-000000000021', 'patient_b');
select tests.send_download('d0000000-0000-4000-8000-000000000021', 'patient_b');
select tests.act_as('patient_i');
select tests.send_play('00000000-0000-4000-8000-000000000031', 'patient_i');
select tests.send_download('d0000000-0000-4000-8000-000000000031', 'patient_i');
select tests.act_as('regular');
select tests.send_play('00000000-0000-4000-8000-000000000041', 'regular');
select tests.send_download('d0000000-0000-4000-8000-000000000041', 'regular');

-- ── A User reads only their own ─────────────────────────────────────────────

select results_eq(
  'select id from public.plays',
  $$ values ('00000000-0000-4000-8000-000000000041'::uuid) $$,
  'a Regular reads only their own Plays'
);

select results_eq(
  'select id from public.downloads',
  $$ values ('d0000000-0000-4000-8000-000000000041'::uuid) $$,
  'a Regular reads only their own Downloads'
);

select tests.act_as('patient_a');

select results_eq(
  'select id from public.plays',
  $$ values ('00000000-0000-4000-8000-000000000011'::uuid) $$,
  'a Patient reads only their own Plays'
);

-- ── Nobody updates or deletes through the client ────────────────────────────

select throws_ok(
  $$ update public.plays set outcome = 'stopped', listened_sec = 60 $$,
  '42501', 'permission denied for table plays',
  'a User cannot change their own Play'
);

select throws_ok(
  'delete from public.plays',
  '42501', 'permission denied for table plays',
  'a User cannot delete their own Play'
);

select throws_ok(
  $$ update public.downloads set length_min = 60 $$,
  '42501', 'permission denied for table downloads',
  'a User cannot change their own Download'
);

select throws_ok(
  'delete from public.downloads',
  '42501', 'permission denied for table downloads',
  'a User cannot delete their own Download'
);

select tests.act_as('clinician_a');

select throws_ok(
  'delete from public.plays',
  '42501', 'permission denied for table plays',
  'a Clinician cannot delete their Patient''s Plays'
);

select tests.act_as('admin');

select throws_ok(
  'delete from public.plays',
  '42501', 'permission denied for table plays',
  'the Admin cannot delete Plays through the client either'
);

select throws_ok(
  $$ update public.downloads set length_min = 60 $$,
  '42501', 'permission denied for table downloads',
  'the Admin cannot change Downloads through the client'
);

-- ── Clinicians read their linked Patients' rows only ────────────────────────

select tests.act_as('clinician_a');

select set_eq(
  'select id from public.plays',
  $$ values ('00000000-0000-4000-8000-000000000011'::uuid) $$,
  'a Clinician reads their Patient''s Plays and nobody else''s'
);

select set_eq(
  'select id from public.downloads',
  $$ values ('d0000000-0000-4000-8000-000000000011'::uuid) $$,
  'a Clinician reads their Patient''s Downloads and nobody else''s'
);

select throws_ok(
  $$ select tests.send_play('00000000-0000-4000-8000-000000000017', 'patient_a') $$,
  '42501', 'new row violates row-level security policy for table "plays"',
  'a Clinician cannot record a Play for their Patient'
);

select tests.act_as('clinician_b');

select set_eq(
  'select id from public.plays',
  $$ values ('00000000-0000-4000-8000-000000000021'::uuid) $$,
  'Clinician B cannot read the Plays of Clinician A''s Patient'
);

select set_eq(
  'select id from public.downloads',
  $$ values ('d0000000-0000-4000-8000-000000000021'::uuid) $$,
  'Clinician B cannot read the Downloads of Clinician A''s Patient'
);

select tests.act_as('inactive_clinician');

select is_empty(
  'select id from public.plays',
  'an Inactive Clinician no longer reads their Patients'' Plays'
);

select is_empty(
  'select id from public.downloads',
  'an Inactive Clinician no longer reads their Patients'' Downloads'
);

-- ── The Admin reads all ─────────────────────────────────────────────────────

select tests.act_as('admin');

select set_eq(
  'select id from public.plays',
  $$ values ('00000000-0000-4000-8000-000000000011'::uuid),
            ('00000000-0000-4000-8000-000000000021'::uuid),
            ('00000000-0000-4000-8000-000000000031'::uuid),
            ('00000000-0000-4000-8000-000000000041'::uuid) $$,
  'the Admin reads every Play, Regulars'' included'
);

select set_eq(
  'select id from public.downloads',
  $$ values ('d0000000-0000-4000-8000-000000000011'::uuid),
            ('d0000000-0000-4000-8000-000000000021'::uuid),
            ('d0000000-0000-4000-8000-000000000031'::uuid),
            ('d0000000-0000-4000-8000-000000000041'::uuid) $$,
  'the Admin reads every Download, Regulars'' included'
);

-- ── Signed-out visitors ─────────────────────────────────────────────────────

select tests.act_as_anon();

select throws_ok(
  'select id from public.plays',
  '42501', 'permission denied for table plays',
  'a signed-out visitor cannot read Plays'
);

select throws_ok(
  'select id from public.downloads',
  '42501', 'permission denied for table downloads',
  'a signed-out visitor cannot read Downloads'
);

-- ── Rows go with the account ────────────────────────────────────────────────

reset role;
delete from auth.users where id = tests.user_id('regular');

select is_empty(
  $$ select 1 from public.plays where id = '00000000-0000-4000-8000-000000000041'
     union all
     select 1 from public.downloads where id = 'd0000000-0000-4000-8000-000000000041' $$,
  'deleting an account deletes its Plays and Downloads'
);

select * from finish();
rollback;
