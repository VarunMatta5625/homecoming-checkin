import { APP_VERSION, BUILTIN_COUNTERS } from '../lib/config.ts'
import { db } from '../lib/db.ts'
import { FLUSH_PREFIX } from '../lib/flush.ts'
import { newId } from '../lib/ids.ts'
import { prefs } from '../lib/prefs.ts'
import { groupByParty, liveEvents, partyState } from '../lib/state.ts'
import type { Counter } from '../lib/config.ts'
import type { OutboxItem, PushResult, ScanEvent, Session } from '../lib/types.ts'
import { demoSnapshot } from './demo.ts'
import type { AdminUser, AuditEntry, AuditPage, Backend, DeviceRow, FlushPreview, FlushResult, SignInResult } from './types.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const ACCOUNTS: Record<string, Session> = {
  volunteer: { actorId: 'u-rahul', email: 'rahul.teja@gitam.in', name: 'Rahul Teja', role: 'volunteer' },
  staff: { actorId: 'u-lakshmi', email: 'lakshmi.p@gitam.in', name: 'Lakshmi P.', role: 'staff' },
  admin: { actorId: 'u-venkat', email: 'venkat.r@gitam.in', name: 'Venkat R.', role: 'admin' },
}
const UNLISTED = 's.ravi@gitam.in'
const result = (who: string): SignInResult => (ACCOUNTS[who] ? { session: ACCOUNTS[who] } : { rejectedEmail: UNLISTED })

const USERS_KEY = 'gh26.demo.users'
const seedUsers: AdminUser[] = [
  { email: 'venkat.r@gitam.in', name: 'Venkat R.', role: 'admin', active: true },
  { email: 'lakshmi.p@gitam.in', name: 'Lakshmi P.', role: 'staff', active: true },
  { email: 'rahul.teja@gitam.in', name: 'Rahul Teja', role: 'volunteer', active: true },
  { email: 'sneha.p@gitam.in', name: 'Sneha P.', role: 'volunteer', active: true },
  { email: 'kiran.b@gitam.in', name: 'Kiran B.', role: 'volunteer', active: false },
]
const readUsers = (): AdminUser[] => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '') as AdminUser[]
  } catch {
    return seedUsers
  }
}

const AUDIT_KEY = 'gh26.demo.auditCleared'
const readCleared = (): { at: number; reason: string } | null => {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) ?? 'null') as { at: number; reason: string } | null
  } catch {
    return null
  }
}

