// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { db, STORES_V1 } from './db.ts'
import { ui } from './ui.ts'
import { party, ev, T0 } from '../test/fixtures.ts'

describe('local database', () => {
  it('reads and writes parties, events and the outbox', async () => {
    const p = party()
    await db.parties.put(p)
    await db.events.put(ev(p.id, 'entry', 1, T0))
    await db.outbox.put({ id: 'o1', type: 'event', payload: {}, attempts: 0, createdAt: T0 })
    expect(await db.parties.get(p.id)).toEqual(p)
    expect(await db.events.where('partyId').equals(p.id).count()).toBe(1)
    expect(await db.parties.where('passCode').equals(p.passCode).count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
  })

  it('upgrades to a newer version in place and keeps every row, unsynced scans included', async () => {
    const name = 'upgrade-test'
    const p = party()
    const before = new Dexie(name)
    before.version(1).stores(STORES_V1)
    await before.table('parties').put(p)
    await before.table('events').put(ev(p.id, 'dinner', 2, T0))
    await before.table('outbox').bulkPut([1, 2, 3].map((i) => ({ id: 'o' + i, type: 'event', payload: { i }, attempts: 0, createdAt: T0 + i })))
    before.close()

    // The next release: same stores plus a new table, as a second version.
    const after = new Dexie(name)
    after.version(1).stores(STORES_V1)
    after.version(2).stores({ ...STORES_V1, extra: 'id' })
    await after.open()
    expect(after.verno).toBe(2)
    expect(await after.table('parties').get(p.id)).toEqual(p)
    expect(await after.table('events').count()).toBe(1)
    expect((await after.table('outbox').orderBy('createdAt').toArray()).map((r) => r.id)).toEqual(['o1', 'o2', 'o3'])
    expect(await after.table('extra').count()).toBe(0)
    after.close()
  })

  it('asks this tab to reload when another tab upgrades the database', async () => {
    await db.open()
    ui.set({ dbUpdated: false })
    const other = new Dexie('gh26')
    other.version(2).stores({ ...STORES_V1, extra: 'id' })
    await other.open()
    expect(ui.get().dbUpdated).toBe(true)
    other.close()
  })
})
