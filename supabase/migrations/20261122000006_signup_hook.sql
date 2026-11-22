-- Only listed emails can create an account. Without this, any Google user who finishes the sign-in gets a row under
-- Supabase Authentication, Users (the allowlist still kept them out of every table, but the list filled with strangers).
--
-- This is a Supabase "Before User Created" auth hook. Creating the function does nothing by itself: after running this
-- file, turn it on in the dashboard (Authentication, Hooks, Before User Created, pick hook_before_user_created).
-- It runs only when a new account would be created, so people who already signed in are not affected.
-- Existing projects: run just this file.

create function hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from staff_users where email = lower(btrim(event->'user'->>'email'))) then
    return '{}'::jsonb;
  end if;
  -- NOT_ON_LIST is matched by the app (src/lib/signinReturn.ts) to show "You're not on the list yet".
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'NOT_ON_LIST: this account is not on the Homecoming list.'));
end $$;

-- Only Supabase Auth may run it: not the signed-out role, not signed-in users.
revoke execute on function hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function hook_before_user_created(jsonb) to supabase_auth_admin;
