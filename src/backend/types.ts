import type { OutboxItem, Party, PushResult, ScanEvent, Session, Role } from '../lib/types.ts'

export type SignInResult = { session: Session } | { rejectedEmail: string } | { error: string }

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
  /** True when a real request succeeds. navigator.onLine alone is not trusted. */
  ping(): Promise<boolean>
  listUsers(): Promise<AdminUser[]>
  saveUser(user: AdminUser): Promise<void>
}
