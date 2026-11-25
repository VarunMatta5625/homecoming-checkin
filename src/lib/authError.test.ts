import { describe, expect, it } from 'vitest'
import { authFailure } from './authError.ts'

describe('authFailure', () => {
  it('a switched-off or deleted account is "removed"', () => {
    expect(authFailure({ message: 'Your account is switched off or removed', code: '42501' })).toBe('removed')
  })
  it('a role that is too low is not "removed"', () => {
    expect(authFailure({ message: 'not authorised', code: '42501' })).toBe('expired')
  })
  it('a missing or expired sign-in is "expired"', () => {
    expect(authFailure({ message: 'permission denied for function push_batch', code: '42501' })).toBe('expired')
    expect(authFailure({ message: 'JWT expired', code: 'PGRST301' })).toBe('expired')
    expect(authFailure({ message: 'Unauthorized', status: 401 })).toBe('expired')
    expect(authFailure({ message: 'Forbidden', status: 403 })).toBe('expired')
  })
  it('anything else says nothing about who the person is', () => {
    expect(authFailure({ message: 'Mobile needs 10 digits', code: 'P0001' })).toBeNull()
    expect(authFailure({ message: 'Failed to fetch' })).toBeNull()
  })
})
