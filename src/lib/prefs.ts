import { newId } from './ids.ts'
import { createStore } from './store.ts'
import type { Session } from './types.ts'


export interface Prefs {
  deviceId: string
  /** Counter code, e.g. DINNER-4 or GATE-2. Saved with every scan. */
  counter: string | null
  mode: 'entry' | 'dinner'
  theme: 'auto' | 'light' | 'dark'
  bigText: boolean
  session: Session | null
  sessionExpired: boolean
  /** When the roster was last downloaded or refreshed. Null until the first download finishes. */
  rosterAt: number | null
  lastSyncAt: number | null
  homeScreenDone: boolean
  cameraAsked: boolean
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
  mode: 'dinner',
  theme: 'auto',
  bigText: false,
  session: null,
  sessionExpired: false,
  rosterAt: null,
  lastSyncAt: null,
  homeScreenDone: false,
  cameraAsked: false,
  demoOffline: false,
  wipePending: false,
  partyCursor: 0,
  eventCursor: 0,
}

export const prefs = createStore<Prefs>(defaults, 'gh26.prefs')

// make sure a valid (uuid) device id is persisted on first run
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!localStorage.getItem('gh26.prefs') || !UUID.test(prefs.get().deviceId)) prefs.set({ deviceId: UUID.test(prefs.get().deviceId) ? prefs.get().deviceId : newId() })

export function applyAppearance() {
  const p = prefs.get()
  const dark = p.theme === 'dark' || (p.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.classList.toggle('xl', p.bigText)
}
