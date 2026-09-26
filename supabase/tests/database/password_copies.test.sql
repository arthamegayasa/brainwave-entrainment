-- Password copies and the password access log (0009, #8; ADR-015): only the
-- server functions (service role) read or write either table, so no client,
-- the Admin included, reaches a copy or the log directly. Removing a Link
-- deletes that Patient's copy, unless the Admin created them as a Clinician;
-- the log outlives the accounts it names.
begin;
\ir fixtures.psql
select plan(22);

select tests.create_user('clinician_a', 'clinician');
select tests.create_user('patient_a');
select tests.create_user('patient_b');
select tests.create_user('new_patient');
select tests.create_user('admin', 'admin');
select tests.link('clinician_a', 'patient_a');
select tests.link('clinician_a', 'patient_b');
select tests.create_user('granted', 'clinician');
update public.profiles set clinician_origin = 'admin' where user_id = tests.user_id('granted');
select tests.link('clinician_a', 'granted');
insert into public.password_copies (user_id, ciphertext)
values (tests.user_id('patient_a'), 'cipher-a'), (tests.user_id('patient_b'), 'cipher-b'),
       (tests.user_id('granted'), 'cipher-g');
insert into public.password_access_log (viewer_id, target_id)
values (tests.user_id('clinician_a'), tests.user_id('patient_a'));

-- ── Clients reach neither table ─────────────────────────────────────────────

select tests.act_as('patient_a');

select throws_ok(
  'select * from public.password_copies',
  '42501', 'permission denied for table password_copies',
  'a Patient cannot read password copies, not even their own'
);

select throws_ok(
  $$ update public.password_copies set ciphertext = 'mine'
      where user_id = tests.user_id('patient_a') $$,
  '42501', 'permission denied for table password_copies',
  'a Patient cannot write their password copy'
);

select throws_ok(
  'select * from public.password_access_log',
  '42501', 'permission denied for table password_access_log',
  'a Patient cannot read the password access log'
);

select tests.act_as('clinician_a');

select throws_ok(
  'select * from public.password_copies',
  '42501', 'permission denied for table password_copies',
  'a Clinician cannot read their Patients'' password copies'
);

select throws_ok(
  $$ insert into public.password_copies (user_id, ciphertext)
     values (tests.user_id('new_patient'), 'cipher') $$,
  '42501', 'permission denied for table password_copies',
  'a Clinician cannot write a password copy'
);

select throws_ok(
  'select * from public.password_access_log',
  '42501', 'permission denied for table password_access_log',
  'a Clinician cannot read the password access log'
);

select throws_ok(
  'delete from public.password_access_log',
  '42501', 'permission denied for table password_access_log',
  'a Clinician cannot erase their reveals from the access log'
);

select throws_ok(
  $$ select public.link_new_patient(tests.user_id('clinician_a'), tests.user_id('new_patient'),
                                    'x', 'xyz', null, null, 'cipher') $$,
  '42501', 'permission denied for function link_new_patient',
  'a Clinician cannot store a password copy through link_new_patient()'
);

select tests.act_as('admin');

select throws_ok(
  'select * from public.password_copies',
  '42501', 'permission denied for table password_copies',
  'the Admin cannot read password copies directly'
);

select throws_ok(
  'select * from public.password_access_log',
  '42501', 'permission denied for table password_access_log',
  'the Admin reads the access log only through the server function'
);

select tests.act_as_anon();

select throws_ok(
  'select * from public.password_copies',
  '42501', 'permission denied for table password_copies',
  'a signed-out visitor cannot read password copies'
);

select throws_ok(
  'select * from public.password_access_log',
  '42501', 'permission denied for table password_access_log',
  'a signed-out visitor cannot read the password access log'
);

-- ── The service role (server functions) ─────────────────────────────────────

select tests.act_as_service_role();

select results_eq(
  $$ select ciphertext from public.password_copies where user_id = tests.user_id('patient_a') $$,
  $$ values ('cipher-a') $$,
  'the service role reads a password copy'
);

insert into public.password_copies (user_id, ciphertext)
values (tests.user_id('patient_a'), 'cipher-a2')
on conflict (user_id) do update set ciphertext = excluded.ciphertext;

select results_eq(
  $$ select ciphertext from public.password_copies where user_id = tests.user_id('patient_a') $$,
  $$ values ('cipher-a2') $$,
  'the service role replaces a password copy: one copy per account'
);

insert into public.password_access_log (viewer_id, target_id)
values (tests.user_id('admin'), tests.user_id('patient_b'));

select results_eq(
  $$ select viewer_id, target_id, revealed_at from public.password_access_log
      order by id $$,
  $$ values (tests.user_id('clinician_a'), tests.user_id('patient_a'), now()),
            (tests.user_id('admin'), tests.user_id('patient_b'), now()) $$,
  'the service role writes and reads the access log: viewer, target and time'
);

select public.link_new_patient(
  tests.user_id('clinician_a'), tests.user_id('new_patient'),
  'Made Wirawan', 'made', null, 30, 'cipher-new'
);

select results_eq(
  $$ select ciphertext from public.password_copies where user_id = tests.user_id('new_patient') $$,
  $$ values ('cipher-new') $$,
  'link_new_patient() stores the new Patient''s password copy with the Link'
);

-- ── Removing a Link deletes that Patient's copy ─────────────────────────────

select tests.act_as('clinician_a');
delete from public.patient_links where patient_id = tests.user_id('patient_a');
select tests.act_as_service_role();

select is_empty(
  $$ select 1 from public.password_copies where user_id = tests.user_id('patient_a') $$,
  'removing a Link deletes that Patient''s password copy'
);

select results_eq(
  $$ select ciphertext from public.password_copies where user_id = tests.user_id('patient_b') $$,
  $$ values ('cipher-b') $$,
  'another Patient''s password copy stays'
);

select tests.act_as('clinician_a');
delete from public.patient_links where patient_id = tests.user_id('granted');
select tests.act_as_service_role();

select results_eq(
  $$ select ciphertext from public.password_copies where user_id = tests.user_id('granted') $$,
  $$ values ('cipher-g') $$,
  'a Clinician the Admin created keeps their copy for the Admin when their Link is removed'
);

-- ── Deleted accounts ────────────────────────────────────────────────────────

reset role;
delete from auth.users where id = tests.user_id('patient_b');
select tests.act_as_service_role();

select set_eq(
  'select user_id from public.password_copies',
  $$ values (tests.user_id('new_patient')), (tests.user_id('granted')) $$,
  'deleting an account deletes its password copy'
);

select results_eq(
  $$ select viewer_id, target_id from public.password_access_log order by id $$,
  $$ values (tests.user_id('clinician_a'), tests.user_id('patient_a')),
            (tests.user_id('admin'), null::uuid) $$,
  'access-log rows outlive the account they name, which then reads as deleted'
);

-- ── Clinician origin ────────────────────────────────────────────────────────

reset role;

select throws_ok(
  $$ update public.profiles set clinician_origin = 'bought'
      where user_id = tests.user_id('clinician_a') $$,
  '23514', null,
  'a Clinician origin is a subscription or granted by the Admin'
);

select * from finish();
rollback;
