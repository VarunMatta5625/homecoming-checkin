import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CorrectionSheet } from '../components/CorrectionSheet.tsx'
import { Empty, Btn, Chip, Group, Icon, NavBar } from '../components/ui.tsx'
import { counterLabel } from '../lib/config.ts'
import { fmtTime, parkingLabel } from '../lib/format.ts'
import { usePartyView } from '../lib/hooks.ts'
import { prefs } from '../lib/prefs.ts'
import { hasRole, type ScanEvent } from '../lib/types.ts'
import type { IconName } from '../components/sprite.ts'

function Timeline({ events, empty }: { events: ScanEvent[]; empty: string }) {
  if (!events.length) return <div className="tl"><div className="t-sub muted" style={{ padding: '12px 16px' }}>{empty}</div></div>
  return (
    <div className="tl">
      {events.map((e) => {
        const isVoid = e.action === 'void'
        const icon: IconName = isVoid ? 'undo' : e.checkpoint === 'dinner' ? 'utensils' : 'login'
        const title = isVoid ? 'Undone' : e.checkpoint === 'dinner' ? 'Served ' + e.qty : 'Checked in · ' + e.qty
        return (
          <div key={e.id} className="tl-i">
            <span className="dotc" style={{ background: isVoid ? 'var(--warn-bg)' : 'var(--fill)', color: isVoid ? 'var(--warn-text)' : 'var(--text2)' }}><Icon name={icon} size="s" /></span>
            <div className="tx">
              <span className="t-head">{title}</span>
              <span className="t-sub muted">{fmtTime(e.clientAt)} · {counterLabel(e.counter)} · {e.actorName}{isVoid && e.reason ? ' · ' + e.reason.toLowerCase() : ''}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function GuestDetailScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const view = usePartyView(id)
  const session = prefs.use().session
  const [correct, setCorrect] = useState(false)
  if (view === undefined) return null
  const back = () => (history.length > 1 ? navigate(-1) : navigate('/search', { replace: true }))
  if (view === null)
    return (
      <main className="screen" style={{ paddingTop: 0 }}>
        <div style={{ height: 'max(env(safe-area-inset-top),8px)', background: 'var(--bar)' }} />
        <NavBar back="Back" onBack={back} title="Guest" />
        <Empty icon="help" title="Guest not found" body="This guest isn’t on this phone yet. It may still be syncing." />
      </main>
    )
  const { party, events, state } = view
  const sorted = events.slice().sort((a, b) => a.clientAt - b.clientAt)
  const dinner = sorted.filter((e) => e.checkpoint === 'dinner')
  const entry = sorted.filter((e) => e.checkpoint === 'entry')
  const staff = hasRole(session, 'staff')

  return (
    <main className="screen" style={{ paddingTop: 0 }}>
      <div style={{ height: 'max(env(safe-area-inset-top),8px)', background: 'var(--bar)' }} />
      <NavBar back="Back" onBack={back} title="Guest" />
      <div className="stack" style={{ padding: '16px 20px 14px', gap: 4 }}>
        <h1 className="gname">{party.leadName}</h1>
        <span className="gmeta">Batch of {party.batchYear} · {party.course} · {party.school}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <Chip icon="users">{party.spouse === 'maybe' ? 'Party of up to ' + party.partySize : 'Party of ' + party.partySize}</Chip>
          {party.spouse === 'maybe' && <Chip icon="help">Spouse: Maybe</Chip>}
          <Chip icon={party.parking === 'two_wheeler' ? 'bike' : 'car'}>{parkingLabel(party.parking)}</Chip>
          <Chip icon="phone" className="mono">••••{party.mobileLast4}</Chip>
          {party.source === 'onspot' && <Chip kind="tint" icon="user-plus">On-spot</Chip>}
          {state.needsReview && <Chip kind="warn" icon="flag">Needs review</Chip>}
        </div>
      </div>

      <Group header="Entry">
        <div className="cell">
          <Icon name="login" size="m" style={{ color: 'var(--text2)' }} />
          <div className="stack grow" style={{ minWidth: 0 }}>
            <span>{state.entered && state.enteredAt ? 'Checked in ' + fmtTime(state.enteredAt) : 'Not checked in yet'}</span>
            {state.entered && <span className="t-sub muted">{counterLabel(state.enteredCounter ?? '')} · {state.enteredBy}</span>}
          </div>
        </div>
      </Group>
      {entry.length > 1 && <div style={{ marginTop: 12 }}><Timeline events={entry} empty="" /></div>}

      <div className="gh-h" style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between' }}>
        <span>Dinner</span>
        <span>{state.served} of {state.entitled} served</span>
      </div>
      <Timeline events={dinner} empty="No meals served yet." />

      {staff ? (
        <div className="px" style={{ paddingTop: 16 }}>
          <Btn kind="secondary" icon="wrench" onClick={() => setCorrect(true)}>Correct record</Btn>
        </div>
      ) : (
        <div className="note" style={{ marginTop: 16 }}>
          <Icon name="info" size="m" style={{ color: 'var(--text2)' }} />
          <span>Something wrong? Ask a staff member to correct it.</span>
        </div>
      )}
      {correct && <CorrectionSheet partyId={party.id} onClose={() => setCorrect(false)} />}
    </main>
  )
}
