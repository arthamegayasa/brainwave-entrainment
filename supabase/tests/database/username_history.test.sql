-- Username history (0008, #7): a Username change records the released
-- Username with its owner and release time; only the server functions
-- (service role) read or write the history or change a Username, so a Patient
-- cannot change their own.
begin;
\ir fixtures.psql
select plan(17);

select tests.create_user('clinician_a', 'clinician');
select tests.create_user('patient_a');
select tests.create_user('patient_b');
select tests.create_user('no_username');
select tests.link('clinician_a', 'patient_a');
update public.profiles set username = 'ivan' where user_id = tests.user_id('patient_a');
update public.profiles set username = 'made' where user_id = tests.user_id('patient_b');

-- ── Clients reach neither the history nor its helpers ───────────────────────

select tests.act_as('patient_a');

select throws_ok(
  'select * from public.username_history',
  '42501', 'permission denied for table username_history',
  'a Patient cannot read the Username history'
);

select throws_ok(
  $$ insert into public.username_history (username, user_id)
     values ('ivan', tests.user_id('patient_a')) $$,
  '42501', 'permission denied for table username_history',
  'a Patient cannot write the Username history'
);

select throws_ok(
  $$ select public.change_username(tests.user_id('patient_a'), 'ivan-moon') $$,
  '42501', 'permission denied for function change_username',
  'a Patient cannot change their own Username'
);

select tests.act_as('clinician_a');

select throws_ok(
  'select * from public.username_history',
  '42501', 'permission denied for table username_history',
  'a Clinician cannot read the Username history'
);

select throws_ok(
  $$ select public.change_username(tests.user_id('patient_a'), 'ivan-moon') $$,
  '42501', 'permission denied for function change_username',
  'a Clinician changes a Username only through the server function'
);

select throws_ok(
  $$ select * from public.username_state('ivan') $$,
  '42501', 'permission denied for function username_state',
  'a Clinician cannot call username_state()'
);

select tests.act_as_anon();

select throws_ok(
  'select * from public.username_history',
  '42501', 'permission denied for table username_history',
  'a signed-out visitor cannot read the Username history'
);

select throws_ok(
  $$ select * from public.username_state('ivan') $$,
  '42501', 'permission denied for function username_state',
  'a signed-out visitor cannot call username_state()'
);

-- ── The service role (server functions) ─────────────────────────────────────

select tests.act_as_service_role();

select results_eq(
  $$ select * from public.username_state('ivan') $$,
  $$ values (tests.user_id('patient_a'), null::uuid, null::timestamptz, null::text) $$,
  'a Username never released reports its holder and no release'
);

select public.change_username(tests.user_id('patient_a'), 'ivan-moon');

select results_eq(
  $$ select username from public.profiles where user_id = tests.user_id('patient_a') $$,
  $$ values ('ivan-moon') $$,
  'change_username() gives the account its new Username'
);

select results_eq(
  'select username, user_id, released_at from public.username_history',
  $$ values ('ivan', tests.user_id('patient_a'), now()) $$,
  'change_username() records the released Username, its owner and the release time'
);

select results_eq(
  $$ select * from public.username_state('ivan') $$,
  $$ values (null::uuid, tests.user_id('patient_a'), now(), 'ivan-moon') $$,
  'an unclaimed released Username reports its owner''s current Username'
);

select public.change_username(tests.user_id('patient_a'), 'ivan-moon');

select is(
  (select count(*)::int from public.username_history),
  1,
  'keeping the same Username records no release'
);

select throws_ok(
  $$ select public.change_username(tests.user_id('patient_a'), 'made') $$,
  '23505', null,
  'change_username() refuses a Username another account holds'
);

select throws_ok(
  $$ select public.change_username(tests.user_id('no_username'), 'someone') $$,
  'P0001', null,
  'change_username() refuses an account without a Username'
);

-- An older release by another account does not hide the latest one.
insert into public.username_history (username, user_id, released_at)
values ('ivan', tests.user_id('patient_b'), now() - interval '40 days');

select results_eq(
  $$ select owner_id, released_at from public.username_state('ivan') $$,
  $$ values (tests.user_id('patient_a'), now()) $$,
  'username_state() reports the latest release'
);

-- ── A deleted account's releases stay ───────────────────────────────────────

reset role;
delete from auth.users where id = tests.user_id('patient_a');
select tests.act_as_service_role();

select results_eq(
  $$ select * from public.username_state('ivan') $$,
  $$ values (null::uuid, null::uuid, now(), null::text) $$,
  'a deleted account''s released Username keeps its release time, so it stays locked'
);

select * from finish();
rollback;
