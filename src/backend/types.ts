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
}
