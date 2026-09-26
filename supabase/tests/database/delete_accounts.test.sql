-- The Admin deletes an account (0017, #17; ADR-014, ADR-016, ADR-022). Only
-- the server function (service role) deletes, after the Account rules allow
-- it, and never the Admin account or anyone who still has Patients. Deleting
-- removes the account with its Listening History, Link and password copy;
-- its Username stays locked, and password access-log rows about it stay with
-- the target read as a deleted account. Custom Audio still in someone else's
-- Library moves to the Admin; the rest of the Audio Bank goes.
begin;
\ir fixtures.psql
select plan(31);

select tests.create_user('admin', 'admin');
select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('inactive_clinician');
select tests.create_user('ivan');
select tests.create_user('ketut');
select tests.create_user('patient_i');
select tests.create_user('nadia');
-- A Clinician the Admin created, whose Patients were all Transferred.
select tests.create_user('sari', 'clinician');

select tests.link('clinician_a', 'ivan');
select tests.link('clinician_b', 'ketut');
select tests.link('inactive_clinician', 'patient_i');

update public.profiles set username = 'ivan', display_name = 'Ivan Pratama'
 where user_id = tests.user_id('ivan');
update public.profiles set clinician_origin = 'admin' where user_id = tests.user_id('sari');
-- Ivan's Username before a rename, still locked and redirecting to "ivan".
insert into public.username_history (username, user_id, released_at)
values ('ivan-old', tests.user_id('ivan'), now() - interval '10 days');

insert into public.password_copies (user_id, ciphertext)
values (tests.user_id('ivan'), 'cipher-ivan'),
       (tests.user_id('sari'), 'cipher-sari');
insert into public.password_access_log (viewer_id, target_id)
values (tests.user_id('clinician_a'), tests.user_id('ivan')),
       (tests.user_id('admin'), tests.user_id('ivan')),
       (tests.user_id('admin'), tests.user_id('sari'));

-- Ivan's Listening History and curation.
insert into public.plays (id, user_id, audio_kind, audio_id, audio_name, started_at,
                          ended_at, listened_sec, planned_min, outcome, time_zone)
values (gen_random_uuid(), tests.user_id('ivan'), 'preset', 'sleeping', 'Sleeping',
        '2026-09-25 21:00+08', '2026-09-25 21:20+08', 1200, 20, 'completed', 'Asia/Makassar');
insert into public.downloads (id, user_id, audio_kind, audio_id, audio_name, length_min,
                              downloaded_at, time_zone)
values (gen_random_uuid(), tests.user_id('ivan'), 'preset', 'sleeping', 'Sleeping', 15,
        '2026-09-25 22:00+08', 'Asia/Makassar');
insert into public.template_visibility (clinician_id, patient_id, preset_id)
values (tests.user_id('clinician_a'), tests.user_id('ivan'), 'focus');
select tests.create_custom_audio('bank_a', 'clinician_a');
select tests.assign('bank_a', 'ivan');

-- Sari's Audio Bank: one audio the Admin assigned to Ketut, one published as
-- a Template, one assigned only to Sari herself, one assigned to nobody.
-- Sari also assigned audio from the Admin's bank to Ketut.
select tests.create_custom_audio('sari_assigned', 'sari');
select tests.create_custom_audio('sari_template', 'sari', true);
select tests.create_custom_audio('sari_self', 'sari');
select tests.create_custom_audio('sari_unassigned', 'sari');
select tests.create_custom_audio('bank_admin', 'admin');
insert into public.audio_assignments (audio_id, user_id, assigned_by)
values (tests.custom_audio_id('sari_assigned'), tests.user_id('ketut'), tests.user_id('admin')),
       (tests.custom_audio_id('sari_self'), tests.user_id('sari'), tests.user_id('admin')),
       (tests.custom_audio_id('bank_admin'), tests.user_id('ketut'), tests.user_id('sari'));

-- The ids of the accounts this file deletes, readable (as the fixture owner)
-- once they are gone.
create table tests.deleted as
  select label, tests.user_id(label) as id
    from unnest(array['ivan', 'nadia', 'sari']) as label;

-- ── Only the server function deletes ────────────────────────────────────────

select tests.act_as('admin');

select throws_ok(
  $$ select public.delete_account(tests.user_id('nadia'), tests.user_id('admin')) $$,
  '42501', 'permission denied for function delete_account',
  'the Admin deletes an account only through the server function'
);

select throws_ok(
  $$ delete from auth.users where id = tests.user_id('nadia') $$,
  '42501', 'permission denied for table users',
  'the Admin cannot delete an account from the client'
);

select tests.act_as('clinician_a');

select throws_ok(
  $$ select public.delete_account(tests.user_id('ivan'), tests.user_id('admin')) $$,
  '42501', 'permission denied for function delete_account',
  'a Clinician cannot delete their own Patient'
);

select tests.act_as('ivan');

select throws_ok(
  $$ select public.delete_account(tests.user_id('ivan'), tests.user_id('admin')) $$,
  '42501', 'permission denied for function delete_account',
  'a Patient cannot delete their own account'
);

select tests.act_as_anon();

select throws_ok(
  $$ select public.delete_account(tests.user_id('nadia'), tests.user_id('admin')) $$,
  '42501', 'permission denied for function delete_account',
  'a signed-out visitor cannot delete an account'
);

-- ── Refused deletions ───────────────────────────────────────────────────────

select tests.act_as_service_role();

select throws_ok(
  $$ select public.delete_account(tests.user_id('clinician_a'), tests.user_id('admin')) $$,
  'P0001', 'has_patients',
  'a Clinician who still has Patients is not deleted'
);

select throws_ok(
  $$ select public.delete_account(tests.user_id('inactive_clinician'), tests.user_id('admin')) $$,
  'P0001', 'has_patients',
  'an Inactive Clinician whose Patients were not Transferred is not deleted'
);

select throws_ok(
  $$ select public.delete_account(tests.user_id('admin'), tests.user_id('admin')) $$,
  'P0001', 'account_is_admin',
  'the Admin account is never deleted'
);

select throws_ok(
  $$ select public.delete_account(tests.user_id('nadia'), tests.user_id('clinician_b')) $$,
  'P0001', 'not_allowed',
  'nobody but the Admin deletes, nor receives a deleted Audio Bank'
);

reset role;

select is(
  (select count(*)::int from public.patient_links
    where clinician_id in (tests.user_id('clinician_a'), tests.user_id('inactive_clinician'))),
  2,
  'a refused deletion leaves every Patient Linked'
);

-- ── Deleting a Patient ──────────────────────────────────────────────────────

select tests.act_as_service_role();

select lives_ok(
  $$ select public.delete_account(tests.user_id('ivan'), tests.user_id('admin')) $$,
  'the Admin deletes a Patient'
);

reset role;

select is(
  (select count(*)::int from auth.users where id = (select id from tests.deleted where label = 'ivan'))
    + (select count(*)::int from public.profiles where user_id = (select id from tests.deleted where label = 'ivan')),
  0,
  'the account and its profile are gone'
);

select is(
  (select count(*)::int from public.plays where user_id = (select id from tests.deleted where label = 'ivan'))
    + (select count(*)::int from public.downloads where user_id = (select id from tests.deleted where label = 'ivan')),
  0,
  'its Listening History is gone: Plays and Downloads'
);

select is(
  (select count(*)::int from public.patient_links where patient_id = (select id from tests.deleted where label = 'ivan')),
  0,
  'its Link is gone'
);

select is(
  (select count(*)::int from public.password_copies where user_id = (select id from tests.deleted where label = 'ivan')),
  0,
  'its password copy is gone'
);

select is(
  (select count(*)::int from public.template_visibility where patient_id = (select id from tests.deleted where label = 'ivan'))
    + (select count(*)::int from public.audio_assignments where user_id = (select id from tests.deleted where label = 'ivan')),
  0,
  'its Hidden Presets and Assignments are gone'
);

select results_eq(
  $$ select name from public.custom_audios where created_by = tests.user_id('clinician_a') $$,
  $$ values ('bank_a') $$,
  'the Clinician keeps the audio they had assigned to the deleted Patient'
);

select results_eq(
  $$ select username, user_id, released_at from public.username_history order by username $$,
  $$ values ('ivan', null::uuid, now()), ('ivan-old', null::uuid, now() - interval '10 days') $$,
  'its Username is released now with no owner, and an older release loses its owner too'
);

select results_eq(
  $$ select viewer_id, target_id from public.password_access_log
      where target_id is null order by viewer_id = tests.user_id('admin') $$,
  $$ values (tests.user_id('clinician_a'), null::uuid), (tests.user_id('admin'), null::uuid) $$,
  'password views of the deleted account stay, their target a deleted account'
);

select tests.act_as_service_role();

select results_eq(
  $$ select * from public.username_state('ivan') $$,
  $$ values (null::uuid, null::uuid, now(), null::text) $$,
  'the Username reads as released now by a deleted account: locked for 30 days, its Personal URL leads nowhere'
);

select results_eq(
  $$ select * from public.username_state('ivan-old') $$,
  $$ values (null::uuid, null::uuid, now() - interval '10 days', null::text) $$,
  'an old Personal URL of the deleted account no longer redirects'
);

-- ── Deleting a Regular ──────────────────────────────────────────────────────

select lives_ok(
  $$ select public.delete_account(tests.user_id('nadia'), tests.user_id('admin')) $$,
  'the Admin deletes a Regular without a Username'
);

reset role;

select is(
  (select count(*)::int from auth.users where id = (select id from tests.deleted where label = 'nadia'))
    + (select count(*)::int from public.username_history where username = 'nadia'),
  0,
  'the Regular is gone and no Username is released'
);

-- ── Deleting a Clinician without Patients ───────────────────────────────────

select tests.act_as_service_role();

select lives_ok(
  $$ select public.delete_account(tests.user_id('sari'), tests.user_id('admin')) $$,
  'the Admin deletes a Clinician once they have no Patients'
);

reset role;

select is(
  (select count(*)::int from auth.users where id = (select id from tests.deleted where label = 'sari'))
    + (select count(*)::int from public.password_copies where user_id = (select id from tests.deleted where label = 'sari')),
  0,
  'the Clinician and their password copy are gone'
);

select results_eq(
  $$ select name from public.custom_audios where created_by = tests.user_id('admin') order by name $$,
  $$ values ('bank_admin'), ('sari_assigned'), ('sari_template') $$,
  'their audio still in someone else''s Library, assigned or a Template, moves to the Admin'
);

select is(
  (select count(*)::int from public.custom_audios where name in ('sari_self', 'sari_unassigned')),
  0,
  'the rest of their Audio Bank is deleted'
);

select results_eq(
  $$ select a.user_id, a.assigned_by from public.audio_assignments a
      where a.audio_id = tests.custom_audio_id('sari_assigned') $$,
  $$ values (tests.user_id('ketut'), tests.user_id('admin')) $$,
  'the moved audio stays in the Library it was assigned to'
);

select results_eq(
  $$ select a.user_id, a.assigned_by from public.audio_assignments a
      where a.audio_id = tests.custom_audio_id('bank_admin') $$,
  $$ values (tests.user_id('ketut'), null::uuid) $$,
  'audio they assigned from another Audio Bank stays, without who assigned it'
);

select results_eq(
  $$ select count(*)::int, count(*) filter (where target_id is null)::int from public.password_access_log $$,
  $$ values (3, 3) $$,
  'every password view stays; the ones of both deleted accounts read as a deleted account'
);

select tests.act_as('ketut');

select is(
  (select count(*)::int from public.custom_audios
    where id in (tests.custom_audio_id('sari_assigned'), tests.custom_audio_id('bank_admin'))),
  2,
  'the Patient still reads the audio assigned to them'
);

select * from finish();
rollback;
