# Missing screens and features

Running list of screens (or features) not built yet. Add new entries as they come up.

| # | Screen / feature | Who | Notes | Added |
| --- | --- | --- | --- | --- |
| 1 | Counters management (add, rename, disable) | Admin | The `counters` table exists and phones copy it every ten minutes (`listCounters` in `src/backend/types.ts`, `src/lib/counters.ts`); `BUILTIN_COUNTERS` in `src/lib/config.ts` is only the fallback. Still missing: a `saveCounter` call on the backend and an Admin screen like Users to edit the list. | 2026-11-22 |
| 2 | Pending changes (sync details) | All | Opens from the "Pending changes" row on the Ready offline screen and the Account sheet. Lists each unsynced outbox item: type (serve, check-in, undo, on-spot registration), guest, time, and state (waiting, or failed with the server's reason) with Retry. Today only a count is shown, plus the "Waiting to sync" group on the Activity tab. | 2026-11-22 |
