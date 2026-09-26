-- Permanent Links and the Premium grant (0010, #9; ADR-014): a Patient cannot
-- end their Link; the owning Clinician (while they hold the role) and the
-- Admin can. Every Link carries the Premium grant, which only the server
-- functions switch. After a disconnect the former Patient keeps their Username
-- login but no grant, and the Clinician loses their profile. Invite Codes are
-- gone.
begin;
\ir fixtures.psql
select plan(20);

select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('inactive_clinician', 'clinician');
select tests.create_user('admin', 'admin');
select tests.create_user('patient_a');
select tests.create_user('patient_leaving');
select tests.create_user('patient_b');
select tests.create_user('patient_i');
select tests.create_user('regular');
select tests.link('clinician_a', 'patient_a');
select tests.link('clinician_a', 'patient_leaving');
select tests.link('clinician_b', 'patient_b');
select tests.link('inactive_clinician', 'patient_i');
update public.profiles set display_name = 'Sari Dewi'
 where user_id = tests.user_id('clinician_a');
update public.profiles set username = 'made', display_name = 'Made Wirawan'
 where user_id = tests.user_id('patient_leaving');
update public.profiles set role = 'user'
 where user_id = tests.user_id('inactive_clinician');

-- ── Invite Codes are removed ────────────────────────────────────────────────

select hasnt_table('public', 'invite_codes', 'the Invite Code table is gone');
select hasnt_function('public', 'redeem_invite_code', 'the redeem function is gone');

-- ── The Premium grant ───────────────────────────────────────────────────────

select results_eq(
  $$ select premium_grant from public.patient_links where patient_id = tests.user_id('patient_a') $$,
  $$ values (true) $$,
  'a new Link carries the Premium grant'
);

select tests.act_as('patient_a');

select is(
  public.get_my_clinician(),
  jsonb_build_object(
    'name', 'Sari Dewi', 'email', tests.email('clinician_a'), 'contact_email', null,
    'premium_grant', true
  ),
  'a Patient reads their Clinician''s name and their Premium grant'
);

select throws_ok(
  $$ update public.patient_links set premium_grant = false
      where patient_id = tests.user_id('patient_a') $$,
  '42501', 'permission denied for table patient_links',
  'a Patient cannot switch their Premium grant'
);

select tests.act_as('clinician_a');

select throws_ok(
  $$ update public.patient_links set premium_grant = false
      where patient_id = tests.user_id('patient_a') $$,
  '42501', 'permission denied for table patient_links',
  'a Clinician switches the Premium grant only through the server functions'
);

select tests.act_as_service_role();
update public.patient_links set premium_grant = false
 where patient_id = tests.user_id('patient_a');
select tests.act_as('patient_a');

select is(
  public.get_my_clinician() -> 'premium_grant',
  'false'::jsonb,
  'the server functions switch the Premium grant off'
);

select tests.act_as('regular');

select is(public.get_my_clinician(), null, 'a Regular has no Clinician and no grant');

select tests.act_as_anon();

select throws_ok(
  'select public.get_my_clinician()',
  '42501', 'permission denied for function get_my_clinician',
  'a signed-out visitor cannot call get_my_clinician()'
);

-- ── Who ends a Link ─────────────────────────────────────────────────────────

select tests.act_as('patient_a');
delete from public.patient_links where patient_id = tests.user_id('patient_a');

select isnt_empty(
  $$ select 1 from public.patient_links where patient_id = tests.user_id('patient_a') $$,
  'a Patient cannot delete their Link'
);

select tests.act_as('clinician_b');
delete from public.patient_links where patient_id = tests.user_id('patient_a');
select tests.act_as('clinician_a');

select isnt_empty(
  $$ select 1 from public.patient_links where patient_id = tests.user_id('patient_a') $$,
  'another Clinician cannot delete the Link'
);

select tests.act_as('inactive_clinician');
delete from public.patient_links where patient_id = tests.user_id('patient_i');
select tests.act_as('patient_i');

select isnt_empty(
  $$ select 1 from public.patient_links where patient_id = tests.user_id('patient_i') $$,
  'an Inactive Clinician cannot disconnect their Patients'
);

select tests.act_as('clinician_a');
delete from public.patient_links where patient_id = tests.user_id('patient_leaving');

select is_empty(
  $$ select 1 from public.patient_links where patient_id = tests.user_id('patient_leaving') $$,
  'the owning Clinician disconnects their Patient'
);

select is_empty(
  $$ select 1 from public.profiles where user_id = tests.user_id('patient_leaving') $$,
  'after a disconnect the Clinician no longer reads the former Patient''s profile'
);

select tests.act_as('admin');

select set_eq(
  'select clinician_id, patient_id from public.patient_links',
  $$ values (tests.user_id('clinician_a'), tests.user_id('patient_a')),
            (tests.user_id('clinician_b'), tests.user_id('patient_b')),
            (tests.user_id('inactive_clinician'), tests.user_id('patient_i')) $$,
  'the Admin reads every Link'
);

delete from public.patient_links where patient_id = tests.user_id('patient_b');

select is_empty(
  $$ select 1 from public.patient_links where patient_id = tests.user_id('patient_b') $$,
  'the Admin deletes any Link'
);

select tests.act_as('clinician_b');

select is_empty(
  $$ select 1 from public.profiles where user_id = tests.user_id('patient_b') $$,
  'after the Admin ends a Link its Clinician no longer reads the former Patient''s profile'
);

-- ── The former Patient ──────────────────────────────────────────────────────

select tests.act_as('patient_leaving');

select is(
  public.get_my_clinician(),
  null,
  'a disconnected Patient is a Regular without a Premium grant'
);

select results_eq(
  $$ select username from public.profiles where user_id = tests.user_id('patient_leaving') $$,
  $$ values ('made') $$,
  'a disconnected Patient keeps their Username'
);

select tests.act_as_service_role();

select is(
  public.password_login_email('made'),
  tests.email('patient_leaving'),
  'a disconnected Patient still signs in with Username + password'
);

select * from finish();
rollback;
