-- Patient accounts with a Username (0007, #5): the new profile fields, the
-- client's lack of write access to profiles and Links, and the helpers only
-- the server functions (service role) may call.
begin;
\ir fixtures.psql
select plan(28);

select tests.create_user('clinician_a', 'clinician');
select tests.create_user('clinician_b', 'clinician');
select tests.create_user('patient_a');
select tests.create_user('regular');
-- Accounts the service role completes as Patients below.
select tests.create_user('new_patient');
select tests.create_user('one_too_many');
select tests.link('clinician_a', 'patient_a');
update public.profiles
   set username = 'ivan', display_name = 'Ivan Pratama', contact_email = 'ivan@mail.test'
 where user_id = tests.user_id('patient_a');

-- ── Profile fields ──────────────────────────────────────────────────────────

select is(
  (select patient_limit from public.profiles where user_id = tests.user_id('clinician_b')),
  30,
  'a Clinician starts with a Patient limit of 30'
);

select throws_ok(
  $$ update public.profiles set username = 'Ivan-2' where user_id = tests.user_id('regular') $$,
  '23514', null,
  'a Username has no uppercase letters'
);

select throws_ok(
  $$ update public.profiles set username = 'iv' where user_id = tests.user_id('regular') $$,
  '23514', null,
  'a Username has at least 3 characters'
);

select throws_ok(
  $$ update public.profiles set username = repeat('a', 31) where user_id = tests.user_id('regular') $$,
  '23514', null,
  'a Username has at most 30 characters'
);

select throws_ok(
  $$ update public.profiles set username = 'ivan_2' where user_id = tests.user_id('regular') $$,
  '23514', null,
  'a Username uses only a–z, 0–9 and hyphen'
);

select lives_ok(
  $$ update public.profiles set username = repeat('a', 30) where user_id = tests.user_id('regular') $$,
  'a 30-character Username is valid'
);

select throws_ok(
  $$ update public.profiles set username = 'ivan' where user_id = tests.user_id('regular') $$,
  '23505', null,
  'a Username belongs to one account across the platform'
);

select throws_ok(
  $$ update public.profiles set contact_email = 'Ivan@Mail.test' where user_id = tests.user_id('regular') $$,
  '23514', null,
  'a contact email is stored lowercase'
);

select throws_ok(
  $$ update public.profiles set contact_email = 'ivan@mail.test' where user_id = tests.user_id('regular') $$,
  '23505', null,
  'a contact email belongs to one account'
);

-- ── Clients cannot create Links or write profiles ───────────────────────────

select tests.act_as('clinician_a');

select throws_ok(
  $$ insert into public.patient_links (clinician_id, patient_id)
     values (tests.user_id('clinician_a'), tests.user_id('regular')) $$,
  '42501', null,
  'a Clinician cannot insert a Link'
);

select throws_ok(
  $$ update public.profiles set patient_limit = 1000 where user_id = tests.user_id('clinician_a') $$,
  '42501', 'permission denied for table profiles',
  'a Clinician cannot raise their own Patient limit'
);

select throws_ok(
  $$ update public.profiles set username = 'ivan-moon' where user_id = tests.user_id('patient_a') $$,
  '42501', 'permission denied for table profiles',
  'a Clinician cannot write their Patient''s profile'
);

select tests.act_as('regular');

select throws_ok(
  $$ insert into public.patient_links (clinician_id, patient_id)
     values (tests.user_id('clinician_b'), tests.user_id('regular')) $$,
  '42501', null,
  'a Regular cannot link themselves to a Clinician'
);

select throws_ok(
  $$ insert into public.profiles (user_id, username) values (gen_random_uuid(), 'someone') $$,
  '42501', 'permission denied for table profiles',
  'a User cannot insert a profile'
);

select tests.act_as('patient_a');

select throws_ok(
  $$ update public.profiles
        set display_name = 'Someone else', username = 'ivan-2', contact_email = 'x@mail.test'
      where user_id = tests.user_id('patient_a') $$,
  '42501', 'permission denied for table profiles',
  'a Patient cannot write their own profile'
);

-- ── A Patient reads their own profile and Link ──────────────────────────────

select results_eq(
  $$ select display_name, username, contact_email from public.profiles
      where user_id = tests.user_id('patient_a') $$,
  $$ values ('Ivan Pratama', 'ivan', 'ivan@mail.test') $$,
  'a Patient reads their own name, Username and contact email'
);

select set_eq(
  'select clinician_id, patient_id from public.patient_links',
  $$ values (tests.user_id('clinician_a'), tests.user_id('patient_a')) $$,
  'a Patient reads their own Link'
);

-- ── Server-function helpers are closed to clients ───────────────────────────

select throws_ok(
  $$ select public.is_email_registered('ivan@mail.test') $$,
  '42501', 'permission denied for function is_email_registered',
  'a User cannot call is_email_registered()'
);

select throws_ok(
  $$ select public.password_login_email('ivan') $$,
  '42501', 'permission denied for function password_login_email',
  'a User cannot call password_login_email()'
);

select throws_ok(
  $$ select public.link_new_patient(tests.user_id('clinician_a'), tests.user_id('patient_a'),
                                    'x', 'xyz', null, null, 'cipher') $$,
  '42501', 'permission denied for function link_new_patient',
  'a User cannot call link_new_patient()'
);

select tests.act_as_anon();

select throws_ok(
  $$ select public.password_login_email('ivan') $$,
  '42501', 'permission denied for function password_login_email',
  'a signed-out visitor cannot call password_login_email()'
);

-- ── The service role (server functions) ─────────────────────────────────────

select tests.act_as_service_role();

select ok(
  public.is_email_registered('CLINICIAN_A@serenade.test')
    and public.is_email_registered('Ivan@Mail.test')
    and not public.is_email_registered('nobody@mail.test'),
  'an email is registered when it is any login email or contact email, in any case'
);

select is(
  public.password_login_email('ivan'),
  tests.email('patient_a'),
  'a Username resolves to its account''s login email'
);

select is(
  public.password_login_email('IVAN@mail.test'),
  tests.email('patient_a'),
  'a contact email resolves to its account''s login email'
);

select ok(
  public.password_login_email('regular@serenade.test') is null
    and public.password_login_email('nobody') is null,
  'a magic-link account''s email and an unknown Username resolve to nothing'
);

select public.link_new_patient(
  tests.user_id('clinician_b'), tests.user_id('new_patient'),
  'Made Wirawan', 'made', 'made@mail.test', 30, 'cipher'
);

select results_eq(
  $$ select p.display_name, p.username, p.contact_email, l.clinician_id
       from public.profiles p
       join public.patient_links l on l.patient_id = p.user_id
      where p.user_id = tests.user_id('new_patient') $$,
  $$ values ('Made Wirawan', 'made', 'made@mail.test', tests.user_id('clinician_b')) $$,
  'link_new_patient() sets the name, Username and contact email and creates the Link'
);

select throws_ok(
  $$ select public.link_new_patient(tests.user_id('clinician_b'), tests.user_id('one_too_many'),
                                    'Ketut', 'ketut', null, 1, 'cipher') $$,
  'P0001', 'patient_limit_reached',
  'link_new_patient() refuses a Clinician at their Patient limit'
);

select lives_ok(
  $$ select public.link_new_patient(tests.user_id('clinician_b'), tests.user_id('one_too_many'),
                                    'Ketut', 'ketut', null, null, 'cipher') $$,
  'link_new_patient() applies no limit when given none (the Admin)'
);

select * from finish();
rollback;
