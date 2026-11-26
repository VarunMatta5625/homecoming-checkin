import type { ReactNode } from 'react'
import { Icon } from '../components/ui.tsx'
import { fmtTime, plural } from '../lib/format.ts'
import { bucket, cellKey, isSmall, pct, schoolCode, type ArrivalSeries, type Tally } from '../lib/stats.ts'
import { schoolShort } from '../lib/config.ts'

export function Card({ title, sub, right, children }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="st-card">
      <div className="st-h">
        <h3>{title}</h3>
        {right ?? (sub ? <span className="sub">{sub}</span> : null)}
      </div>
      {children}
    </section>
  )
}

export function SortToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="st-seg-s" role="group" aria-label="Sort">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Arrived over expected, with counts beside the percentage. Groups of one or two read "1 of 2" and are drawn hatched. */
export function ProgressRow({ label, t, wide, name, onClick }: { label: string; t: Tally; wide?: boolean; name: string; onClick?: () => void }) {
  const small = isSmall(t.exp)
  const p = pct(t.arr, t.exp)
  return (
    <button type="button" className={'prow' + (wide ? ' wide' : '') + (small ? ' small' : '')} aria-label={name + ': ' + t.arr + ' of ' + t.exp + ' arrived'} onClick={onClick}>
      <span className="lbl">{label}</span>
      <span className="bar"><i style={{ width: Math.min(100, t.exp ? (t.arr / t.exp) * 100 : 0) + '%' }} /></span>
      <span className="val">
        {small ? t.arr + ' of ' + t.exp : (<>{t.arr} / {t.exp} · <b>{p}%</b></>)}
      </span>
    </button>
  )
}

export interface Seg {
  n: number
  cls: string
  label: string
  /** Drawn with diagonal stripes: the number is an estimate. */
  est?: boolean
}

/** Segments are sized by count. A label is printed only where it fits; the legend always carries every count. */
export function StackBar({ segs, tall, aria }: { segs: Seg[]; tall?: boolean; aria: string }) {
  const total = segs.reduce((n, s) => n + s.n, 0)
  return (
    <div className={'sbar' + (tall ? ' tall' : '')} role="img" aria-label={aria}>
      {segs.filter((s) => s.n > 0).map((s) => {
        const share = total ? s.n / total : 0
        return (
          <span key={s.label} className={s.cls + (s.est ? ' seg-est' : '')} style={{ flex: s.n + ' 1 0%' }} title={s.label + ' ' + s.n}>
            {share >= 0.3 ? s.label + ' ' + s.n : share >= 0.07 ? s.n : ''}
          </span>
        )
      })}
    </div>
  )
}

export function Legend({ segs }: { segs: Seg[] }) {
  return (
    <div className="lgd">
      {segs.map((s) => (
        <span key={s.label}>
          <i className={s.cls + (s.est ? ' seg-est' : '')} />
          {s.label} <b>{s.n}</b>
        </span>
      ))}
    </div>
  )
}

export function Donut({ arr, exp }: { arr: number; exp: number }) {
  const r = 54
  const c = 2 * Math.PI * r
  const p = pct(arr, exp)
  return (
    <svg width="124" height="124" viewBox="0 0 124 124" role="img" aria-label={p + ' percent arrived'} style={{ flex: 'none' }}>
      <circle cx="62" cy="62" r={r} fill="none" stroke="var(--track)" strokeWidth="16" />
      <circle cx="62" cy="62" r={r} fill="none" stroke="var(--arr)" strokeWidth="16" strokeDasharray={(Math.min(1, exp ? arr / exp : 0) * c) + ' ' + c} transform="rotate(-90 62 62)" strokeLinecap="butt" />
      <text x="62" y="64" textAnchor="middle" fontSize="28" fontWeight="700" fill="var(--text)" style={{ fontVariantNumeric: 'tabular-nums' }}>{p}%</text>
      <text x="62" y="84" textAnchor="middle" fontSize="13" fill="var(--text2)">arrived</text>
    </svg>
  )
}

