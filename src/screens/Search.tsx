import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionToast } from '../components/ActionToast.tsx'
import { Screen } from '../components/layout.tsx'
import { ResultFlow, type Flow } from '../components/ResultFlow.tsx'
import { Btn, Chip, Icon, Sheet } from '../components/ui.tsx'
import { Wheel } from '../components/Wheel.tsx'
import { schoolShort } from '../lib/config.ts'
import { plural } from '../lib/format.ts'
import { useRoster } from '../lib/hooks.ts'
import { prefs } from '../lib/prefs.ts'
import type { Party } from '../lib/types.ts'
import type { PartyState } from '../lib/state.ts'

const LIMIT = 60

function rowChip(mode: 'entry' | 'dinner', s: PartyState) {
  if (mode === 'entry') return s.entered ? { kind: 'ok' as const, icon: 'login' as const, label: 'Checked in' } : { kind: 'neutral' as const, icon: 'clock' as const, label: 'Not arrived' }
  if (!s.entered) return { kind: 'warn' as const, icon: 'alert' as const, label: 'Not in' }
  if (s.remaining <= 0) return { kind: 'neutral' as const, icon: 'check' as const, label: 'Served' }
  return { kind: 'ok' as const, icon: 'check-circle' as const, label: s.remaining + ' left' }
}

export function SearchScreen() {
  const mode = prefs.use().mode
  const roster = useRoster()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [batch, setBatch] = useState<number | null>(null)
  const [notIn, setNotIn] = useState(false)
  const [notServed, setNotServed] = useState(false)
  const [wheel, setWheel] = useState(false)
  const [flow, setFlow] = useState<Flow | null>(null)

  const years = useMemo(() => [...new Set((roster?.parties ?? []).map((p) => p.batchYear))].sort((a, b) => a - b), [roster])

  const results = useMemo(() => {
    if (!roster) return []
    const needle = q.trim().toLowerCase()
    const code = needle.replace(/[^a-z0-9]/g, '')
    const hit = (p: Party) => !needle || p.nameLc.includes(needle) || (code.length >= 4 && p.passCode.toLowerCase().replace('-', '').includes(code))
    return roster.parties
      .filter((p) => hit(p) && (batch === null || p.batchYear === batch))
      .filter((p) => {
        const s = roster.states.get(p.id)!
        return (!notIn || !s.entered) && (!notServed || s.remaining > 0)
      })
      .sort((a, b) => a.nameLc.localeCompare(b.nameLc))
  }, [roster, q, batch, notIn, notServed])

  const filtered = q.trim() !== '' || batch !== null || notIn || notServed
  const shown = results.slice(0, LIMIT)

  return (
    <Screen title="Search">
      <div className="px" style={{ paddingBottom: 12 }}>
        <label className="search">
          <Icon name="search" size="m" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Guest name or pass code" aria-label="Search by guest name or pass code" autoCapitalize="words" autoCorrect="off" enterKeyHint="search" />
        </label>
      </div>
      <div className="fchips scroll-x" style={{ paddingBottom: 14 }}>
        <button type="button" className={'fchip' + (batch !== null ? ' on' : '')} aria-haspopup="dialog" onClick={() => setWheel(true)}>
          {batch !== null ? 'Batch ' + batch : 'Batch year'}
          <Icon name="chev-d" size="s" />
        </button>
        <button type="button" className={'fchip' + (notIn ? ' on' : '')} aria-pressed={notIn} onClick={() => setNotIn(!notIn)}>
          Not checked in
        </button>
        <button type="button" className={'fchip' + (notServed ? ' on' : '')} aria-pressed={notServed} onClick={() => setNotServed(!notServed)}>
          Not served
        </button>
      </div>

      {roster && results.length > 0 && (
        <>
          <div className="gh-h">
            {plural(results.length, 'guest')} · tap to open
          </div>
          <div className="group">
            {shown.map((p) => {
              const c = rowChip(mode, roster.states.get(p.id)!)
              return (
                <button key={p.id} type="button" className="rrow" onClick={() => setFlow({ kind: 'guest', partyId: p.id, method: 'search' })}>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="nm">{p.leadName}</span>
                    <span className="meta ellipsis">
                      {p.batchYear} · {schoolShort(p.school)} · <span className="mono">••••{p.mobileLast4}</span>
                    </span>
                  </div>
                  <Chip kind={c.kind} icon={c.icon}>{c.label}</Chip>
                  <Icon name="chev-r" size="s" className="chev" style={{ color: 'var(--text2)', opacity: 0.7 }} />
                </button>
              )
            })}
          </div>
          <div className="gh-f">
            {results.length > LIMIT ? 'Showing the first ' + LIMIT + '. Type more of the name to narrow it down. ' : ''}Only the last 4 digits of a mobile number are shown. Ask the guest to confirm them.
          </div>
        </>
      )}

      {roster && results.length === 0 && (
        <div className="empty" style={{ paddingTop: 48 }}>
          <h2 style={{ fontSize: 22, lineHeight: 28 + 'px' }}>
            {q.trim() ? 'No one matches “' + q.trim() + '”' : 'No one matches these filters'}
          </h2>
          <p className="t-body muted">
            {batch !== null ? 'in the batch of ' + batch + '. ' : ''}Check the spelling, or ask the guest for their batch year.
          </p>
          <div className="stack g2" style={{ width: '100%', marginTop: 12 }}>
            {filtered && (
              <Btn kind="secondary" onClick={() => { setBatch(null); setNotIn(false); setNotServed(false); setQ('') }}>
                Clear filters
              </Btn>
            )}
            <Btn icon="user-plus" onClick={() => navigate('/register', { replace: true })}>Register on the spot</Btn>
          </div>
        </div>
      )}

      <ActionToast hidden={!!flow || wheel} />
      {flow && <ResultFlow flow={flow} mode={mode} onClose={() => setFlow(null)} />}
      {wheel && (
        <BatchSheet
          years={years}
          current={batch}
          count={(y) => (roster ? roster.parties.filter((p) => p.batchYear === y && (!q.trim() || p.nameLc.includes(q.trim().toLowerCase()))).length : 0)}
          onClose={() => setWheel(false)}
          onPick={(y) => { setBatch(y); setWheel(false) }}
        />
      )}
    </Screen>
  )
}

function BatchSheet({ years, current, count, onPick, onClose }: { years: number[]; current: number | null; count: (y: number) => number; onPick: (y: number | null) => void; onClose: () => void }) {
  const items = ['Any batch year', ...years.map(String)]
  const [i, setI] = useState(current === null ? 0 : Math.max(0, years.indexOf(current) + 1))
  const year = i === 0 ? null : years[i - 1]!
  return (
    <Sheet title="Batch year" onClose={onClose}>
      <Wheel items={items} index={i} onChange={setI} label="Batch year" />
      <div className="px">
        <Btn onClick={() => onPick(year)}>{year === null ? 'Show all batches' : 'Show ' + plural(count(year), 'guest') + ' from ' + year}</Btn>
      </div>
    </Sheet>
  )
}
