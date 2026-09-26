-- The Admin's aggregate read (0013, #13): user_overview() returns one row per
-- User, Regulars included, with their role, their Link to a Clinician and its
-- Premium grant, their Assigned audio and their week of listening. Anyone
-- but the Admin gets nothing, and signed-out visitors cannot call it. The
-- week comes from listening_week(), which counts only the Plays the caller
-- may read.
begin;
\ir fixtures.psql
select plan(13);

select tests.create_user('admin', 'admin');
select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('clinician_p', 'clinician');
select tests.create_user('inactive_clinician', 'clinician');
select tests.create_user('patient_a');
select tests.create_user('patient_b');
select tests.create_user('patient_i');
select tests.create_user('regular');
select tests.link('clinician_a', 'patient_a');
select tests.link('clinician_a', 'clinician_p');
select tests.link('clinician_b', 'patient_b');
select tests.link('inactive_clinician', 'patient_i');
update public.profiles set role = 'user'
 where user_id = tests.user_id('inactive_clinician');
update public.profiles
   set display_name = 'Sari Dewi', clinician_origin = 'subscription', patient_limit = 40
 where user_id = tests.user_id('clinician_a');
update public.profiles
   set display_name = 'Made Wirawan', username = 'made', contact_email = 'made@example.com'
 where user_id = tests.user_id('patient_a');
update public.patient_links set premium_grant = false
 where patient_id = tests.user_id('patient_b');

select tests.create_custom_audio('calm_a', 'clinician_a');
select tests.create_custom_audio('deep_a', 'clinician_a');
select tests.assign('calm_a', 'patient_a');
select tests.assign('deep_a', 'patient_a');

-- A Play today on the wall clock of p_zone, heard for p_min minutes.
create function tests.add_play_today(p_user text, p_min integer, p_zone text)
returns void
language sql
as $$
  insert into public.plays (id, user_id, audio_kind, audio_id, audio_name, started_at,
                            ended_at, listened_sec, planned_min, outcome, time_zone)
  values (gen_random_uuid(), tests.user_id(p_user), 'preset', 'sleeping', 'Sleeping',
          (now() at time zone p_zone)::date at time zone p_zone,
          ((now() at time zone p_zone)::date at time zone p_zone) + make_interval(mins => p_min),
          p_min * 60, p_min, 'completed', p_zone);
$$;

select tests.add_play_today('patient_a', 20, 'Asia/Makassar');
select tests.add_play_today('regular', 15, 'Asia/Jakarta');

-- ── The Admin reads every User ──────────────────────────────────────────────

select tests.act_as('admin');

select set_eq(
  $$ select user_id, role, clinician_id from public.user_overview() $$,
  $$ values (tests.user_id('admin'), 'admin', null::uuid),
            (tests.user_id('clinician_a'), 'clinician', null),
            (tests.user_id('clinician_b'), 'clinician', null),
            (tests.user_id('clinician_p'), 'clinician', tests.user_id('clinician_a')),
            (tests.user_id('inactive_clinician'), 'user', null),
            (tests.user_id('patient_a'), 'user', tests.user_id('clinician_a')),
            (tests.user_id('patient_b'), 'user', tests.user_id('clinician_b')),
            (tests.user_id('patient_i'), 'user', tests.user_id('inactive_clinician')),
            (tests.user_id('regular'), 'user', null) $$,
  'the Admin reads one row per User, with their role and their Clinician'
);

select results_eq(
  $$ select display_name, clinician_origin, patient_limit
       from public.user_overview() where user_id = tests.user_id('clinician_a') $$,
  $$ values ('Sari Dewi', 'subscription', 40) $$,
  'a Clinician''s row carries their name, Clinician origin and Patient limit'
);

select results_eq(
  $$ select display_name, username, email, contact_email, premium_grant, linked_at is not null,
            assigned_count
       from public.user_overview() where user_id = tests.user_id('patient_a') $$,
  $$ values ('Made Wirawan', 'made', tests.email('patient_a'), 'made@example.com', true, true, 2) $$,
  'a Patient''s row carries their Username, emails, Link, Premium grant and Assigned audio'
);

select results_eq(
  $$ select premium_grant from public.user_overview() where user_id = tests.user_id('patient_b') $$,
  $$ values (false) $$,
  'a Patient whose Premium grant is off reads so'
);

select results_eq(
  $$ select linked_at, premium_grant, assigned_count, time_zone, plays_7d, listened_sec_7d,
            daily_listened_sec[7]
       from public.user_overview() where user_id = tests.user_id('regular') $$,
  $$ values (null::timestamptz, null::boolean, 0, 'Asia/Jakarta', 1, 15 * 60, 15 * 60) $$,
  'a Regular has no Link, and their listening is there too'
);

select results_eq(
  $$ select time_zone, plays_7d, listened_sec_7d
       from public.user_overview() where user_id = tests.user_id('patient_a') $$,
  $$ values ('Asia/Makassar', 1, 20 * 60) $$,
  'a Patient''s week of listening is counted in their zone'
);

-- ── Nobody else ─────────────────────────────────────────────────────────────

select tests.act_as('clinician_a');

select is_empty(
  $$ select * from public.user_overview() $$,
  'a Clinician reads nothing, not even their own Patients'
);

select tests.act_as('clinician_b');

select results_eq(
  $$ select last_play_at, time_zone, plays_7d, listened_sec_7d
       from public.listening_week(array[tests.user_id('patient_a')]) $$,
  $$ values (null::timestamptz, null::text, 0, 0) $$,
  'listening_week() counts only Plays the caller may read: not another Clinician''s Patient''s'
);

select tests.act_as('clinician_p');

select is_empty(
  $$ select * from public.user_overview() $$,
  'a Clinician who is someone''s Patient reads nothing'
);

select tests.act_as('inactive_clinician');

select is_empty(
  $$ select * from public.user_overview() $$,
  'an Inactive Clinician reads nothing'
);

select tests.act_as('patient_a');

select is_empty(
  $$ select * from public.user_overview() $$,
  'a Patient reads nothing'
);

select tests.act_as('regular');

select is_empty(
  $$ select * from public.user_overview() $$,
  'a Regular reads nothing'
);

select tests.act_as_anon();

select throws_ok(
  $$ select * from public.user_overview() $$,
  '42501', 'permission denied for function user_overview',
  'a signed-out visitor cannot call it'
);

select * from finish();
rollback;
