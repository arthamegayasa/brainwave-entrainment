-- Harden the Data API surface (Supabase advisor lints 0026/0028, applied
-- 2026-07-07). RLS already gates every row; these revokes additionally remove
-- schema discoverability and RPC entry points that no client legitimately
-- uses:
--   - anon never reads these tables (all cloud reads happen signed-in), so
--     revoking table privileges hides them from the anon GraphQL/REST schema;
--   - profiles has no client-write path at all (role changes are service-role
--     only), so authenticated loses write grants too (RLS also blocks them —
--     defense in depth);
--   - is_admin() is evaluated INSIDE RLS policies, which run as the querying
--     role: authenticated MUST keep EXECUTE or every policy calling it fails;
--   - handle_new_user() only fires from the auth.users trigger and is never a
--     client API.
revoke all on public.profiles from anon;
revoke all on public.custom_audios from anon;
revoke all on public.audio_assignments from anon;
revoke all on public.entitlements from anon;

revoke insert, update, delete on public.profiles from authenticated;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
