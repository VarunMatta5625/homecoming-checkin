import type { Roster } from '../lib/hooks.ts'
import { groupByParty, partyState } from '../lib/state.ts'
import type { Row } from '../lib/stats.ts'
import type { Checkpoint, Party, ScanEvent } from '../lib/types.ts'

/** 12 Dec 2026, 10:00 IST. On a 30-minute boundary, so slot maths in tests is easy to read. */
export const T0 = Date.UTC(2026, 11, 12, 4, 30, 0)
export const MIN = 60000

let n = 0
export const resetIds = () => {
  n = 0
}

export function party(over: Partial<Party> = {}): Party {
  n++
  const spouse = over.spouse ?? 'no'
  const children = over.children ?? 0
  return {
    id: 'p' + n,
    passCode: 'HC' + String(n).padStart(4, '0'),
    qrToken: 'tok' + n,
    source: 'booked',
    leadName: 'Guest ' + n,
    nameLc: 'guest ' + n,
    batchYear: 2010,
    school: 'School of Technology',
    department: null,
    course: null,
    mobileLast4: '0000',
    spouse,
    children,
    partySize: 1 + (spouse !== 'no' ? 1 : 0) + children,
    entitledOverride: null,
    parking: 'none',
    possibleDuplicateOf: null,
    deletedAt: null,
    ...over,
  }
}

export function ev(partyId: string, checkpoint: Checkpoint, qty: number, at: number, over: Partial<ScanEvent> = {}): ScanEvent {
  n++
  return {
    id: 'e' + n,
    partyId,
    checkpoint,
    action: 'pass',
    qty,
    method: 'qr',
    actorId: 'u1',
    actorName: 'Rahul',
    counter: checkpoint === 'entry' ? 'GATE-1' : 'DINNER-1',
    deviceId: 'd1',
    clientAt: at,
    ...over,
  }
}

export const voidOf = (e: ScanEvent, at: number): ScanEvent => ev(e.partyId, e.checkpoint, e.qty, at, { action: 'void', voidsEventId: e.id, counter: e.counter })

/** Rows the way the Stats screen builds them: each party with its derived state. */
export function rowsOf(parties: Party[], events: ScanEvent[]): Row[] {
  return parties.map((p) => ({ party: p, st: partyState(p, events.filter((e) => e.partyId === p.id)) }))
}

/** The roster the Stats screen reads from useRoster(), built the same way. */
export function rosterOf(parties: Party[], events: ScanEvent[]): Roster {
  const grouped = groupByParty(events)
  return {
    parties,
    events,
    byId: new Map(parties.map((p) => [p.id, p])),
    states: new Map(parties.map((p) => [p.id, partyState(p, grouped.get(p.id) ?? [])])),
  }
}
