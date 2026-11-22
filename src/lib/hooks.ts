import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from './db.ts'
import { groupByParty, partyState, type PartyState } from './state.ts'
import { net } from './sync.ts'
import type { Party, ScanEvent } from './types.ts'

export interface Roster {
  parties: Party[]
  events: ScanEvent[]
  byId: Map<string, Party>
  states: Map<string, PartyState>
}

/** Whole roster with derived state. ~500 parties and ~1k events, recomputed on any local change. */
export function useRoster(): Roster | undefined {
  return useLiveQuery(async () => {
    const [parties, events] = await Promise.all([db.parties.toArray(), db.events.toArray()])
    const grouped = groupByParty(events)
    const states = new Map<string, PartyState>()
    const byId = new Map<string, Party>()
    for (const p of parties) {
      byId.set(p.id, p)
      states.set(p.id, partyState(p, grouped.get(p.id) ?? []))
    }
    return { parties: parties.filter((p) => !p.deletedAt), events, byId, states }
  }, [])
}

export interface PartyView {
  party: Party
  events: ScanEvent[]
  state: PartyState
}

export function usePartyView(id: string | null | undefined): PartyView | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null
    const party = await db.parties.get(id)
    if (!party) return null
    const events = await db.events.where('partyId').equals(id).toArray()
    return { party, events, state: partyState(party, events) }
  }, [id])
}

export interface SyncStatus {
  online: boolean
  syncing: boolean
  pending: number
  failed: number
}

export function useSyncStatus(): SyncStatus {
  const n = net.use()
  const counts = useLiveQuery(async () => {
    const items = await db.outbox.toArray()
    return { pending: items.length, failed: items.filter((i) => i.lastError).length }
  }, [])
  return { online: n.online, syncing: n.syncing, pending: counts?.pending ?? 0, failed: counts?.failed ?? 0 }
}

/** Ids of events still waiting in the outbox. */
export function usePendingIds(): Set<string> {
  const ids = useLiveQuery(() => db.outbox.toCollection().primaryKeys(), [])
  return useMemo(() => new Set(ids ?? []), [ids])
}

export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}
