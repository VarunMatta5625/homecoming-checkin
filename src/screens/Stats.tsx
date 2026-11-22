import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/layout.tsx'
import { Chip, Icon, Seg } from '../components/ui.tsx'
import { COUNTERS } from '../lib/config.ts'
import { ago, fmtTime, plural } from '../lib/format.ts'
import { useNow, useRoster, useSyncStatus } from '../lib/hooks.ts'
import { prefs } from '../lib/prefs.ts'
import { liveEvents } from '../lib/state.ts'

export function StatsScreen() {
  const roster = useRoster()
  const navigate = useNavigate()
  const status = useSyncStatus()
  const lastSyncAt = prefs.use().lastSyncAt
  const now = useNow(30000)
  const [view, setView] = useState<'dinner' | 'entry'>('dinner')
  const [all, setAll] = useState(false)

  const s = useMemo(() => {
    if (!roster) return null
    let total = 0, entered = 0, served = 0, toServe = 0, review = 0
    for (const p of roster.parties) {
      const st = roster.states.get(p.id)!
      total += st.entitled
      if (st.entered) {
        entered += st.headcount ?? 0
        toServe += Math.max(0, (st.headcount ?? 0) - st.served)
      }
      served += st.served
      if (st.needsReview) review++
    }
    const per = new Map<string, { n: number; actor: string; at: number }>()
    for (const e of liveEvents(roster.events)) {
      const cur = per.get(e.checkpoint + e.counter) ?? { n: 0, actor: e.actorName, at: 0 }
      cur.n += e.qty
      if (e.clientAt >= cur.at) { cur.at = e.clientAt; cur.actor = e.actorName }
      per.set(e.checkpoint + e.counter, cur)
    }
    return { total, entered, served, toServe, review, per }
  }, [roster])

  if (!s) return <Screen title="Stats"><span /></Screen>
  const rows = COUNTERS.filter((c) => c.kind === (view === 'dinner' ? 'dinner' : 'gate')).map((c) => ({ c, d: s.per.get((view === 'dinner' ? 'dinner' : 'entry') + c.code) }))
  const shown = all ? rows : rows.slice(0, 4)
  const max = Math.max(1, ...rows.map((r) => r.d?.n ?? 0))
  const active = rows.filter((r) => r.d && now - r.d.at < 10 * 60000).length

  return (
    <Screen title="Stats">
      <div className="px" style={{ marginBottom: 14 }}>
        <Seg label="Stats view" value={view} onChange={setView} options={[{ value: 'entry', label: 'Entry', icon: 'login' }, { value: 'dinner', label: 'Dinner', icon: 'utensils' }]} />
      </div>
      <div className="stat-grid">
        {view === 'dinner' ? (
          <>
            <Stat label="Served" value={s.served} sub={'of ' + s.total + ' guests'} />
            <Stat label="Checked in" value={s.entered} sub={Math.round((s.entered / Math.max(1, s.total)) * 100) + '% of guests'} />
            <Stat label="Still to serve" value={s.toServe} sub="checked in, not served" />
            <Stat label="Needs review" value={s.review} sub="flagged after sync" warn={s.review > 0} />
          </>
        ) : (
          <>
            <Stat label="Checked in" value={s.entered} sub={'of ' + s.total + ' guests'} />
            <Stat label="Not arrived" value={Math.max(0, s.total - s.entered)} sub="still to come" />
          </>
        )}
      </div>
      <div style={{ height: 18 }} />
      <div className="group">
        <button type="button" className="cell" onClick={() => navigate('/stats/review')}>
          <Icon name="flag" size="m" style={{ color: 'var(--warn-text)' }} />
          <span className="grow">Needs review</span>
          <span className="val">{s.review}</span>
          <Icon name="chev-r" size="s" className="chev" />
        </button>
      </div>

      <div className="gh-h" style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <span>{view === 'dinner' ? 'Meals by counter' : 'Check-ins by gate'}</span>
        <span>{active} active</span>
      </div>
      <div className="group">
        {shown.map(({ c, d }) => (
          <div key={c.code} className="rrow" style={{ minHeight: 56 }}>
            <div className="grow stack" style={{ gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="nm">{c.label}</span>
                <span className="t-head num">{d?.n ?? 0}</span>
              </div>
              <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: ((d?.n ?? 0) / max) * 100 + '%' }} /></div>
              {all && <span className="meta">{d ? d.actor + ' · last scan ' + ago(d.at, now) : 'No scans yet'}</span>}
            </div>
            {all && (d && now - d.at < 10 * 60000 ? <Chip kind="ok" icon="check-circle">Active</Chip> : <Chip kind="neutral" icon="clock">Quiet</Chip>)}
          </div>
        ))}
      </div>
      {rows.length > 4 && (
        <div className="px" style={{ marginTop: 8 }}>
          <button type="button" className="btn plain" onClick={() => setAll(!all)}>{all ? 'Show fewer' : 'Show all ' + rows.length + ' ' + (view === 'dinner' ? 'counters' : 'gates')}</button>
        </div>
      )}
      <div className="gh-f">
        {lastSyncAt ? 'Updated ' + fmtTime(lastSyncAt) : 'Not synced yet'}
        {status.pending ? ' · ' + plural(status.pending, 'change') + ' on this phone still syncing' : ''}. Numbers include every phone this one has heard from.
      </div>
    </Screen>
  )
}

function Stat({ label, value, sub, warn }: { label: string; value: number; sub: string; warn?: boolean }) {
  return (
    <div className="card stat-card">
      <span className="t-cap muted">{label}</span>
      <span className="big-num" style={warn ? { color: 'var(--warn-text)' } : undefined}>{value}</span>
      <span className="t-cap muted">{sub}</span>
    </div>
  )
}
