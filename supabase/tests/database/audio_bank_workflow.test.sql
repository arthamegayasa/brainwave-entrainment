-- The Audio Bank workflow (0019). Private notes are read and written only by
-- the audio's owner Clinician and the Admin, never by its assignees. Custom
-- Audio made for a Patient is assigned to them by the database, is made only
-- for the maker's own Patients (the Admin: anyone), and is never assigned to
-- anyone else. A Transfer takes the Patient's personal audio to the new
-- Clinician; an ended Link leaves it with its maker; deleting the Patient
-- deletes it. updated_at is stamped by the database on every save.
begin;
\ir fixtures.psql
select plan(34);

select tests.create_user('admin', 'admin');
select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('clinician_c', 'clinician');
select tests.create_user('patient_a1');
select tests.create_user('patient_a2');
select tests.create_user('patient_b');
select tests.create_user('patient_t');
select tests.create_user('patient_e');
select tests.create_user('patient_d');
select tests.create_user('regular');

select tests.link('clinician_a', 'patient_a1');
select tests.link('clinician_a', 'patient_a2');
select tests.link('clinician_b', 'patient_b');
select tests.link('clinician_a', 'patient_t');
select tests.link('clinician_a', 'patient_e');
select tests.link('clinician_a', 'patient_d');

-- bank_a: Clinician A's general audio with a private note, assigned to both
-- of A's first Patients.
select tests.create_custom_audio('bank_a', 'clinician_a');
insert into public.custom_audio_notes (audio_id, notes)
values (tests.custom_audio_id('bank_a'), 'note a');
select tests.assign('bank_a', 'patient_a1');
select tests.assign('bank_a', 'patient_a2');

-- ── Private notes ───────────────────────────────────────────────────────────

select hasnt_column(
  'public', 'custom_audios', 'notes',
  'Custom Audio rows, which assignees read whole, no longer carry notes'
);

select tests.act_as('patient_a1');

select is(
  (select count(*)::int from public.custom_audios where id = tests.custom_audio_id('bank_a')),
  1,
  'the Patient reads the Custom Audio assigned to them'
);

select is_empty(
  'select notes from public.custom_audio_notes',
  'an assignee reads none of its notes'
);

select tests.act_as('clinician_a');

select results_eq(
  $$ select notes from public.custom_audio_notes where audio_id = tests.custom_audio_id('bank_a') $$,
  $$ values ('note a') $$,
  'the owner Clinician reads their notes'
);

select tests.act_as('admin');

select results_eq(
  $$ select notes from public.custom_audio_notes where audio_id = tests.custom_audio_id('bank_a') $$,
  $$ values ('note a') $$,
  'the Admin reads every note'
);

select tests.act_as('clinician_b');

select is_empty(
  'select notes from public.custom_audio_notes',
  'another Clinician reads none of them'
);

select throws_ok(
  $$ insert into public.custom_audio_notes (audio_id, notes)
     values (tests.custom_audio_id('bank_a'), 'not mine') $$,
  '42501', 'new row violates row-level security policy for table "custom_audio_notes"',
  'a Clinician cannot write notes on another Clinician''s Custom Audio'
);

-- ── Made for a Patient ──────────────────────────────────────────────────────

select tests.act_as('clinician_a');

select lives_ok(
  $$ insert into public.custom_audios (created_by, name, spec, made_for)
     values (auth.uid(), 'personal_a1', '{}', tests.user_id('patient_a1')) $$,
  'a Clinician saves audio made for their own Patient'
);

reset role;

select results_eq(
  $$ select user_id, assigned_by from public.audio_assignments
      where audio_id = tests.custom_audio_id('personal_a1') $$,
  $$ values (tests.user_id('patient_a1'), tests.user_id('clinician_a')) $$,
  'personal audio is assigned to its Patient on save'
);

select tests.act_as('clinician_a');

