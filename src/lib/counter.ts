import { getCounters } from './counters.ts'
import { prefs } from './prefs.ts'
import { createStore } from './store.ts'

/**
 * The counter each account last chose on this phone. Kept apart from prefs because signing out resets prefs,
 * and the point is that the next sign-in starts at the same counter without asking.
 */
const saved = createStore<{ byAccount: Record<string, string> }>({ byAccount: {} }, 'gh26.counters')

/** Work at this counter, and make it this account's default for next time. */
export function applyCounter(code: string) {
  prefs.set({ counter: code })
  const actorId = prefs.get().session?.actorId
  if (actorId) saved.set({ byAccount: { ...saved.get().byAccount, [actorId]: code } })
}

/** This account's counter from last time, if it still exists and hasn’t been retired. */
export function savedCounter(actorId: string | undefined) {
  const code = actorId ? saved.get().byAccount[actorId] : undefined
  return code && getCounters().some((c) => c.code === code && c.active) ? code : null
}
