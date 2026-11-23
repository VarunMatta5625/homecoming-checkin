import { UNDO_WINDOW_S } from './config.ts'
import type { ScanEvent, Session } from './types.ts'
import { hasRole } from './types.ts'

/**
 * open: can undo now. closed: window over (volunteer). done: already undone.
 *
 * A volunteer can undo only a scan made on this phone, and only within the window. Both scans then share one clock,
 * so a phone that runs fast or slow doesn't matter. A scan that came from another phone is stamped by that phone's
 * clock, which can't be compared with this one, so it stays closed. The server applies the same rule (migration 8).
 */
export function undoStatus(e: ScanEvent, session: Session | null, voided: Set<string>, now: number, deviceId: string): 'open' | 'closed' | 'done' {
  if (e.action !== 'pass') return 'closed'
  if (voided.has(e.id)) return 'done'
  if (hasRole(session, 'staff')) return 'open'
  if (e.actorId === session?.actorId && e.deviceId === deviceId && now - e.clientAt >= 0 && now - e.clientAt < UNDO_WINDOW_S * 1000) return 'open'
  return 'closed'
}

/** Zero once the window is over, and also if the phone's clock was set back past the scan: the server refuses an undo dated before its scan. */
export const undoSecondsLeft = (e: ScanEvent, now: number) => (now < e.clientAt ? 0 : Math.max(0, Math.ceil((e.clientAt + UNDO_WINDOW_S * 1000 - now) / 1000)))
