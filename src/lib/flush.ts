/** The reason every flush void carries, so the server can leave them out of the audit list and show the flush as one line. */
export const FLUSH_PREFIX = 'Flush: '

/** The sentence an admin types to confirm a flush. It carries the count, so it can't be typed from habit. */
export const flushPhrase = (checkedIn: number) => 'flush ' + checkedIn + ' check-ins'

export const phraseMatches = (typed: string, checkedIn: number) => typed.trim().replace(/\s+/g, ' ').toLowerCase() === flushPhrase(checkedIn)
