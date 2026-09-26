-- Transfer Patients and remove the Clinician role (0015, #15; ADR-014). Only
-- the server functions (service role) Transfer or remove a role, after the
-- Account rules allow it. A Transfer moves the Link: the Patient keeps their
-- Listening History, Premium grant, password copy and Username; the old
-- Clinician's Assignments and Hidden Presets go, and with the Link the old
-- Clinician loses the Patient's data while the new Clinician reads it at
-- once. The new Clinician's limit holds, for all the moving Patients or none.
-- The role goes only once no Patient is left with that Clinician.
begin;
\ir fixtures.psql
select plan(40);

select tests.create_user('admin', 'admin');
select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('clinician_full', 'clinician');
select tests.create_user('clinician_one_free', 'clinician');
select tests.create_user('inactive_clinician');
select tests.create_user('regular');
select tests.create_user('ivan');
select tests.create_user('ketut');
-- Made holds the Clinician role and is also one of Clinician A's Patients.
select tests.create_user('made', 'clinician');
select tests.create_user('patient_full');
select tests.create_user('patient_one');
select tests.create_user('patient_i');
-- Clinicians the Admin created, one of them also Clinician B's Patient.
select tests.create_user('granted', 'clinician');
select tests.create_user('granted_patient', 'clinician');

select tests.link('clinician_a', 'ivan');
select tests.link('clinician_a', 'ketut');
select tests.link('clinician_a', 'made');
select tests.link('clinician_full', 'patient_full');
select tests.link('clinician_one_free', 'patient_one');
select tests.link('inactive_clinician', 'patient_i');
select tests.link('clinician_b', 'granted_patient');

update public.profiles set patient_limit = 1 where user_id = tests.user_id('clinician_full');
update public.profiles set patient_limit = 2 where user_id = tests.user_id('clinician_one_free');
update public.profiles set username = 'ivan', display_name = 'Ivan Pratama'
 where user_id = tests.user_id('ivan');
update public.profiles set clinician_origin = 'admin'
 where user_id in (tests.user_id('granted'), tests.user_id('granted_patient'));
update public.patient_links set premium_grant = false, created_at = '2026-09-01 09:00+08'
 where patient_id = tests.user_id('ivan');

insert into public.password_copies (user_id, ciphertext)
values (tests.user_id('ivan'), 'cipher-ivan'),
       (tests.user_id('granted'), 'cipher-granted'),
       (tests.user_id('granted_patient'), 'cipher-granted-patient');

-- Ivan's Listening History, Hidden Presets and Assignments: one from Clinician
-- A's Audio Bank, one the Admin assigned from the Admin's own.
insert into public.plays (id, user_id, audio_kind, audio_id, audio_name, started_at,
                          ended_at, listened_sec, planned_min, outcome, time_zone)
values (gen_random_uuid(), tests.user_id('ivan'), 'preset', 'sleeping', 'Sleeping',
        '2026-09-25 21:00+08', '2026-09-25 21:20+08', 1200, 20, 'completed', 'Asia/Makassar');
insert into public.downloads (id, user_id, audio_kind, audio_id, audio_name, length_min,
                              downloaded_at, time_zone)
values (gen_random_uuid(), tests.user_id('ivan'), 'preset', 'sleeping', 'Sleeping', 15,
        '2026-09-25 22:00+08', 'Asia/Makassar');
insert into public.template_visibility (clinician_id, patient_id, preset_id)
values (tests.user_id('clinician_a'), tests.user_id('ivan'), 'focus'),
       (tests.user_id('clinician_a'), tests.user_id('ivan'), 'energize');
select tests.create_custom_audio('bank_a', 'clinician_a');
select tests.create_custom_audio('bank_admin', 'admin');
select tests.assign('bank_a', 'ivan');
select tests.assign('bank_admin', 'ivan');

-- ── Only the server functions Transfer or remove a role ─────────────────────

select tests.act_as('admin');

select throws_ok(
  $$ select public.transfer_patients(tests.user_id('clinician_a'), tests.user_id('ivan'),
                                     tests.user_id('clinician_b'), 30) $$,
  '42501', 'permission denied for function transfer_patients',
  'the Admin Transfers only through the server function'
);

select throws_ok(
  $$ update public.patient_links set clinician_id = tests.user_id('clinician_b')
      where patient_id = tests.user_id('ivan') $$,
  '42501', 'permission denied for table patient_links',
  'the Admin cannot move a Link from the client'
);

select throws_ok(
  $$ select public.remove_clinician_role(tests.user_id('clinician_a'), tests.user_id('clinician_b'), 30) $$,
  '42501', 'permission denied for function remove_clinician_role',
  'the Admin removes a Clinician role only through the server function'
);

select tests.act_as('clinician_a');

select throws_ok(
  $$ select public.transfer_patients(tests.user_id('clinician_a'), tests.user_id('ivan'),
                                     tests.user_id('clinician_b'), 30) $$,
  '42501', 'permission denied for function transfer_patients',
  'a Clinician cannot Transfer their own Patient'
);

select tests.act_as_anon();

select throws_ok(
  $$ select public.remove_clinician_role(tests.user_id('clinician_a'), null, null) $$,
  '42501', 'permission denied for function remove_clinician_role',
  'a signed-out visitor cannot remove a Clinician role'
);

-- ── Before the Transfer ─────────────────────────────────────────────────────

select tests.act_as('clinician_b');

select is(
  (select count(*)::int from public.plays where user_id = tests.user_id('ivan')),
  0,
  'before the Transfer, Clinician B cannot read Ivan''s Plays'
);

-- ── Transferring one Patient ────────────────────────────────────────────────

select tests.act_as_service_role();

select is(
  public.transfer_patients(tests.user_id('clinician_a'), tests.user_id('ivan'),
                           tests.user_id('clinician_b'), 30),
  1,
  'transfer_patients() moves one Patient'
);

reset role;

select results_eq(
  $$ select clinician_id, premium_grant, created_at
       from public.patient_links where patient_id = tests.user_id('ivan') $$,
  $$ values (tests.user_id('clinician_b'), false, '2026-09-01 09:00+08'::timestamptz) $$,
  'the Link moves to the new Clinician with its Premium grant and its created_at'
);

select results_eq(
  $$ select username, display_name from public.profiles where user_id = tests.user_id('ivan') $$,
  $$ values ('ivan', 'Ivan Pratama') $$,
  'the Patient keeps their Username'
);

select results_eq(
  $$ select ciphertext from public.password_copies where user_id = tests.user_id('ivan') $$,
  $$ values ('cipher-ivan') $$,
  'the Patient keeps their password copy'
);

select is(
  (select count(*)::int from public.plays where user_id = tests.user_id('ivan'))
    + (select count(*)::int from public.downloads where user_id = tests.user_id('ivan')),
  2,
  'the Patient keeps their Listening History'
);

select is(
  (select count(*)::int from public.template_visibility where patient_id = tests.user_id('ivan')),
  0,
  'the old Clinician''s Hidden Presets are gone'
);

select results_eq(
  $$ select audio_id from public.audio_assignments where user_id = tests.user_id('ivan') $$,
  $$ values (tests.custom_audio_id('bank_admin')) $$,
  'the old Clinician''s Assignments are gone; one from another Audio Bank stays'
);

select tests.act_as('clinician_a');

select is(
  (select count(*)::int from public.profiles where user_id = tests.user_id('ivan'))
    + (select count(*)::int from public.plays where user_id = tests.user_id('ivan'))
    + (select count(*)::int from public.downloads where user_id = tests.user_id('ivan'))
    + (select count(*)::int from public.patient_links where patient_id = tests.user_id('ivan')),
  0,
  'after the Transfer, the old Clinician reads nothing of the Patient: profile, Plays, Downloads, Link'
);

select is(
  (select count(*)::int from public.patient_activity() where patient_id = tests.user_id('ivan')),
  0,
  'the Patient is gone from the old Clinician''s Patients table'
);

select tests.act_as('clinician_b');

select is(
  (select count(*)::int from public.profiles where user_id = tests.user_id('ivan'))
    + (select count(*)::int from public.plays where user_id = tests.user_id('ivan'))
    + (select count(*)::int from public.downloads where user_id = tests.user_id('ivan'))
    + (select count(*)::int from public.patient_links where patient_id = tests.user_id('ivan')),
  4,
  'the new Clinician reads the Patient at once: profile, Plays, Downloads, Link'
);

select is(
  (select count(*)::int from public.patient_activity() where patient_id = tests.user_id('ivan')),
  1,
  'the Patient is in the new Clinician''s Patients table'
);

select lives_ok(
  $$ insert into public.template_visibility (clinician_id, patient_id, preset_id)
     values (tests.user_id('clinician_b'), tests.user_id('ivan'), 'focus') $$,
  'the new Clinician curates the Patient'
);

-- ── Refused Transfers ───────────────────────────────────────────────────────

select tests.act_as_service_role();

select throws_ok(
  $$ select public.transfer_patients(tests.user_id('clinician_a'), tests.user_id('ketut'),
                                     tests.user_id('clinician_full'), 1) $$,
  'P0001', 'patient_limit_reached',
  'a Transfer never takes the new Clinician past their limit'
);

select throws_ok(
  $$ select public.transfer_patients(tests.user_id('clinician_a'), null,
                                     tests.user_id('clinician_one_free'), 2) $$,
  'P0001', 'patient_limit_reached',
  'moving every Patient of a Clinician needs room for all of them'
);

select throws_ok(
  $$ select public.transfer_patients(tests.user_id('clinician_a'), null,
                                     tests.user_id('made'), 30) $$,
  'P0001', 'target_is_patient',
  'a Clinician never becomes their own Patient'
);

select throws_ok(
  $$ select public.transfer_patients(tests.user_id('clinician_a'), tests.user_id('ketut'),
                                     tests.user_id('regular'), 30) $$,
  'P0001', 'target_not_clinician',
  'Patients move only to someone who holds the Clinician role, or to the Admin'
);

select throws_ok(
  $$ select public.transfer_patients(tests.user_id('clinician_a'), tests.user_id('ketut'),
                                     tests.user_id('clinician_a'), 30) $$,
  'P0001', 'same_clinician',
  'a Patient does not move to the Clinician they already have'
);

select throws_ok(
  $$ select public.transfer_patients(tests.user_id('clinician_a'), tests.user_id('ivan'),
                                     tests.user_id('clinician_full'), 1) $$,
  'P0001', 'not_linked',
  'a Transfer from a Clinician the Patient has already left moves nothing'
);

reset role;

select results_eq(
  $$ select l.clinician_id from public.patient_links l
      where l.patient_id in (tests.user_id('ketut'), tests.user_id('made')) $$,
  $$ values (tests.user_id('clinician_a')), (tests.user_id('clinician_a')) $$,
  'a refused Transfer moves nobody'
);

-- ── An Inactive Clinician's Patients ────────────────────────────────────────

select tests.act_as_service_role();

select is(
  public.transfer_patients(tests.user_id('inactive_clinician'), null,
                           tests.user_id('clinician_one_free'), 2),
  1,
  'the Admin Transfers every Patient of an Inactive Clinician'
);

select tests.act_as('clinician_one_free');

select is(
  (select count(*)::int from public.profiles where user_id = tests.user_id('patient_i')),
  1,
  'the Inactive Clinician''s Patient is monitored again'
);

-- ── Removing the Clinician role ─────────────────────────────────────────────

select tests.act_as_service_role();

select throws_ok(
  $$ select public.remove_clinician_role(tests.user_id('clinician_a'), null, null) $$,
  'P0001', 'transfer_target_required',
  'the role stays while the Clinician has Patients and no Transfer target is chosen'
);

select throws_ok(
  $$ select public.remove_clinician_role(tests.user_id('clinician_a'), tests.user_id('clinician_full'), 1) $$,
  'P0001', 'patient_limit_reached',
  'the role stays when the chosen target cannot take every Patient'
);

select throws_ok(
  $$ select public.remove_clinician_role(tests.user_id('inactive_clinician'), null, null) $$,
  'P0001', 'not_clinician',
  'an Inactive Clinician holds no role to remove'
);

select throws_ok(
  $$ select public.remove_clinician_role(tests.user_id('admin'), null, null) $$,
  'P0001', 'not_clinician',
  'the Admin account never loses its role'
);

reset role;

select results_eq(
  $$ select role, clinician_origin from public.profiles where user_id = tests.user_id('clinician_a') $$,
  $$ values ('clinician', null::text) $$,
  'a refused removal leaves the Clinician as they were'
);

select tests.act_as_service_role();

select lives_ok(
  $$ select public.remove_clinician_role(tests.user_id('clinician_a'), tests.user_id('admin'), null) $$,
  'the role goes once every Patient is Transferred, here to the Admin, who has no limit'
);

reset role;

select results_eq(
  $$ select role, clinician_origin from public.profiles where user_id = tests.user_id('clinician_a') $$,
  $$ values ('user', null::text) $$,
  'afterwards the former Clinician is a Regular'
);

select results_eq(
  $$ select l.clinician_id from public.patient_links l
      where l.patient_id in (tests.user_id('ketut'), tests.user_id('made')) $$,
  $$ values (tests.user_id('admin')), (tests.user_id('admin')) $$,
  'their Patients now have the chosen Clinician'
);

select tests.act_as('clinician_a');

select is(
  (select count(*)::int from public.profiles where user_id = tests.user_id('ketut'))
    + (select count(*)::int from public.patient_links where clinician_id = tests.user_id('clinician_a')),
  0,
  'the former Clinician keeps no Patient'
);

select tests.act_as_service_role();

select lives_ok(
  $$ select public.remove_clinician_role(tests.user_id('granted'), null, null) $$,
  'a Clinician without Patients loses the role with no Transfer target'
);

select lives_ok(
  $$ select public.remove_clinician_role(tests.user_id('granted_patient'), null, null) $$,
  'a Clinician who is someone''s Patient loses the role too'
);

reset role;

select ok(
  not exists (select 1 from public.password_copies where user_id = tests.user_id('granted'))
    and public.password_login_email(tests.email('granted')) is null,
  'a Clinician the Admin created keeps no password copy as a Regular, and signs in with a magic link'
);

select results_eq(
  $$ select p.role, l.clinician_id, c.ciphertext
       from public.profiles p
       join public.patient_links l on l.patient_id = p.user_id
       join public.password_copies c on c.user_id = p.user_id
      where p.user_id = tests.user_id('granted_patient') $$,
  $$ values ('user', tests.user_id('clinician_b'), 'cipher-granted-patient') $$,
  'a former Clinician who is someone''s Patient stays their Patient, password copy included'
);

select * from finish();
rollback;
