import type { GuestRow, PassRow } from '../lib/guestImport.ts'
import type { Counter } from '../lib/config.ts'
import type { OutboxItem, Party, PartyContact, PushResult, ScanEvent, Session, Role } from '../lib/types.ts'

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
  /** True when nothing on record names this person, so they can be deleted for good (migration 11). Absent before it. */
  canDelete?: boolean
}

/** What one audit line is about. The server classifies each row (migration 13), so the app only has to word it. */
export type AuditKind =
  | 'checkin' | 'undo' | 'reset'
  | 'guest_added' | 'guests_imported' | 'guest_edited' | 'guest_removed' | 'review_cleared'
  | 'contact_read' | 'passes_exported'
  | 'user_added' | 'user_changed' | 'user_linked' | 'user_deleted'
  | 'settings_changed' | 'audit_cleared' | 'flush' | 'gates_set' | 'other'

export interface AuditEntry {
  /** Unique and sortable with atUs: the paging cursor is (atUs, key). */
  key: string
  /** Microseconds since 1970. */
  atUs: number
  actor: string
  kind: AuditKind
  /** The guest or person the line is about. */
  subject: string | null
  partyId: string | null
  reason: string | null
  /** More than 1 when rows of one bulk change (an import) were collapsed into this line. */
  n: number
  extra: Record<string, unknown>
}
export interface AuditCursor {
  atUs: number
  key: string
}
export interface AuditPage {
  /** When the log was last cleared (ms), or null when it shows everything from the start. */
  since: number | null
  entries: AuditEntry[]
}

/** One phone that has reported in (device_heartbeat). */
export interface DeviceRow {
  deviceId: string
  name: string
  email: string
  counter: string | null
  /** Items waiting to be sent, not counting the ones the server refused. */
  pending: number
  appVersion: string | null
  lastSyncAt: number
  /** Server time minus the phone's clock, in ms. */
  clockOffsetMs: number | null
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
  /** Admin. Deletes a switched-off person who has no history. The server refuses anyone with scans or edits on record. */
  deleteUser(email: string): Promise<void>
  /** Admin. Loads a guest list in one go (all rows or none). replace retires the current guests first. */
  importGuests(rows: GuestRow[], opts: { filename: string; replace: boolean }): Promise<ImportResult>
  /** Admin. Every current guest with pass code, QR token and contact. The server records the export. */
  exportPasses(): Promise<PassRow[]>
  /** Admin. What a flush would do right now. */
  flushPreview(): Promise<FlushPreview>
  /** Admin. Undoes every live check-in in one go (one void each, so the log stays append-only). removeOnSpot also removes guests registered in the app. */
  flushCheckins(opts: { reason: string; removeOnSpot: boolean }): Promise<FlushResult>
  /** Staff. "These are two different guests": clears the duplicate flag for everyone (phones pick it up on their next pull). */
  resolveReview(partyId: string, note: string): Promise<void>
  /** Staff. The guest's full mobile and email, or null when the server has none yet (a guest registered on a phone that has not synced). The server records each lookup. */
  getContact(partyId: string): Promise<PartyContact | null>
  /** Admin. Sets how many gate desks there are (1 to 20) and returns the gate list. */
  setGateCount(count: number): Promise<Counter[]>
  /** Admin. Phones that have reported in, newest first. */
  listDevices(): Promise<DeviceRow[]>
  /** Admin. One page of the audit log, newest first. Pass the last entry's cursor to get the next page. */
  auditFeed(before?: AuditCursor): Promise<AuditPage>
  /** Admin. Starts the audit log afresh from now. Nothing is deleted. Refused once the event is live. */
  clearAuditLog(reason: string): Promise<void>
}
