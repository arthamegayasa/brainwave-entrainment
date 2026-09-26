-- The Admin links an existing User as a Patient; Username + password for a
-- Patient who has none (0016, #16; ADR-014, ADR-018). Only the server
-- functions (service role) link an account or add a Username login, after the
-- Account rules allow it; the database re-checks under a lock. Any User may
-- become a Patient, a Clinician too, but never the Admin account; the
-- Clinician's limit holds. The new Clinician reads the Patient at once, and a
-- linked Clinician keeps their own Patients. A Username never resolves to an
-- account's real email, even halfway through moving it to a password login.
begin;
\ir fixtures.psql
select plan(34);

select tests.create_user('admin', 'admin');
select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('clinician_full', 'clinician');
select tests.create_user('inactive_clinician');
-- Nadia, Sari, Dewi and Budi signed up with a magic link.
select tests.create_user('nadia');
select tests.create_user('sari');
select tests.create_user('dewi');
select tests.create_user('budi');
-- Made holds the Clinician role and has a Patient of his own, Ketut.
select tests.create_user('made', 'clinician');
select tests.create_user('ketut');
-- A Clinician the Admin created: signs in with their own email and a password.
select tests.create_user('granted', 'clinician');
-- Ivan is already Clinician A's Patient, with the Username "ivan".
select tests.create_user('ivan');
select tests.create_user('patient_full');
select tests.create_user('patient_i');

select tests.link('clinician_a', 'ivan');
select tests.link('clinician_full', 'patient_full');
select tests.link('inactive_clinician', 'patient_i');
select tests.link('made', 'ketut');

update public.profiles set patient_limit = 1 where user_id = tests.user_id('clinician_full');
update public.profiles set username = 'ivan' where user_id = tests.user_id('ivan');
update public.profiles set clinician_origin = 'admin' where user_id = tests.user_id('granted');
insert into public.password_copies (user_id, ciphertext)
values (tests.user_id('granted'), 'cipher-granted');

-- Nadia listened before anyone linked her.
insert into public.plays (id, user_id, audio_kind, audio_id, audio_name, started_at,
                          ended_at, listened_sec, planned_min, outcome, time_zone)
values (gen_random_uuid(), tests.user_id('nadia'), 'preset', 'sleeping', 'Sleeping',
        '2026-09-25 21:00+08', '2026-09-25 21:20+08', 1200, 20, 'completed', 'Asia/Makassar');

-- ── Only the server functions link an account or add a Username login ──────

select tests.act_as('admin');

select throws_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_a'), tests.user_id('nadia'), 30,
                                         null, null, null, null) $$,
  '42501', 'permission denied for function link_existing_patient',
  'the Admin links an account only through the server function'
);

select throws_ok(
  $$ select public.add_username_login(tests.user_id('ivan'), 'ivan-2', null,
                                      'x@login.serenade.invalid', 'cipher') $$,
  '42501', 'permission denied for function add_username_login',
  'the Admin adds a Username login only through the server function'
);

select tests.act_as('clinician_a');

select throws_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_a'), tests.user_id('nadia'), 30,
                                         null, null, null, null) $$,
  '42501', 'permission denied for function link_existing_patient',
  'a Clinician cannot link an existing account'
);

select tests.act_as_anon();

select throws_ok(
  $$ select public.add_username_login(tests.user_id('nadia'), 'nadia', null,
                                      'x@login.serenade.invalid', 'cipher') $$,
  '42501', 'permission denied for function add_username_login',
  'a signed-out visitor cannot add a Username login'
);

-- ── Before the Link ─────────────────────────────────────────────────────────

select tests.act_as('clinician_a');

select is(
  (select count(*)::int from public.profiles where user_id = tests.user_id('nadia'))
    + (select count(*)::int from public.plays where user_id = tests.user_id('nadia')),
  0,
  'before the Link, Clinician A reads nothing of Nadia'
);

-- ── Linking a Regular ───────────────────────────────────────────────────────

select tests.act_as_service_role();

