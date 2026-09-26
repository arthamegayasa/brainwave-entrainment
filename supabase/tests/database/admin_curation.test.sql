-- The Admin acts on any Patient (0013, #13): the Admin reads every Hidden
-- Preset and hides or shows Presets for any Patient, under that Patient's own
-- Clinician, as the Clinician would; ending the Link still removes them.
-- Nobody else gains access: a Clinician curates only their own Patients, and
-- a Patient, a Regular or a signed-out visitor curates nobody. On Links the
-- Admin keeps reading and ending any Link (0010, permanent_links); creating
-- or changing one stays with the server functions, for the Admin too.
begin;
\ir fixtures.psql
select plan(21);

select tests.create_user('admin', 'admin');
select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('inactive_clinician', 'clinician');
select tests.create_user('patient_a');
select tests.create_user('patient_b');
select tests.create_user('patient_i');
select tests.create_user('regular');
select tests.link('clinician_a', 'patient_a');
select tests.link('clinician_b', 'patient_b');
select tests.link('inactive_clinician', 'patient_i');

insert into public.template_visibility (clinician_id, patient_id, preset_id)
values (tests.user_id('clinician_a'), tests.user_id('patient_a'), 'sleeping'),
       (tests.user_id('clinician_b'), tests.user_id('patient_b'), 'focus'),
       (tests.user_id('clinician_b'), tests.user_id('patient_b'), 'sleeping'),
       (tests.user_id('inactive_clinician'), tests.user_id('patient_i'), 'meditating');

update public.profiles set role = 'user'
 where user_id = tests.user_id('inactive_clinician');

-- ── The Admin ───────────────────────────────────────────────────────────────

select tests.act_as('admin');

select set_eq(
  $$ select patient_id, preset_id from public.template_visibility $$,
  $$ values (tests.user_id('patient_a'), 'sleeping'), (tests.user_id('patient_b'), 'focus'),
            (tests.user_id('patient_b'), 'sleeping'), (tests.user_id('patient_i'), 'meditating') $$,
  'the Admin reads the Hidden Presets of every Patient'
);

select lives_ok(
  $$ insert into public.template_visibility (clinician_id, patient_id, preset_id)
     values (tests.user_id('clinician_a'), tests.user_id('patient_a'), 'focus') $$,
  'the Admin hides a Preset for another Clinician''s Patient, under that Clinician'
);

select throws_ok(
  $$ insert into public.template_visibility (clinician_id, patient_id, preset_id)
     values (tests.user_id('admin'), tests.user_id('patient_a'), 'energizing') $$,
  '42501', 'new row violates row-level security policy for table "template_visibility"',
  'the Admin cannot hide a Preset under anyone but the Patient''s own Clinician'
);

select throws_ok(
  $$ insert into public.template_visibility (clinician_id, patient_id, preset_id)
     values (tests.user_id('admin'), tests.user_id('regular'), 'focus') $$,
  '42501', 'new row violates row-level security policy for table "template_visibility"',
  'the Admin cannot hide a Preset for a Regular: there is no Link'
);

delete from public.template_visibility
 where patient_id = tests.user_id('patient_b') and preset_id = 'focus';

select tests.act_as('patient_b');

select is_empty(
  $$ select 1 from public.template_visibility where preset_id = 'focus' $$,
  'the Admin shows a hidden Preset again for any Patient'
);

select tests.act_as('clinician_a');

select set_eq(
  $$ select preset_id from public.template_visibility where patient_id = tests.user_id('patient_a') $$,
  $$ values ('sleeping'), ('focus') $$,
  'the Clinician sees the Preset the Admin hid for their Patient'
);

select tests.act_as('patient_a');

select set_eq(
  $$ select preset_id from public.template_visibility $$,
  $$ values ('sleeping'), ('focus') $$,
  'the Preset the Admin hid is hidden from the Patient'
);

-- ── Links: read and end any, create or change none ──────────────────────────

select tests.act_as('admin');

select throws_ok(
  $$ insert into public.patient_links (clinician_id, patient_id)
     values (tests.user_id('clinician_a'), tests.user_id('regular')) $$,
  '42501', 'new row violates row-level security policy for table "patient_links"',
  'the Admin creates Links only through the server functions'
);

select throws_ok(
  $$ update public.patient_links set clinician_id = tests.user_id('clinician_b')
      where patient_id = tests.user_id('patient_a') $$,
  '42501', 'permission denied for table patient_links',
  'the Admin moves or switches Links only through the server functions'
);

-- ── Nobody else gains access ────────────────────────────────────────────────

select tests.act_as('clinician_b');

select set_eq(
  $$ select patient_id, preset_id from public.template_visibility $$,
  $$ values (tests.user_id('patient_b'), 'sleeping') $$,
  'a Clinician reads only the Hidden Presets of their own Patients'
);

select throws_ok(
  $$ insert into public.template_visibility (clinician_id, patient_id, preset_id)
     values (tests.user_id('clinician_b'), tests.user_id('patient_a'), 'energizing') $$,
  '42501', 'new row violates row-level security policy for table "template_visibility"',
  'a Clinician cannot hide a Preset for another Clinician''s Patient'
);

select throws_ok(
  $$ insert into public.template_visibility (clinician_id, patient_id, preset_id)
     values (tests.user_id('clinician_a'), tests.user_id('patient_a'), 'energizing') $$,
  '42501', 'new row violates row-level security policy for table "template_visibility"',
  'a Clinician cannot hide a Preset under another Clinician, the way the Admin does'
);

select is_empty(
  $$ delete from public.template_visibility
      where patient_id = tests.user_id('patient_a') returning 1 $$,
  'a Clinician cannot show another Clinician''s Patient a hidden Preset'
);

select tests.act_as('inactive_clinician');

select throws_ok(
  $$ insert into public.template_visibility (clinician_id, patient_id, preset_id)
     values (tests.user_id('inactive_clinician'), tests.user_id('patient_i'), 'focus') $$,
  '42501', 'new row violates row-level security policy for table "template_visibility"',
  'an Inactive Clinician can no longer hide Presets for the Patients still linked to them'
);

select tests.act_as('patient_a');

select throws_ok(
  $$ insert into public.template_visibility (clinician_id, patient_id, preset_id)
     values (tests.user_id('clinician_a'), tests.user_id('patient_a'), 'energizing') $$,
  '42501', 'new row violates row-level security policy for table "template_visibility"',
  'a Patient cannot hide a Preset from themselves'
);

select is_empty(
  $$ delete from public.template_visibility returning 1 $$,
  'a Patient cannot show themselves a Preset their Clinician hid'
);

select tests.act_as('regular');

select is_empty(
  $$ select 1 from public.template_visibility $$,
  'a Regular reads no Hidden Presets'
);

select throws_ok(
  $$ insert into public.template_visibility (clinician_id, patient_id, preset_id)
     values (tests.user_id('clinician_a'), tests.user_id('patient_a'), 'energizing') $$,
  '42501', 'new row violates row-level security policy for table "template_visibility"',
  'a Regular cannot hide a Preset for anyone'
);

select tests.act_as_anon();

select throws_ok(
  $$ select 1 from public.template_visibility $$,
  '42501', 'permission denied for table template_visibility',
  'a signed-out visitor cannot read Hidden Presets'
);

-- ── Ending the Link removes what the Admin hid ──────────────────────────────

select tests.act_as('admin');

delete from public.patient_links where patient_id = tests.user_id('patient_a');

select is_empty(
  $$ select 1 from public.template_visibility where patient_id = tests.user_id('patient_a') $$,
  'ending a Link removes the Hidden Presets the Admin added with those of the Clinician'
);

reset role;

select is_empty(
  $$ select 1 from public.template_visibility where patient_id = tests.user_id('patient_a') $$,
  'no Hidden Preset of the former Patient is left behind for anyone'
);

select * from finish();
rollback;
