# Homecoming 2026 check-in

Mobile-first, offline-first PWA for the GITAM Homecoming 2026 event. Volunteers scan guest QR passes at the gate and dinner counters, staff see stats and fix records, admins manage who can sign in. Vite, React 19, TypeScript, Dexie (IndexedDB) and Supabase. No servers to run: Vercel serves static files, Supabase is the database.

Looks come from the GITAM Homecoming design system (`src/styles/tokens.css` is generated from its `tokens.json`; `gh.css` is its component stylesheet). Project history, decisions and the to-do list are in `CONTEXT.md`.

## Run it locally

```
npm install
npm run dev          # http://localhost:5173
npm run dev:phone    # HTTPS on your LAN so a real phone can use the camera
npm run typecheck    # tsc -b
npm run lint         # oxlint
npm run build        # static files in dist/
```

Copy `.env.example` to `.env.local` and fill in the two Supabase values. With no values the app runs on built-in fake demo data (local development only, with a "simulate a scan" panel and demo sign-in chips). A production build refuses to run without them, so a missing Vercel variable fails the deploy instead of shipping fake data.

## Deploy (GitHub, then Vercel)

1. Push this repo to GitHub (private recommended).
2. In Vercel, **Add New, Project**, import the repo. Framework preset **Vite**. Build command `npm run build`, output `dist` (both are the defaults).
3. **Settings, Environment Variables**, for Production and Preview:
   - `VITE_SUPABASE_URL` (Supabase, Project Settings, API, Project URL)
   - `VITE_SUPABASE_ANON_KEY` (the publishable key, never the service-role key)
   They are baked in at build time, so redeploy after changing them.
4. After the first deploy, note the production URL (for example `https://your-app.vercel.app`) and update sign-in so it works there:
   - **Google Cloud**, project `homecoming-checkin`, Clients, "Homecoming web": add the URL under **Authorized JavaScript origins**. The redirect URI (the Supabase `/auth/v1/callback`) does not change.
   - **Supabase**, Authentication, URL Configuration: set **Site URL** to the production URL and add `https://your-app.vercel.app/**` to **Redirect URLs**. Keep the localhost entries for development.
5. Open the URL on a phone and sign in. Test on the production domain; preview deployments get random URLs that are not in the Redirect URLs.
6. Before real volunteers sign in: Google Auth Platform, Audience, **Publish app** (move from Testing to In production). Until then only listed test users can sign in.

`vercel.json` has the single-page-app rewrite and keeps `sw.js` uncached so updates reach phones.

## Database

Schema, row-level security and RPCs are in `supabase/`. Setup, role mapping and the 47 acceptance checks (`supabase/test/harness.sh`, needs Docker) are in `supabase/README.md`. Tests must pass before changing sync, derived state or RLS.

## Backend seam

Everything the UI needs from a server is one interface: `src/backend/types.ts`. `supabase.ts` implements it against Supabase, `demoBackend.ts` is the built-in demo, `index.ts` picks one.

| Method | Supabase |
| --- | --- |
| `signInWithGoogle` / `resume` | `signInWithOAuth`, then `rpc('whoami')`; `{rejectedEmail}` when it returns null |
| `fetchSnapshot` / `fetchChanges` | paged `get_snapshot` (parties and events) |
| `pushBatch` | `rpc('push_batch')`; mapped to accepted / duplicate / rejected per item |
| `ping` | any cheap authenticated request |
| `listUsers` / `saveUser` | `admin_list_users` and `admin_set_user` |

## Where the invariants live

- Append-only events, undo = void: `src/lib/actions.ts` (event and outbox row in one Dexie transaction).
- Derived state, same logic as the SQL view: `src/lib/state.ts` (`partyState`).
- Outbox flush, order, 50-item batches, rejected items kept: `src/lib/sync.ts`.
- No wipe with unsynced data unless confirmed: the sign-out alert in `AccountSheet.tsx`.
- The roster holds only the last 4 mobile digits. Full mobile and email live in `party_contacts` (staff and up).

## Choices worth knowing

- Undo window is `UNDO_WINDOW_S = 60`. The server allows 120 s, so it always accepts.
- Pass codes are `GH26-` plus 5 characters (spec alphabet). QR contents are `GH26:` plus a random token, no personal data.
- Tabs: Scan, Search, Register, Activity, plus Stats for staff. Admin screens open from the Account sheet.
- Small UI prefs and the session live in localStorage (`src/lib/prefs.ts`).
- Entry headcount is editable (defaults to the party size).
- Blocked scans are not stored (events are real-world facts only).
- Stats, Register, Admin, Review and Guest screens load on demand; the service worker precaches every chunk so they work offline.

## Test passes for rehearsals

`scripts/test_passes.py` turns an exported CSV of fake guests into printable QR sheets (4 per page), plus a sheet of QR codes that must be rejected. See the header of that file.

Not built yet: Realtime (phones pull every 15 s instead), the audit feed screen, `get_party_contact` in the guest screen, the staff stats RPCs (stats are derived locally). See `MISSING_SCREENS.md`.
