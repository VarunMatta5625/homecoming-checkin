import { UNDO_WINDOW_S } from './config.ts'
import type { ScanEvent, Session } from './types.ts'
import { hasRole } from './types.ts'

/** open: can undo now. closed: window over (volunteer). done: already undone. */
export function undoStatus(e: ScanEvent, session: Session | null, voided: Set<string>, now: number): 'open' | 'closed' | 'done' {
  if (e.action !== 'pass') return 'closed'
  if (voided.has(e.id)) return 'done'
  if (hasRole(session, 'staff')) return 'open'
  if (e.actorId === session?.actorId && now - e.clientAt < UNDO_WINDOW_S * 1000) return 'open'
  return 'closed'
}

export const undoSecondsLeft = (e: ScanEvent, now: number) => Math.max(0, Math.ceil((e.clientAt + UNDO_WINDOW_S * 1000 - now) / 1000))
