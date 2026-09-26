-- An Inactive Clinician (lost the clinician role; their Links and Custom Audio
-- stay) no longer reads or makes Assignments to their Patients: the
-- is_clinician() gate on "clinician assign own audio to own patient" (0005,
-- rewritten in 0006).
begin;
\ir fixtures.psql
select plan(2);

select tests.create_user('inactive_clinician', 'clinician');
select tests.create_user('patient');
select tests.link('inactive_clinician', 'patient');
select tests.create_custom_audio('bank', 'inactive_clinician');
select tests.create_custom_audio('bank_unassigned', 'inactive_clinician');
select tests.assign('bank', 'patient');
update public.profiles set role = 'user'
 where user_id = tests.user_id('inactive_clinician');

select tests.act_as('inactive_clinician');

select is_empty(
  'select audio_id, user_id from public.audio_assignments',
  'an Inactive Clinician no longer reads Assignments to their Patients'
);

select throws_ok(
  $$ insert into public.audio_assignments (audio_id, user_id)
     values (tests.custom_audio_id('bank_unassigned'), tests.user_id('patient')) $$,
  '42501', 'new row violates row-level security policy for table "audio_assignments"',
  'an Inactive Clinician cannot assign their Custom Audio to their Patients'
);

select * from finish();
rollback;
