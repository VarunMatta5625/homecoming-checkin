import { useState } from 'react'
import { useNow, usePartyView } from '../lib/hooks.ts'
import { UNDO_WINDOW_S } from '../lib/config.ts'
import { db } from '../lib/db.ts'
import { ui } from '../lib/ui.ts'
import type { ScanEvent } from '../lib/types.ts'
import { Toast } from './ui.tsx'
import { UndoSheet } from './UndoSheet.tsx'

/** Confirmation after a serve or check-in, with Undo until the window closes. */
export function ActionToast({ hidden }: { hidden?: boolean }) {
  const { last } = ui.use()
  const now = useNow(1000)
  const view = usePartyView(last?.partyId)
  const [undo, setUndo] = useState<ScanEvent | null>(null)

  if (undo && view)
    return <UndoSheet event={undo} who={view.party.leadName} detail={view.state.served + ' of ' + view.state.entitled + ' served'} onClose={() => setUndo(null)} onUndone={() => { setUndo(null); ui.set({ last: null }) }} />

  if (!last || hidden || now > last.until + 4000) return null
  // Zero if the phone's clock went back past the scan: the server would refuse that undo.
  const left = now < last.until - UNDO_WINDOW_S * 1000 ? 0 : Math.max(0, Math.ceil((last.until - now) / 1000))
  return (
    <Toast
      title={last.title}
      sub={last.sub}
      undo={left}
      onUndo={async () => {
        const e = await db.events.get(last.eventId)
        if (e) setUndo(e)
      }}
    />
  )
}
