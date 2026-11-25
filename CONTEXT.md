# Homecoming 2026 check-in: project context

Last updated 25 Nov 2026 (check-in-only refactor). Everything done so far, why, and what is left. Read this first when picking the project up again.

## Check-in-only refactor (branch refactor/checkin-only, 25 Nov 2026)

Dinner scanning is gone. The app has one scan: check-in at a gate. Removed: the Entry/Dinner switch, the dinner result sheets (valid, check-in-first, already-served, heads-up, served), serve counts, the Dinner stats tab, dinner counters, the "Not served" search filter, the Dinner override import column, and the dinner reset in Correct record. What stays: scan, undo, correct (reset check-in), search, register, activity, stats (Entry and Breakdown), Review (possible duplicates only), admin.

- It runs against the same Supabase project and the same env variables as main. Migrations 1 to 8 are untouched and work with both apps. **The branch ignores dinner rows that are already in the database**: `liveEvents` keeps only `entry`, `backend/supabase.ts` drops dinner events when it reads a snapshot, and `counters.ts` keeps only gate counters.
- `supabase/migrations/20261122000009_checkin_only.sql` is the database half (drops the dinner columns from `party_state`, refuses non-entry events, switches the dinner counters off). It is tested by `supabase/test/harness.sh` but **must not be applied to the hosted project until main's dinner app is retired**, because it would refuse that app's dinner scans. Order for cutover is in `supabase/README.md`.
- **Flush (migration 10, `supabase/migrations/20261122000010_flush_checkins.sql`).** Account, Danger zone, "Flush all check-ins" (admin only, enforced in the database). It writes one void per live check-in in a single transaction (same lock as `push_batch`), reason `Flush: <why>`, method `staff`, one shared timestamp. Void rather than delete because phones only pull rows with a higher `seq` and never see a server delete, and the log stays append-only. The admin can also remove on-spot guests (soft delete like a list Replace, contacts deleted). The screen asks for a reason and a typed sentence that carries the count (`flush 299 check-ins`), shows phones that still report unsent items, and is blocked while this phone has unsent items. There is no server guard against a straggler phone: its old scans arrive after the flush and check guests in again, so run the flush again once that phone has synced. Migration 10 only adds functions, so it can be applied to the shared project at any time. The Audit screen shows each flush as one line (`lib/flush.ts`).
- Dexie is unchanged (still version 1). `Party.entitledOverride` is no longer read from the server or stored; old rows that still carry it are harmless.
- Not done: the screenshots in `docs/screenshots` still show the old Entry/Dinner switch on the scanner, and `hero.png` was not re-shot. The dinner-only screenshots were deleted.

## What this is

A mobile-first, offline-first PWA for the GITAM Homecoming 2026 alumni event (12 Dec 2026, Visakhapatnam). Volunteers scan a guest's QR at the gate (check-in only: there is no dinner scan any more), register on-spot guests, and see their own activity. Staff see stats, a needs-review queue and can correct records. Admins manage who can sign in and read the audit log. Primary devices: iPhone 16 and OnePlus 11.

The design came from a Claude Design artifact and its design system. The build spec ("GITAM Homecoming 2026 - Check-in App") lives in the original conversation; its schema, RPC and acceptance-test sections are implemented in `supabase/`.

Deployment target: Vercel (static build) plus Supabase, with no server containers.

## Stack

- Vite 8, React 19, TypeScript 7, react-router-dom 7. No React StrictMode (sheets own browser-history entries).
- Dexie (IndexedDB): `parties`, `events`, `outbox`. A write puts the event and its outbox row in one transaction. Events are append-only; undo is a `void` event.
- `@supabase/supabase-js` for auth and RPCs. `qr-scanner` for the camera, `qrcode` for passes.
- vite-plugin-pwa (`registerType: 'prompt'`): the update banner only appears when nothing is waiting to sync and applies only on tap. Service worker is registered once at boot (`src/main.tsx`).
- Inter is self-hosted (`@fontsource-variable/inter`) so Android does not fall back to Roboto and it works offline.

