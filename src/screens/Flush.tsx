import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../backend/index.ts'
import type { FlushPreview, FlushResult } from '../backend/types.ts'
import { Banner, Btn, Group, Icon, Sheet, Switch } from '../components/ui.tsx'
import { counterLabel } from '../lib/counters.ts'
import { flushPhrase, phraseMatches } from '../lib/flush.ts'
import { ago, plural } from '../lib/format.ts'
import { useSyncStatus } from '../lib/hooks.ts'
import { checkOnline } from '../lib/sync.ts'
import { Page } from './Admin.tsx'

/** Admin, Danger zone: undo every check-in so everyone counts as not arrived again. Registrations stay. */
export function FlushScreen() {
  const navigate = useNavigate()
  const status = useSyncStatus()
  const [pre, setPre] = useState<FlushPreview | null>(null)
  const [removeOnSpot, setRemoveOnSpot] = useState(false)
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<FlushResult | null>(null)

  useEffect(() => {
    let live = true
    backend
      .flushPreview()
      .then((p) => live && setPre(p))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Couldn’t load the numbers. Check your signal and try again.'))
    return () => {
      live = false
    }
  }, [])

  const reasonOk = reason.trim().length >= 3
  // Items the server already refused stay in the outbox but are never sent again, so they can't check anyone in after a flush.
  const unsynced = status.pending - status.failed > 0
  const canOpen = !!pre && reasonOk && !unsynced && !busy
  const canFlush = canOpen && phraseMatches(typed, pre.checkedIn)

  const run = async () => {
    if (!canFlush || !pre) return
    setBusy(true)
    setError(null)
    try {
      setDone(await backend.flushCheckins({ reason: reason.trim(), removeOnSpot }))
      setConfirm(false)
      setTyped('')
      void checkOnline() // pull the undos onto this phone now
    } catch (e) {
      setConfirm(false)
      setError(e instanceof Error ? e.message : 'Couldn’t flush. Check your signal and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <Page title="Flush check-ins">
        <Banner kind="info" icon="check-circle" title="Flushed">
          {plural(done.voided, 'check-in')} undone{done.removedOnSpot ? ', ' + plural(done.removedOnSpot, 'on-spot guest') + ' removed' : ''}. Other phones update within about 15 seconds. If a phone was offline during the flush, run it again once that phone has synced.
        </Banner>
        <div className="px stack g2" style={{ marginTop: 16 }}>
          <Btn onClick={() => navigate('/stats', { replace: true })}>Done</Btn>
        </div>
      </Page>
    )

  return (
    <Page title="Flush check-ins">
      <Banner kind="warn" icon="alert" title="Fresh start">
        Everyone who is checked in goes back to not arrived. Registrations stay. Every check-in is undone in the log, which can’t be reversed from the app.
      </Banner>

      {unsynced && (
        <div style={{ marginTop: 12 }}>
          <Banner kind="warn" icon="wifi-off" title="This phone has unsent changes" action={<Btn sm auto onClick={() => void checkOnline()}>Sync now</Btn>}>
            Send them first. Anything still waiting would check guests in again after the flush.
          </Banner>
        </div>
      )}
      {status.failed > 0 && !unsynced && (
        <div style={{ marginTop: 12 }}>
          <Banner kind="info" icon="info">{plural(status.failed, 'change')} on this phone {status.failed === 1 ? 'was' : 'were'} refused by the server earlier and won’t be sent. That doesn’t affect a flush.</Banner>
        </div>
      )}
      {!!pre?.phones.length && (
        <div style={{ marginTop: 12 }}>
          <Banner kind="warn" icon="phone" title={plural(pre.phones.length, 'other phone') + ' still ' + (pre.phones.length === 1 ? 'has' : 'have') + ' unsent scans'}>
            {pre.phones.map((p) => counterLabel(p.counter ?? '') + ' (' + ago(p.lastSyncAt) + ')').join(', ')}. Ask them to sync first, or run the flush again afterwards.
          </Banner>
        </div>
      )}

      <Group header="What will happen" style={{ marginTop: 20 }}>
        <div className="cell"><span className="grow">Checked in now</span><span className="val num">{pre ? plural(pre.checkedIn, 'party', 'parties') + ' · ' + plural(pre.people, 'person', 'people') : '…'}</span></div>
        <div className="cell"><span className="grow">On-spot guests</span><span className="val num">{pre ? pre.onSpot : '…'}</span></div>
        <div className="cell">
          <span className="grow">Also remove on-spot guests</span>
          <Switch on={removeOnSpot} onChange={setRemoveOnSpot} label="Also remove on-spot guests" />
        </div>
      </Group>
      <div className="gh-f">Off: on-spot guests stay on the list as not arrived. On: they are removed from every phone, like guests retired by a list replace.</div>

      <Group header="Why" style={{ marginTop: 20 }} footer="Saved in the audit log.">
        <label className="cell"><span style={{ width: 80, flex: 'none' }}>Reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: rehearsal over" maxLength={140} /></label>
      </Group>

      {error && <div className="err-msg" style={{ marginTop: 12 }}><Icon name="alert" size="s" />{error}</div>}

      <div className="px stack g2" style={{ marginTop: 20 }}>
        <Btn kind="destructive" disabled={!canOpen} onClick={() => { setTyped(''); setConfirm(true) }}>Flush all check-ins…</Btn>
      </div>

      {confirm && pre && (
        <Sheet
          title="Are you absolutely sure?"
          onClose={() => !busy && setConfirm(false)}
          footer={<Btn kind="destructive-fill" disabled={!canFlush} onClick={() => void run()}>{busy ? 'Flushing…' : 'I understand, flush check-ins'}</Btn>}
        >
          <div className="px5 stack g2">
            <span className="t-body">
              This undoes {plural(pre.checkedIn, 'check-in')} ({plural(pre.people, 'person', 'people')}){removeOnSpot ? ' and removes ' + plural(pre.onSpot, 'on-spot guest') : ''}. It can’t be undone from the app.
            </span>
            <span className="t-body">To confirm, type <b>{flushPhrase(pre.checkedIn)}</b> below.</span>
          </div>
          <Group style={{ marginTop: 12 }}>
            <label className="cell"><input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type the sentence to confirm" autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} style={{ textAlign: 'left' }} /></label>
          </Group>
        </Sheet>
      )}
    </Page>
  )
}
