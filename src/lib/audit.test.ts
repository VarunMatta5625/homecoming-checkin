import { describe, expect, it } from 'vitest'
import type { AuditEntry, AuditKind } from '../backend/types.ts'
import { auditLine, clearPhraseMatches } from './audit.ts'

const entry = (kind: AuditKind, over: Partial<AuditEntry> = {}): AuditEntry => ({ key: 'a1', atUs: 1, actor: 'Asha', kind, subject: null, partyId: null, reason: null, n: 1, extra: {}, ...over })

describe('auditLine', () => {
  it('words a check-in with the party and the gate', () => {
    const l = auditLine(entry('checkin', { subject: 'Priya Raghavan', extra: { qty: 3, counter: 'GATE-2' } }), (c) => 'Gate desk ' + c.slice(-1))
    expect(l.title).toBe('Checked in · Priya Raghavan')
    expect(l.detail).toBe('party of 3 · Gate desk 2')
  })
  it('keeps the reason of an undo and a reset', () => {
    expect(auditLine(entry('undo', { subject: 'A', reason: 'Wrong guest' })).detail).toBe('Wrong guest')
    expect(auditLine(entry('reset', { subject: 'A', reason: 'Guest left' })).title).toBe('Reset check-in · A')
  })
  it('shows a collapsed import as one line with the file name', () => {
    const l = auditLine(entry('guests_imported', { n: 5000, reason: 'Guest list import: alumni.csv' }))
    expect(l.title).toBe('Imported 5000 guests')
    expect(l.detail).toBe('alumni.csv')
  })
  it('names the fields of an edit in plain words', () => {
    const l = auditLine(entry('guest_edited', { subject: 'Ravi', reason: 'Typo', extra: { changed: ['lead_name', 'batch_year'] } }))
    expect(l.detail).toBe('changed name, batch year · Typo')
  })
  it('says how many guests a bulk removal took', () => {
    expect(auditLine(entry('guest_removed', { n: 12, reason: 'Flush: rehearsal over' })).title).toBe('Removed 12 guests')
    expect(auditLine(entry('guest_removed', { n: 1, subject: 'Ravi' })).title).toBe('Removed Ravi')
  })
  it('drops the reason prefix the server adds to a cleared flag', () => {
    expect(auditLine(entry('review_cleared', { subject: 'Ravi', reason: 'Not a duplicate: Family sharing one phone' })).detail).toBe('Family sharing one phone')
  })
  it('describes what changed about a person', () => {
    expect(auditLine(entry('user_changed', { subject: 'a@b.co', extra: { wasRole: 'volunteer', role: 'staff', wasActive: true, active: true } })).detail).toBe('role volunteer to staff')
    const off = auditLine(entry('user_changed', { subject: 'a@b.co', extra: { wasActive: true, active: false } }))
    expect(off.detail).toBe('switched off')
    expect(off.tone).toBe('warn')
    expect(auditLine(entry('user_changed', { subject: 'a@b.co', extra: { wasActive: false, active: true } })).detail).toBe('switched on')
  })
  it('words a flush with its counts', () => {
    const l = auditLine(entry('flush', { reason: 'rehearsal over', extra: { voided: 300, removedOnSpot: 4 } }))
    expect(l.detail).toBe('300 check-ins undone · 4 on-spot guests removed · rehearsal over')
    expect(l.tone).toBe('bad')
  })
  it('has a line for every kind the server can send', () => {
    const kinds: AuditKind[] = ['checkin', 'undo', 'reset', 'guest_added', 'guests_imported', 'guest_edited', 'guest_removed', 'review_cleared', 'contact_read', 'passes_exported', 'user_added', 'user_changed', 'user_linked', 'user_deleted', 'settings_changed', 'audit_cleared', 'flush', 'gates_set', 'other']
    for (const k of kinds) expect(auditLine(entry(k)).title.length).toBeGreaterThan(0)
  })
})

describe('clear phrase', () => {
  it('ignores case and stray spaces, and rejects anything else', () => {
    expect(clearPhraseMatches('  Clear   audit LOG ')).toBe(true)
    expect(clearPhraseMatches('clear')).toBe(false)
    expect(clearPhraseMatches('')).toBe(false)
  })
})
