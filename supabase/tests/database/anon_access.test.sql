-- A signed-out visitor (anon key) cannot read profiles, Custom Audio,
-- Assignments or entitlements: 0004 revokes every anon privilege on them.
-- Nor can anon call the Custom Audio policy helpers (0006) as RPCs.
begin;
\ir fixtures.psql
select plan(6);

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

select throws_ok(
  'select public.is_audio_owner(gen_random_uuid())',
  '42501', 'permission denied for function is_audio_owner',
  'anon cannot call is_audio_owner()'
);

select throws_ok(
  'select public.is_audio_assignee(gen_random_uuid())',
  '42501', 'permission denied for function is_audio_assignee',
  'anon cannot call is_audio_assignee()'
);

select * from finish();
rollback;
