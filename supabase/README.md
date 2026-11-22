# Supabase setup

Database for the check-in app: schema, row-level security and the RPCs the app calls.

## Files

| File | What it does |
| --- | --- |
| `migrations/20261122000001_schema.sql` | Tables, the append-only event log, and the `party_state` view |
| `migrations/20261122000002_security.sql` | Role helpers, audit triggers, last-admin guard, RLS, grants |
| `migrations/20261122000003_rpc.sql` | `whoami`, `get_snapshot`, `push_batch`, `device_heartbeat`, staff and admin RPCs |
| `migrations/20261122000004_update_party_lock.sql` | Makes `update_party` take the same lock as `push_batch` (existing projects: run just this file) |
| `seed_admin.sql` | Your first admin (edit the email first) |
| `seed_dev.sql` | Fake test accounts and 120 fake parties. Testing only |
| `test/` | Docker harness that applies everything to a throwaway Postgres and runs 47 acceptance checks |

## Set up a hosted project

1. Create a project at supabase.com. Pick the region closest to the venue (this project uses Sydney, `ap-southeast-2`). Save the database password somewhere safe.
2. Open **SQL editor**. Run the three migration files in filename order, each in its own run.
3. Run `seed_dev.sql` for fake data and test accounts. (For a real event, run `seed_admin.sql` instead, and import attendees with a script that uses the service-role key locally.)
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
