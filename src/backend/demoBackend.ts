import { prefs } from '../lib/prefs.ts'
import type { OutboxItem, PushResult, Session } from '../lib/types.ts'
import { demoSnapshot } from './demo.ts'
import type { AdminUser, Backend, SignInResult } from './types.ts'

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
    return readUsers()
  },
  async saveUser(user) {
    const list = readUsers()
    const i = list.findIndex((u) => u.email.toLowerCase() === user.email.toLowerCase())
    if (i >= 0) list[i] = user
    else list.push(user)
    localStorage.setItem(USERS_KEY, JSON.stringify(list))
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
  async exportPasses() {
    await sleep(300)
    return demoSnapshot().parties.map((p) => ({
      pass_code: p.passCode, qr_token: p.qrToken, lead_name: p.leadName, batch_year: p.batchYear, school: p.school, department: p.department,
      course: p.course, mobile_last4: p.mobileLast4, spouse: p.spouse, children: p.children, party_size: p.partySize, parking: p.parking,
      mobile: null, email: null,
    }))
  },
}
