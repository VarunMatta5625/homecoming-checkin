import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UNDO_WINDOW_S } from '../lib/config.ts'
import { counterLabel } from '../lib/counters.ts'
import { ago, firstName, fmtTime, mmss, partyDesc, plural, vibrate } from '../lib/format.ts'
import { checkIn, serveDinner, shortName } from '../lib/actions.ts'
import { usePartyView, useNow } from '../lib/hooks.ts'
import { leaveLayers } from '../lib/layers.ts'
import { prefs } from '../lib/prefs.ts'
import { liveEvents } from '../lib/state.ts'
import { ui } from '../lib/ui.ts'
import { undoSecondsLeft } from '../lib/undo.ts'
import { hasRole, type Method, type ScanEvent } from '../lib/types.ts'
import { Btn, Chip, Kv, PartyCounter, ResultHead, Sheet, Stepper } from './ui.tsx'
import { UndoSheet } from './UndoSheet.tsx'

export type Flow = { kind: 'guest'; partyId: string; method: Method } | { kind: 'unrec' } | { kind: 'notfound'; code?: string }

type Kind = 'valid' | 'nocheck' | 'served' | 'flagged' | 'done' | 'entry' | 'entryDone' | 'unrec' | 'notfound'

const TITLES: Record<Kind, string> = { valid: 'Dinner', nocheck: 'Dinner', served: 'Dinner', flagged: 'Dinner', done: 'Done', entry: 'Entry', entryDone: 'Entry', unrec: 'Entry', notfound: 'Not found' }
const BUZZ: Partial<Record<Kind, 'ok' | 'warn' | 'bad'>> = { valid: 'ok', entry: 'ok', entryDone: 'ok', nocheck: 'warn', flagged: 'warn', unrec: 'warn', served: 'bad' }

