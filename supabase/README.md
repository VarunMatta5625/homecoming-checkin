# Supabase setup

Database for the check-in app: schema, row-level security and the RPCs the app calls.

## Files

| File | What it does |
| --- | --- |
| `migrations/20261122000001_schema.sql` | Tables, the append-only event log, and the `party_state` view |
| `migrations/20261122000002_security.sql` | Role helpers, audit triggers, last-admin guard, RLS, grants |
| `migrations/20261122000003_rpc.sql` | `whoami`, `get_snapshot`, `push_batch`, `device_heartbeat`, staff and admin RPCs |
| `migrations/20261122000004_update_party_lock.sql` | Makes `update_party` take the same lock as `push_batch` (existing projects: run just this file) |
| `migrations/20261122000005_lock_down.sql` | Signed-out users can run no functions; contacts and `parties.notes` readable only through audited functions; a void must target a plain scan of the same guest (existing projects: run just this file) |
| `migrations/20261122000006_signup_hook.sql` | `hook_before_user_created`: only emails on the `staff_users` list can create an account. Needs one dashboard step, see below (existing projects: run just this file) |
| `migrations/20261122000007_guest_import.sql` | `admin_import_guests` (load a whole guest list in one go, Add or Replace) and `admin_export_passes` (pass codes and contacts, audited). Admin only (existing projects: run just this file) |
| `migrations/20261122000008_undo_and_heartbeat.sql` | A volunteer's undo is refused if dated before its scan, and an undo from a different phone than the scan is judged by the server's clock; `device_heartbeat` rows are keyed on device and user so one user can't overwrite another's (existing projects: run just this file; the app works with or without it) |
| `migrations/20261122000009_checkin_only.sql` | The app no longer serves dinner. `party_state` loses its dinner columns and entitlement is the party size, the server refuses any event that is not an entry check-in, and the dinner counters are switched off. Nothing is deleted. Apply only when the check-in-only app is deployed (see below) |
| `migrations/20261122000010_flush_checkins.sql` | `admin_flush_preview` and `admin_flush_checkins`: an admin undoes every live check-in in one go (one void each; the log stays append-only) and can remove on-spot guests too. Only adds two functions, so it is safe to apply at any time, including while the earlier app is deployed |
| `migrations/20261122000011_delete_user.sql` | `admin_delete_user`: delete a switched-off person for good, only when no scan, registration, review or edit names them. `admin_list_users` also reports `canDelete`. A switched-off or removed account now gets "Your account is switched off or removed" from every sync call, which the app uses to sign that phone out. Safe to apply at any time |
| `seed_admin.sql` | Your first admin (edit the email first) |
| `seed_dev.sql` | Fake test accounts and 120 fake parties. Testing only |
| `test/` | Docker harness that applies everything to a throwaway Postgres and runs 140 acceptance checks |

When you add a function, end its migration with `revoke execute on function ... from public, anon;` and grant it to `authenticated` by name. Postgres lets everyone run a new function by default; the checks fail if one is open to the signed-out role.

## Moving an existing project to check-in only

Migrations 1 to 8 work with both the earlier app (entry and dinner) and the check-in-only app, so the check-in-only app can run against the same project while the earlier one is still deployed. **Migration 9 does not.** Apply it only when you retire the earlier app, and in this order:

1. Every phone has synced (no "Waiting to sync" on any phone). The server will refuse dinner scans that arrive after migration 9.
2. Deploy the check-in-only app.
3. Run `migrations/20261122000009_checkin_only.sql` in the SQL editor.

It deletes nothing, so old dinner scans stay in the log. It is not reversible by a script: to go back, restore `party_state` and `_push_event` from migrations 1 and 8.

## Turn on the sign-up hook

Running migration 6 only creates the function. In the dashboard open Authentication, Hooks, add the **Before User Created** hook, choose the Postgres function `hook_before_user_created`, and save. From then on a Google account that is not on the list gets "You're not on the list yet" and no account is created under Authentication, Users. People who already signed in are not affected. To undo it, remove the hook in the same place.

## Set up a hosted project

1. Create a project at supabase.com. Pick the region closest to the venue (this project uses Sydney, `ap-southeast-2`). Save the database password somewhere safe.
2. Open **SQL editor**. Run the migration files in filename order, each in its own run (or run `setup_all.sql` once on a new project). After adding a migration, run `scripts/build_setup_all.sh` to rebuild `setup_all.sql`; CI fails if you forget.
3. Run `seed_dev.sql` for fake data and test accounts. (For a real event, run `seed_admin.sql` instead, and load the real guest list from the app: Account, Admin, Import guests. The app gives you a CSV template and a PDF guide. No script and no service-role key is needed.)
4. Sign-in is Google only (Authentication, Sign In / Providers, Google; setup is in `CONTEXT.md`). Add your first admin with `seed_admin.sql` (edit the email first), or add people later from the app (Admin, Users). `seed_dev.sql` also adds fake `@homecoming.test` rows; they cannot sign in, and the cleanup SQL in `CONTEXT.md` removes them.
5. **Project Settings, API**: copy the **Project URL** and the **anon public** key into `.env.local` at the project root. Never copy the `service_role` key into the app.

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

## How sign-in maps to roles

The Google sign-in (Supabase Auth) only proves who someone is. `whoami()` matches their verified email to `staff_users`, links the two on first login, and returns the role. An email that is not on the list gets nothing back, and row-level security hides all data from them. Add people later from the app (Admin, Users) or with `admin_set_user`.

## Reset test activity

Scans are append-only, so a normal delete is refused. To wipe test scans and on-spot guests between dry runs, run this in the SQL editor (it refuses once the event is live):

```sql
do $$ begin
  if (select is_live from event_settings) then raise exception 'Event is live: refusing to reset'; end if;
  alter table scan_events disable trigger scan_events_no_update;
  delete from scan_events;
  alter table scan_events enable trigger scan_events_no_update;
  delete from review_resolutions;
  delete from party_contacts where party_id in (select id from parties where source = 'onspot');
  delete from parties where source = 'onspot';
  delete from device_status;
end $$;
```

Phones keep their local copy until they sign out and back in, so sign out (and back in) on each test phone afterwards.

## Run the database tests

```
supabase/test/harness.sh
```

Needs Docker running. It starts a temporary Postgres, applies the migrations and seed, and runs the checks as real roles. The last line should read `ALL CHECKS PASSED`.

## Not built yet

`stats_summary`, `stats_breakdown` and `review_queue` (the app derives those locally for now) and the Realtime subscription.