select lives_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_a'), tests.user_id('nadia'), 30,
                                         null, null, null, null) $$,
  'link_existing_patient() links a Regular who signed up with a magic link'
);

reset role;

select results_eq(
  $$ select clinician_id, premium_grant from public.patient_links
      where patient_id = tests.user_id('nadia') $$,
  $$ values (tests.user_id('clinician_a'), true) $$,
  'the new Link carries the Premium grant'
);

select results_eq(
  $$ select username, contact_email, email from public.profiles where user_id = tests.user_id('nadia') $$,
  $$ values (null::text, null::text, tests.email('nadia')) $$,
  'linked without a Username, she keeps her sign-in: no Username, her own login email'
);

select ok(
  not exists (select 1 from public.password_copies where user_id = tests.user_id('nadia')),
  'linked without a password, she has no password copy'
);

select tests.act_as('clinician_a');

select is(
  (select count(*)::int from public.profiles where user_id = tests.user_id('nadia'))
    + (select count(*)::int from public.plays where user_id = tests.user_id('nadia'))
    + (select count(*)::int from public.patient_activity() where patient_id = tests.user_id('nadia')),
  3,
  'the Clinician reads their new Patient at once: profile, Listening History, Patients table'
);

-- ── Linking a Clinician ─────────────────────────────────────────────────────

select tests.act_as_service_role();

select lives_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_b'), tests.user_id('made'), 30,
                                         null, null, null, null) $$,
  'a Clinician can become another Clinician''s Patient: roles overlap'
);

reset role;

select results_eq(
  $$ select p.role, l.clinician_id
       from public.profiles p join public.patient_links l on l.patient_id = p.user_id
      where p.user_id = tests.user_id('made') $$,
  $$ values ('clinician'::text, tests.user_id('clinician_b')) $$,
  'the linked Clinician keeps the Clinician role and is Clinician B''s Patient'
);

select tests.act_as('made');

select results_eq(
  $$ select patient_id from public.patient_links where clinician_id = auth.uid() $$,
  $$ values (tests.user_id('ketut')) $$,
  'the linked Clinician keeps their own Patients'
);

select tests.act_as_service_role();

select lives_ok(
  $$ select public.link_existing_patient(tests.user_id('admin'), tests.user_id('budi'), null,
                                         null, null, null, null) $$,
  'the Admin, who has no limit, can be the Clinician'
);

-- ── Refused Links ───────────────────────────────────────────────────────────

select throws_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_a'), tests.user_id('admin'), 30,
                                         null, null, null, null) $$,
  'P0001', 'account_is_admin',
  'the Admin account never becomes a Patient'
);

select throws_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_b'), tests.user_id('ivan'), 30,
                                         null, null, null, null) $$,
  'P0001', 'already_linked',
  'an account that already has a Clinician is not linked again'
);

select throws_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_b'), tests.user_id('clinician_b'), 30,
                                         null, null, null, null) $$,
  'P0001', 'target_is_account',
  'a Clinician never becomes their own Patient'
);

select throws_ok(
  $$ select public.link_existing_patient(tests.user_id('inactive_clinician'), tests.user_id('dewi'), 30,
                                         null, null, null, null) $$,
  'P0001', 'target_not_clinician',
  'an Inactive Clinician gets no new Patients'
);

select throws_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_full'), tests.user_id('dewi'), 1,
                                         null, null, null, null) $$,
  'P0001', 'patient_limit_reached',
  'a Link never takes the Clinician past their limit'
);

reset role;

select ok(
  not exists (
    select 1 from public.patient_links
     where patient_id in (tests.user_id('admin'), tests.user_id('dewi'))
  ),
  'a refused Link creates nothing'
);

-- ── Linking with a Username and password ────────────────────────────────────

select tests.act_as_service_role();

select lives_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_a'), tests.user_id('sari'), 30,
                                         'sari', tests.email('sari'),
                                         '0b9d8f3e-2a1c-4e5f-8a7b-6c5d4e3f2a1b@login.serenade.invalid',
                                         'cipher-sari') $$,
  'link_existing_patient() links an account and gives it a Username and password'
);

reset role;

