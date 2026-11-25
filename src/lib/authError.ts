/**
 * Why did the server refuse a request?
 *  'removed': the sign-in is fine, but this person was switched off or is no longer on the list (migration 11 words
 *             this "Your account is switched off or removed"). Signing in again will not help. A role that is merely too
 *             low says "not authorised" and is not this.
 *  'expired': the sign-in itself is missing or out of date (an expired token, or no token at all). Before migration 11
 *             is applied a switched-off account also lands here, which only shows the "please sign in again" banner.
 *  null:      anything else (a bad request, a network problem): not about who the person is.
 */
export function authFailure(error: { message: string; code?: string; status?: number }): 'removed' | 'expired' | null {
  if (error.code === '42501' && /switched off or removed/i.test(error.message)) return 'removed'
  if (error.code === '42501' || error.code === 'PGRST301' || error.status === 401 || error.status === 403) return 'expired'
  return null
}
