import { backend } from '../backend/index.ts'
import { db, clearLocalData, finishWipe } from './db.ts'
import { mobileDigits } from './format.ts'
import { newId, newPassCode, newQrToken } from './ids.ts'
import { prefs } from './prefs.ts'
import { kickSync, net, nextStamp } from './sync.ts'
import type { Checkpoint, Method, Parking, Party, PartyContact, ScanEvent, Session, Ynm } from './types.ts'
import { liveEvents } from './state.ts'
import { hasRole } from './types.ts'

/** "Rahul Teja" -> "Rahul T." */
export function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/)
  const last = rest[rest.length - 1]
  return !last || last.endsWith('.') ? name : first + ' ' + last[0]!.toUpperCase() + '.'
}

function ctx() {
  const p = prefs.get()
  if (!p.session || !p.counter) throw new Error('This phone is not set up yet')
  return { actorId: p.session.actorId, actorName: shortName(p.session.name), counter: p.counter, deviceId: p.deviceId }
}

type NewEvent = Pick<ScanEvent, 'partyId' | 'checkpoint' | 'action' | 'qty' | 'method'> & Partial<ScanEvent>

const build = (e: NewEvent): ScanEvent => ({ id: newId(), clientAt: Date.now(), ...ctx(), ...e })

/** Invariant 4: the event and its outbox row are written in ONE local transaction. The UI never waits on the network. */
async function commit(events: ScanEvent[], party?: { party: Party; contact: PartyContact }) {
  await db.transaction('rw', db.parties, db.events, db.outbox, async () => {
    if (party) {
      await db.parties.add(party.party)
      await db.outbox.add({ id: party.party.id, type: 'party', payload: party, attempts: 0, createdAt: nextStamp() })
    }
    await db.events.bulkAdd(events)
    await db.outbox.bulkAdd(events.map((e) => ({ id: e.id, type: 'event' as const, payload: e, attempts: 0, createdAt: nextStamp() })))
  })
  if (net.get().online) kickSync()
  return events
}

export const checkIn = (partyId: string, qty: number, method: Method) =>
  commit([build({ partyId, checkpoint: 'entry', action: 'pass', qty, method })]).then((e) => e[0]!)

export const serveDinner = (partyId: string, qty: number, method: Method) =>
  commit([build({ partyId, checkpoint: 'dinner', action: 'pass', qty, method })]).then((e) => e[0]!)

/** Undo = a compensating void event. The original row is never touched. */
export async function voidEvent(original: ScanEvent, reason: string, method: Method = 'search') {
  const already = await db.events.where('partyId').equals(original.partyId).filter((e) => e.action === 'void' && e.voidsEventId === original.id).count()
  if (already) return
  await commit([build({ partyId: original.partyId, checkpoint: original.checkpoint, action: 'void', qty: 0, voidsEventId: original.id, reason, method })])
}

/** Staff reset: void every live event of one checkpoint (or both), reason required. */
export async function resetCheckpoints(partyId: string, checkpoints: Checkpoint[], reason: string) {
  const s = prefs.get().session
  if (!hasRole(s, 'staff')) throw new Error('Only staff can correct records')
  if (!reason.trim()) throw new Error('A reason is required')
  const live = liveEvents(await db.events.where('partyId').equals(partyId).toArray()).filter((e) => checkpoints.includes(e.checkpoint))
  if (!live.length) return
  await commit(live.map((o) => build({ partyId, checkpoint: o.checkpoint, action: 'void', qty: 0, voidsEventId: o.id, reason, method: 'staff' })))
}

export interface RegisterInput {
  name: string
  mobile: string
  email: string
  batchYear: number
  school: string
  course: string
  spouse: Ynm
  children: number
  parking: Parking
  duplicateOf: string | null
}

async function uniquePassCode() {
  for (;;) {
    const code = newPassCode()
    if (!(await db.parties.where('passCode').equals(code).count())) return code
  }
}

/** On-spot guest: id, qr token and pass code are made here so the QR shows instantly, offline too. */
export async function registerOnSpot(input: RegisterInput) {
  const name = input.name.trim().replace(/\s+/g, ' ')
  const mobile = mobileDigits(input.mobile)
  // "B.Tech, Mechanical" is the course and the department, the same split the imported guest list uses.
  const [course = '', department = ''] = input.course.split(',').map((s) => s.trim())
  const party: Party = {
    id: newId(),
    passCode: await uniquePassCode(),
    qrToken: newQrToken(),
    source: 'onspot',
    leadName: name,
    nameLc: name.toLowerCase(),
    batchYear: input.batchYear,
    school: input.school,
    department: department || null,
    course,
    mobileLast4: mobile.slice(-4),
    spouse: input.spouse,
    children: input.children,
    partySize: 1 + (input.spouse === 'no' ? 0 : 1) + input.children,
    entitledOverride: null,
    parking: input.parking,
    possibleDuplicateOf: input.duplicateOf,
    deletedAt: null,
  }
  const contact: PartyContact = { mobile: '+91' + mobile, email: input.email.trim() || null }
  const entry = build({ partyId: party.id, checkpoint: 'entry', action: 'pass', qty: party.partySize, method: 'search' })
  await commit([entry], { party, contact })
  return { party, entry }
}

/** Same last 4 digits and the same batch or a shared name. Server does the real match on the full mobile. */
export async function findPossibleDuplicate(mobile: string, name: string, batchYear: number) {
  const last4 = mobileDigits(mobile).slice(-4)
  if (last4.length < 4) return null
  const tokens = name.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
  const hits = await db.parties.filter((p) => p.mobileLast4 === last4 && (p.batchYear === batchYear || tokens.some((t) => p.nameLc.includes(t)))).toArray()
  return hits[0] ?? null
}

export async function downloadRoster(onProgress: (done: number, total: number) => void) {
  if (!(await finishWipe())) throw new Error('The previous sign-out is still clearing this phone. Close other tabs of this app and try again.')
  const snap = await backend.fetchSnapshot(onProgress)
  await db.transaction('rw', db.parties, db.events, async () => {
    await db.parties.bulkPut(snap.parties)
    await db.events.bulkPut(snap.events)
  })
  prefs.set({ rosterAt: Date.now(), lastSyncAt: Date.now(), partyCursor: snap.cursors?.party ?? 0, eventCursor: snap.cursors?.event ?? 0 })
}

export async function pendingCount() {
  return db.outbox.count()
}

/** Invariant 7: only called after the person has seen the unsynced warning and confirmed, or when the outbox is empty. */
export async function signOutAndWipe() {
  await backend.signOut().catch(() => {})
  await startOver(null)
}

/**
 * Replace this phone's local copy. With `null` the person signed out; with a session, a different person signed in while
 * nothing was waiting to sync, so the phone becomes theirs (they pick a counter and download the roster again).
 * Leaves the app first; the wipe can't hold the UI hostage if the local database is busy.
 */
export async function startOver(session: Session | null) {
  prefs.set({ session, sessionExpired: false, counter: null, rosterAt: null, lastSyncAt: null, wipePending: true, partyCursor: 0, eventCursor: 0 })
  await finishWipe()
}

export async function resetDemoData() {
  await clearLocalData()
  prefs.set({ rosterAt: null, partyCursor: 0, eventCursor: 0 })
  await downloadRoster(() => {})
}
