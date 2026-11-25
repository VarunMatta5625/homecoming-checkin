import type { ScanEvent } from './types.ts'

/** Every void written by a flush starts with this reason, so screens can show them as one line instead of hundreds. */
export const FLUSH_PREFIX = 'Flush: '

export const isFlushVoid = (e: ScanEvent) => e.action === 'void' && !!e.reason?.startsWith(FLUSH_PREFIX)

/** The sentence an admin types to confirm a flush. It carries the count, so it can't be typed from habit. */
export const flushPhrase = (checkedIn: number) => 'flush ' + checkedIn + ' check-ins'

export const phraseMatches = (typed: string, checkedIn: number) => typed.trim().replace(/\s+/g, ' ').toLowerCase() === flushPhrase(checkedIn)

export interface FlushGroup {
  key: string
  /** When the flush ran: every void of one flush shares this timestamp. */
  at: number
  by: string
  reason: string
  count: number
}

/** Splits voids into one group per flush (same person, same moment, same reason) and the ordinary voids. */
export function splitFlushVoids(voids: ScanEvent[]): { flushes: FlushGroup[]; rest: ScanEvent[] } {
  const groups = new Map<string, FlushGroup>()
  const rest: ScanEvent[] = []
  for (const e of voids) {
    if (!isFlushVoid(e)) {
      rest.push(e)
      continue
    }
    const key = e.actorId + '|' + e.clientAt + '|' + e.reason
    const g = groups.get(key)
    if (g) g.count++
    else groups.set(key, { key, at: e.clientAt, by: e.actorName, reason: (e.reason ?? '').slice(FLUSH_PREFIX.length), count: 1 })
  }
  return { flushes: [...groups.values()].sort((a, b) => b.at - a.at), rest }
}