## How to run

```
npm install
npm run dev              # http://localhost:5173
npm run dev:phone        # HTTPS on the LAN (iPhone camera)
npm run build            # static output in dist/, SPA rewrite in vercel.json
npm test                 # vitest, 183 tests: Stats, state, undo, counters, local database
supabase/test/harness.sh # 119 database acceptance checks (needs Docker)
```

Modes (decided in `src/lib/config.ts`):

- **Live**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env.local` (gitignored). The app talks to Supabase.
- **Demo**: no keys (or `VITE_DEMO=true`). Built-in fake roster of 480 parties, demo sign-in chips, demo tools in the Account sheet.
- Sign-in is Google only. The old email and password form and the `VITE_GOOGLE_LOGIN` / `VITE_PASSWORD_LOGIN` switches were removed.
- A production build fails without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `vite.config.ts`), so a missing Vercel variable can never ship the fake demo roster. Dev tools (simulate a scan, demo sign-in chips, demo tools in Account) only exist in demo mode.

Android phone over adb: `adb -s <ip:port> reverse tcp:5173 tcp:5173`, then open `http://localhost:5173` in Chrome. `localhost` is a secure context, so the camera works. Pin `-s` because the phone shows up twice (IP and mDNS).

## Code map (`src/`)

- `screens/`: Scan, Search, Register, Activity, Stats, Review, GuestDetail, Admin (Users, Audit), SignIn, Setup.
- `components/`: ui.tsx (design-system primitives), ResultFlow.tsx (one sheet for every scan result), UndoSheet, CorrectionSheet, AccountSheet, layout.tsx (TopRow, Banners, TabBar, re-sign-in sheet).
- `lib/`: state.ts (`partyState`, mirrors the SQL view), actions.ts (all writes), sync.ts (flush outbox, pull changes, heartbeat, counter list), counters.ts (the counter list, from the server's table, built-in until then), db.ts (Dexie plus `finishWipe`), prefs.ts and store.ts (localStorage store, follows other tabs), layers.ts (history-backed sheets), config.ts.
- `backend/`: `types.ts` (the seam), `supabase.ts` (live), `demoBackend.ts` (demo), `index.ts` (picks one). The Supabase client is created lazily so demo mode never builds one.
- `styles/`: tokens.css (generated from the design system), gh.css (component CSS), app.css (real-viewport layout).

## Backend (Supabase)

- Hosted project "Homecoming 2026" (region Sydney, ap-southeast-2). URL and publishable key are in `.env.local`. The service-role key is never used by the app and must never be committed or shared.
- Migrations in `supabase/migrations/` (run in order): schema, security (RLS, audit triggers, last-admin guard, grants), RPCs, an `update_party` lock fix (`…0004`), and a lock-down pass (`…0005`: function grants, no direct reads of contacts or notes, stricter voids), and a sign-up hook (`…0006`: only listed emails can create an account; it must also be switched on in the dashboard, Authentication, Hooks). When the hook refuses, Google sends the person back with `error_description` containing `NOT_ON_LIST`; `src/lib/signinReturn.ts` reads it before the Supabase client clears the address and the sign-in screen shows "You're not on the list yet". `supabase/setup_all.sql` is all of them plus fake seed data for a brand-new project.
- RPCs: `whoami`, `get_snapshot` (paged; used for the first download and incremental pulls), `push_batch`, `device_heartbeat`, `get_party_contact`, `resolve_review`, `update_party`, `admin_set_user`, `admin_list_users`, `audit_feed`.
- All writes go through SECURITY DEFINER RPCs; tables have read-only RLS policies. The roster holds only the last 4 digits of a mobile number. Full mobile and email are in `party_contacts` (staff and up).
- 119 acceptance checks (`supabase/test/checks.sql`) run as real roles against a throwaway Postgres: unlisted and inactive users get nothing, volunteers cannot reach staff or admin data, replayed batches create no duplicates, a second device's check-in of the same party is flagged as a repeat, dinner scans are refused, undo rules, last-admin guard, append-only events, audit entries, no function open to the signed-out role, no direct reads of contacts or notes, voids that must match the guest.
- Data access settings when the project was created: Data API on, "automatically expose new tables" off. Verified that both settings pass all checks.

### Auth

- Google OAuth, working for all three roles. Google Cloud project: `homecoming-checkin`, consent screen type External, status Testing, three Gmail test users added. Supabase Google provider enabled with that client.
- Supabase Auth only proves identity. `whoami()` matches the verified email to `staff_users` (the allowlist), links the two on first login and returns the role. An unlisted account is signed out locally and sees nothing.
- First admin and test roles were added by SQL insert into `staff_users` (one admin, one staff, one volunteer Gmail).
- The earlier email and password test users (`@homecoming.test`) were deactivated and their logins deleted. Their rows remain only because scan history points at them. See "Cleanup SQL" below.

## Decisions and deviations from spec or design

- Undo window is 60 s in the app (design); the server allows 120 s (spec), so it always accepts.
- Pass codes are `GH26-` plus 5 characters (spec alphabet); the design mock showed 4.
- Tabs follow the design (Scan, Search, Register, Activity, plus Stats for staff). Admin screens open from the Account sheet.
- Entry headcount is editable (stepper, defaults to the party size) per spec 15; the design shows fixed buttons only.
- Counters are hardcoded in `src/lib/config.ts` and seeded in the `counters` table (Gate desk 1 to 2; the table still holds Dinner counter 1 to 10 from the earlier version, which the app ignores and migration 9 switches off).
- Blocked scans are not stored (events are real-world facts only), so Activity does not list them.
- Stats "Active/Quiet" chips are derived from events. Stats and the needs-review list are derived locally; the `stats_*` and `review_queue` RPCs are not built.
- UI prefs and the session live in localStorage, not a Dexie `meta` table.
- Each account's last counter is remembered on that phone (`gh26.counters` in localStorage, keyed by the staff id; `src/lib/counter.ts`). Signing out wipes prefs but not this, so the next sign-in of the same account skips the counter step. Another phone or a browser reset asks once again; a server-side default per account would fix that.
- The app version is `package.json` version plus the short commit (set in `vite.config.ts`), shown in Account and sent in each phone's heartbeat so a phone on an old build can be spotted.

## Bugs found and fixed (worth remembering)

- Result sheets sat under the tab bar: sheets, alerts and toasts now render through a portal to `.app`.
- "Search by name instead" bounced back to Scan: navigating while a history-backed sheet was open. Fixed with `leaveLayers(() => navigate(...))`.
- Sign-out hung on "Signing out...": the local database was locked by a second tab. Sign-out now leaves the app first, then wipes in the background (`wipePending`, 4 s give-up, retried at start). Prefs also follow other tabs through the `storage` event.
- Camera "No camera found" on plain `http://<lan-ip>`: browsers expose the camera only on HTTPS or localhost. The screen now says "Camera needs a secure page".
- IDs and device id must be real UUIDs for the database; the fallback on insecure origins now builds a valid v4.
- `update_party` could commit out of `change_seq` order; it now takes the same advisory lock as `push_batch`.
- A false "session expired" banner after a long offline stretch is cleared on `TOKEN_REFRESHED`.
- Demo mode crashed without keys (supabase-js throws on an empty URL): the client is now created lazily.
- "Please sign in again" loop after Google sign-in (found on the OnePlus 11). Two causes. (1) A fake demo session (ids like `u-rahul`, not UUIDs) was left in localStorage by an earlier demo run on the same address `localhost:5173`. With a session present the app skipped the sign-in screen, so nothing ever finished the Google sign-in. Live mode now drops a non-UUID session and its fake data at start (`src/main.tsx`). (2) The Supabase client is created lazily, and the router redirected `/` to `/scan` before the client could swap the `?code=` for a session, so the code was lost. The client is now created before the router runs in live mode. Also: the banner's sign-in now finishes itself after the redirect (`useFinishReauth`), and a different account signing in on a phone with nothing unsynced takes the phone over with a clean copy (`switchAccount`); with unsynced changes it still demands the original account.

## Verified

- `tsc -b` and `npm run build` are clean.
- Visual pass of every screen at 393x852 and 412x915, light and dark, larger text, no horizontal overflow.
- Production build offline test: service worker controls the page, `/search` loads with the network off, a serve queues ("Waiting to sync"), reconnect flushes.
- Real OnePlus 11 over adb: app loads on localhost, camera starts, flows work.
- Live end to end: volunteer checks in and serves, the outbox empties, staff on a clean browser sees it with the volunteer's name; admin lists, adds and guards users through the real RPCs.
- Google login as admin, staff and volunteer lands on the correct role.

## Not verified yet

- Real camera scans of real passes against live data (only the dev "simulate a scan" panel and an empty viewfinder were used).
- Standalone mode (opened from the browser's own install or Add to Home Screen menu) on a real iPhone and Android, and Google sign-in inside an installed iPhone PWA (known to be awkward; test early).
- Two phones offline for a long stretch, then reconnecting, on live data.
- GITAM Workspace accounts: an admin policy may block third-party OAuth apps. The staff test address is a `student.gitam.edu` account; test with real GITAM accounts early.
- Realtime subscription (not built; phones pull every 15 s).

## Still to do

See `MISSING_SCREENS.md` (counters management, pending-changes detail screen). Also: Admin Audit screen reading `audit_feed`; `get_party_contact` in the guest screen; Devices and sync screen; stats RPCs if wanted; the real guest import and the pass list export are built (see "Guest import" below).

## Guest import (23 Nov 2026 branch)

- Admin screen `/admin/import` (Account sheet, Admin, Import guests). Template is built in the browser from `FIELDS` in `src/lib/guestImport.ts` (headings only, UTF-8 with a byte-order mark). `public/guest-list-guide.pdf` is the printable guide, made by `scripts/make_guest_guide.py` (keep its column table in step with `FIELDS`).
- The browser checks the whole file first (CSV parser handles quotes, CRLF, semicolons, Windows-1252; Excel's `9.87654E+09` and `.0` mobile damage is reported by name; school must match `SCHOOLS`). Nothing is sent while there are problems. The server checks again.
- `admin_import_guests(filename, rows, replace)` (migration 0007) is one transaction and one set-based insert. Server makes pass codes and QR tokens (core functions only: `gen_random_uuid`, because `pgcrypto` lives in the `extensions` schema on hosted Supabase). It takes the same advisory lock as `push_batch`. Same mobile as a current guest or an earlier row: created but flagged (`possible_duplicate_of`), never merged.
- Replace soft-deletes the current guests (`deleted_at`, so phones learn through the normal change cursor). It is refused when `event_settings.is_live` is true or any `scan_events` row exists. Add stays allowed when live (late registrations).
- `admin_export_passes()` returns every current guest with contacts and writes an audit_log read row. The CSV's first twelve columns match what `scripts/test_passes.py` reads.
- Timing in the Docker harness: 5000 guests in about 0.3 s. A row-by-row loop with lookups took 8.8 s (stale plan statistics on fresh tables), too close to the hosted request limit.
- Limits: 10,000 guests per file; the "test activity reset" button is still to build (`supabase/README.md` has the SQL).

## Code review notes (22 Nov 2026, left for later)

- Fixed in migration 8 and the app (23 Nov 2026): undo window, `device_heartbeat`, `saveUser` and `fail()`, the parking chip, counters from the table, Dexie upgrade safety. What is left of each:
  - Undo window: **not closed.** A volunteer can still stretch the window for their own scans from their own phone by setting its clock back, because same-phone undo must keep trusting that phone's clock or an undo done offline would be refused. Migration 8 only refuses an undo dated *before* its scan, and judges an undo from a *different* phone by the server's clock. The app also stops offering Undo if the clock steps back past the scan.
  - Heartbeat rows are keyed on (device, user). Nothing in the app reads `device_status` yet.
  - Counters: phones copy the `counters` table every ten minutes (`lib/counters.ts`); the built-in list is the fallback. There is still no screen to edit counters (MISSING_SCREENS.md).
  - Dexie stays at version 1. Add `this.version(2)` (full new layout, never edit v1) when stored fields change; `db.test.ts` proves an upgrade keeps rows. Another tab upgrading the database shows a "Reload this page" banner.
- Remaining oxlint warnings are in `layers.ts`, `Scan.tsx` and `hooks.ts` (refs and effects in the history-sheet and scanner code). Left alone on purpose.

## Cleanup SQL (remove the old test users and all test scans)

Only for this fake-data test project. It refuses to run once `event_settings.is_live` is true. It was tested on a throwaway database.

```sql
do $$
declare t uuid[];
begin
  if (select is_live from event_settings) then raise exception 'Event is live: refusing to clean up'; end if;
  select coalesce(array_agg(id), '{}') into t from staff_users where email like '%@homecoming.test';

  -- all test scans (fake data); the append-only guard is switched off for this one statement
  alter table scan_events disable trigger scan_events_no_update;
  delete from scan_events;
  alter table scan_events enable trigger scan_events_no_update;

  delete from device_status      where user_id     = any(t);
  delete from review_resolutions where resolved_by = any(t);
  delete from audit_log          where actor_id    = any(t);
  update staff_users set created_by = null where created_by = any(t);
  update parties set created_by = null where created_by = any(t);
  update parties set updated_by = null where updated_by = any(t);
  delete from staff_users where id = any(t);
end $$;
```

To reset only the test scans later, see "Reset test activity" in `supabase/README.md`.

## Moving to Vercel

- Google Cloud client: add the Vercel address to Authorized JavaScript origins. The redirect URI (the Supabase `/auth/v1/callback`) does not change.
- Supabase Auth, URL Configuration: set Site URL to the Vercel address and add `https://<app>.vercel.app/**` to Redirect URLs (keep the localhost entries for development).
- Vercel project settings, Production and Preview: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only. They are baked in at build time, so redeploy after changing them. The build fails if either is missing.
- Test on the production domain: preview deployments get random URLs that are not in Supabase's Redirect URLs.
- **Remember:** publish the Google consent screen (Google Auth Platform, Audience, Publish app; Testing to In production) after the Vercel deploy works and before real volunteers sign in. Until then only listed test users (max 100) can sign in. After publishing, people are added only through the app's Users screen.- Optional: turn off the Email provider in Supabase Auth so Google is the only way in.

## Event timeline (from the spec)

Feature freeze 8 Dec. Version freeze and full rehearsal 9 Dec (about 10 phones, offline flapping). Code freeze and final import 10 Dec. Every volunteer phone installed, signed in online and roster downloaded 11 Dec. Set `is_live = true` on the morning of 12 Dec.

**Before go-live (after the 9 Dec rehearsal, before phones are set up on 11 Dec):** the Flush button only voids check-ins, so rehearsal scans and voids stay in `scan_events`. Run the "Reset test activity" SQL in `supabase/README.md` (it deletes all scans and on-spot guests, and refuses once `is_live` is true), sign every test phone out and back in, then set `is_live = true`.

## Rules to keep

- Tests must pass before changing sync, derived state or RLS (`supabase/test/harness.sh` and the TypeScript `partyState` against the SQL view).
- Never commit real attendee data or the service-role key. `.env.local`, `.env.*.local` and `*.csv` are gitignored.
- Sign-out never wipes unsynced data without an explicit confirmation.
