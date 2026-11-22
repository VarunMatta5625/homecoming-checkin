import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/config.ts'
import { prefs } from '../lib/prefs.ts'
import type { OutboxItem, Party, PushResult, ScanEvent, Session } from '../lib/types.ts'
import type { GuestRow, PassRow } from '../lib/guestImport.ts'
import type { AdminUser, Backend, Cursors, ImportResult, SignInResult, Snapshot } from './types.ts'

const PAGE = 1000

/** A deliberate sign-out is not an expired session. */
let deliberate = false

let client: SupabaseClient | null = null
/** Created on first use, so demo mode (no keys) never builds a client. */
export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (!deliberate && prefs.get().session) prefs.set({ sessionExpired: true })
        deliberate = false
      }
      // The same session refreshed itself (for example after a long offline stretch): it is not expired after all.
      if (event === 'TOKEN_REFRESHED' && prefs.get().sessionExpired) prefs.set({ sessionExpired: false })
    })
  }
  return client
}

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const toParty = (r: Row): Party => ({
  id: r.id,
  passCode: r.pass_code,
  qrToken: r.qr_token,
  source: r.source,
  leadName: r.lead_name,
  nameLc: String(r.lead_name).toLowerCase(),
  batchYear: r.batch_year,
  school: r.school,
  department: r.department,
  course: r.course,
  mobileLast4: r.mobile_last4 ?? '',
  spouse: r.spouse,
  children: r.children,
  partySize: r.party_size,
  entitledOverride: r.entitled_override,
  parking: r.parking,
  possibleDuplicateOf: r.possible_duplicate_of,
  deletedAt: r.deleted_at,
})

const toEvent = (r: Row): ScanEvent => ({
  id: r.id,
  seq: r.seq,
  partyId: r.party_id,
  checkpoint: r.checkpoint,
  action: r.action,
  qty: r.qty,
  voidsEventId: r.voids_event_id,
  reason: r.reason,
  overrideReason: r.override_reason,
  method: r.method,
  actorId: r.actor_id,
  actorName: r.actor_name ?? '',
  counter: r.counter ?? '',
  deviceId: r.device_id,
  clientAt: Number(r.client_at),
  receivedAt: Number(r.received_at),
})

/** Turns an RPC error into a thrown Error. An auth failure also flags the session as expired. */
function fail(error: { message: string; code?: string; status?: number }): never {
  if (error.code === '42501' || error.code === 'PGRST301' || error.status === 401 || error.status === 403) {
    if (prefs.get().session) prefs.set({ sessionExpired: true })
  }
  throw new Error(error.message)
}

async function fetchPages(from: Cursors, onPage?: (parties: number) => void): Promise<Snapshot> {
  const parties: Party[] = []
  const events: ScanEvent[] = []
  const cur = { ...from }
  for (;;) {
    const { data, error } = await sb().rpc('get_snapshot', { p_party_after: cur.party, p_event_after: cur.event, p_limit: PAGE })
    if (error) fail(error)
    const d = data as { parties: Row[]; events: Row[]; party_cursor: number; event_cursor: number; more: boolean }
    parties.push(...d.parties.map(toParty))
    events.push(...d.events.map(toEvent))
    cur.party = d.party_cursor
    cur.event = d.event_cursor
    onPage?.(parties.length)
    if (!d.more) break
  }
  return { parties, events, cursors: cur }
}

async function sessionFromWhoami(): Promise<SignInResult> {
  const { data: s } = await sb().auth.getSession()
  const email = s.session?.user.email ?? ''
  const { data, error } = await sb().rpc('whoami')
  if (error) fail(error)
  const w = data as { id: string; email: string; name: string; role: Session['role']; active: boolean } | null
  if (!w || w.active === false || !w.id) {
    // Unlisted or switched off: they get nothing, and are signed out.
    deliberate = true
    await sb().auth.signOut({ scope: 'local' })
    return { rejectedEmail: email }
  }
  return { session: { actorId: w.id, email: w.email, name: w.name, role: w.role } }
}

export const supabaseBackend: Backend = {
  async signInWithGoogle() {
    const { error } = await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/' } })
    if (error) return { error: error.message }
    // The browser is on its way to Google. resume() finishes the job when it comes back.
    return new Promise<SignInResult>(() => {})
  },

  async resume() {
    const { data } = await sb().auth.getSession()
    return data.session ? sessionFromWhoami() : null
  },

  async signOut() {
    deliberate = true
    await sb().auth.signOut({ scope: 'local' })
  },

  async fetchSnapshot(onProgress) {
    const { count } = await sb().from('parties').select('id', { count: 'exact', head: true })
    const total = count ?? 0
    onProgress(0, total)
    return fetchPages({ party: 0, event: 0 }, (n) => onProgress(Math.min(n, total), total))
  },

  fetchChanges(from) {
    return fetchPages(from)
  },

  async pushBatch(items: OutboxItem[]): Promise<PushResult[]> {
    const { data, error } = await sb().rpc('push_batch', { items: items.map((i) => ({ id: i.id, type: i.type, payload: i.payload })) })
    if (error) fail(error)
    return (data as Row[]).map((r) => (r.status === 'rejected' ? { id: r.id, status: 'rejected' as const, reason: String(r.reason) } : { id: r.id, status: r.status as 'accepted' | 'duplicate' }))
  },

  async heartbeat(info) {
    await sb().rpc('device_heartbeat', {
      p_device_id: info.deviceId,
      p_counter: info.counter,
      p_pending_count: info.pending,
      p_app_version: info.appVersion,
      p_client_now: new Date().toISOString(),
    })
  },

  async ping() {
    if (!navigator.onLine) return false
    try {
      const res = await fetch(SUPABASE_URL + '/auth/v1/health', { headers: { apikey: SUPABASE_KEY }, cache: 'no-store', signal: AbortSignal.timeout(5000) })
      return res.ok
    } catch {
      return false
    }
  },

  async listUsers() {
    const { data, error } = await sb().rpc('admin_list_users')
    if (error) fail(error)
    return data as AdminUser[]
  },

  async saveUser(u) {
    const { error } = await sb().rpc('admin_set_user', { p_email: u.email, p_name: u.name, p_role: u.role, p_active: u.active })
    if (error) throw new Error(error.message)
  },

  async importGuests(rows: GuestRow[], opts) {
    const { data, error } = await sb().rpc('admin_import_guests', { p_filename: opts.filename, p_rows: rows, p_replace: opts.replace })
    if (error) fail(error)
    return data as ImportResult
  },

  async exportPasses() {
    const { data, error } = await sb().rpc('admin_export_passes')
    if (error) fail(error)
    return data as PassRow[]
  },
}
