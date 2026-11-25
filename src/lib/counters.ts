import { BUILTIN_COUNTERS, type Counter } from './config.ts'
import { createStore } from './store.ts'

/**
 * The gate desks this event uses. The database has a counters table; phones copy it on sync and keep the copy, so the
 * list works offline and before the first sync. Until then, and if the server's list is ever empty, the built-in
 * list (gates 1 and 2) applies. Rows of any other kind (the shared database may still hold dinner counters) are ignored.
 */
export const countersStore = createStore<{ list: Counter[] }>({ list: BUILTIN_COUNTERS }, 'gh26.counterList')

export const getCounters = () => countersStore.get().list
export const useCounters = () => countersStore.use().list
/** Counters people can pick today. Retired ones stay in the list so old scans still show their name. */
export const activeCounters = (list: Counter[]) => list.filter((c) => c.active)

export const counterLabel = (code: string) => getCounters().find((c) => c.code === code)?.label ?? code

/** Gates in natural order (Gate desk 2 before Gate desk 10). */
function tidy(raw: Counter[]): Counter[] {
  return raw
    .filter((c) => c && typeof c.code === 'string' && c.code && typeof c.label === 'string' && c.kind === 'gate')
    .map((c) => ({ code: c.code, label: c.label, kind: c.kind, active: c.active !== false }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
}

/** Keep the server's list. A list with nothing pickable (empty, or every counter retired) is ignored rather than leaving the picker blank. */
export function setCounters(raw: Counter[]) {
  const list = tidy(raw)
  if (!list.some((c) => c.active)) return
  countersStore.set({ list })
}
