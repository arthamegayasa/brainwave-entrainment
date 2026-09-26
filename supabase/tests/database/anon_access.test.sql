-- A signed-out visitor (anon key) cannot read profiles, Custom Audio,
-- Assignments or entitlements: 0004 revokes every anon privilege on them.
begin;
\ir fixtures.psql
select plan(4);

select tests.act_as_anon();

select throws_ok(
  'select * from public.profiles',
  '42501', 'permission denied for table profiles',
  'anon cannot read profiles'
);

select throws_ok(
  'select * from public.custom_audios',
  '42501', 'permission denied for table custom_audios',
  'anon cannot read Custom Audio'
);

select throws_ok(
  'select * from public.audio_assignments',
  '42501', 'permission denied for table audio_assignments',
  'anon cannot read Assignments'
);

select throws_ok(
  'select * from public.entitlements',
  '42501', 'permission denied for table entitlements',
  'anon cannot read entitlements'
);

select * from finish();
rollback;