select throws_ok(
  $$ insert into public.custom_audios (created_by, name, spec, made_for)
     values (auth.uid(), 'personal_b', '{}', tests.user_id('patient_b')) $$,
  'P0001', 'not_your_patient',
  'a Clinician cannot make audio for another Clinician''s Patient'
);

select throws_ok(
  $$ insert into public.custom_audios (created_by, name, spec, made_for)
     values (auth.uid(), 'personal_regular', '{}', tests.user_id('regular')) $$,
  'P0001', 'not_your_patient',
  'nor for a User who is nobody''s Patient'
);

select throws_ok(
  $$ update public.custom_audios set made_for = tests.user_id('patient_b')
      where id = tests.custom_audio_id('personal_a1') $$,
  'P0001', 'not_your_patient',
  'nor move their audio to another Clinician''s Patient'
);

select tests.act_as('admin');

select lives_ok(
  $$ insert into public.custom_audios (created_by, name, spec, made_for)
     values (auth.uid(), 'admin_for_b', '{}', tests.user_id('patient_b')) $$,
  'the Admin makes audio for any Clinician''s Patient'
);

reset role;

select results_eq(
  $$ select user_id from public.audio_assignments
      where audio_id = tests.custom_audio_id('admin_for_b') $$,
  $$ values (tests.user_id('patient_b')) $$,
  'the Admin''s personal audio is assigned to that Patient'
);

select tests.act_as('clinician_a');

select throws_ok(
  $$ insert into public.audio_assignments (audio_id, user_id)
     values (tests.custom_audio_id('personal_a1'), tests.user_id('patient_a2')) $$,
  'P0001', 'personal_audio',
  'a Clinician cannot assign personal audio to another of their Patients'
);

select tests.act_as('admin');

select throws_ok(
  $$ insert into public.audio_assignments (audio_id, user_id)
     values (tests.custom_audio_id('personal_a1'), tests.user_id('regular')) $$,
  'P0001', 'personal_audio',
  'nor can the Admin assign personal audio to anyone else'
);

select throws_ok(
  $$ update public.audio_assignments set user_id = tests.user_id('regular')
      where audio_id = tests.custom_audio_id('personal_a1') $$,
  'P0001', 'personal_audio',
  'nor move its Assignment to anyone else'
);

select throws_ok(
  $$ insert into public.custom_audios (created_by, name, spec, is_template, made_for)
     values (auth.uid(), 'personal_template', '{}', true, tests.user_id('patient_b')) $$,
  '23514', 'new row for relation "custom_audios" violates check constraint "custom_audios_personal_template"',
  'a Template is never personal'
);

select tests.act_as('clinician_a');

select throws_ok(
  $$ update public.custom_audios set made_for = tests.user_id('patient_a1')
      where id = tests.custom_audio_id('bank_a') $$,
  'P0001', 'assigned_to_others',
  'audio assigned to other Patients cannot become personal'
);

-- ── Moving and ending personal audio ────────────────────────────────────────

select lives_ok(
  $$ update public.custom_audios set made_for = tests.user_id('patient_a2')
      where id = tests.custom_audio_id('personal_a1') $$,
  'a Clinician moves personal audio to another of their Patients'
);

reset role;

select results_eq(
  $$ select user_id from public.audio_assignments
      where audio_id = tests.custom_audio_id('personal_a1') $$,
  $$ values (tests.user_id('patient_a2')) $$,
  'moving it from one Patient to another moves its Assignment'
);

select tests.act_as('clinician_a');

select lives_ok(
  $$ update public.custom_audios set made_for = null
      where id = tests.custom_audio_id('personal_a1') $$,
  'a Clinician makes personal audio general'
);

reset role;

select results_eq(
  $$ select user_id from public.audio_assignments
      where audio_id = tests.custom_audio_id('personal_a1') $$,
  $$ values (tests.user_id('patient_a2')) $$,
  'general again, it stays in its former Patient''s Library'
);

-- ── updated_at ──────────────────────────────────────────────────────────────

insert into public.custom_audios (created_by, name, spec, created_at, updated_at)
values (tests.user_id('clinician_a'), 'dated', '{}', '2020-01-01', '2020-01-01');

