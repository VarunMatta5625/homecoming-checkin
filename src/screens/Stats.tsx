import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/layout.tsx'
import { Banner, Btn, Empty, Icon, Seg } from '../components/ui.tsx'
import type { IconName } from '../components/sprite.ts'
import { schoolShort } from '../lib/config.ts'
import { useCounters } from '../lib/counters.ts'
import { ago, fmtTime, plural } from '../lib/format.ts'
import { useNow, useRoster, useSyncStatus } from '../lib/hooks.ts'
import { prefs } from '../lib/prefs.ts'
import { arrivalSeries, computeStats, filterOn, gateRows, filterOptions, matches, NO_FILTER, pct, type Filter, type Row, type Stats } from '../lib/stats.ts'
import { createStore } from '../lib/store.ts'
import { kickSync, retryFailed } from '../lib/sync.ts'
import { Card, Donut, Grid, GridKey, Legend, Pair, ProgressRow, SortToggle, StackBar, Timeline, type Seg as SegData } from './StatsCharts.tsx'
import { FilterSheet } from './StatsFilter.tsx'

type Tab = 'entry' | 'breakdown'

/** Kept while the app is open, so Review and back doesn't lose the tab or the filter. */
const view = createStore<{ tab: Tab; filter: Filter }>({ tab: 'entry', filter: NO_FILTER })

const yearsText = (ys: number[]) => (ys.length === 1 ? String(ys[0]) : ys.length + ' years')
const schoolsText = (ss: string[]) => (ss.length === 1 ? (ss[0] ? schoolShort(ss[0]) : 'No school') : ss.length + ' schools')
function filterText(f: Filter) {
  const bits = [f.years.length ? yearsText(f.years) : '', f.schools.length ? schoolsText(f.schools) : ''].filter(Boolean)
  return bits.join(f.years.length > 1 || f.schools.length > 1 ? ', ' : ' · ')
}

interface Alert {
  icon: IconName
  text: string
  go: () => void
}

