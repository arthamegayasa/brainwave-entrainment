-- Match production: cleanup_patient_link() is only ever run by its trigger,
-- so no client role needs EXECUTE (production already had this revoke,
-- applied outside the migration files before 0006). Triggers fire regardless
-- of EXECUTE on the trigger function.
revoke execute on function public.cleanup_patient_link() from public, anon, authenticated;
