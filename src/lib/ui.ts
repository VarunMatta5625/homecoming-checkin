import { createStore } from './store.ts'

export interface LastAction {
  eventId: string
  partyId: string
  title: string
  sub: string
  /** Epoch ms when the undo window closes. */
  until: number
}

/** Cross-screen UI state: account sheet, counter picker, last action (drives the undo toast). dbUpdated: another tab upgraded the local database, so this tab should reload. */
export const ui = createStore<{ account: boolean; last: LastAction | null; needRefresh: boolean; dbUpdated: boolean; updateSW: ((reload?: boolean) => Promise<void>) | null }>({ account: false, last: null, needRefresh: false, dbUpdated: false, updateSW: null })
