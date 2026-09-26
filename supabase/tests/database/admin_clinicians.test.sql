-- The Admin manages Clinicians (0014, #14; ADR-014, ADR-015, ADR-018). No
-- client, the Admin included, writes a role, a Clinician origin or a Patient
-- limit: the server functions do, after the Account rules allow it.
-- complete_new_clinician() is for create-clinician (service role) only: it
-- grants the Clinician role with the Admin as its origin and stores the
-- password copy. A Clinician the Admin created signs in with their own email
-- and a password; a promoted User keeps the magic link until a password copy
-- exists.
begin;
\ir fixtures.psql
select plan(18);

select tests.create_user('admin', 'admin');
select tests.create_user('clinician_a', 'clinician');
update public.profiles set clinician_origin = 'subscription'
 where user_id = tests.user_id('clinician_a');
select tests.create_user('regular');
select tests.create_user('new_clinician');
select tests.create_user('promoted', 'clinician');
update public.profiles set clinician_origin = 'admin'
 where user_id = tests.user_id('promoted');
-- An account a direct magic-link sign-up made, which the Admin later promoted
-- and gave a password, and a Patient whose contact email is its login email.
select tests.create_user('lookalike', 'clinician');
update public.profiles set clinician_origin = 'admin'
 where user_id = tests.user_id('lookalike');
select tests.create_user('patient_c');
select tests.link('clinician_a', 'patient_c');
update public.profiles set username = 'ketut', contact_email = tests.email('lookalike')
 where user_id = tests.user_id('patient_c');
insert into public.password_copies (user_id, ciphertext)
values (tests.user_id('lookalike'), 'cipher-l'), (tests.user_id('patient_c'), 'cipher-c');

-- ── Clients write no role, origin or limit ──────────────────────────────────

select tests.act_as('clinician_a');

select throws_ok(
  $$ update public.profiles set clinician_origin = 'admin'
      where user_id = tests.user_id('clinician_a') $$,
  '42501', 'permission denied for table profiles',
  'a subscription Clinician cannot make their role granted by the Admin, out of the webhook''s reach'
);

select throws_ok(
  $$ select public.complete_new_clinician(tests.user_id('new_clinician'), 'x', 'cipher') $$,
  '42501', 'permission denied for function complete_new_clinician',
  'a Clinician cannot call complete_new_clinician()'
);

select tests.act_as('admin');

select throws_ok(
  $$ update public.profiles set role = 'clinician', clinician_origin = 'admin'
      where user_id = tests.user_id('regular') $$,
  '42501', 'permission denied for table profiles',
  'the Admin promotes a User only through the server function'
);

select throws_ok(
  $$ update public.profiles set patient_limit = 45
      where user_id = tests.user_id('clinician_a') $$,
  '42501', 'permission denied for table profiles',
  'the Admin raises a Patient limit only through the server function'
);

select throws_ok(
  $$ select public.complete_new_clinician(tests.user_id('new_clinician'), 'x', 'cipher') $$,
  '42501', 'permission denied for function complete_new_clinician',
  'the Admin creates a Clinician only through the server function'
);

select tests.act_as_anon();

select throws_ok(
  $$ select public.complete_new_clinician(tests.user_id('new_clinician'), 'x', 'cipher') $$,
  '42501', 'permission denied for function complete_new_clinician',
  'a signed-out visitor cannot call complete_new_clinician()'
);

-- ── The service role (server functions) ─────────────────────────────────────

select tests.act_as_service_role();

select public.complete_new_clinician(tests.user_id('new_clinician'), 'Sari Dewi', 'cipher-s');

select results_eq(
  $$ select display_name, role, clinician_origin
       from public.profiles where user_id = tests.user_id('new_clinician') $$,
  $$ values ('Sari Dewi', 'clinician', 'admin') $$,
  'complete_new_clinician() names the profile and grants the Clinician role, granted by the Admin'
);

select results_eq(
  $$ select ciphertext from public.password_copies where user_id = tests.user_id('new_clinician') $$,
  $$ values ('cipher-s') $$,
  'complete_new_clinician() stores the password copy the Admin may reveal'
);

select is(
  (select patient_limit from public.profiles where user_id = tests.user_id('new_clinician')),
  30,
  'a Clinician the Admin created starts with a Patient limit of 30'
);

select throws_ok(
  $$ select public.complete_new_clinician(tests.user_id('admin'), 'x', 'cipher') $$,
  'P0001', null,
  'complete_new_clinician() never turns the Admin account into a Clinician'
);

select throws_ok(
  $$ select public.complete_new_clinician(tests.user_id('clinician_a'), 'x', 'cipher') $$,
  'P0001', null,
  'complete_new_clinician() refuses an account that already holds the Clinician role'
);

select is(
  (select clinician_origin from public.profiles where user_id = tests.user_id('clinician_a')),
  'subscription',
  'a refused complete_new_clinician() leaves the subscription Clinician as they were'
);

-- ── Signing in ──────────────────────────────────────────────────────────────

select is(
  public.password_login_email('New_Clinician@Serenade.test'),
  tests.email('new_clinician'),
  'a Clinician the Admin created signs in with their own email and a password'
);

select ok(
  public.password_login_email(tests.email('promoted')) is null,
  'a User the Admin promoted keeps the magic link while no password copy exists'
);

insert into public.password_copies (user_id, ciphertext)
values (tests.user_id('promoted'), 'cipher-p');

select is(
  public.password_login_email(tests.email('promoted')),
  tests.email('promoted'),
  'once the Admin sets their password, a promoted User signs in with it'
);

select ok(
  public.password_login_email(tests.email('clinician_a')) is null
    and public.password_login_email(tests.email('regular')) is null
    and public.password_login_email(tests.email('admin')) is null,
  'a subscription Clinician, a Regular and the Admin keep the magic link'
);

select ok(
  public.password_login_email('someone-else@serenade.test') is null,
  'an email nobody signs in with resolves to nothing'
);

select is(
  public.password_login_email(tests.email('lookalike')),
  tests.email('patient_c'),
  'a Patient''s contact email keeps resolving to that Patient, even when another account signs in with it'
);

select * from finish();
rollback;
