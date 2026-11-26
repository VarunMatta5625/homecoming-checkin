import { describe, expect, it } from 'vitest'
import { flushPhrase, phraseMatches } from './flush.ts'

describe('flush phrase', () => {
  it('carries the count', () => expect(flushPhrase(727)).toBe('flush 727 check-ins'))
  it('ignores case and stray spaces', () => expect(phraseMatches('  Flush   727 Check-Ins ', 727)).toBe(true))
  it('rejects a different count, a partial sentence and an empty box', () => {
    expect(phraseMatches('flush 726 check-ins', 727)).toBe(false)
    expect(phraseMatches('flush', 727)).toBe(false)
    expect(phraseMatches('', 727)).toBe(false)
  })
})
