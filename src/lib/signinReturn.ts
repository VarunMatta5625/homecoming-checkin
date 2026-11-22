/**
 * Runs when this file is first loaded, so main.tsx must import it before anything that creates the Supabase client:
 * the client removes error details from the address as soon as it exists.
 *
 * Google sends people back to the app with an error in the address when Supabase refuses to create their account
 * (the sign-up hook in supabase/migrations/…0006 only lets listed emails in). The router redirects and drops the address,
 * so main.tsx reads it first and the sign-in screen asks for it here.
 */

/** What the hook says when the email is not on the list. Keep in sync with the SQL function. */
export const NOT_LISTED = 'NOT_ON_LIST'

let returned: 'not-listed' | 'other' | null = null

function capture() {
  const q = new URLSearchParams(location.search)
  const h = new URLSearchParams(location.hash.slice(1))
  const msg = q.get('error_description') ?? h.get('error_description') ?? (q.get('error') || h.get('error'))
  if (!msg) return
  returned = msg.includes(NOT_LISTED) ? 'not-listed' : 'other'
  history.replaceState(null, '', location.pathname)
}

/** Why Google sent this page load back with a refusal, or null. Gone after a reload, since the address was cleaned. */
export const signInReturnError = () => returned

capture()
