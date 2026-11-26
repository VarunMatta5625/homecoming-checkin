import type { Party, ScanEvent } from './types.ts'

export interface PartyState {
  partyId: string
  /** People on the pass: the most the gate can check in. */
  entitled: number
  entered: boolean
  enteredAt: number | null
  headcount: number | null
  enteredCounter: string | null
  enteredBy: string | null
  duplicateEntry: boolean
  possibleDuplicate: boolean
  needsReview: boolean
}

/**
 * Derived state, never stored (invariant 5). Mirrors the SQL view party_state:
 * live = 'entry' passes not voided; earliest entry wins. Events from another checkpoint (the shared database may still
 * hold old dinner scans) are ignored.
 */
export function partyState(party: Party, events: ScanEvent[]): PartyState {
  const entries = liveEvents(events)
    .sort((a, b) => a.clientAt - b.clientAt || (a.receivedAt ?? Infinity) - (b.receivedAt ?? Infinity))
  const first = entries[0]
  const possibleDuplicate = party.possibleDuplicateOf !== null
  const duplicateEntry = entries.length > 1
  return {
    partyId: party.id,
    entitled: party.partySize,
    entered: !!first,
    enteredAt: first?.clientAt ?? null,
    headcount: first?.qty ?? null,
    enteredCounter: first?.counter ?? null,
    enteredBy: first?.actorName ?? null,
    duplicateEntry,
    possibleDuplicate,
    needsReview: possibleDuplicate,
  }
}

/** Check-ins that count: entry passes that have not been voided. */
export function liveEvents(events: ScanEvent[]): ScanEvent[] {
  const voided = new Set<string>()
  for (const e of events) if (e.action === 'void' && e.voidsEventId) voided.add(e.voidsEventId)
  return events.filter((e) => e.action === 'pass' && e.checkpoint === 'entry' && !voided.has(e.id))
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
