-- A Clinician sees only their own Links and their own Patients' profiles,
-- never another Clinician's (0005: patient_links and profiles policies).
begin;
\ir fixtures.psql
select plan(2);

select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('patient_a');
select tests.create_user('patient_b');
select tests.link('clinician_a', 'patient_a');
select tests.link('clinician_b', 'patient_b');

select tests.act_as('clinician_a');

select set_eq(
  'select clinician_id, patient_id from public.patient_links',
  $$ values (tests.user_id('clinician_a'), tests.user_id('patient_a')) $$,
  'a Clinician reads only their own Links, not another Clinician''s'
);

select set_eq(
  'select user_id from public.profiles',
  $$ values (tests.user_id('clinician_a')), (tests.user_id('patient_a')) $$,
  'a Clinician reads only their own and their Patients'' profiles, not another Clinician''s Patients'' profiles'
);

select * from finish();
rollback;
