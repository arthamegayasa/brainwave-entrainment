-- A Patient reads only their own Link: not the Links of other Patients of the
-- same Clinician, nor of another Clinician (0005: patient_links policies).
begin;
\ir fixtures.psql
select plan(1);

select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('patient_a1');
select tests.create_user('patient_a2');
select tests.create_user('patient_b');
select tests.link('clinician_a', 'patient_a1');
select tests.link('clinician_a', 'patient_a2');
select tests.link('clinician_b', 'patient_b');

select tests.act_as('patient_a1');

select set_eq(
  'select clinician_id, patient_id from public.patient_links',
  $$ values (tests.user_id('clinician_a'), tests.user_id('patient_a1')) $$,
  'a Patient reads only their own Link'
);

select * from finish();
rollback;
