import type { GuestRow, PassRow } from '../lib/guestImport.ts'
import type { Counter } from '../lib/config.ts'
import type { OutboxItem, Party, PushResult, ScanEvent, Session, Role } from '../lib/types.ts'

export type SignInResult = { session: Session } | { rejectedEmail: string } | { error: string }

export interface ImportResult {
  imported: number
  /** Guests whose mobile matched another guest: created, but flagged for review. */
  flagged: number
  /** Guests retired by a replace. */
  retired: number
}

/** What a flush would do right now. phones: devices that reported unsent items recently (their scans would check guests in again). */
export interface FlushPreview {
  /** Parties checked in now, and the people in them. */
  checkedIn: number
  people: number
  /** Live check-in events that would be undone. */
  scans: number
  /** On-spot guests that can be removed too. */
  onSpot: number
  phones: { counter: string | null; pending: number; lastSyncAt: number }[]
}

export interface FlushResult {
  voided: number
  removedOnSpot: number
}

export interface AdminUser {
  email: string
  name: string
  role: Role
  active: boolean
}

/** Server positions: everything up to here has been pulled. */
export interface Cursors {
  party: number
  event: number
}
export interface Snapshot {
  parties: Party[]
  events: ScanEvent[]
  cursors?: Cursors
}

/**
 * Everything the app needs from the server. ./demoBackend.ts runs on built-in data;
 * ./supabase.ts talks to Supabase (RPCs from supabase/migrations). ./index.ts picks one.
 */
export interface Backend {
  /** Resolves to the session, or the email when it is not on the allowlist (whoami returned null). */
  signInWithGoogle(): Promise<SignInResult>
  /** After a redirect back from Google: the session if there is one. */
  resume?(): Promise<SignInResult | null>
  signInDemo?(who: 'volunteer' | 'staff' | 'admin' | 'unlisted'): Promise<SignInResult>
  signOut(): Promise<void>
  fetchSnapshot(onProgress: (done: number, total: number) => void): Promise<Snapshot>
  /** Rows changed on the server since the cursors. */
  fetchChanges?(from: Cursors): Promise<Snapshot>
  pushBatch(items: OutboxItem[]): Promise<PushResult[]>
  heartbeat?(info: { deviceId: string; counter: string | null; pending: number; appVersion: string }): Promise<void>
  /** The counters table (the gate desks, active or retired). Demo mode has none: the built-in list applies. */
  listCounters?(): Promise<Counter[]>
  /** True when a real request succeeds. navigator.onLine alone is not trusted. */
  ping(): Promise<boolean>
  listUsers(): Promise<AdminUser[]>
  saveUser(user: AdminUser): Promise<void>
  /** Admin. Loads a guest list in one go (all rows or none). replace retires the current guests first. */
  importGuests(rows: GuestRow[], opts: { filename: string; replace: boolean }): Promise<ImportResult>
  /** Admin. Every current guest with pass code, QR token and contact. The server records the export. */
  exportPasses(): Promise<PassRow[]>
  /** Admin. What a flush would do right now. */
  flushPreview(): Promise<FlushPreview>
  /** Admin. Undoes every live check-in in one go (one void each, so the log stays append-only). removeOnSpot also removes guests registered in the app. */
  flushCheckins(opts: { reason: string; removeOnSpot: boolean }): Promise<FlushResult>
}