export function StatsScreen() {
  const roster = useRoster()
  const navigate = useNavigate()
  const status = useSyncStatus()
  const counters = useCounters()
  const lastSyncAt = prefs.use().lastSyncAt
  const now = useNow(30000)
  const { tab, filter } = view.use()
  const [sheet, setSheet] = useState<'year' | 'school' | null>(null)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [toast, setToast] = useState<{ title: string; sub: string; undo: Filter } | null>(null)

  useEffect(() => {
    // Shrinks once scrolled a little, and grows back only near the top, so it can't flicker at the edge.
    const on = () => setCompact((c) => (c ? window.scrollY > 24 : window.scrollY > 150))
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const all = useMemo<Row[] | null>(() => (roster ? roster.parties.map((party) => ({ party, st: roster.states.get(party.id)! })) : null), [roster])
  const rows = useMemo(() => all?.filter((r) => matches(r.party, filter)) ?? [], [all, filter])
  const s = useMemo(() => computeStats(rows), [rows])
  const options = useMemo(() => (all ? filterOptions(all.map((r) => r.party), (id) => roster!.states.get(id)!.entitled) : { years: [], schools: [] }), [all, roster])

  const setFilter = (next: Filter, title: string, sub: string) => {
    const prev = view.get().filter
    view.set({ filter: next })
    setToast({ title, sub, undo: prev })
  }
  const pick = (patch: Partial<Filter>) => {
    const next = { ...view.get().filter, ...patch }
    const r = computeStats((all ?? []).filter((x) => matches(x.party, next)))
    setFilter(next, 'Filtered to ' + filterText(next), r.arrived + ' of ' + r.expected + ' arrived')
  }
  const clear = () => setFilter(NO_FILTER, 'Filters cleared', 'Showing all ' + (all ?? []).reduce((n, r) => n + r.st.entitled, 0) + ' guests')

  if (!roster || !all) return <Screen title="Stats"><span /></Screen>
  if (all.length === 0) {
    return (
      <Screen title="Stats">
        {lastSyncAt ? (
          <Empty icon="users" title="No guests loaded yet" body="Stats appear once the guest list is on this phone.">
            <Btn kind="secondary" auto icon="refresh" onClick={kickSync}>Sync now</Btn>
          </Empty>
        ) : (
          <Empty icon="refresh" title="Getting the numbers" body="This phone hasn’t finished its first sync. Keep it online for a minute." />
        )}
      </Screen>
    )
  }

  // A retired counter drops off the list, unless it already has scans that count in the totals.
  const gates = gateRows(counters.filter((c) => c.active || rows.some((r) => r.st.enteredCounter === c.code)), rows)
  const alerts: Alert[] = []
  if (status.failed) alerts.push({ icon: 'alert', text: plural(status.failed, 'sync') + ' failed on this phone. Tap to retry', go: () => void retryFailed() })
  if (s.review) alerts.push({ icon: 'flag', text: plural(s.review, 'party', 'parties') + ' need review', go: () => navigate('/stats/review') })

  const staleMin = lastSyncAt ? Math.floor((now - lastSyncAt) / 60000) : null
  const arrivedPct = pct(s.arrived, s.expected)

  return (
    <Screen title="Stats">
      {!status.online && (
        <div className="px" style={{ marginBottom: 10 }}>
          <Banner kind="warn" icon="wifi-off" title="Offline">
            {lastSyncAt ? 'Last synced ' + fmtTime(lastSyncAt) + ', ' + ago(lastSyncAt, now) + '. ' : ''}Numbers may be behind. They’ll update when this phone is back online.
          </Banner>
        </div>
      )}
      <div className="st-sticky">
        {compact ? (
          <button type="button" className="st-mini" aria-label="Show all numbers" onClick={() => window.scrollTo({ top: 0 })}>
            <span><b>{s.arrived}</b> here</span>
            <span><b>{arrivedPct}%</b> of {s.expected}</span>
            {s.review > 0 && <span><Icon name="flag" size="s" /> {s.review}</span>}
            {alerts.length > 0 && <span style={{ color: 'var(--warn-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="alert" size="s" />{alerts.length}<span className="sr"> {alerts.length === 1 ? 'alert' : 'alerts'}</span></span>}
          </button>
        ) : (
          <>
            <div className="st-tiles">
              <div className="st-tile"><span className="n">{s.arrived}</span><span className="l">On campus now</span></div>
              <div className="st-tile"><span className="n">{arrivedPct}%</span><span className="l">{s.arrived} of {s.expected} arrived</span></div>
              {s.review > 0 ? (
                <button type="button" className="st-tile warn" onClick={() => navigate('/stats/review')}><span className="n">{s.review}</span><span className="l"><Icon name="flag" size="s" /> Review ›</span></button>
              ) : (
                <div className="st-tile"><span className="n">0</span><span className="l">Review</span></div>
              )}
            </div>
            {alerts.length > 0 && (
              <div className="st-alerts" role="list">
                {alerts.length > 1 && !alertsOpen ? (
                  <button type="button" className="st-alert" role="listitem" aria-expanded="false" onClick={() => setAlertsOpen(true)}>
                    <Icon name={alerts[0]!.icon} size="m" />
                    <span className="grow">{alerts[0]!.text}</span>
                    <span className="more">+{alerts.length - 1} more</span>
                    <Icon name="chev-d" size="m" />
                  </button>
                ) : (
                  <>
                    {alerts.map((a) => (
                      <button key={a.text} type="button" className="st-alert" role="listitem" onClick={a.go}>
                        <Icon name={a.icon} size="m" />
                        <span className="grow">{a.text}</span>
                        <Icon name="chev-r" size="s" />
                      </button>
                    ))}
                    {alerts.length > 1 && (
                      <button type="button" className="st-alert" aria-expanded="true" onClick={() => setAlertsOpen(false)}>
                        <Icon name="chev-d" size="m" />
                        <span className="grow more" style={{ fontSize: 13 }}>Show fewer</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
        <div className="st-filterbar">
          <button type="button" className={'fchip' + (filter.years.length ? ' on' : '')} onClick={() => setSheet('year')}>Year{filter.years.length ? ' · ' + filter.years.length : ''}<Icon name="chev-d" size="s" /></button>
          <button type="button" className={'fchip' + (filter.schools.length ? ' on' : '')} onClick={() => setSheet('school')}>School{filter.schools.length ? ' · ' + filter.schools.length : ''}<Icon name="chev-d" size="s" /></button>
          <button type="button" className="btn sm plain" style={{ padding: '0 8px', marginLeft: 'auto' }} disabled={!filterOn(filter)} onClick={clear}>Clear</button>
        </div>
        {filterOn(filter) && !compact && (
          <div className="st-filtered"><span>Filtered: <b>{filterText(filter)}</b></span><span className="muted" style={{ marginLeft: 'auto' }}>Partial numbers</span></div>
        )}
        <div className="px">
          <Seg<Tab> label="Stats view" value={tab} onChange={(t) => view.set({ tab: t })} options={[{ value: 'entry', label: 'Entry' }, { value: 'breakdown', label: 'Breakdown' }]} />
        </div>
      </div>

      <div className="st-body">
        {rows.length === 0 ? (
          <Empty icon="search" title="No guests match" body={'Nobody from ' + (filter.years.length ? yearsText(filter.years) : 'any year') + ' registered with ' + (filter.schools.length ? schoolsText(filter.schools) : 'any school') + '. Try another year or school.'}>
            <Btn kind="secondary" auto onClick={clear}>Clear filters</Btn>
          </Empty>
        ) : tab === 'entry' ? (
          <EntryTab s={s} rows={rows} gates={gates} now={now} />
        ) : (
          <BreakdownTab s={s} all={all} filter={filter} pick={pick} />
        )}
        <p className="st-foot">
          {staleMin != null && !status.online ? <b style={{ color: 'var(--warn-text)' }}>Last synced {fmtTime(lastSyncAt!)}, {ago(lastSyncAt!, now)}. </b> : lastSyncAt ? 'Updated ' + fmtTime(lastSyncAt) + '. ' : 'Not synced yet. '}
          {status.pending ? plural(status.pending, 'change') + ' on this phone still syncing. ' : ''}Numbers include every phone this one has heard from.
        </p>
      </div>

      {sheet && (
        <FilterSheet
          options={options}
          initial={filter}
          tab={sheet}
          count={(f) => all.filter((r) => matches(r.party, f)).reduce((n, r) => n + r.st.entitled, 0)}
          onClose={() => setSheet(null)}
          onApply={(f) => {
            setSheet(null)
            if (f.years.join() === filter.years.join() && f.schools.join() === filter.schools.join()) return
            view.set({ filter: f })
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <div className="stack grow">
            <span className="t-head" style={{ color: 'var(--on-toast)' }}>{toast.title}</span>
            <span className="t-cap" style={{ color: 'var(--on-toast)', opacity: 0.8 }}>{toast.sub}</span>
          </div>
          <button type="button" className="tbtn" onClick={() => { view.set({ filter: toast.undo }); setToast(null) }}>
            <Icon name="undo" size="s" />
            Undo
          </button>
        </div>
      )}
    </Screen>
  )
}

function EntryTab({ s, rows, gates, now }: { s: Stats; rows: Row[]; gates: ReturnType<typeof gateRows>; now: number }) {
  const series = useMemo(() => arrivalSeries(rows, now, s.expected, s.arrived), [rows, now, s.expected, s.arrived])
  const [a, sp, ch] = s.split.arr
  const [ea, es, ec] = s.split.exp
  const split = (v: [number, number, number], est: boolean): SegData[] => [
    { n: v[0], cls: 'q5', label: 'Alumni', est },
    { n: v[1], cls: 'q3', label: 'Spouses', est },
    { n: v[2], cls: 'q2', label: 'Children', est },
  ]
  const walkPct = s.arrived ? Math.round((s.walkIns.people / s.arrived) * 100) : 0
  const gateTotal = gates.reduce((n, g) => n + g.n, 0)
  const projText = !series ? null : series.done ? '80% are already here.' : series.slow ? 'The pace is too slow to name a time for 80%.' : series.eta ? 'At this pace, 80% are here by ' + fmtTime(series.eta) + '. ' + Math.ceil(s.expected * 0.8) + ' of ' + s.expected + '.' : null
  return (
    <>
      <Card title={'Arrived of ' + s.expected + ' expected'}>
        <div className="st-donut">
          <Donut arr={s.arrived} exp={s.expected} />
          <Legend segs={[{ n: s.arrived, cls: 'seg-arr', label: 'Arrived' }, { n: s.notArrived, cls: 'seg-none', label: 'Not arrived' }]} />
        </div>
        {s.arrived === 0 && <span className="t-sub muted">0 of {s.expected} guests have checked in.</span>}
      </Card>
      <Card title="Arrivals per 15 min">
        {series ? (
          <>
            <Timeline s={series} />
            {projText && <span className="t-sub">{projText}</span>}
          </>
        ) : (
          <span className="t-sub muted">No check-ins yet. The first scan shows up here.</span>
        )}
      </Card>
      <Card title="Who’s here" sub="people">
        <div className="st-split">
          <span className="t-sub"><b>Expected</b> <span className="muted">{s.expected}</span></span>
          <StackBar tall aria={'Expected: ' + ea + ' alumni, ' + es + ' spouses, ' + ec + ' children'} segs={split(s.split.exp, false)} />
          <span className="t-sub"><b>Arrived</b> <span className="muted">{s.arrived} · estimated</span></span>
          <StackBar tall aria={'Arrived, estimated: ' + a + ' alumni, ' + sp + ' spouses, ' + ch + ' children'} segs={split(s.split.arr, true)} />
        </div>
        <Legend segs={split(s.split.exp, false).map((g) => ({ ...g, n: g.n }))} />
        <span className="t-cap muted">Striped = estimated. The gate counts heads, not who. Arrived is split by filling alumni first, then spouses, then children.</span>
      </Card>
      <Card title="Walk-ins vs pre-registered" sub={'of ' + s.arrived + ' arrived'}>
        <StackBar aria={s.arrived - s.walkIns.people + ' pre-registered, ' + s.walkIns.people + ' walk-ins'} segs={[{ n: s.arrived - s.walkIns.people, cls: 'seg-arr', label: 'Pre-registered' }, { n: s.walkIns.people, cls: 'seg-exp', label: 'Walk-ins' }]} />
        <div className="lgd">
          <span><i className="seg-arr" />Pre-registered <b>{s.arrived - s.walkIns.people}</b> · {s.arrived ? 100 - walkPct : 0}%</span>
          <span><i className="seg-exp" />Walk-ins <b>{s.walkIns.people}</b> · {walkPct}% · {plural(s.walkIns.parties, 'party', 'parties')}</span>
        </div>
      </Card>
      <Card title="Check-ins by gate">
        {gates.map((g) => (
          <div key={g.code} className="stack" style={{ gap: 4 }}>
            <div className="st-h"><span className="t-head" style={{ fontSize: 15 }}>{g.label}</span><span className="t-sub"><b>{g.n}</b> · {gateTotal ? Math.round((g.n / gateTotal) * 100) : 0}%</span></div>
            <span className="prow" style={{ gridTemplateColumns: '1fr', minHeight: 14 }}><span className="bar"><i style={{ width: (gateTotal ? (g.n / gateTotal) * 100 : 0) + '%' }} /></span></span>
          </div>
        ))}
      </Card>
    </>
  )
}

function BreakdownTab({ s, all, filter, pick }: { s: Stats; all: Row[]; filter: Filter; pick: (p: Partial<Filter>) => void }) {
  const [yearSort, setYearSort] = useState<'year' | 'pct'>('year')
  const [schoolSort, setSchoolSort] = useState<'size' | 'pct'>('size')
  const [moreYears, setMoreYears] = useState(false)
  const [moreGrid, setMoreGrid] = useState(false)

  const years = [...s.years].sort(yearSort === 'year' ? (a, b) => a.year - b.year : (a, b) => pct(a.arr, a.exp) - pct(b.arr, b.exp) || a.year - b.year)
  const yearsShown = moreYears ? years : years.slice(0, 6)
  const schools = [...s.schools].sort(schoolSort === 'size' ? (a, b) => b.exp - a.exp : (a, b) => pct(a.arr, a.exp) - pct(b.arr, b.exp) || b.exp - a.exp)

  // The grid always shows everyone and rings the cells inside the filter, so a tap is never a dead end.
  const grid = useMemo(() => computeStats(all), [all])
  const gridYears = moreGrid ? grid.years.map((y) => y.year) : grid.years.slice(0, 6).map((y) => y.year)
  const gridSchools = grid.schools.map((x) => x.key)
  const sel = (y: number, sc: string) => filterOn(filter) && (!filter.years.length || filter.years.includes(y)) && (!filter.schools.length || filter.schools.includes(sc))

  const q = ['q5', 'q4', 'q3', 'q2']
  const top = s.campusSchools.slice(0, 4)
  const other = s.campusSchools.slice(4).reduce((n, x) => n + x.n, 0)
  const bySchool: SegData[] = [...top.map((x, i) => ({ n: x.n, cls: q[i]!, label: x.key ? schoolShort(x.key) : 'None' })), { n: other, cls: 'q1', label: 'Other' }]
  const byDecade: SegData[] = s.decades.map((d, i) => ({ n: d.n, cls: 'q' + Math.min(5, i + 1), label: d.label }))
  const parkMax = Math.max(s.parking.four.exp, s.parking.two.exp, 1)

  return (
    <>
      <Card title="By batch year" right={<SortToggle value={yearSort} onChange={setYearSort} options={[{ value: 'year', label: 'Year' }, { value: 'pct', label: '%' }]} />}>
        <div className="stack">
          {yearsShown.map((y) => <ProgressRow key={y.year} label={String(y.year)} name={String(y.year)} t={y} onClick={() => pick({ years: [y.year] })} />)}
        </div>
        {years.length > 6 && <Btn kind="plain" onClick={() => setMoreYears(!moreYears)}>{moreYears ? 'Show fewer years' : 'Show ' + (years.length - 6) + ' more years'}</Btn>}
        <span className="t-cap muted">{years.length} years · {yearSort === 'pct' ? 'lowest arrival first · ' : ''}tap a year to filter</span>
      </Card>
      <Card title="By school" right={<SortToggle value={schoolSort} onChange={setSchoolSort} options={[{ value: 'size', label: 'Size' }, { value: 'pct', label: '%' }]} />}>
        <div className="stack">
          {schools.map((x) => <ProgressRow key={x.key} wide label={x.key ? schoolShort(x.key) : 'No school'} name={x.key ? schoolShort(x.key) : 'No school'} t={x} onClick={() => pick({ schools: [x.key] })} />)}
        </div>
        <span className="t-cap muted">Tap a school to filter</span>
      </Card>
      <Card title="Year × school" sub={gridSchools.length > 6 ? 'Swipe for ' + (gridSchools.length - 6) + ' more' : undefined}>
        <span className="t-sub muted" style={{ marginTop: -6 }}>Share of each group that has arrived. Tap a cell to filter to it.</span>
        <Grid data={{ years: gridYears, schools: gridSchools, cell: grid.cell }} selected={sel} onPick={(y, sc) => pick({ years: [y], schools: [sc] })} />
        {grid.years.length > 6 && <Btn kind="plain" onClick={() => setMoreGrid(!moreGrid)}>{moreGrid ? 'Show fewer years' : 'Show all ' + grid.years.length + ' years'}</Btn>}
        <GridKey />
      </Card>
      <Card title="On campus now" sub={s.arrived + ' people'}>
        <span className="t-cap muted" style={{ marginTop: -6 }}>By batch decade</span>
        <StackBar tall aria={'On campus by decade: ' + byDecade.map((d) => d.label + ' ' + d.n).join(', ')} segs={byDecade} />
        <Legend segs={byDecade} />
        <span className="t-cap muted">By school</span>
        <StackBar tall aria={'On campus by school: ' + bySchool.map((d) => d.label + ' ' + d.n).join(', ')} segs={bySchool} />
        <Legend segs={bySchool.filter((x) => x.n > 0)} />
      </Card>
      <Card title="Parking" sub="vehicles">
        <Pair icon="car" name="Four-wheelers" exp={s.parking.four.exp} arr={s.parking.four.arr} scale={parkMax} />
        <Pair icon="bike" name="Two-wheelers" exp={s.parking.two.exp} arr={s.parking.two.arr} scale={parkMax} />
      </Card>
    </>
  )
}