select tests.act_as('clinician_a');

update public.custom_audios set based_on = 'bank_a', updated_at = '2000-01-01'
 where id = tests.custom_audio_id('dated');

reset role;

select results_eq(
  $$ select created_at, updated_at from public.custom_audios
      where id = tests.custom_audio_id('dated') $$,
  $$ values ('2020-01-01'::timestamptz, now()) $$,
  'saving stamps updated_at with the save time, whatever the client sends'
);

-- ── A Transfer takes personal audio along ───────────────────────────────────

select tests.create_custom_audio('bank_t', 'clinician_a');
select tests.assign('bank_t', 'patient_t');

select tests.act_as('clinician_a');

insert into public.custom_audios (created_by, name, spec, made_for)
values (auth.uid(), 'personal_t', '{}', tests.user_id('patient_t'));
insert into public.custom_audio_notes (audio_id, notes)
values (tests.custom_audio_id('personal_t'), 'note t');

select tests.act_as_service_role();

select is(
  public.transfer_patients(tests.user_id('clinician_a'), tests.user_id('patient_t'),
                           tests.user_id('clinician_c'), null),
  1,
  'the Admin Transfers a Patient with personal audio'
);

reset role;

select results_eq(
  $$ select created_by, made_for from public.custom_audios
      where id = tests.custom_audio_id('personal_t') $$,
  $$ values (tests.user_id('clinician_c'), tests.user_id('patient_t')) $$,
  'the Patient''s personal audio moves to the new Clinician''s Audio Bank'
);

select results_eq(
  $$ select audio_id from public.audio_assignments where user_id = tests.user_id('patient_t') $$,
  $$ values (tests.custom_audio_id('personal_t')) $$,
  'the Patient keeps their personal audio; the old Clinician''s general Assignments go'
);

select tests.act_as('clinician_c');

select results_eq(
  $$ select notes from public.custom_audio_notes where audio_id = tests.custom_audio_id('personal_t') $$,
  $$ values ('note t') $$,
  'the new Clinician reads its notes'
);

-- ── Ending the Link ─────────────────────────────────────────────────────────

select tests.act_as('clinician_a');

insert into public.custom_audios (created_by, name, spec, made_for)
values (auth.uid(), 'personal_e', '{}', tests.user_id('patient_e'));
delete from public.patient_links where patient_id = tests.user_id('patient_e');

reset role;

select results_eq(
  $$ select created_by, made_for from public.custom_audios
      where id = tests.custom_audio_id('personal_e') $$,
  $$ values (tests.user_id('clinician_a'), tests.user_id('patient_e')) $$,
  'when the Link ends, personal audio stays with its maker'
);

select is_empty(
  $$ select 1 from public.audio_assignments where user_id = tests.user_id('patient_e') $$,
  'and leaves the former Patient''s Library'
);

select tests.act_as('clinician_a');

select lives_ok(
  $$ update public.custom_audios
        set based_on = 'bank_a', made_for = tests.user_id('patient_e')
      where id = tests.custom_audio_id('personal_e') $$,
  'its maker still saves it with its unchanged Patient'
);

reset role;

select is_empty(
  $$ select 1 from public.audio_assignments where user_id = tests.user_id('patient_e') $$,
  'saving it does not put it back in the former Patient''s Library'
);

select tests.act_as('clinician_a');

-- ── Deleting the Patient ────────────────────────────────────────────────────

insert into public.custom_audios (created_by, name, spec, made_for)
values (auth.uid(), 'personal_d', '{}', tests.user_id('patient_d'));

select tests.act_as_service_role();

select lives_ok(
  $$ select public.delete_account(tests.user_id('patient_d'), tests.user_id('admin')) $$,
  'the Admin deletes a Patient with personal audio'
);

reset role;

select is(
  (select count(*)::int from public.custom_audios where name = 'personal_d'),
  0,
  'deleting the Patient deletes their personal audio'
);

select * from finish();
rollback;
