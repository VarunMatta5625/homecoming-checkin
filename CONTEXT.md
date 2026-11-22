# Homecoming 2026 check-in: project context

Last updated 22 Nov 2026. Everything done so far, why, and what is left. Read this first when picking the project up again.

## What this is

A mobile-first, offline-first PWA for the GITAM Homecoming 2026 alumni event (12 Dec 2026, Visakhapatnam). Volunteers scan a guest's QR at the gate (entry) and at dinner counters (serving), register on-spot guests, and see their own activity. Staff see stats, a needs-review queue and can correct records. Admins manage who can sign in and read the audit log. Primary devices: iPhone 16 and OnePlus 11.

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
supabase/test/harness.sh # 54 database acceptance checks (needs Docker)
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
- `lib/`: state.ts (`partyState`, mirrors the SQL view), actions.ts (all writes), sync.ts (flush outbox, pull changes, heartbeat), db.ts (Dexie plus `finishWipe`), prefs.ts and store.ts (localStorage store, follows other tabs), layers.ts (history-backed sheets), config.ts.
- `backend/`: `types.ts` (the seam), `supabase.ts` (live), `demoBackend.ts` (demo), `index.ts` (picks one). The Supabase client is created lazily so demo mode never builds one.
- `styles/`: tokens.css (generated from the design system), gh.css (component CSS), app.css (real-viewport layout).

## Backend (Supabase)

- Hosted project "Homecoming 2026" (region Sydney, ap-southeast-2). URL and publishable key are in `.env.local`. The service-role key is never used by the app and must never be committed or shared.
- Migrations in `supabase/migrations/` (run in order): schema, security (RLS, audit triggers, last-admin guard, grants), RPCs, an `update_party` lock fix (`…0004`), and a lock-down pass (`…0005`: function grants, no direct reads of contacts or notes, stricter voids). `supabase/setup_all.sql` is all of them plus fake seed data for a brand-new project.
- RPCs: `whoami`, `get_snapshot` (paged; used for the first download and incremental pulls), `push_batch`, `device_heartbeat`, `get_party_contact`, `resolve_review`, `update_party`, `admin_set_user`, `admin_list_users`, `audit_feed`.
- All writes go through SECURITY DEFINER RPCs; tables have read-only RLS policies. The roster holds only the last 4 digits of a mobile number. Full mobile and email are in `party_contacts` (staff and up).
- 54 acceptance checks (`supabase/test/checks.sql`) run as real roles against a throwaway Postgres: unlisted and inactive users get nothing, volunteers cannot reach staff or admin data, replayed batches create no duplicates, two devices' servings add, undo rules, last-admin guard, append-only events, audit entries, no function open to the signed-out role, no direct reads of contacts or notes, voids that must match the guest.
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
- Counters are hardcoded in `src/lib/config.ts` and seeded in the `counters` table (Gate desk 1 to 2, Dinner counter 1 to 10). A gate counter starts the scanner in Entry mode, a dinner counter in Dinner mode.
- Blocked scans are not stored (events are real-world facts only), so Activity does not list them.
- Stats "Active/Quiet" chips are derived from events. Stats and the needs-review list are derived locally; the `stats_*` and `review_queue` RPCs are not built.
- UI prefs and the session live in localStorage, not a Dexie `meta` table.
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
- Add to Home Screen and standalone mode on a real iPhone and Android, and Google sign-in inside an installed iPhone PWA (known to be awkward; test early).
- Two phones offline for a long stretch, then reconnecting, on live data.
- GITAM Workspace accounts: an admin policy may block third-party OAuth apps. The staff test address is a `student.gitam.edu` account; test with real GITAM accounts early.
- Realtime subscription (not built; phones pull every 15 s).

## Still to do

See `MISSING_SCREENS.md` (counters management, pending-changes detail screen). Also: Admin Audit screen reading `audit_feed`; `get_party_contact` in the guest screen; Devices and sync screen; stats RPCs if wanted; real attendee import script (service-role key, local only, insert-only dedupe); `passes.csv` export.

## Code review notes (22 Nov 2026, left for later)

- The volunteer undo window compares two timestamps the phone supplies, so a volunteer could stretch it, but only for their own scans. Using the server's receive time would break undo done offline.
- `device_heartbeat` lets any signed-in user overwrite another device's row if they know its id. Low impact (it is only the status list).
- Google sign-ups are open in Supabase (`disable_signup` false). The allowlist keeps strangers out of the data, but their accounts still appear under Authentication, Users.
- `saveUser` throws the raw error instead of going through `fail()` like the other RPC calls, so an expired session during a user edit does not raise the "sign in again" banner.
- Guest detail shows a car icon with "No parking" when there is no parking. The pass screen hides the chip instead. Pick one.
- Counters are hard-coded in `config.ts` (counter picker, Stats rows) next to the `counters` table. Counters management (MISSING_SCREENS.md) should make the table the single source.
- Dexie schema is at version 1. Any change to stored fields needs `this.version(2)` with an upgrade, or phones keep an incompatible local copy.
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
- **Remember:** publish the Google consent screen (Google Auth Platform, Audience, Publish app; Testing to In production) after the Vercel deploy works and before real volunteers sign in. Until then only listed test users (max 100) can sign in. After publishing, people are added only through the app's Users screen. Step-by-step is in `README.md`.
- Optional: turn off the Email provider in Supabase Auth so Google is the only way in.

## Event timeline (from the spec)

Feature freeze 8 Dec. Version freeze and full rehearsal 9 Dec (about 10 phones: 2 gate and 10 dinner roles, offline flapping). Code freeze and final import 10 Dec. Every volunteer phone installed, signed in online and roster downloaded 11 Dec. Set `is_live = true` on the morning of 12 Dec.

## Rules to keep

- Tests must pass before changing sync, derived state or RLS (`supabase/test/harness.sh` and the TypeScript `partyState` against the SQL view).
- Never commit real attendee data or the service-role key. `.env.local`, `.env.*.local` and `*.csv` are gitignored.
- Sign-out never wipes unsynced data without an explicit confirmation.
