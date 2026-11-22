import Dexie, { type Table } from 'dexie'
import { prefs } from './prefs.ts'
import type { OutboxItem, Party, ScanEvent } from './types.ts'

class AppDB extends Dexie {
  parties!: Table<Party, string>
  events!: Table<ScanEvent, string>
  outbox!: Table<OutboxItem, string>

  constructor() {
    super('gh26')
    this.version(1).stores({
      parties: 'id, &qrToken, &passCode, nameLc, batchYear, [nameLc+batchYear]',
      events: 'id, partyId, seq, clientAt',
      outbox: 'id, createdAt',
    })
  }
}

export const db = new AppDB()

export async function clearLocalData() {
  await db.transaction('rw', db.parties, db.events, db.outbox, async () => {
    await Promise.all([db.parties.clear(), db.events.clear(), db.outbox.clear()])
  })
}

let wiping: Promise<boolean> | null = null

/**
 * Finish a sign-out wipe. Never throws and gives up after a few seconds, so a locked database (for
 * example a second tab) can't freeze the UI; `wipePending` stays set and the next start retries.
 */
export function finishWipe(): Promise<boolean> {
  if (!prefs.get().wipePending) return Promise.resolve(true)
  wiping ??= Promise.race([
    clearLocalData().then(() => {
      prefs.set({ wipePending: false })
      return true
    }),
    new Promise<boolean>((r) => setTimeout(() => r(false), 4000)),
  ])
    .catch(() => false)
    .finally(() => {
      wiping = null
    })
  return wiping
}