select results_eq(
  $$ select username, contact_email, email from public.profiles where user_id = tests.user_id('sari') $$,
  $$ values ('sari'::text, tests.email('sari'),
             '0b9d8f3e-2a1c-4e5f-8a7b-6c5d4e3f2a1b@login.serenade.invalid'::text) $$,
  'the profile has the Username, the real email as contact email and the internal login email'
);

select results_eq(
  $$ select ciphertext from public.password_copies where user_id = tests.user_id('sari') $$,
  $$ values ('cipher-sari') $$,
  'the new Patient''s password copy is stored'
);

-- Auth has not moved Sari yet: her login email is still her real email.
select tests.act_as_service_role();

select ok(
  public.password_login_email('sari') is null,
  'until Auth moves the account, its Username resolves to nothing, never to its real email'
);

select is(
  public.password_login_email(tests.email('sari')),
  tests.email('sari'),
  'meanwhile the email she types answers with nothing but itself'
);

reset role;
update auth.users set email = '0b9d8f3e-2a1c-4e5f-8a7b-6c5d4e3f2a1b@login.serenade.invalid'
 where id = tests.user_id('sari');
select tests.act_as_service_role();

select ok(
  public.password_login_email('sari') = '0b9d8f3e-2a1c-4e5f-8a7b-6c5d4e3f2a1b@login.serenade.invalid'
    and public.password_login_email(upper(tests.email('sari')))
        = '0b9d8f3e-2a1c-4e5f-8a7b-6c5d4e3f2a1b@login.serenade.invalid',
  'once Auth moved it, her Username and her real email both ask for a password at the internal login email'
);

select throws_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_b'), tests.user_id('dewi'), 30,
                                         'ivan', tests.email('dewi'),
                                         '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f@login.serenade.invalid',
                                         'cipher-dewi') $$,
  '23505', null,
  'a Username another account holds is refused'
);

reset role;

select ok(
  not exists (select 1 from public.patient_links where patient_id = tests.user_id('dewi')),
  'a refused Username leaves the account unlinked'
);

-- ── Adding a Username and password to a Patient ─────────────────────────────

select tests.act_as_service_role();

select throws_ok(
  $$ select public.add_username_login(tests.user_id('dewi'), 'dewi', tests.email('dewi'),
                                      '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a@login.serenade.invalid',
                                      'cipher-dewi') $$,
  'P0001', 'not_linked',
  'only a Patient gets a Username login'
);

select throws_ok(
  $$ select public.add_username_login(tests.user_id('ivan'), 'ivan-2', null,
                                      '3e4f5a6b-7c8d-4e9f-8a0b-2c3d4e5f6a7b@login.serenade.invalid',
                                      'cipher-ivan') $$,
  'P0001', 'has_username',
  'an account that has a Username does not get a second one'
);

select lives_ok(
  $$ select public.add_username_login(tests.user_id('nadia'), 'nadia', tests.email('nadia'),
                                      '4f5a6b7c-8d9e-4f0a-9b1c-3d4e5f6a7b8c@login.serenade.invalid',
                                      'cipher-nadia') $$,
  'a linked Patient without a Username gets one later'
);

-- Granted, a Clinician the Admin created, becomes Clinician A's Patient.
select lives_ok(
  $$ select public.link_existing_patient(tests.user_id('clinician_a'), tests.user_id('granted'), 30,
                                         null, null, null, null) $$,
  'a Clinician the Admin created is linked without a Username'
);

select lives_ok(
  $$ select public.add_username_login(tests.user_id('granted'), 'granted', tests.email('granted'),
                                      '5a6b7c8d-9e0f-4a1b-8c2d-4e5f6a7b8c9d@login.serenade.invalid',
                                      'cipher-granted-new') $$,
  'a Clinician who is a Patient gets a Username login too'
);

reset role;

select results_eq(
  $$ select ciphertext from public.password_copies where user_id = tests.user_id('granted') $$,
  $$ values ('cipher-granted-new') $$,
  'the new password copy replaces the one the Admin set before'
);

select * from finish();
rollback;
