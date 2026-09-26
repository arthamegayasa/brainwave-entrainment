-- Who reads which Custom Audio and Assignments (#19; 0002 and 0005 policies):
--   any signed-in User: Templates, and Custom Audio assigned to them;
--   a Patient: their own Assignments;
--   a Clinician: their own Custom Audio (Audio Bank), and Assignments of it to
--     their own linked Patients;
--   the Admin: everything.
-- Every read below also proves the two tables' policies no longer recurse into
-- each other ("infinite recursion detected in policy").
begin;
\ir fixtures.psql
select plan(8);

-- Every User reads Templates and the Admin reads every row, so Custom Audio
-- left in a reused local database would leak into the expected sets: start
-- from none (rollback restores it).
delete from public.custom_audios;

select tests.create_user('admin', 'admin');
select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('patient_a1');
select tests.create_user('patient_a2');
select tests.create_user('patient_b');
select tests.create_user('regular');
select tests.link('clinician_a', 'patient_a1');
select tests.link('clinician_a', 'patient_a2');
select tests.link('clinician_b', 'patient_b');

select tests.create_custom_audio('template', 'admin', true);
select tests.create_custom_audio('admin_audio', 'admin');
select tests.create_custom_audio('bank_a', 'clinician_a');
select tests.create_custom_audio('bank_a_unassigned', 'clinician_a');
select tests.create_custom_audio('bank_b', 'clinician_b');
select tests.assign('bank_a', 'patient_a1');
select tests.assign('bank_a', 'patient_a2');
-- The Admin can assign any Custom Audio to any User (ADR-011), not only to
-- a Clinician's Patients.
select tests.assign('bank_a', 'regular');
select tests.assign('bank_b', 'patient_b');
select tests.assign('admin_audio', 'patient_a1');

-- ── Any signed-in User ─────────────────────────────────────────────────────
select tests.act_as('regular');

select set_eq(
  'select id from public.custom_audios',
  $$ values (tests.custom_audio_id('template')), (tests.custom_audio_id('bank_a')) $$,
  'a signed-in User reads Templates and the Custom Audio assigned to them, not other Users'''
);

select set_eq(
  'select audio_id, user_id from public.audio_assignments',
  $$ values (tests.custom_audio_id('bank_a'), tests.user_id('regular')) $$,
  'a signed-in User reads only their own Assignments'
);

-- ── A Patient ──────────────────────────────────────────────────────────────
reset role;
select tests.act_as('patient_a1');

select set_eq(
  'select id from public.custom_audios',
  $$ values (tests.custom_audio_id('template')),
            (tests.custom_audio_id('bank_a')),
            (tests.custom_audio_id('admin_audio')) $$,
  'a Patient reads Templates and the Custom Audio assigned to them, not their Clinician''s unassigned Custom Audio'
);

select set_eq(
  'select audio_id, user_id from public.audio_assignments',
  $$ values (tests.custom_audio_id('bank_a'), tests.user_id('patient_a1')),
            (tests.custom_audio_id('admin_audio'), tests.user_id('patient_a1')) $$,
  'a Patient reads their own Assignments, not other Patients'' Assignments of the same Custom Audio'
);

-- ── A Clinician ────────────────────────────────────────────────────────────
reset role;
select tests.act_as('clinician_a');

select set_eq(
  'select id from public.custom_audios',
  $$ values (tests.custom_audio_id('template')),
            (tests.custom_audio_id('bank_a')),
            (tests.custom_audio_id('bank_a_unassigned')) $$,
  'a Clinician reads Templates and their own Custom Audio, not another Clinician''s or the Admin''s'
);

select set_eq(
  'select audio_id, user_id from public.audio_assignments',
  $$ values (tests.custom_audio_id('bank_a'), tests.user_id('patient_a1')),
            (tests.custom_audio_id('bank_a'), tests.user_id('patient_a2')) $$,
  'a Clinician reads Assignments of their own Custom Audio to their own Patients only'
);

-- ── The Admin ──────────────────────────────────────────────────────────────
reset role;
select tests.act_as('admin');

select set_eq(
  'select id from public.custom_audios',
  $$ values (tests.custom_audio_id('template')),
            (tests.custom_audio_id('admin_audio')),
            (tests.custom_audio_id('bank_a')),
            (tests.custom_audio_id('bank_a_unassigned')),
            (tests.custom_audio_id('bank_b')) $$,
  'the Admin reads all Custom Audio'
);

select set_eq(
  'select audio_id, user_id from public.audio_assignments',
  $$ values (tests.custom_audio_id('bank_a'), tests.user_id('patient_a1')),
            (tests.custom_audio_id('bank_a'), tests.user_id('patient_a2')),
            (tests.custom_audio_id('bank_a'), tests.user_id('regular')),
            (tests.custom_audio_id('bank_b'), tests.user_id('patient_b')),
            (tests.custom_audio_id('admin_audio'), tests.user_id('patient_a1')) $$,
  'the Admin reads all Assignments'
);

select * from finish();
rollback;