export function Timeline({ s }: { s: ArrivalSeries }) {
  const top = Math.max(1, ...s.bars.map((b) => b.n))
  const first = s.bars[0]!.start
  const lastActual = s.bars.filter((b) => b.kind !== 'proj').at(-1)!.start
  const last = s.bars.at(-1)!.start
  const mid = s.bars[Math.floor((s.bars.length - 1) / 2)]!.start
  return (
    <>
      <div className="st-h">
        <span className="t-sub"><b>Now: {s.current}</b> since {fmtTime(lastActual)}</span>
        <span className="sub">{s.peak} peak</span>
      </div>
      <div className="tlc" role="img" aria-label={'Arrivals per 15 minutes. ' + s.current + ' in the current slot, peak ' + s.peak + '.'}>
        {s.bars.map((b) => (
          <i key={b.start} className={b.kind === 'act' ? '' : b.kind} style={{ height: Math.max(2, (b.n / top) * 100) + '%' }} title={fmtTime(b.start) + ': ' + b.n} />
        ))}
      </div>
      <div className="tlc-ax"><span>{fmtTime(first)}</span><span>{fmtTime(mid)}</span><span>{fmtTime(last + 15 * 60000)}</span></div>
      <div className="lgd">
        <span><i style={{ background: 'var(--arr)' }} />Arrived</span>
        {s.bars.some((b) => b.kind === 'proj') && <span><i style={{ boxShadow: 'inset 0 0 0 1.5px var(--arr)' }} />Projected</span>}
      </div>
    </>
  )
}

export interface GridData {
  years: number[]
  schools: string[]
  cell: Map<string, Tally>
}

/** Year by school, shaded by how much of each group has arrived. The first column stays put while the schools scroll sideways. */
export function Grid({ data, selected, onPick }: { data: GridData; selected: (year: number, school: string) => boolean; onPick: (year: number, school: string) => void }) {
  return (
    <div className="ggrid">
      <table role="grid" aria-label="Arrival rate by year and school">
        <thead>
          <tr>
            <th className="yr" scope="col">Year</th>
            {data.schools.map((s) => <th key={s} scope="col">{s ? schoolCode(schoolShort(s)) : 'None'}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.years.map((y) => (
            <tr key={y}>
              <td className="yr">{y}</td>
              {data.schools.map((s) => {
                const t = data.cell.get(cellKey(y, s))
                const name = y + ' ' + (s ? schoolShort(s) : 'no school')
                const sel = selected(y, s) ? ' sel' : ''
                if (!t || t.exp === 0) return <td key={s}><button type="button" className={'gc none' + sel} aria-label={name + ': no registrations'} onClick={() => onPick(y, s)} /></td>
                const label = t.arr + ' of ' + t.exp + ' arrived'
                if (isSmall(t.exp)) return <td key={s}><button type="button" className={'gc small' + sel} aria-label={name + ': ' + label} onClick={() => onPick(y, s)}>{t.arr + '/' + t.exp}</button></td>
                const p = pct(t.arr, t.exp)
                return <td key={s}><button type="button" className={'gc ' + (p === 0 ? 'zero' : 'q' + bucket(p)) + sel} aria-label={name + ': ' + label} onClick={() => onPick(y, s)}>{p + '%'}</button></td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function GridKey() {
  const steps = [['q1', '1–19%'], ['q2', '20–39%'], ['q3', '40–59%'], ['q4', '60–79%'], ['q5', '80–100%']]
  return (
    <div className="lgd">
      {steps.map(([c, l]) => <span key={c}><i className={c} />{l}</span>)}
      <span><i style={{ background: 'var(--track)' }} />0%</span>
      <span><i style={{ boxShadow: 'inset 0 0 0 1px var(--sep)', backgroundImage: 'repeating-linear-gradient(135deg,var(--sep) 0 1px,transparent 1px 4px)' }} />No registrations</span>
      <span><i style={{ boxShadow: 'inset 0 0 0 1.5px var(--text2)', background: 'var(--card)' }} />2 or fewer (shows “1/2”)</span>
    </div>
  )
}

export function Pair({ icon, name, exp, arr, scale, unit }: { icon: 'car' | 'bike'; name: string; exp: number; arr: number; scale: number; unit?: string }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="t-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name={icon} size="m" />{name}</span>
      <div className="pk t-sub">
        <span className="muted">Expected</span>
        <span className="pk-bar" style={{ width: (scale ? (exp / scale) * 100 : 0) + '%', background: 'var(--exp)' }} />
        <span className="pk-n">{exp}</span>
        <span className="muted">Arrived</span>
        <span className="pk-bar" style={{ width: (scale ? (arr / scale) * 100 : 0) + '%', background: 'var(--arr)' }} />
        <span className="pk-n" style={{ fontWeight: 600 }}>{arr}</span>
      </div>
      {unit && <span className="sr">{plural(arr, unit)} arrived of {exp}</span>}
    </div>
  )
}
