import { backend } from '../backend/index.ts'
import { APP_VERSION } from './config.ts'
import { db, finishWipe } from './db.ts'
import { prefs } from './prefs.ts'
import { createStore } from './store.ts'
import type { PushResult } from './types.ts'

/** What the sync pill shows. 'online' comes from a real request, not navigator.onLine. */
export const net = createStore({ online: true, syncing: false })

let lastStamp = 0
/** Strictly increasing so outbox order == write order, even within one millisecond. */
export const nextStamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1))

let flushing = false

/** Push the outbox in order, 50 at a time. accepted/duplicate leave the queue; rejected stay with the reason. */
export async function flush() {
  if (flushing || !net.get().online || prefs.get().wipePending || !prefs.get().session) return
  flushing = true
  net.set({ syncing: true })
  try {
    for (;;) {
      const items = await db.outbox
        .orderBy('createdAt')
        .filter((i) => !i.lastError)
        .limit(50)
        .toArray()
      if (!items.length) break
      let results: PushResult[]
      try {
        results = await backend.pushBatch(items)
      } catch {
        await db.outbox.bulkPut(items.map((i) => ({ ...i, attempts: i.attempts + 1 })))
        net.set({ online: false })
        break
      }
      await db.transaction('rw', db.outbox, async () => {
        for (const r of results) {
          if (r.status === 'rejected') await db.outbox.update(r.id, { lastError: r.reason })
          else await db.outbox.delete(r.id)
        }
      })
      prefs.set({ lastSyncAt: Date.now() })
      if (results.every((r) => r.status === 'rejected')) break
    }
  } finally {
    flushing = false
    net.set({ syncing: false })
  }
}

export async function checkOnline() {
  const online = await backend.ping()
  net.set({ online })
  if (online) void syncCycle()
  return online
}

let pulling = false
/** Bring in what other phones did (live mode). Safe to fail: the next cycle tries again. */
async function pull() {
  const p = prefs.get()
  if (!backend.fetchChanges || pulling || p.wipePending || !p.session || !p.rosterAt) return
  pulling = true
  try {
    const snap = await backend.fetchChanges({ party: p.partyCursor, event: p.eventCursor })
    // The person may have signed out while the request was in flight: never write after the wipe.
    if (!prefs.get().session || prefs.get().wipePending) return
    if (snap.parties.length || snap.events.length) {
      await db.transaction('rw', db.parties, db.events, async () => {
        await db.parties.bulkPut(snap.parties)
        await db.events.bulkPut(snap.events)
      })
    }
    if (snap.cursors) prefs.set({ partyCursor: snap.cursors.party, eventCursor: snap.cursors.event, lastSyncAt: Date.now() })
  } catch {
    /* offline or session ended */
  } finally {
    pulling = false
  }
}

async function heartbeat() {
  const p = prefs.get()
  if (!backend.heartbeat || !p.session || p.wipePending) return
  try {
    await backend.heartbeat({ deviceId: p.deviceId, counter: p.counter, pending: await db.outbox.count(), appVersion: APP_VERSION })
  } catch {
    /* best effort */
  }
}

async function syncCycle() {
  await flush()
  await pull()
  void heartbeat()
}

/** Retry items the server rejected earlier. */
export async function retryFailed() {
  await db.outbox.toCollection().modify({ lastError: null })
  await checkOnline()
}

let started = false
/** Triggers: app open, online/offline events, tab visible, every 15 s, and after each action. */
export function startSync() {
  if (started) return
  started = true
  void finishWipe()
  const check = () => void checkOnline()
  addEventListener('online', check)
  addEventListener('offline', check)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  setInterval(check, 15000)
  check()
}

export const kickSync = () => void flush()
