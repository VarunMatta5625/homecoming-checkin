import { useEffect, useState } from 'react'
import { backend } from '../backend/index.ts'
import type { AuditEntry, AuditPage } from '../backend/types.ts'
import { Banner, Btn, Empty, Group, Icon, Sheet } from '../components/ui.tsx'
import { auditLine, clearPhraseMatches, CLEAR_PHRASE } from '../lib/audit.ts'
import { counterLabel } from '../lib/counters.ts'
import { fmtDateTime } from '../lib/format.ts'
import { Page } from './Admin.tsx'

const TONE = {
  neutral: { background: 'var(--tint-bg)', color: 'var(--tint)' },
  warn: { background: 'var(--warn-bg)', color: 'var(--warn-text)' },
  bad: { background: 'var(--bad-bg)', color: 'var(--bad-text)' },
} as const

const PAGE = 100

/** Admin: everything the server has logged, newest first, from the start (or from the last clear) to now. */
export function AuditScreen() {
  const [page, setPage] = useState<AuditPage | null>(null)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  const load = async (after?: AuditEntry) => {
    setLoading(true)
    setError(null)
    try {
      const p = await backend.auditFeed(after ? { atUs: after.atUs, key: after.key } : undefined)
      setPage(p)
      setEntries((prev) => (after ? [...prev, ...p.entries] : p.entries))
      setMore(p.entries.length === PAGE)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the audit log. Check your signal and try again.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  return (
    <Page title="Audit log">
      <Banner kind="info" icon="history">
        {page?.since ? 'Showing activity since ' + fmtDateTime(page.since) + ', when the log was cleared. Older records are kept in the database.' : 'Showing everything from the start: check-ins, undos, edits, imports, contact lookups and changes to who can sign in.'}
      </Banner>
      {error && <div className="err-msg" style={{ marginTop: 12 }}><Icon name="alert" size="s" />{error}</div>}
      <div style={{ height: 16 }} />
      {page && entries.length === 0 && !error && <Empty icon="history" title="Nothing logged yet" body="Check-ins, undos and changes will show up here with who did them and why." />}
      {entries.length > 0 && (
        <div className="group">
          {entries.map((e) => {
            const l = auditLine(e, counterLabel)
            return (
              <div key={e.key} className="rrow vtop">
                <div className="lead lead36" style={TONE[l.tone]}><Icon name={l.icon} size="m" /></div>
                <div className="grow stack" style={{ gap: 2 }}>
                  <span className="nm" style={{ whiteSpace: 'normal' }}>{l.title}</span>
                  <span className="meta" style={{ whiteSpace: 'normal' }}>{fmtDateTime(e.atUs / 1000)} · {e.actor}</span>
                  {l.detail && <span className="meta" style={{ whiteSpace: 'normal' }}>{l.detail}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {loading && !entries.length && <p className="t-cap muted center">Loading…</p>}
      {more && (
        <div className="px stack g2" style={{ marginTop: 16 }}>
          <Btn kind="secondary" disabled={loading} onClick={() => void load(entries[entries.length - 1])}>{loading ? 'Loading…' : 'Show older'}</Btn>
        </div>
      )}

      <Group header="Before the event" style={{ marginTop: 28 }} footer="Clear the log after the rehearsals so it only shows event activity. Nothing is deleted from the database. Once the event is live, the log can no longer be cleared.">
        <div className="px stack g2" style={{ padding: 16 }}>
          <Btn kind="destructive" icon="history" onClick={() => setClearing(true)}>Clear the audit log…</Btn>
        </div>
      </Group>
      <div style={{ height: 32 }} />

      {clearing && <ClearSheet onClose={() => setClearing(false)} onCleared={() => { setClearing(false); void load() }} />}
    </Page>
  )
}

function ClearSheet({ onClose, onCleared }: { onClose: () => void; onCleared: () => void }) {
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = reason.trim().length >= 3 && clearPhraseMatches(typed)
  const run = async () => {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      await backend.clearAuditLog(reason.trim())
      onCleared()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t clear the log. Check your signal and try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      title="Clear the audit log?"
      onClose={() => !busy && onClose()}
      footer={<Btn kind="destructive-fill" disabled={!ok || busy} onClick={() => void run()}>{busy ? 'Clearing…' : 'Clear the log'}</Btn>}
    >
      <div className="px5 stack g2">
        <span className="t-body">The log starts again from now. Everything before stays in the database but is no longer shown here. The clear itself is the first line of the new log.</span>
      </div>
      <Group header="Why" style={{ marginTop: 12 }}>
        <label className="cell"><span style={{ width: 80, flex: 'none' }}>Reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: rehearsal over" maxLength={140} /></label>
      </Group>
      <div className="px5 stack g2" style={{ marginTop: 12 }}>
        <span className="t-body">To confirm, type <b>{CLEAR_PHRASE}</b> below.</span>
      </div>
      <Group style={{ marginTop: 12 }}>
        <label className="cell"><input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type the sentence to confirm" autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} style={{ textAlign: 'left' }} /></label>
      </Group>
      {error && <div className="err-msg"><Icon name="alert" size="s" />{error}</div>}
    </Sheet>
  )
}
