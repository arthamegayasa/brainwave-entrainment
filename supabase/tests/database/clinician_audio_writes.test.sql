-- A Clinician saves Custom Audio only to their own Audio Bank, never as a
-- Template, and assigns only their own Custom Audio to their own linked
-- Patients (0005: "clinician manage own", "clinician assign own audio to own
-- patient").
begin;
\ir fixtures.psql
select plan(6);

select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('patient_a');
select tests.create_user('patient_b');
select tests.link('clinician_a', 'patient_a');
select tests.link('clinician_b', 'patient_b');
select tests.create_custom_audio('bank_a', 'clinician_a');
select tests.create_custom_audio('bank_b', 'clinician_b');

select tests.act_as('clinician_a');

-- ── Audio Bank and Templates ───────────────────────────────────────────────
select lives_ok(
  $$ insert into public.custom_audios (created_by, name, spec)
     values (auth.uid(), 'new_bank', '{}') $$,
  'a Clinician saves Custom Audio to their own Audio Bank'
);

select throws_ok(
  $$ insert into public.custom_audios (created_by, name, spec, is_template)
     values (auth.uid(), 'new_template', '{}', true) $$,
  '42501', 'new row violates row-level security policy for table "custom_audios"',
  'a Clinician cannot publish a Template'
);

select throws_ok(
  $$ update public.custom_audios set is_template = true
     where id = tests.custom_audio_id('bank_a') $$,
  '42501', 'new row violates row-level security policy for table "custom_audios"',
  'a Clinician cannot turn their own Custom Audio into a Template'
);

-- ── Assignments ────────────────────────────────────────────────────────────
select lives_ok(
  $$ insert into public.audio_assignments (audio_id, user_id)
     values (tests.custom_audio_id('bank_a'), tests.user_id('patient_a')) $$,
  'a Clinician assigns their own Custom Audio to their own Patient'
);

select throws_ok(
  $$ insert into public.audio_assignments (audio_id, user_id)
     values (tests.custom_audio_id('bank_b'), tests.user_id('patient_a')) $$,
  '42501', 'new row violates row-level security policy for table "audio_assignments"',
  'a Clinician cannot assign another Clinician''s Custom Audio'
);

select throws_ok(
  $$ insert into public.audio_assignments (audio_id, user_id)
     values (tests.custom_audio_id('bank_a'), tests.user_id('patient_b')) $$,
  '42501', 'new row violates row-level security policy for table "audio_assignments"',
  'a Clinician cannot assign to another Clinician''s Patient'
);

select * from finish();
rollback;
