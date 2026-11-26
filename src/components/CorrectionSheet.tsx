import { useState } from 'react'
import { REASONS_CORRECT } from '../lib/config.ts'
import { fmtTime } from '../lib/format.ts'
import { resetEntry } from '../lib/actions.ts'
import { usePartyView } from '../lib/hooks.ts'
import { prefs } from '../lib/prefs.ts'
import { Btn, Group, Kv, ResultHead, Sheet } from './ui.tsx'

/** Staff only. A reset is a void event with a required reason, written to the audit log by the server. */
export function CorrectionSheet({ partyId, onClose }: { partyId: string; onClose: () => void }) {
  const view = usePartyView(partyId)
  const session = prefs.use().session
  const [reason, setReason] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ reason: string; at: number } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!view) return null
  const { party, state } = view

  const apply = async () => {
    if (!reason || busy) return
    setBusy(true)
    try {
      await resetEntry(party.id, reason)
      setSaved({ reason, at: Date.now() })
    } finally {
      setBusy(false)
    }
  }

  if (saved)
    return (
      <Sheet title="Saved" onClose={onClose}>
        <ResultHead kind="ok" icon="check-circle" label="Correction saved" sub={party.leadName + ' · check-in reset'} />
        <div className="group">
          <Kv k="Now" v="Not checked in" />
          <Kv k="Reason" v={saved.reason} />
          <Kv k="Logged as" v={(session?.name ?? 'You') + ' · ' + fmtTime(saved.at)} />
        </div>
        <div className="px">
          <Btn onClick={onClose}>Done</Btn>
        </div>
      </Sheet>
    )

  return (
    <Sheet title="Correct record" onClose={onClose}>
      <div className="px5 stack" style={{ gap: 2 }}>
        <span className="t-title" style={{ fontWeight: 700 }}>{party.leadName}</span>
        <span className="t-sub muted">
          Batch of {party.batchYear} · Party of {state.entitled}
          {state.entered && state.enteredAt ? ' · Entry ' + fmtTime(state.enteredAt) : ' · Not checked in'}
        </span>
      </div>
      <p className="t-sub px5" style={{ margin: 0 }}>
        The check-in is cleared and the party will need to check in again. Earlier records stay in the log.
      </p>
      <Group header="Reason · required">
        <div className="fchips wrap" style={{ padding: 12 }}>
          {REASONS_CORRECT.map((r) => (
            <button key={r} type="button" className={'fchip' + (reason === r ? ' on' : '')} aria-pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
      </Group>
      <div className="px">
        <Btn kind="destructive-fill" icon="wrench" disabled={!reason || busy || !state.entered} onClick={apply}>
          Reset check-in
        </Btn>
      </div>
      <div className="t-cap muted px5 center">
        Logged as {session?.name} ({session?.role}). Corrections are saved to the audit log.
      </div>
    </Sheet>
  )
}