/** The scan result sheet. One Sheet instance for every state, so it never re-animates or re-pushes history. */
export function ResultFlow({ flow, mode, onClose, onEnterCode }: { flow: Flow; mode: 'entry' | 'dinner'; onClose: () => void; onEnterCode?: () => void }) {
  const navigate = useNavigate()
  const { session, rosterAt } = prefs.use()
  const view = usePartyView(flow.kind === 'guest' ? flow.partyId : null)
  const [userN, setUserN] = useState<number | null>(null)
  const [entryN, setEntryN] = useState<number | null>(null)
  const [done, setDone] = useState<{ event: ScanEvent; qty: number } | null>(null)
  const [undo, setUndo] = useState(false)
  const [busy, setBusy] = useState(false)
  const now = useNow(1000)

  let kind: Kind | null = null
  if (flow.kind === 'unrec') kind = 'unrec'
  else if (flow.kind === 'notfound' || view === null) kind = 'notfound'
  else if (view) {
    const s = view.state
    if (done) kind = 'done'
    else if (mode === 'entry') kind = s.entered ? 'entryDone' : 'entry'
    else if (!s.entered) kind = 'nocheck'
    else if (s.remaining <= 0) kind = s.overServed ? 'flagged' : 'served'
    else kind = 'valid'
  }

  useEffect(() => {
    const b = kind && BUZZ[kind]
    if (b) vibrate(b)
  }, [kind])

  if (!kind) return null
  const party = view?.party
  const state = view?.state
  const n = state ? Math.min(userN ?? state.remaining, state.remaining) : 1
  const go = (to: string) => leaveLayers(() => navigate(to))

  const doServe = async () => {
    if (!party || !state || busy) return
    setBusy(true)
    try {
      const event = await serveDinner(party.id, n, flow.kind === 'guest' ? flow.method : 'search')
      ui.set({ last: { eventId: event.id, partyId: party.id, title: 'Served ' + n + ' · ' + shortName(party.leadName), sub: state.served + n + ' of ' + state.entitled + ' served', until: event.clientAt + UNDO_WINDOW_S * 1000 } })
      setDone({ event, qty: n })
    } finally {
      setBusy(false)
    }
  }

  const doCheckIn = async (qty: number) => {
    if (!party || !state || busy) return
    setBusy(true)
    try {
      const event = await checkIn(party.id, qty, flow.kind === 'guest' ? flow.method : 'search')
      if (mode === 'entry') {
        ui.set({ last: { eventId: event.id, partyId: party.id, title: 'Welcome back, ' + firstName(party.leadName) + '!', sub: (qty === party.partySize ? 'Party of ' + qty : plural(qty, 'person', 'people')) + ' checked in', until: event.clientAt + UNDO_WINDOW_S * 1000 } })
        onClose()
      }
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

  const live = view ? liveEvents(view.events).sort((a, b) => a.clientAt - b.clientAt) : []
  const dinnerEvents = live.filter((e) => e.checkpoint === 'dinner')
  const lastDinner = dinnerEvents[dinnerEvents.length - 1]
  const entryEvent = live.find((e) => e.checkpoint === 'entry')

  const details = party && kind !== 'done' && (
    <button type="button" className="navbtn" onClick={() => go('/guest/' + party.id)}>
      Details
    </button>
  )

  if (undo && done && party && state) {
    return <UndoSheet event={done.event} who={party.leadName} detail={state.served + ' of ' + state.entitled + ' served'} onClose={() => setUndo(false)} onUndone={() => { ui.set({ last: null }); onClose() }} />
  }

  const left = done ? undoSecondsLeft(done.event, now) : 0
  const canUndoDone = !!done && (hasRole(session, 'staff') || left > 0)

  return (
    <Sheet title={TITLES[kind]} onClose={onClose} action={details}>
      {kind === 'valid' && party && state && (
        <>
          <ResultHead kind="ok" icon="check-circle" label="Valid" sub={'Dinner · checked in ' + (state.enteredAt ? fmtTime(state.enteredAt) : '')} />
          {guest}
          <div style={{ margin: '0 16px', padding: '14px 16px', borderRadius: 14, background: 'var(--fill2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PartyCounter total={state.entitled} served={state.served} now={n} />
            {party.spouse === 'maybe' && <span className="t-cap muted">A “Maybe” spouse is welcome. Serve them if they’re here.</span>}
          </div>
          <div className="px5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="stack">
              <span className="t-head">Serve now</span>
              <span className="t-sub muted">Up to {state.remaining}</span>
            </div>
            <Stepper value={n} min={1} max={state.remaining} onChange={setUserN} label="How many to serve now" />
          </div>
          <div className="px">
            <Btn icon="utensils" onClick={doServe} disabled={busy}>Serve {n}</Btn>
          </div>
        </>
      )}

      {kind === 'nocheck' && party && state && (
        <>
          <ResultHead kind="warn" icon="alert" label="Check in first" sub="No entry scan for this party" />
          {guest}
          <p className="t-body px5" style={{ margin: 0 }}>
            {firstName(party.leadName)}’s party wasn’t checked in at the gate. Check them in here, then serve. No need to scan again.
          </p>
          <div className="btns">
            <Btn icon="login" onClick={() => doCheckIn(party.partySize)} disabled={busy}>Check in now</Btn>
            <Btn kind="plain" onClick={onClose}>Not now</Btn>
          </div>
        </>
      )}

      {kind === 'served' && party && state && (
        <>
          <ResultHead kind="bad" icon="x-circle" label="Already served" sub={'All ' + state.entitled + ' meals for this party'} />
          {guest}
          <div className="group">
            <Kv k="When" v={lastDinner ? fmtTime(lastDinner.clientAt) + ' · ' + ago(lastDinner.clientAt, now) : '—'} />
            <Kv k="Where" v={lastDinner ? counterLabel(lastDinner.counter) : '—'} />
            <Kv k="Served by" v={lastDinner?.actorName ?? '—'} />
            <Kv k="Party" v={state.served + ' of ' + state.entitled + ' served'} />
          </div>
          <p className="t-sub muted px5" style={{ margin: 0 }}>If someone in the party missed their meal, ask a staff member to check.</p>
          <div className="px">
            <Btn icon="scan" onClick={onClose}>Scan next</Btn>
          </div>
        </>
      )}

      {kind === 'flagged' && party && state && (
        <>
          <ResultHead kind="warn" icon="flag" label="Heads-up" sub={'Flagged after sync · ' + plural(state.served - state.entitled, 'meal') + ' more than the party size'} />
          {guest}
          <div className="group">
            {dinnerEvents.map((e) => (
              <div key={e.id} className="kv">
                <span>{fmtTime(e.clientAt)} · {counterLabel(e.counter)}</span>
                <span style={{ textAlign: 'right' }}>{e.actorId === session?.actorId ? 'You' : e.actorName} · served {e.qty}</span>
              </div>
            ))}
          </div>
          <p className="t-sub muted px5" style={{ margin: 0 }}>More than one counter served this party. Staff have been told and will sort it out. Nothing to do here.</p>
          <div className="px">
            <Btn onClick={onClose}>OK</Btn>
          </div>
        </>
      )}

      {kind === 'done' && party && state && done && (
        <>
          <ResultHead kind="ok" icon="check-circle" label={'Served ' + done.qty} sub={'Enjoy dinner, ' + firstName(party.leadName) + '!'} />
          {guest}
          <div style={{ margin: '0 16px', padding: '14px 16px', borderRadius: 14, background: 'var(--fill2)' }}>
            <PartyCounter total={state.entitled} served={state.served} done={state.served - done.qty} now={done.qty} />
          </div>
          <div className="btns">
            <Btn icon="scan" onClick={onClose}>Scan next</Btn>
            {canUndoDone && (
              <Btn kind="plain" icon="undo" onClick={() => setUndo(true)}>
                Undo{hasRole(session, 'staff') ? '' : ' · ' + mmss(left)}
              </Btn>
            )}
          </div>
        </>
      )}

      {kind === 'entry' && party && state && (
        <>
          <ResultHead kind="ok" icon="check-circle" label="Valid" sub={party.spouse === 'maybe' ? 'Entry · allowed in' : 'Entry · welcome back to campus'} />
          {guest}
          <p className="t-sub muted px5" style={{ margin: 0 }}>
            {party.spouse === 'maybe' ? 'A “Maybe” spouse is still welcome. Check in whoever is here now.' : 'Checks in everyone on this pass. Dinner opens for all ' + party.partySize + '.'}
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

