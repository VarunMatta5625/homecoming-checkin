import { useMemo, useState } from 'react'
import { Btn, Group, Icon, Seg, Sheet } from '../components/ui.tsx'
import { schoolShort } from '../lib/config.ts'
import { plural } from '../lib/format.ts'
import { decadeOf, type Filter } from '../lib/stats.ts'

export interface Options {
  years: { year: number; guests: number }[]
  schools: { key: string; guests: number }[]
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      style={{ width: 24, height: 24, borderRadius: 7, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(on ? { background: 'var(--btn)', color: 'var(--on-btn)' } : { boxShadow: 'inset 0 0 0 1.5px var(--text2)' }) }}
    >
      {on && <Icon name="check" size="s" />}
    </span>
  )
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/** Year and school in one sheet. Choices are held here until "Show N guests" is tapped, and the button says what the result will be. */
export function FilterSheet({ options, initial, tab: startTab, count, onApply, onClose }: { options: Options; initial: Filter; tab: 'year' | 'school'; count: (f: Filter) => number; onApply: (f: Filter) => void; onClose: () => void }) {
  const [tab, setTab] = useState(startTab)
  const [f, setF] = useState(initial)
  const [q, setQ] = useState('')

  const years = useMemo(() => {
    const term = q.trim()
    return options.years.filter((y) => !term || String(y.year).includes(term) || String(y.year).slice(2).startsWith(term))
  }, [options.years, q])
  const decades = useMemo(() => {
    const m = new Map<number, { year: number; guests: number }[]>()
    for (const y of years) m.set(decadeOf(y.year), [...(m.get(decadeOf(y.year)) ?? []), y])
    return [...m]
  }, [years])
  const allDecades = useMemo(() => [...new Set(options.years.map((y) => decadeOf(y.year)))], [options.years])
  const inDecade = (d: number) => options.years.filter((y) => decadeOf(y.year) === d).map((y) => y.year)
  const decadeOn = (d: number) => inDecade(d).every((y) => f.years.includes(y))
  const toggleDecade = (d: number) => {
    const ys = inDecade(d)
    setF({ ...f, years: decadeOn(d) ? f.years.filter((y) => !ys.includes(y)) : [...new Set([...f.years, ...ys])] })
  }
  const n = count(f)

  return (
    <Sheet
      title="Filter"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="gray" auto disabled={!f.years.length && !f.schools.length} onClick={() => setF({ years: [], schools: [] })}>Clear</Btn>
          <Btn onClick={() => onApply(f)}>{'Show ' + plural(n, 'guest')}</Btn>
        </div>
      }
    >
      <div className="stack g3">
        <div className="px">
          <Seg<'year' | 'school'> label="Filter by" value={tab} onChange={setTab} options={[{ value: 'year', label: 'Year' + (f.years.length ? ' · ' + f.years.length : '') }, { value: 'school', label: 'School' + (f.schools.length ? ' · ' + f.schools.length : '') }]} />
        </div>
        {tab === 'year' ? (
          <>
            <div className="px">
              <label className="search">
                <Icon name="search" size="m" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search years, e.g. 09" aria-label="Search years" inputMode="numeric" />
              </label>
            </div>
            <div className="fchips scroll-x">
              {allDecades.map((d) => (
                <button key={d} type="button" className={'fchip' + (decadeOn(d) ? ' on' : '')} aria-pressed={decadeOn(d)} onClick={() => toggleDecade(d)}>{d + 's'}</button>
              ))}
            </div>
            {decades.length === 0 && <span className="t-sub muted px">No year matches “{q}”.</span>}
            {decades.map(([d, ys]) => (
              <Group key={d} header={<span style={{ textTransform: 'none' }}>{d + 's'}</span>}>
                {ys.map((y) => {
                  const on = f.years.includes(y.year)
                  return (
                    <button key={y.year} type="button" className="cell" role="checkbox" aria-checked={on} onClick={() => setF({ ...f, years: toggle(f.years, y.year) })}>
                      <Check on={on} />
                      <span className="grow">{y.year}</span>
                      <span className="val">{plural(y.guests, 'guest')}</span>
                    </button>
                  )
                })}
              </Group>
            ))}
          </>
        ) : (
          <Group>
            {options.schools.map((s) => {
              const on = f.schools.includes(s.key)
              return (
                <button key={s.key} type="button" className="cell" role="checkbox" aria-checked={on} onClick={() => setF({ ...f, schools: toggle(f.schools, s.key) })}>
                  <Check on={on} />
                  <span className="grow">{s.key ? schoolShort(s.key) : 'No school given'}</span>
                  <span className="val">{plural(s.guests, 'guest')}</span>
                </button>
              )
            })}
          </Group>
        )}
      </div>
    </Sheet>
  )
}
