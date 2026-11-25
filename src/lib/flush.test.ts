import { beforeEach, describe, expect, it } from 'vitest'
import { FLUSH_PREFIX, flushPhrase, isFlushVoid, phraseMatches, splitFlushVoids } from './flush.ts'
import { T0, ev, resetIds, voidOf } from '../test/fixtures.ts'

describe('flush phrase', () => {
  it('carries the count', () => expect(flushPhrase(727)).toBe('flush 727 check-ins'))
  it('ignores case and stray spaces', () => expect(phraseMatches('  Flush   727 Check-Ins ', 727)).toBe(true))
  it('rejects a different count, a partial sentence and an empty box', () => {
    expect(phraseMatches('flush 726 check-ins', 727)).toBe(false)
    expect(phraseMatches('flush 727', 727)).toBe(false)
    expect(phraseMatches('', 0)).toBe(false)
  })
})

describe('flush voids', () => {
  beforeEach(resetIds)
  const flushVoid = (partyId: string, at: number, reason = 'rehearsal over') =>
    ({ ...voidOf(ev(partyId, 'entry', 1, T0), at), actorId: 'admin', reason: FLUSH_PREFIX + reason })

  it('recognises a flush void by its reason', () => {
    expect(isFlushVoid(flushVoid('a', T0 + 1))).toBe(true)
    expect(isFlushVoid({ ...voidOf(ev('a', 'entry', 1, T0), T0 + 1), reason: 'Wrong guest' })).toBe(false)
  })

  it('groups the voids of one flush into one line and leaves ordinary undos alone', () => {
    const ordinary = { ...voidOf(ev('b', 'entry', 1, T0), T0 + 5), reason: 'Wrong guest' }
    const { flushes, rest } = splitFlushVoids([flushVoid('a', 100), flushVoid('b', 100), flushVoid('c', 100), ordinary, flushVoid('d', 200, 'second round')])
    expect(flushes.map((f) => [f.count, f.reason])).toEqual([[1, 'second round'], [3, 'rehearsal over']])
    expect(rest).toEqual([ordinary])
  })
})
