import { useState } from 'react'
import { REASONS_CORRECT } from '../lib/config.ts'
import { fmtTime } from '../lib/format.ts'
import { resetCheckpoints } from '../lib/actions.ts'
import { usePartyView } from '../lib/hooks.ts'
import { prefs } from '../lib/prefs.ts'
import { Btn, Icon, Kv, ResultHead, Seg, Sheet, Switch } from './ui.tsx'
import { Group } from './ui.tsx'

/** Staff only. Resets are void events with a required reason, written to the audit log by the server. */
export function CorrectionSheet({ partyId, onClose, onOpenGuest }: { partyId: string; onClose: () => void; onOpenGuest?: () => void }) {
  const view = usePartyView(partyId)
  const session = prefs.use().session
  const [kind, setKind] = useState<'dinner' | 'entry'>('dinner')
  const [also, setAlso] = useState(true)
  const [reason, setReason] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ now: string; reason: string; what: string; at: number } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!view) return null
  const { party, state } = view
  const showAlso = kind === 'entry' && state.served > 0
  const both = showAlso && also

  const apply = async () => {
    if (!reason || busy) return
    setBusy(true)
    try {
      await resetCheckpoints(party.id, kind === 'dinner' ? ['dinner'] : both ? ['entry', 'dinner'] : ['entry'], reason)
      setSaved({ now: kind === 'dinner' ? '0 of ' + state.entitled + ' served' : 'Not checked in', reason, what: kind === 'dinner' ? 'dinner reset' : both ? 'entry and dinner reset' : 'entry reset', at: Date.now() })
    } finally {
      setBusy(false)
    }
  }

  if (saved)
    return (
      <Sheet title="Saved" onClose={onClose}>
        <ResultHead kind="ok" icon="check-circle" label="Correction saved" sub={party.leadName + ' · ' + saved.what} />
        <div className="group">
          <Kv k="Now" v={saved.now} />
          <Kv k="Reason" v={saved.reason} />
          <Kv k="Logged as" v={(session?.name ?? 'You') + ' · ' + fmtTime(saved.at)} />
        </div>
        <div className="px">
          <Btn onClick={onClose}>Done</Btn>
        </div>
      </Sheet>
    )

  return (
    <Sheet title="Correct record" onClose={onClose} action={onOpenGuest && <button type="button" className="navbtn" onClick={onOpenGuest}>Guest</button>}>
      <div className="px5 stack" style={{ gap: 2 }}>
        <span className="t-title" style={{ fontWeight: 700 }}>{party.leadName}</span>
        <span className="t-sub muted">
          Batch of {party.batchYear} · Party of {state.entitled}
          {state.entered && state.enteredAt ? ' · Entry ' + fmtTime(state.enteredAt) : ''} · Dinner {state.served} of {state.entitled}
        </span>
      </div>
      <div className="px">
        <Seg
          label="What to reset"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'dinner', label: 'Reset dinner', icon: 'utensils' },
            { value: 'entry', label: 'Reset entry', icon: 'login' },
          ]}
        />
      </div>
      <p className="t-sub px5" style={{ margin: 0 }}>
        {kind === 'dinner' ? 'Dinner goes back to 0 of ' + state.entitled + ' served so the right counter can serve again. Earlier records stay in the log.' : 'Entry is cleared. The party will need to check in again.'}
      </p>
      {showAlso && (
        <div style={{ margin: '0 16px', borderRadius: 14, background: 'var(--warn-bg)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="alert" size="m" style={{ color: 'var(--warn-text)' }} />
          <span className="t-sub grow">{state.served} of {state.entitled} served. Reset dinner too?</span>
          <Switch on={also} onChange={setAlso} label="Also reset dinner" />
        </div>
      )}
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
        <Btn kind="destructive-fill" icon="wrench" disabled={!reason || busy} onClick={apply}>
          {kind === 'dinner' ? 'Reset dinner' : both ? 'Reset entry and dinner' : 'Reset entry'}
        </Btn>
      </div>
      <div className="t-cap muted px5 center">
        Logged as {session?.name} ({session?.role}). Corrections are saved to the audit log.
      </div>
    </Sheet>
  )
}
