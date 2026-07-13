-- Bootstrap admin (quick-260707-a47 follow-up). auth.users cannot be seeded
-- reliably from SQL (GoTrue owns that table), so the first admin is promoted
-- at first sign-in instead: app_config (service-role only, see 0001) holds
-- key 'bootstrap_admin_email', and the signup trigger creates that user's
-- profile with role 'admin'. The config row can be deleted once the admin
-- account exists; role changes afterwards happen via SQL/service role only.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, role)
  values (
    new.id,
    new.email,
    case
      when new.email is not null
        and lower(new.email) = lower((
          select value from public.app_config
          where key = 'bootstrap_admin_email'
        ))
        then 'admin'
      else 'user'
    end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
