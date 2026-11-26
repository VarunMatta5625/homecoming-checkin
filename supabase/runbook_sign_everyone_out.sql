-- Sign everyone out except one admin, so the database can be moved to check-in only without syncing every phone.
-- Run these in the Supabase SQL editor, one step at a time. Replace YOUR_ADMIN_EMAIL@example.com in steps 1 and 2 with the
-- admin who stays signed in (it must be an active admin). Nothing here is a migration: it is a one-off for one project.
--
-- How it works: everybody else is switched off. A switched-off account fails every sync call with "Your account is switched
-- off or removed" (migration 11), and the check-in-only app signs that phone out by itself. A phone with scans that were
-- never sent asks first, and those scans are lost (they can't be sent any more). Scans already on the server are untouched.
-- A phone still running the earlier app only shows "Please sign in again"; signing in again says "not on the list".
-- A phone with nothing waiting also updates when the check-in-only app is deployed (the update banner appears and applies on tap).
--
-- Order for the whole cutover is in supabase/README.md ("Moving an existing project to check-in only").

-- STEP 1. Read-only. Copy the one-line result into a safe place: it is the statement that switches these people back on.
select count(*) as people_to_switch_off,
       'update staff_users set active = true where email in (' || string_agg(quote_literal(email::text), ', ' order by email) || ');' as restore_sql
from staff_users
where active and email <> lower('YOUR_ADMIN_EMAIL@example.com');

-- STEP 2. Switch everyone else off. It refuses to run unless the email above is an active admin, so nobody can be locked out.
do $$
declare keep constant text := lower('YOUR_ADMIN_EMAIL@example.com'); n int;
begin
  if not exists (select 1 from staff_users where email = keep and active and role = 'admin') then
    raise exception '% is not an active admin: refusing, so that nobody is locked out', keep;
  end if;
  perform set_config('app.reason', 'Cutover: sign everyone else out', true);
  update staff_users set active = false where active and email <> keep;
  get diagnostics n = row_count;
  raise notice '% people switched off', n;
end $$;

-- STEP 3. Apply migrations 9 to 13 and deploy the app (supabase/README.md). Check that you can sign in and scan as the admin.

-- STEP 4. When the phones are to be set up again, run the restore_sql from step 1. Or switch people on one by one from
-- the app (Account, Users and roles). People who stay off are the ones who were already off before step 1.
