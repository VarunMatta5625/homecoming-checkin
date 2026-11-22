export type Role = 'volunteer' | 'staff' | 'admin'
export type Ynm = 'no' | 'yes' | 'maybe'
export type Parking = 'none' | 'two_wheeler' | 'four_wheeler'
export type Checkpoint = 'entry' | 'dinner'
export type Method = 'qr' | 'search' | 'code' | 'staff'

/** Roster row held on every phone. No full mobile number or email (privacy invariant 6). */
export interface Party {
  id: string
  passCode: string
  qrToken: string
  source: 'booked' | 'onspot'
  leadName: string
  nameLc: string
  batchYear: number
  school: string | null
  department: string | null
  course: string | null
  mobileLast4: string
  spouse: Ynm
  children: number
  partySize: number
  entitledOverride: number | null
  parking: Parking
  possibleDuplicateOf: string | null
  deletedAt: string | null
}

/** Append-only. Undo is a compensating 'void' event. */
export interface ScanEvent {
  id: string
  /** Server order. Set once the server has confirmed the event. */
  seq?: number
  partyId: string
  checkpoint: Checkpoint
  action: 'pass' | 'void'
  /** entry: headcount. dinner: servings. */
  qty: number
  voidsEventId?: string | null
  reason?: string | null
  overrideReason?: string | null
  method: Method
  actorId: string
  /** Display name of the actor. The server resolves it from actor_id. */
  actorName: string
  counter: string
  deviceId: string
  clientAt: number
  receivedAt?: number
}

export interface OutboxItem {
  id: string
  type: 'party' | 'event'
  /** type 'party': { party, contact }; type 'event': a ScanEvent */
  payload: unknown
  attempts: number
  createdAt: number
  lastError?: string | null
}

export interface Session {
  actorId: string
  email: string
  name: string
  role: Role
}

export interface PartyContact {
  mobile: string
  email: string | null
}

export type PushResult = { id: string; status: 'accepted' | 'duplicate' } | { id: string; status: 'rejected'; reason: string }

export const roleRank: Record<Role, number> = { volunteer: 0, staff: 1, admin: 2 }
export const hasRole = (s: Session | null, min: Role) => !!s && roleRank[s.role] >= roleRank[min]
