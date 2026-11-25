import { newId } from './ids.ts'
import { createStore } from './store.ts'
import type { Session } from './types.ts'

export interface Prefs {
  deviceId: string
  /** Counter code, e.g. GATE-2. Saved with every scan. */
  counter: string | null
  theme: 'auto' | 'light' | 'dark'
  bigText: boolean
  session: Session | null
  sessionExpired: boolean
  /** The server says this account was switched off or removed. The phone signs out (it asks first when scans are unsent). */
  accessRemoved: boolean
  /** When the roster was last downloaded or refreshed. Null until the first download finishes. */
  rosterAt: number | null
  lastSyncAt: number | null
  cameraAsked: boolean
  /** Chose "Not now, I'll type codes". Kept across refreshes and sign-ins, so the browser's camera prompt doesn't come back by itself. */
  cameraDeclined: boolean
  /** Demo only: pretend there is no network. */
  demoOffline: boolean
  /** Sign-out finished but the local data wipe has not. Retried on every start; nothing syncs meanwhile. */
  wipePending: boolean
  /** Server positions already pulled (live mode). */
  partyCursor: number
  eventCursor: number
}

const defaults: Prefs = {
  deviceId: newId(),
  counter: null,
  theme: 'auto',
  bigText: false,
  session: null,
  sessionExpired: false,
  accessRemoved: false,
  rosterAt: null,
  lastSyncAt: null,
  cameraAsked: false,
  cameraDeclined: false,
  demoOffline: false,
  wipePending: false,
  partyCursor: 0,
  eventCursor: 0,
}

export const prefs = createStore<Prefs>(defaults, 'gh26.prefs')

// Persist the device id on first run, and replace an old one that is not a UUID (the database needs a real UUID).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
prefs.set({ deviceId: UUID.test(prefs.get().deviceId) ? prefs.get().deviceId : newId() })

export function applyAppearance() {
  const p = prefs.get()
  const dark = p.theme === 'dark' || (p.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.classList.toggle('xl', p.bigText)
}
