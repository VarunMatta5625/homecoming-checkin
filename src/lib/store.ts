import { useSyncExternalStore } from 'react'

/** Tiny external store, optionally persisted to localStorage. */
export function createStore<T extends object>(init: T, key?: string) {
  let state: T = init
  if (key) {
    try {
      const raw = localStorage.getItem(key)
      if (raw) state = { ...init, ...JSON.parse(raw) }
    } catch {
      /* corrupt or unavailable storage: start from defaults */
    }
  }
  const subs = new Set<() => void>()
  const get = () => state
  const subscribe = (f: () => void) => {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  }
  const set = (patch: Partial<T>) => {
    state = { ...state, ...patch }
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(state))
      } catch {
        /* storage full or blocked */
      }
    }
    subs.forEach((f) => f())
  }
  // Another tab changed the saved state (sign-out, counter, theme): follow it instead of overwriting it later.
  if (key) {
    addEventListener('storage', (e) => {
      if (e.key !== key || e.newValue == null) return
      try {
        state = { ...init, ...JSON.parse(e.newValue) }
        subs.forEach((f) => f())
      } catch {
        /* ignore a half-written value */
      }
    })
  }
  const use = () => useSyncExternalStore(subscribe, get)
  return { get, set, subscribe, use }
}
