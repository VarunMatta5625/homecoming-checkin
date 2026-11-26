import type { AuditEntry } from '../backend/types.ts'
import type { IconName } from '../components/sprite.ts'
import { plural } from './format.ts'

export interface AuditLine {
  icon: IconName
  tone: 'neutral' | 'warn' | 'bad'
  title: string
  detail: string | null
}

/** The sentence an admin types to clear the audit log. */
export const CLEAR_PHRASE = 'clear audit log'
export const clearPhraseMatches = (typed: string) => typed.trim().replace(/\s+/g, ' ').toLowerCase() === CLEAR_PHRASE

const FIELD: Record<string, string> = {
  lead_name: 'name', batch_year: 'batch year', school: 'school', department: 'department', course: 'course', spouse: 'spouse',
  children: 'children', parking: 'parking', notes: 'notes', deleted_at: 'removal', possible_duplicate_of: 'duplicate flag',
}

const text = (v: unknown) => (typeof v === 'string' && v ? v : null)
const join = (...bits: (string | null | false | undefined)[]) => bits.filter(Boolean).join(' · ') || null
const without = (reason: string | null, prefix: string) => (reason && reason.startsWith(prefix) ? reason.slice(prefix.length) : reason)

/** The words for one audit entry. Pure, so the wording is tested without a screen. counterName turns GATE-2 into "Gate desk 2". */
export function auditLine(e: AuditEntry, counterName: (code: string) => string = (c) => c): AuditLine {
  const who = e.subject ?? 'a guest'
  const x = e.extra
  switch (e.kind) {
    case 'checkin':
      return { icon: 'login', tone: 'neutral', title: 'Checked in · ' + who, detail: join('party of ' + String(x.qty ?? 1), text(x.counter) && counterName(String(x.counter))) }
    case 'undo':
      return { icon: 'undo', tone: 'warn', title: 'Undid check-in · ' + who, detail: e.reason }
    case 'reset':
      return { icon: 'wrench', tone: 'warn', title: 'Reset check-in · ' + who, detail: e.reason }
    case 'guest_added':
      return { icon: 'user-plus', tone: 'neutral', title: 'Registered ' + who + ' on the spot', detail: null }
    case 'guests_imported':
      return { icon: 'download', tone: 'neutral', title: 'Imported ' + plural(e.n, 'guest'), detail: without(e.reason, 'Guest list import: ') }
    case 'guest_edited': {
      const changed = Array.isArray(x.changed) ? x.changed.map((k) => FIELD[String(k)] ?? String(k)) : []
      return { icon: 'wrench', tone: 'neutral', title: 'Edited ' + who, detail: join(changed.length ? 'changed ' + changed.join(', ') : null, e.reason) }
    }
    case 'guest_removed':
      return { icon: 'alert', tone: 'warn', title: e.n > 1 ? 'Removed ' + plural(e.n, 'guest') : 'Removed ' + who, detail: e.reason }
    case 'review_cleared':
      return { icon: 'flag', tone: 'neutral', title: 'Not a duplicate · ' + who, detail: without(e.reason, 'Not a duplicate: ') }
    case 'contact_read':
      return { icon: 'phone', tone: 'neutral', title: 'Opened contact details · ' + who, detail: null }
    case 'passes_exported':
      return { icon: 'download', tone: 'warn', title: 'Downloaded the pass list', detail: 'Holds every guest’s mobile and email' }
    case 'user_added':
      return { icon: 'users', tone: 'neutral', title: 'Added ' + (e.subject ?? 'a person'), detail: text(x.role) && 'as ' + String(x.role) }
    case 'user_linked':
      return { icon: 'login', tone: 'neutral', title: (e.subject ?? 'A person') + ' signed in for the first time', detail: null }
    case 'user_deleted':
      return { icon: 'alert', tone: 'warn', title: 'Deleted ' + (e.subject ?? 'a person'), detail: null }
    case 'user_changed': {
      const bits: string[] = []
      if (x.wasRole && x.role && x.wasRole !== x.role) bits.push('role ' + String(x.wasRole) + ' to ' + String(x.role))
      if (x.wasActive === true && x.active === false) bits.push('switched off')
      if (x.wasActive === false && x.active === true) bits.push('switched on')
      return { icon: 'users', tone: x.active === false ? 'warn' : 'neutral', title: 'Changed ' + (e.subject ?? 'a person'), detail: bits.join(', ') || null }
    }
    case 'settings_changed':
      return { icon: 'settings', tone: 'warn', title: 'Event settings changed', detail: e.reason }
    case 'audit_cleared':
      return { icon: 'history', tone: 'warn', title: 'Cleared the audit log', detail: e.reason }
    case 'flush': {
      const voided = Number(x.voided ?? 0)
      const removed = Number(x.removedOnSpot ?? 0)
      return { icon: 'alert', tone: 'bad', title: 'Flushed all check-ins', detail: join(plural(voided, 'check-in') + ' undone', removed > 0 && plural(removed, 'on-spot guest') + ' removed', e.reason) }
    }
    case 'gates_set':
      return { icon: 'settings', tone: 'neutral', title: 'Set the gate desks to ' + String(x.gates ?? '?'), detail: null }
    default:
      return { icon: 'info', tone: 'neutral', title: 'Other change', detail: e.reason }
  }
}
