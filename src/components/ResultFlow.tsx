import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UNDO_WINDOW_S } from '../lib/config.ts'
import { counterLabel } from '../lib/counters.ts'
import { ago, firstName, fmtTime, partyDesc, plural, vibrate } from '../lib/format.ts'
import { checkIn } from '../lib/actions.ts'
import { usePartyView, useNow } from '../lib/hooks.ts'
import { leaveLayers } from '../lib/layers.ts'
import { prefs } from '../lib/prefs.ts'
import { liveEvents } from '../lib/state.ts'
import { ui } from '../lib/ui.ts'
import type { Method } from '../lib/types.ts'
import { Btn, Chip, Kv, ResultHead, Sheet, Stepper } from './ui.tsx'

export type Flow = { kind: 'guest'; partyId: string; method: Method } | { kind: 'unrec' } | { kind: 'notfound'; code?: string }

type Kind = 'entry' | 'entryDone' | 'unrec' | 'notfound'

const TITLES: Record<Kind, string> = { entry: 'Entry', entryDone: 'Entry', unrec: 'Entry', notfound: 'Not found' }
const BUZZ: Partial<Record<Kind, 'ok' | 'warn' | 'bad'>> = { entry: 'ok', entryDone: 'ok', unrec: 'warn' }

/** The scan result sheet. One Sheet instance for every state, so it never re-animates or re-pushes history. */
export function ResultFlow({ flow, onClose, onEnterCode }: { flow: Flow; onClose: () => void; onEnterCode?: () => void }) {
  const navigate = useNavigate()
  const { session, rosterAt } = prefs.use()
  const view = usePartyView(flow.kind === 'guest' ? flow.partyId : null)
  const [entryN, setEntryN] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const now = useNow(1000)

  let kind: Kind | null = null
  if (flow.kind === 'unrec') kind = 'unrec'
  else if (flow.kind === 'notfound' || view === null) kind = 'notfound'
  else if (view) kind = view.state.entered ? 'entryDone' : 'entry'

  useEffect(() => {
    const b = kind && BUZZ[kind]
    if (b) vibrate(b)
  }, [kind])

  if (!kind) return null
  const party = view?.party
  const state = view?.state
  const go = (to: string) => leaveLayers(() => navigate(to))

  const doCheckIn = async (qty: number) => {
    if (!party || busy) return
    setBusy(true)
    try {
      const event = await checkIn(party.id, qty, flow.kind === 'guest' ? flow.method : 'search')
      ui.set({ last: { eventId: event.id, partyId: party.id, title: 'Welcome back, ' + firstName(party.leadName) + '!', sub: (qty === party.partySize ? 'Party of ' + qty : plural(qty, 'person', 'people')) + ' checked in', until: event.clientAt + UNDO_WINDOW_S * 1000 } })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const guest = party && state && (
    <div className="px5 stack" style={{ gap: 4 }}>
      <h3 className="gname">{party.leadName}</h3>
      <span className="gmeta">Batch of {party.batchYear} · {party.course}</span>
      <span className="gmeta">{party.school}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <Chip icon="users">{party.spouse === 'maybe' ? 'Party of up to ' + party.partySize : 'Party of ' + party.partySize + ' · ' + partyDesc(party.spouse, party.children)}</Chip>
        {party.spouse === 'maybe' && <Chip icon="help">Spouse: Maybe</Chip>}
        <Chip icon="phone" className="mono">••••{party.mobileLast4}</Chip>
      </div>
    </div>
  )

  const entryEvent = view ? liveEvents(view.events).sort((a, b) => a.clientAt - b.clientAt)[0] : undefined

  const details = party && (
    <button type="button" className="navbtn" onClick={() => go('/guest/' + party.id)}>
      Details
    </button>
  )

  return (
    <Sheet title={TITLES[kind]} onClose={onClose} action={details}>
      {kind === 'entry' && party && state && (
        <>
          <ResultHead kind="ok" icon="check-circle" label="Valid" sub={party.spouse === 'maybe' ? 'Entry · allowed in' : 'Entry · welcome back to campus'} />
          {guest}
          <p className="t-sub muted px5" style={{ margin: 0 }}>
            {party.spouse === 'maybe' ? 'A “Maybe” spouse is still welcome. Check in whoever is here now.' : 'Checks in everyone on this pass.'}
          </p>
          {party.partySize > 1 && (
            <div className="px5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="stack">
                <span className="t-head">Checking in now</span>
                <span className="t-sub muted">Counts toward the headcount</span>
              </div>
              <Stepper value={entryN ?? party.partySize} min={1} max={party.partySize} onChange={setEntryN} label="People checking in now" />
            </div>
          )}
          <div className="btns">
            <Btn icon="login" onClick={() => doCheckIn(entryN ?? party.partySize)} disabled={busy}>{(entryN ?? party.partySize) === party.partySize ? 'Check in party of ' + party.partySize : 'Check in ' + (entryN ?? party.partySize)}</Btn>
            {party.spouse === 'maybe' && (
              <Btn kind="secondary" onClick={() => doCheckIn(1)} disabled={busy}>Check in {firstName(party.leadName)} only</Btn>
            )}
            <Btn kind="plain" onClick={onClose}>Not now</Btn>
          </div>
        </>
      )}

      {kind === 'entryDone' && party && state && (
        <>
          <ResultHead kind="ok" icon="check-circle" label="Already checked in" sub="Wave them through" />
          {guest}
          <div className="group">
            <Kv k="When" v={state.enteredAt ? fmtTime(state.enteredAt) + ' · ' + ago(state.enteredAt, now) : '—'} />
            <Kv k="Where" v={entryEvent ? counterLabel(entryEvent.counter) : '—'} />
            <Kv k="Checked in by" v={entryEvent ? (entryEvent.actorId === session?.actorId ? 'You' : entryEvent.actorName) : '—'} />
          </div>
          <div className="px">
            <Btn icon="scan" onClick={onClose}>Scan next</Btn>
          </div>
        </>
      )}

      {kind === 'unrec' && (
        <>
          <ResultHead kind="warn" icon="alert" label="Not a Homecoming pass" sub="Unrecognised QR code" />
          <p className="t-body px5" style={{ margin: 0 }}>This QR isn’t one of ours. It may be a payment or website code. Ask the guest to open their Homecoming pass.</p>
          <div className="t-sub muted px5">Homecoming passes have a code like GH26-7K4Q printed under the QR.</div>
          <div className="btns">
            <Btn icon="scan" onClick={onClose}>Scan again</Btn>
            <Btn kind="secondary" icon="keyboard" onClick={onEnterCode}>Enter code instead</Btn>
          </div>
        </>
      )}

      {kind === 'notfound' && (
        <>
          <ResultHead kind="neutral" icon="help" label="Pass not found" sub={flow.kind === 'notfound' && flow.code ? 'Code ' + flow.code : 'Unknown pass'} />
          <p className="t-body px5" style={{ margin: 0 }}>
            This code isn’t in the guest list on this phone. {rosterAt ? 'The list was last updated at ' + fmtTime(rosterAt) + '.' : ''} If the pass is new, search by name or wait for sync.
          </p>
          <div className="btns">
            <Btn icon="search" onClick={() => go('/search')}>Search by name</Btn>
            <Btn kind="secondary" icon="user-plus" onClick={() => go('/register')}>Register on the spot</Btn>
            <Btn kind="plain" onClick={onClose}>Scan again</Btn>
          </div>
        </>
      )}
    </Sheet>
  )
}
