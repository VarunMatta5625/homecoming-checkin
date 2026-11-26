import { useState } from 'react'
import { REASONS_RESOLVE } from '../lib/config.ts'
import { resolveReview } from '../lib/actions.ts'
import { usePartyView } from '../lib/hooks.ts'
import type { Party } from '../lib/types.ts'
import { Btn, Group, Icon, Sheet } from './ui.tsx'

const line = (p: Party) => 'Batch of ' + p.batchYear + ' · ' + (p.course ?? 'no course') + ' · ••••' + p.mobileLast4

/** Staff: a party shares a mobile number with another guest. Say why they are different people and the flag goes away for everyone. */
export function ReviewSheet({ partyId, onClose, onOpenGuest }: { partyId: string; onClose: () => void; onOpenGuest: () => void }) {
  const view = usePartyView(partyId)
  const other = usePartyView(view?.party.possibleDuplicateOf)
  const [reason, setReason] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!view) return null
  const { party } = view

  const apply = async () => {
    if (!reason || busy) return
    setBusy(true)
    setError(null)
    try {
      await resolveReview(party.id, reason)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save. Check your signal and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Possible duplicate" onClose={onClose} action={<button type="button" className="navbtn" onClick={onOpenGuest}>Guest</button>}>
      <div className="px5 stack" style={{ gap: 2 }}>
        <span className="t-title" style={{ fontWeight: 700 }}>{party.leadName}</span>
        <span className="t-sub muted">{line(party)}</span>
      </div>
      <div className="card" style={{ margin: '0 16px', padding: '12px 16px', background: 'var(--fill2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="t-cap muted">Shares a mobile number with</span>
        {other ? (
          <>
            <span className="t-head">{other.party.leadName}</span>
            <span className="t-sub muted">{line(other.party)}</span>
          </>
        ) : (
          <span className="t-sub muted">A guest this phone does not have (yet).</span>
        )}
      </div>
      <p className="t-sub px5" style={{ margin: 0 }}>
        If they are different people, say why and the flag goes away on every phone. If it is the same person listed twice, open the guest and correct the check-in there.
      </p>
      <Group header="Reason · required">
        <div className="fchips wrap" style={{ padding: 12 }}>
          {REASONS_RESOLVE.map((r) => (
            <button key={r} type="button" className={'fchip' + (reason === r ? ' on' : '')} aria-pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
      </Group>
      {error && <div className="err-msg"><Icon name="alert" size="s" />{error}</div>}
      <div className="px">
        <Btn icon="check" disabled={!reason || busy} onClick={() => void apply()}>{busy ? 'Saving…' : 'Not a duplicate'}</Btn>
      </div>
      <div className="t-cap muted px5 center">Needs signal. Saved to the audit log with your name.</div>
    </Sheet>
  )
}
