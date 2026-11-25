import { describe, expect, it } from 'vitest'
import { UNDO_WINDOW_S } from './config.ts'
import { undoSecondsLeft, undoStatus } from './undo.ts'
import { ev, party, resetIds, T0 } from '../test/fixtures.ts'
import type { Role, Session } from './types.ts'

const me = (role: Role): Session => ({ actorId: 'u1', email: 'a@gitam.in', name: 'A', role })
const here = 'd1'
const W = UNDO_WINDOW_S * 1000
resetIds()
const p = party()
const scan = (over = {}) => ev(p.id, 'entry', 1, T0, { actorId: 'u1', deviceId: here, ...over })
const none = new Set<string>()

describe('undoStatus', () => {
  it('lets a volunteer undo their own scan from this phone inside the window', () => {
    expect(undoStatus(scan(), me('volunteer'), none, T0 + W - 1, here)).toBe('open')
    expect(undoStatus(scan(), me('volunteer'), none, T0, here)).toBe('open')
  })
  it('closes at the end of the window', () => {
    expect(undoStatus(scan(), me('volunteer'), none, T0 + W, here)).toBe('closed')
  })
  it('keeps a scan from another phone closed to a volunteer, whatever the times say', () => {
    expect(undoStatus(scan({ deviceId: 'other' }), me('volunteer'), none, T0 + 1000, here)).toBe('closed')
  })
  it('keeps someone else\'s scan closed', () => {
    expect(undoStatus(scan({ actorId: 'u2' }), me('volunteer'), none, T0 + 1000, here)).toBe('closed')
  })
  it('keeps a scan stamped in the future closed (a clock that was set back)', () => {
    expect(undoStatus(scan(), me('volunteer'), none, T0 - 5000, here)).toBe('closed')
  })
  it('lets staff and admins undo any scan at any time', () => {
    for (const role of ['staff', 'admin'] as const) {
      expect(undoStatus(scan({ actorId: 'u2', deviceId: 'other' }), me(role), none, T0 + 10 * W, here)).toBe('open')
    }
  })
  it('reports an undone scan as done, for everyone', () => {
    const s = scan()
    expect(undoStatus(s, me('staff'), new Set([s.id]), T0, here)).toBe('done')
    expect(undoStatus(s, me('volunteer'), new Set([s.id]), T0, here)).toBe('done')
  })
  it('never offers undo on a void or when signed out', () => {
    expect(undoStatus(scan({ action: 'void' }), me('admin'), none, T0, here)).toBe('closed')
    expect(undoStatus(scan(), null, none, T0, here)).toBe('closed')
  })
})

describe('undoSecondsLeft', () => {
  it('counts down and stops at zero', () => {
    expect(undoSecondsLeft(scan(), T0)).toBe(UNDO_WINDOW_S)
    expect(undoSecondsLeft(scan(), T0 + 59_001)).toBe(1)
    expect(undoSecondsLeft(scan(), T0 + W)).toBe(0)
    expect(undoSecondsLeft(scan(), T0 + 10 * W)).toBe(0)
  })
  it('is zero if the phone\'s clock was set back past the scan, since the server would refuse that undo', () => {
    expect(undoSecondsLeft(scan(), T0 - 1)).toBe(0)
    expect(undoSecondsLeft(scan(), T0 - 30_000)).toBe(0)
  })
})
