# Missing screens and features

Running list of screens (or features) not built yet. Add new entries as they come up.

| # | Screen / feature | Who | Notes | Added |
| --- | --- | --- | --- | --- |
| 1 | Counters management (add, rename, disable) | Admin | Counters are hardcoded in `src/lib/config.ts` (`COUNTERS`: Gate desk 1-2, Dinner counters 1-10). Needs a `counters` table, `listCounters` / `saveCounter` on `src/backend/types.ts`, and an Admin screen like Users. | 2026-11-22 |
| 2 | Pending changes (sync details) | All | Opens from the "Pending changes" row on the Ready offline screen and the Account sheet. Lists each unsynced outbox item: type (serve, check-in, undo, on-spot registration), guest, time, and state (waiting, or failed with the server's reason) with Retry. Today only a count is shown, plus the "Waiting to sync" group on the Activity tab. | 2026-11-22 |
