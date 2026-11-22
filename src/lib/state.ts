import type { Party, ScanEvent } from './types.ts'

export interface PartyState {
  partyId: string
  entitled: number
  entered: boolean
  enteredAt: number | null
  headcount: number | null
  enteredCounter: string | null
  enteredBy: string | null
  served: number
  remaining: number
  lastServedAt: number | null
  overServed: boolean
  servedWithoutEntry: boolean
  duplicateEntry: boolean
  possibleDuplicate: boolean
  needsReview: boolean
}

/**
 * Derived state, never stored (invariant 5). Mirrors the SQL view party_state:
 * live = 'pass' events not voided; earliest entry wins; dinner servings add up.
 */
export function partyState(party: Party, events: ScanEvent[]): PartyState {
  const voided = new Set<string>()
  for (const e of events) if (e.action === 'void' && e.voidsEventId) voided.add(e.voidsEventId)
  const live = events.filter((e) => e.action === 'pass' && !voided.has(e.id))

  const entries = live
    .filter((e) => e.checkpoint === 'entry')
    .sort((a, b) => a.clientAt - b.clientAt || (a.receivedAt ?? Infinity) - (b.receivedAt ?? Infinity))
  const first = entries[0]
  const dinners = live.filter((e) => e.checkpoint === 'dinner')
  const served = dinners.reduce((n, e) => n + e.qty, 0)
  const entitled = party.entitledOverride ?? party.partySize

  const entered = !!first
  const overServed = served > entitled
  const servedWithoutEntry = served > 0 && !entered
  const possibleDuplicate = party.possibleDuplicateOf !== null
  return {
    partyId: party.id,
    entitled,
    entered,
    enteredAt: first?.clientAt ?? null,
    headcount: first?.qty ?? null,
    enteredCounter: first?.counter ?? null,
    enteredBy: first?.actorName ?? null,
    served,
    remaining: Math.max(0, entitled - served),
    lastServedAt: dinners.length ? Math.max(...dinners.map((e) => e.clientAt)) : null,
    overServed,
    servedWithoutEntry,
    duplicateEntry: entries.length > 1,
    possibleDuplicate,
    needsReview: overServed || servedWithoutEntry || possibleDuplicate,
  }
}

/** Events that count: passes that have not been voided. */
export function liveEvents(events: ScanEvent[]): ScanEvent[] {
  const voided = new Set<string>()
  for (const e of events) if (e.action === 'void' && e.voidsEventId) voided.add(e.voidsEventId)
  return events.filter((e) => e.action === 'pass' && !voided.has(e.id))
}

export function groupByParty(events: ScanEvent[]): Map<string, ScanEvent[]> {
  const m = new Map<string, ScanEvent[]>()
  for (const e of events) {
    const list = m.get(e.partyId)
    if (list) list.push(e)
    else m.set(e.partyId, [e])
  }
  return m
}
