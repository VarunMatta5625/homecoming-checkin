import { useEffect, useState } from 'react'
import { Btn, Empty } from '../components/ui.tsx'
import { pendingCount, signOutAndWipe } from '../lib/actions.ts'
import { plural } from '../lib/format.ts'
import { useSyncStatus } from '../lib/hooks.ts'

/**
 * The server says this account is no longer allowed in. Nothing synced can be fetched or sent, so the phone signs out by
 * itself. With scans still waiting it asks first, because signing out deletes them (they can't be sent any more).
 * If an admin switches the account back on, the next sync clears this screen on its own.
 */
export function AccessRemovedScreen() {
  const status = useSyncStatus()
  const [busy, setBusy] = useState(false)
  const out = () => {
    setBusy(true)
    void signOutAndWipe()
  }
  useEffect(() => {
    // Ask the local database itself: the live count reads 0 until its first query returns, and signing out then would delete unsent scans.
    let dead = false
    void pendingCount().then((n) => {
      if (!dead && n === 0) out()
    })
    return () => {
      dead = true
    }
    // sign out once, when there is nothing left to lose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.pending])
  return (
    <main className="screen notabs">
      <Empty
        icon="lock"
        tone="warn"
        title="Your access was removed"
        body={
          status.pending
            ? 'An admin switched off this account, so this phone can no longer sync. ' + plural(status.pending, 'scan') + ' on this phone ' + (status.pending === 1 ? 'was' : 'were') + ' not sent and can’t be sent now. If this is a mistake, ask an admin to switch you back on and this screen will go away by itself.'
            : 'An admin switched off this account. Signing you out.'
        }
      >
        {status.pending > 0 && <Btn kind="destructive" disabled={busy} onClick={out}>{busy ? 'Signing out…' : 'Sign out and delete unsent scans'}</Btn>}
      </Empty>
    </main>
  )
}
