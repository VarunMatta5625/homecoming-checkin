import { beforeEach, describe, expect, it } from 'vitest'
import { ev, legacyDinner, MIN, party, resetIds, T0, voidOf } from '../test/fixtures.ts'
import { liveEvents, partyState } from './state.ts'

beforeEach(resetIds)

describe('partyState', () => {
  it('is not entered with no events, and expects the party size', () => {
    const p = party({ spouse: 'yes', children: 2 })
    const s = partyState(p, [])
    expect(s).toMatchObject({ entered: false, enteredAt: null, headcount: null, entitled: 4, duplicateEntry: false, needsReview: false })
  })
  it('takes the earliest check-in, with its headcount, gate and volunteer', () => {
    const p = party({ children: 3 })
    const late = ev(p.id, 'entry', 4, T0 + 10 * MIN, { counter: 'GATE-2', actorName: 'Asha' })
    const early = ev(p.id, 'entry', 2, T0, { counter: 'GATE-1', actorName: 'Ravi' })
    const s = partyState(p, [late, early])
    expect(s).toMatchObject({ entered: true, enteredAt: T0, headcount: 2, enteredCounter: 'GATE-1', enteredBy: 'Ravi', duplicateEntry: true })
  })
  it('breaks a tie on the same time by which scan the server saw first', () => {
    const p = party()
    const a = ev(p.id, 'entry', 1, T0, { receivedAt: T0 + 5, counter: 'GATE-2' })
    const b = ev(p.id, 'entry', 1, T0, { receivedAt: T0 + 1, counter: 'GATE-1' })
    expect(partyState(p, [a, b]).enteredCounter).toBe('GATE-1')
  })
  it('forgets an undone check-in', () => {
    const p = party()
    const e = ev(p.id, 'entry', 1, T0)
    expect(partyState(p, [e, voidOf(e, T0 + MIN)]).entered).toBe(false)
  })
  it('flags a possible duplicate for review, and nothing else', () => {
    expect(partyState(party({ possibleDuplicateOf: 'x' }), []).needsReview).toBe(true)
    const p = party()
    expect(partyState(p, [ev(p.id, 'entry', 1, T0), ev(p.id, 'entry', 1, T0 + MIN)]).needsReview).toBe(false)
  })
  it('ignores dinner scans left by the earlier version of the app', () => {
    const p = party()
    const s = partyState(p, [legacyDinner(p.id, 2, T0)])
    expect(s.entered).toBe(false)
    expect(liveEvents([legacyDinner(p.id, 2, T0)])).toEqual([])
  })
})