/** Built-in stand-in for Supabase so every screen works without a server. */
export const demoBackend: Backend = {
  async signInWithGoogle() {
    await sleep(500)
    return result('volunteer')
  },
  async signInDemo(who) {
    await sleep(350)
    return result(who)
  },
  async signOut() {
    await sleep(150)
  },
  async fetchSnapshot(onProgress) {
    if (prefs.get().demoOffline) throw new Error('offline')
    const snap = demoSnapshot()
    const total = snap.parties.length
    for (let done = 0; done < total; done += 60) {
      onProgress(Math.min(done + 60, total), total)
      await sleep(140)
    }
    return snap
  },
  async pushBatch(items: OutboxItem[]): Promise<PushResult[]> {
    if (!(await demoBackend.ping())) throw new Error('offline')
    await sleep(350)
    return items.map((i) => ({ id: i.id, status: 'accepted' as const }))
  },
  async ping() {
    if (prefs.get().demoOffline || !navigator.onLine) return false
    try {
      const res = await fetch('/icon-192.png', { method: 'HEAD', cache: 'no-store' })
      return res.ok
    } catch {
      return false
    }
  },
  async listUsers() {
    await sleep(120)
    // The demo people have no scans on record, so the switched-off ones can be deleted.
    return readUsers().map((u) => ({ ...u, canDelete: u.email.toLowerCase() !== ACCOUNTS.admin!.email.toLowerCase() }))
  },
  async saveUser(user) {
    const list = readUsers()
    const i = list.findIndex((u) => u.email.toLowerCase() === user.email.toLowerCase())
    if (i >= 0) list[i] = user
    else list.push(user)
    localStorage.setItem(USERS_KEY, JSON.stringify(list))
  },
  async deleteUser(email) {
    await sleep(200)
    localStorage.setItem(USERS_KEY, JSON.stringify(readUsers().filter((u) => u.email.toLowerCase() !== email.toLowerCase())))
  },
  // Demo mode has no database: the import is checked and counted, but nothing is stored.
  async importGuests(rows, opts) {
    await sleep(600)
    const seen = new Set<string>()
    let flagged = 0
    for (const r of rows) {
      if (seen.has(r.mobile)) flagged++
      seen.add(r.mobile)
    }
    return { imported: rows.length, flagged, retired: opts.replace ? demoSnapshot().parties.length : 0 }
  },
  // Demo mode has no server: the flush works on this phone's own copy, the same way the server's does (one void per live check-in).
  async flushPreview(): Promise<FlushPreview> {
    await sleep(200)
    const [parties, events] = await Promise.all([db.parties.toArray(), db.events.toArray()])
    const grouped = groupByParty(events)
    let checkedIn = 0
    let people = 0
    for (const p of parties) {
      if (p.deletedAt) continue
      const st = partyState(p, grouped.get(p.id) ?? [])
      if (st.entered) {
        checkedIn++
        people += st.headcount ?? 0
      }
    }
    return { checkedIn, people, scans: liveEvents(events).length, onSpot: parties.filter((p) => p.source === 'onspot' && !p.deletedAt).length, phones: [] }
  },
  async flushCheckins(opts): Promise<FlushResult> {
    await sleep(500)
    const s = prefs.get()
    const at = Date.now()
    const voids: ScanEvent[] = liveEvents(await db.events.toArray()).map((e) => ({
      id: newId(), partyId: e.partyId, checkpoint: 'entry', action: 'void', qty: 0, voidsEventId: e.id, reason: FLUSH_PREFIX + opts.reason.trim(),
      method: 'staff', actorId: s.session?.actorId ?? '', actorName: s.session?.name ?? '', counter: '', deviceId: s.deviceId, clientAt: at,
    }))
    await db.events.bulkAdd(voids)
    const removedOnSpot = opts.removeOnSpot ? await db.parties.filter((p) => p.source === 'onspot' && !p.deletedAt).modify({ deletedAt: new Date().toISOString() }) : 0
    return { voided: voids.length, removedOnSpot }
  },
  // Demo mode has no server: a resolve only changes this phone's copy (lib/actions.ts does that).
  async resolveReview() {
    await sleep(150)
  },
  async getContact(partyId) {
    await sleep(200)
    const p = await db.parties.get(partyId)
    return p ? { mobile: '+91 98765' + p.mobileLast4.padStart(5, '0'), email: null } : null
  },
  async setGateCount(count) {
    await sleep(250)
    return Array.from({ length: Math.max(count, BUILTIN_COUNTERS.length) }, (_, i): Counter => ({ code: 'GATE-' + (i + 1), label: 'Gate desk ' + (i + 1), kind: 'gate', active: i < count }))
  },
  async listDevices() {
    await sleep(150)
    const now = Date.now()
    const own = prefs.get()
    return [
      { deviceId: own.deviceId, name: own.session?.name ?? 'You', email: own.session?.email ?? '', counter: own.counter, pending: 0, appVersion: APP_VERSION, lastSyncAt: now - 4000, clockOffsetMs: 120 },
      { deviceId: 'demo-2', name: 'Sneha P.', email: 'sneha.p@gitam.in', counter: 'GATE-2', pending: 3, appVersion: APP_VERSION, lastSyncAt: now - 35000, clockOffsetMs: -800 },
      { deviceId: 'demo-3', name: 'Kiran B.', email: 'kiran.b@gitam.in', counter: 'GATE-1', pending: 0, appVersion: '0.9.0 (old)', lastSyncAt: now - 41 * 60000, clockOffsetMs: 5 * 60000 },
    ] satisfies DeviceRow[]
  },
  // Demo mode has no audit table: the feed is this phone's own check-ins and undos.
  async auditFeed(before): Promise<AuditPage> {
    await sleep(150)
    const cleared = readCleared()
    const [events, parties] = await Promise.all([db.events.toArray(), db.parties.toArray()])
    const names = new Map(parties.map((p) => [p.id, p.leadName]))
    const entries: AuditEntry[] = events
      .filter((e) => !(e.action === 'void' && e.reason?.startsWith(FLUSH_PREFIX)) && (!cleared || e.clientAt >= cleared.at))
      .map((e) => ({
        key: 's' + e.id, atUs: e.clientAt * 1000, actor: e.actorName, kind: e.action === 'pass' ? 'checkin' : e.method === 'staff' ? 'reset' : 'undo',
        subject: names.get(e.partyId) ?? null, partyId: e.partyId, reason: e.reason ?? null, n: 1, extra: { qty: e.qty, counter: e.counter },
      }) satisfies AuditEntry)
    if (cleared) entries.push({ key: 'a-cleared', atUs: cleared.at * 1000, actor: prefs.get().session?.name ?? 'You', kind: 'audit_cleared', subject: null, partyId: null, reason: cleared.reason, n: 1, extra: {} })
    entries.sort((a, b) => b.atUs - a.atUs || (a.key < b.key ? 1 : -1))
    const rest = before ? entries.filter((e) => e.atUs < before.atUs || (e.atUs === before.atUs && e.key < before.key)) : entries
    return { since: cleared?.at ?? null, entries: rest.slice(0, 100) }
  },
  async clearAuditLog(reason) {
    await sleep(200)
    localStorage.setItem(AUDIT_KEY, JSON.stringify({ at: Date.now(), reason }))
  },
  async exportPasses() {
    await sleep(300)
    return demoSnapshot().parties.map((p) => ({
      pass_code: p.passCode, qr_token: p.qrToken, lead_name: p.leadName, batch_year: p.batchYear, school: p.school, department: p.department,
      course: p.course, mobile_last4: p.mobileLast4, spouse: p.spouse, children: p.children, party_size: p.partySize, parking: p.parking,
      mobile: null, email: null,
    }))
  },
}
