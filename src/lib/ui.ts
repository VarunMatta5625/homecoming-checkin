import { createStore } from './store.ts'

export interface LastAction {
  eventId: string
  partyId: string
  title: string
  sub: string
  /** Epoch ms when the undo window closes. */
  until: number
}

/** Cross-screen UI state: account sheet, counter picker, last action (drives the undo toast). */
export const ui = createStore<{ account: boolean; counterPicker: boolean; last: LastAction | null; needRefresh: boolean; updateSW: ((reload?: boolean) => Promise<void>) | null }>({ account: false, counterPicker: false, last: null, needRefresh: false, updateSW: null })
