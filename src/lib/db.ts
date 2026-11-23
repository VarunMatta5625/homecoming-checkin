import Dexie, { type Table } from 'dexie'
import { prefs } from './prefs.ts'
import { ui } from './ui.ts'
import type { OutboxItem, Party, ScanEvent } from './types.ts'

/**
 * Local database layout. Never edit a version that has shipped: add a new `this.version(n + 1)` with the full new
 * layout instead (Dexie then upgrades existing phones in place and keeps their rows, including unsynced scans in the
 * outbox). A test in db.test.ts opens a v1 database, adds rows, and upgrades it, so a change that loses data fails CI.
 */
export const STORES_V1 = {
  parties: 'id, &qrToken, &passCode, nameLc, batchYear, [nameLc+batchYear]',
  events: 'id, partyId, seq, clientAt',
  outbox: 'id, createdAt',
}

class AppDB extends Dexie {
  parties!: Table<Party, string>
  events!: Table<ScanEvent, string>
  outbox!: Table<OutboxItem, string>

  constructor() {
    super('gh26')
    this.version(1).stores(STORES_V1)
    // A newer copy of the app (another tab, after an update) is upgrading this database. Dexie closes our connection so
    // the upgrade can finish and reopens it on the next query; this tab is still running the old code, so ask for a reload.
    this.on('versionchange', () => ui.set({ dbUpdated: true }))
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
