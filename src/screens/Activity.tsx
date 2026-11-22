import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/layout.tsx'
import { UndoSheet } from '../components/UndoSheet.tsx'
import { Alert, Banner, Btn, Chip, Empty, Icon } from '../components/ui.tsx'
import { UNDO_WINDOW_S, counterLabel } from '../lib/config.ts'
import { db } from '../lib/db.ts'
import { fmtTime, mmss } from '../lib/format.ts'
import { useNow, usePendingIds, useRoster, useSyncStatus } from '../lib/hooks.ts'
import { prefs } from '../lib/prefs.ts'
import { retryFailed } from '../lib/sync.ts'
import { undoSecondsLeft, undoStatus } from '../lib/undo.ts'
import { hasRole, type ScanEvent } from '../lib/types.ts'

export function ActivityScreen() {
  const roster = useRoster()
  const p = prefs.use()
  const status = useSyncStatus()
  const pendingIds = usePendingIds()
  const failed = useLiveQuery(() => db.outbox.filter((i) => !!i.lastError).toArray(), []) ?? []
  const now = useNow(1000)
  const navigate = useNavigate()
  const [undoEvt, setUndoEvt] = useState<ScanEvent | null>(null)
  const [expired, setExpired] = useState(false)

  const { mine, voids, voided } = useMemo(() => {
    const evs = roster?.events ?? []
    const voidsBy = new Map<string, ScanEvent>()
    for (const e of evs) if (e.action === 'void' && e.voidsEventId) voidsBy.set(e.voidsEventId, e)
    return {
      mine: evs.filter((e) => e.deviceId === p.deviceId && e.action === 'pass').sort((a, b) => b.clientAt - a.clientAt),
      voids: voidsBy,
      voided: new Set(voidsBy.keys()),
    }
  }, [roster, p.deviceId])

  if (!roster) return <Screen title="Activity"><span /></Screen>

  const staff = hasRole(p.session, 'staff')
  const waiting = mine.filter((e) => pendingIds.has(e.id))
  const synced = mine.filter((e) => !pendingIds.has(e.id))
  const errFor = (id: string) => failed.find((f) => f.id === id)?.lastError

  const row = (e: ScanEvent) => {
    const party = roster.byId.get(e.partyId)
    const name = party?.leadName ?? 'Unknown guest'
    const v = voids.get(e.id)
    const st = undoStatus(e, p.session, voided, now)
    const left = undoSecondsLeft(e, now)
    const isServe = e.checkpoint === 'dinner'
    const meta = fmtTime(e.clientAt) + ' · ' + (v ? 'undone: ' + (v.reason ?? '').toLowerCase() : isServe ? counterLabel(e.counter) : 'party of ' + e.qty)
    return (
      <div key={e.id} className={'rrow' + (v ? ' struck' : '')}>
        <div className="lead lead36" style={{ background: 'var(--tint-bg)', color: 'var(--tint)' }}>
          <Icon name={isServe ? 'utensils' : 'login'} size="m" />
        </div>
        <div className="grow stack" style={{ gap: 2 }}>
          <span className="nm" style={{ whiteSpace: 'normal' }}>{(isServe ? 'Served ' + e.qty : 'Checked in') + ' · ' + name}</span>
          <span className="meta" style={{ whiteSpace: 'normal' }}>
            {meta}
            {errFor(e.id) ? ' · ' + errFor(e.id) : ''}
          </span>
        </div>
        {errFor(e.id) && <Chip kind="warn" icon="alert">Not sent</Chip>}
        {st === 'open' && (
          <Btn sm auto icon="undo" onClick={() => setUndoEvt(e)}>
            {staff ? 'Undo' : 'Undo ' + mmss(left)}
          </Btn>
        )}
        {st === 'closed' && (
          <button type="button" className="t-sub muted nowrap" onClick={() => setExpired(true)}>
            Undo closed
          </button>
        )}
      </div>
    )
  }

  const undoParty = undoEvt ? roster.byId.get(undoEvt.partyId) : null
  const undoState = undoEvt ? roster.states.get(undoEvt.partyId) : null

  return (
    <Screen title="Activity">
      {status.failed > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Banner kind="warn" icon="alert" title={status.failed + ' changes couldn’t sync'} action={<Btn sm auto onClick={() => void retryFailed()}>Try again</Btn>}>
            They’re safe on this phone. We’ll keep trying.
          </Banner>
        </div>
      )}
      {mine.length === 0 ? (
        <Empty icon="history" title="No scans yet" body="Guests you check in or serve will show up here. You can undo anything from this list.">
          <Btn icon="scan" onClick={() => navigate('/scan', { replace: true })}>Start scanning</Btn>
        </Empty>
      ) : (
        <>
          {waiting.length > 0 && (
            <>
              <div className="gh-h">Waiting to sync · {waiting.length}</div>
              <div className="group" style={{ marginBottom: 20 }}>{waiting.map(row)}</div>
            </>
          )}
          {synced.length > 0 && (
            <>
              <div className="gh-h">{waiting.length ? 'Synced' : 'Today · ' + counterLabel(p.counter ?? '')}</div>
              <div className="group">{synced.map(row)}</div>
            </>
          )}
          <div className="gh-f">
            {staff ? 'Staff can undo any scan. ' : 'Undo is open for ' + UNDO_WINDOW_S + ' seconds after each scan. '}Undo always asks for a reason.
          </div>
        </>
      )}

      {undoEvt && undoParty && undoState && (
        <UndoSheet event={undoEvt} who={undoParty.leadName} detail={undoState.served + ' of ' + undoState.entitled + ' served'} onClose={() => setUndoEvt(null)} onUndone={() => setUndoEvt(null)} />
      )}
      {expired && (
        <Alert
          title="Undo expired"
          body={'Undo is open for ' + UNDO_WINDOW_S + ' seconds. To change this one, ask a staff member.'}
          onClose={() => setExpired(false)}
          actions={[{ label: 'OK', kind: 'bold', onClick: () => setExpired(false) }]}
        />
      )}
    </Screen>
  )
}
