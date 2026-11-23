import { beforeEach, describe, expect, it } from 'vitest'
import { ev, MIN, party, resetIds, rowsOf, T0, voidOf } from '../test/fixtures.ts'
import { BUILTIN_COUNTERS as COUNTERS } from './config.ts'
import { arrivalSeries, bucket, cellKey, computeStats, counterRows, decadeOf, dinnerSeries, filterOn, filterOptions, gateRows, isSmall, matches, NO_FILTER, pct, schoolCode, schoolKey } from './stats.ts'
import { liveEvents } from './state.ts'

beforeEach(resetIds)

describe('pct', () => {
  it('is 0 when nobody is expected', () => {
    expect(pct(0, 0)).toBe(0)
    expect(pct(5, 0)).toBe(0)
    expect(pct(0, -3)).toBe(0)
  })
  it('rounds to a whole percent', () => {
    expect(pct(1, 3)).toBe(33)
    expect(pct(2, 3)).toBe(67)
    expect(pct(1, 2)).toBe(50)
  })
  it('never shows 0 once anyone has arrived', () => {
    expect(pct(1, 1000)).toBe(1)
    expect(pct(0, 1000)).toBe(0)
  })
  it('never shows 100 until everyone is in', () => {
    expect(pct(996, 1000)).toBe(99)
    expect(pct(999, 1000)).toBe(99)
    expect(pct(1000, 1000)).toBe(100)
  })
  it('shows 100 when more arrive than expected', () => {
    expect(pct(5, 3)).toBe(100)
  })
})

describe('small groups, buckets, decades, school codes', () => {
  it('treats groups of one or two as small', () => {
    expect([0, 1, 2, 3].map(isSmall)).toEqual([false, true, true, false])
  })
  it('maps percent to the five shading steps at their edges', () => {
    const edges: [number, number][] = [[1, 1], [19, 1], [20, 2], [39, 2], [40, 3], [59, 3], [60, 4], [79, 4], [80, 5], [100, 5]]
    for (const [p, b] of edges) expect(bucket(p), p + '%').toBe(b)
  })
  it('finds the decade of a batch year', () => {
    expect([1984, 1990, 1999, 2000, 2009, 2026].map(decadeOf)).toEqual([1980, 1990, 1990, 2000, 2000, 2020])
  })
  it('shortens every school the app knows, and falls back to four letters', () => {
    expect(schoolCode('Technology')).toBe('Tech')
    expect(schoolCode('Dental')).toBe('Dent')
    expect(schoolCode('Architecture')).toBe('Arch')
    expect(schoolCode('Pharmacy')).toBe('Phar')
    expect(schoolCode('Kinesiology')).toBe('Kine')
    expect(schoolCode('')).toBe('')
  })
  it('keys a missing school as the empty string', () => {
    expect(schoolKey(null)).toBe('')
    expect(schoolKey('School of Law')).toBe('School of Law')
    expect(cellKey(2010, '')).toBe('2010|')
  })
})

describe('filter', () => {
  const a = party({ batchYear: 2010, school: 'School of Law' })
  const b = party({ batchYear: 2012, school: null })
  it('is off when empty', () => {
    expect(filterOn(NO_FILTER)).toBe(false)
    expect(filterOn({ years: [2010], schools: [] })).toBe(true)
    expect(filterOn({ years: [], schools: [''] })).toBe(true)
  })
  it('passes everyone when empty', () => {
    expect(matches(a, NO_FILTER) && matches(b, NO_FILTER)).toBe(true)
  })
  it('ORs inside a list and ANDs across lists', () => {
    expect(matches(a, { years: [2010, 2012], schools: [] })).toBe(true)
    expect(matches(b, { years: [2010], schools: [] })).toBe(false)
    expect(matches(a, { years: [2010], schools: ['School of Law'] })).toBe(true)
    expect(matches(a, { years: [2012], schools: ['School of Law'] })).toBe(false)
    expect(matches(a, { years: [2010], schools: ['School of Science'] })).toBe(false)
  })
  it('matches a guest with no school on the empty key only', () => {
    expect(matches(b, { years: [], schools: [''] })).toBe(true)
    expect(matches(b, { years: [], schools: ['School of Law'] })).toBe(false)
    expect(matches(a, { years: [], schools: [''] })).toBe(false)
  })
})

describe('computeStats: empty', () => {
  it('returns zeros and empty lists', () => {
    const s = computeStats([], [])
    expect([s.guests, s.parties, s.expected, s.arrived, s.served, s.waiting, s.notArrived, s.review, s.overrides]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(s.years).toEqual([])
    expect(s.schools).toEqual([])
    expect(s.decades).toEqual([])
    expect(s.campusSchools).toEqual([])
    expect(s.cell.size).toBe(0)
    expect(s.parking).toEqual({ four: { exp: 0, arr: 0 }, two: { exp: 0, arr: 0 } })
    expect(s.split).toEqual({ exp: [0, 0, 0], arr: [0, 0, 0] })
    expect(s.walkIns).toEqual({ parties: 0, people: 0 })
  })
})

describe('computeStats: a small event', () => {
  // p1 family of 4 (alumnus, spouse, 2 kids), 3 came, 2 ate. p2 alone, not here. p3 walk-in couple... party of 2, both here and fed, 4-wheeler.
  const p1 = party({ batchYear: 2010, school: 'School of Technology', spouse: 'yes', children: 2, parking: 'two_wheeler' })
  const p2 = party({ batchYear: 2010, school: 'School of Science' })
  const p3 = party({ batchYear: 2015, school: null, source: 'onspot', children: 1, parking: 'four_wheeler' })
  const events = [
    ev(p1.id, 'entry', 3, T0 + MIN),
    ev(p1.id, 'dinner', 2, T0 + 40 * MIN),
    ev(p3.id, 'entry', 2, T0 + 5 * MIN, { counter: 'GATE-2' }),
    ev(p3.id, 'dinner', 2, T0 + 45 * MIN),
  ]
  const s = computeStats(rowsOf([p1, p2, p3], events), events)

  it('totals', () => {
    expect(s.parties).toBe(3)
    expect(s.expected).toBe(4 + 1 + 2)
    expect(s.guests).toBe(s.expected)
    expect(s.arrived).toBe(5)
    expect(s.notArrived).toBe(2)
    expect(s.served).toBe(4)
  })
  it('counts checked in and not yet served per party', () => {
    expect(s.waiting).toBe(1)
  })
  it('groups by year and by school', () => {
    expect(s.years).toEqual([{ year: 2010, exp: 5, arr: 3 }, { year: 2015, exp: 2, arr: 2 }])
    expect(s.schools.map((x) => x.key)).toEqual(['School of Technology', '', 'School of Science'])
    expect(s.schools[0]).toEqual({ key: 'School of Technology', exp: 4, arr: 3 })
    expect(s.schools.find((x) => x.key === '')).toEqual({ key: '', exp: 2, arr: 2 })
  })
  it('fills the year by school grid, with the empty key for no school', () => {
    expect(s.cell.get(cellKey(2010, 'School of Technology'))).toEqual({ exp: 4, arr: 3 })
    expect(s.cell.get(cellKey(2010, 'School of Science'))).toEqual({ exp: 1, arr: 0 })
    expect(s.cell.get(cellKey(2015, ''))).toEqual({ exp: 2, arr: 2 })
    expect(s.cell.get(cellKey(2015, 'School of Law'))).toBeUndefined()
  })
  it('counts people on campus by decade and school', () => {
    expect(s.decades).toEqual([{ label: '2010s', n: 5 }])
    expect(s.campusSchools).toEqual([{ key: 'School of Technology', n: 3 }, { key: '', n: 2 }])
  })
  it('counts parking by vehicle, once per party, arrived only when the party entered', () => {
    expect(s.parking).toEqual({ four: { exp: 1, arr: 1 }, two: { exp: 1, arr: 1 } })
  })
  it('counts walk-ins by people and parties', () => {
    expect(s.walkIns).toEqual({ parties: 1, people: 2 })
  })
  it('splits expected exactly and arrived as an estimate, alumnus then spouse then children', () => {
    expect(s.split.exp).toEqual([3, 1, 3])
    expect(s.split.arr).toEqual([2, 1, 2])
  })
  it('sorts years ascending and schools by expected, largest first', () => {
    expect(s.years.map((y) => y.year)).toEqual([2010, 2015])
    for (let i = 1; i < s.schools.length; i++) expect(s.schools[i - 1]!.exp).toBeGreaterThanOrEqual(s.schools[i]!.exp)
  })
})

describe('computeStats: party edge cases', () => {
  it('uses the entitled override, not the registered size', () => {
    const p = party({ spouse: 'yes', children: 2, entitledOverride: 2 })
    const s = computeStats(rowsOf([p], []), [])
    expect(s.expected).toBe(2)
    expect(s.split.exp).toEqual([1, 1, 0])
  })
  it('lets the override drop below the spouse slot', () => {
    const p = party({ spouse: 'yes', children: 1, entitledOverride: 1 })
    expect(computeStats(rowsOf([p], []), []).split.exp).toEqual([1, 0, 0])
  })
  it('treats "maybe" as a spouse slot', () => {
    const p = party({ spouse: 'maybe' })
    expect(p.partySize).toBe(2)
    expect(computeStats(rowsOf([p], []), []).split.exp).toEqual([1, 1, 0])
  })
  it('puts children first when there is no spouse', () => {
    const p = party({ children: 2 })
    const e = ev(p.id, 'entry', 2, T0)
    expect(computeStats(rowsOf([p], [e]), [e]).split).toEqual({ exp: [1, 0, 2], arr: [1, 0, 1] })
  })
  it('handles a party of zero (override 0) without negative numbers', () => {
    const p = party({ entitledOverride: 0 })
    const s = computeStats(rowsOf([p], []), [])
    expect(s.expected).toBe(0)
    expect(s.split.exp).toEqual([0, 0, 0])
  })
  it('counts more arrivals than expected without breaking the split or notArrived', () => {
    const p = party({ children: 1 })
    const e = ev(p.id, 'entry', 4, T0)
    const s = computeStats(rowsOf([p], [e]), [e])
    expect(s.arrived).toBe(4)
    expect(s.notArrived).toBe(0)
    expect(s.split.arr).toEqual([1, 0, 3])
  })
  it('does not count a party that has not entered as arrived, even if parked', () => {
    const p = party({ parking: 'four_wheeler' })
    const s = computeStats(rowsOf([p], []), [])
    expect(s.parking.four).toEqual({ exp: 1, arr: 0 })
    expect(s.arrived).toBe(0)
  })
  it('does not count a walk-in that has not entered', () => {
    const p = party({ source: 'onspot' })
    expect(computeStats(rowsOf([p], []), []).walkIns).toEqual({ parties: 0, people: 0 })
  })
  it('ignores parking "none"', () => {
    const s = computeStats(rowsOf([party()], []), [])
    expect(s.parking).toEqual({ four: { exp: 0, arr: 0 }, two: { exp: 0, arr: 0 } })
  })
})

describe('computeStats: scans and corrections', () => {
  it('uses the earliest entry and ignores a second one', () => {
    const p = party({ children: 3 })
    const a = ev(p.id, 'entry', 2, T0)
    const b = ev(p.id, 'entry', 4, T0 + 10 * MIN, { counter: 'GATE-2' })
    const s = computeStats(rowsOf([p], [a, b]), [a, b])
    expect(s.arrived).toBe(2)
  })
  it('drops a voided entry and then counts the party as not arrived', () => {
    const p = party()
    const a = ev(p.id, 'entry', 1, T0)
    const evs = [a, voidOf(a, T0 + MIN)]
    const s = computeStats(rowsOf([p], evs), evs)
    expect(s.arrived).toBe(0)
    expect(s.notArrived).toBe(1)
  })
  it('drops a voided meal', () => {
    const p = party({ children: 1 })
    const e = ev(p.id, 'entry', 2, T0)
    const d = ev(p.id, 'dinner', 2, T0 + 30 * MIN)
    const evs = [e, d, voidOf(d, T0 + 31 * MIN)]
    const s = computeStats(rowsOf([p], evs), evs)
    expect(s.served).toBe(0)
    expect(s.waiting).toBe(2)
  })
  it('adds up several servings of one party', () => {
    const p = party({ children: 2 })
    const evs = [ev(p.id, 'entry', 3, T0), ev(p.id, 'dinner', 1, T0 + 30 * MIN), ev(p.id, 'dinner', 1, T0 + 31 * MIN)]
    const s = computeStats(rowsOf([p], evs), evs)
    expect(s.served).toBe(2)
    expect(s.waiting).toBe(1)
  })
  it('never lets waiting go negative when more were served than came in', () => {
    const p = party({ children: 2 })
    const evs = [ev(p.id, 'entry', 1, T0), ev(p.id, 'dinner', 3, T0 + 30 * MIN)]
    const s = computeStats(rowsOf([p], evs), evs)
    expect(s.waiting).toBe(0)
    expect(s.served).toBe(3)
    expect(s.review).toBe(0)
  })
  it('flags review for meals without entry, over-serving and possible duplicates', () => {
    const noEntry = party()
    const over = party()
    const dup = party({ possibleDuplicateOf: 'x' })
    const fine = party()
    const evs = [ev(noEntry.id, 'dinner', 1, T0), ev(over.id, 'entry', 1, T0), ev(over.id, 'dinner', 2, T0 + MIN), ev(fine.id, 'entry', 1, T0)]
    expect(computeStats(rowsOf([noEntry, over, dup, fine], evs), evs).review).toBe(3)
  })
  it('counts a meal without entry as served but not as waiting', () => {
    const p = party()
    const evs = [ev(p.id, 'dinner', 1, T0)]
    const s = computeStats(rowsOf([p], evs), evs)
    expect(s.served).toBe(1)
    expect(s.waiting).toBe(0)
    expect(s.arrived).toBe(0)
  })
})

describe('computeStats: dinner overrides', () => {
  const p = party({ children: 1 })
  const q = party()
  it('counts dinner passes that carry an override reason', () => {
    const evs = [ev(p.id, 'dinner', 1, T0, { overrideReason: 'Guest of chief guest' }), ev(p.id, 'dinner', 1, T0 + MIN)]
    expect(computeStats(rowsOf([p], evs), evs).overrides).toBe(1)
  })
  it('does not count entry overrides', () => {
    const evs = [ev(p.id, 'entry', 1, T0, { overrideReason: 'x' })]
    expect(computeStats(rowsOf([p], evs), evs).overrides).toBe(0)
  })
  it('only counts parties in the current rows, so a filter narrows it', () => {
    const evs = [ev(p.id, 'dinner', 1, T0, { overrideReason: 'a' }), ev(q.id, 'dinner', 1, T0, { overrideReason: 'b' })]
    expect(computeStats(rowsOf([p, q], evs), evs).overrides).toBe(2)
    expect(computeStats(rowsOf([p], evs), evs).overrides).toBe(1)
  })
  it('does not count an override that was undone', () => {
    const o = ev(p.id, 'dinner', 1, T0, { overrideReason: 'a' })
    const evs = [o, voidOf(o, T0 + MIN)]
    expect(computeStats(rowsOf([p], evs), evs).overrides).toBe(0)
  })
})

describe('computeStats: invariants over random events', () => {
  // Seeded so a failure reproduces.
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const schools = ['School of Technology', 'School of Science', 'School of Law', null]
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it('seed ' + seed, () => {
      const r = rng(seed)
      const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!
      const parties = Array.from({ length: 60 }, () =>
        party({
          batchYear: pick([1990, 1999, 2005, 2010, 2010, 2015, 2024]),
          school: pick(schools),
          spouse: pick(['no', 'yes', 'maybe'] as const),
          children: Math.floor(r() * 4),
          entitledOverride: r() < 0.1 ? Math.floor(r() * 4) : null,
          source: r() < 0.2 ? 'onspot' : 'booked',
          parking: pick(['none', 'two_wheeler', 'four_wheeler'] as const),
        }),
      )
      const events = parties.flatMap((p) => {
        const out = []
        if (r() < 0.6) {
          const e = ev(p.id, 'entry', 1 + Math.floor(r() * 5), T0 + Math.floor(r() * 180) * MIN)
          out.push(e)
          if (r() < 0.15) out.push(voidOf(e, e.clientAt + MIN))
        }
        if (r() < 0.4) out.push(ev(p.id, 'dinner', 1 + Math.floor(r() * 3), T0 + Math.floor(r() * 180) * MIN))
        return out
      })
      const s = computeStats(rowsOf(parties, events), events)
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
      expect(sum(s.years.map((y) => y.exp))).toBe(s.expected)
      expect(sum(s.years.map((y) => y.arr))).toBe(s.arrived)
      expect(sum(s.schools.map((y) => y.exp))).toBe(s.expected)
      expect(sum(s.schools.map((y) => y.arr))).toBe(s.arrived)
      expect(sum([...s.cell.values()].map((c) => c.exp))).toBe(s.expected)
      expect(sum([...s.cell.values()].map((c) => c.arr))).toBe(s.arrived)
      expect(sum(s.decades.map((d) => d.n))).toBe(s.arrived)
      expect(sum(s.campusSchools.map((d) => d.n))).toBe(s.arrived)
      expect(sum(s.split.exp)).toBe(s.expected)
      expect(sum(s.split.arr)).toBe(s.arrived)
      expect(s.notArrived).toBe(Math.max(0, s.expected - s.arrived))
      expect(s.walkIns.people).toBeLessThanOrEqual(s.arrived)
      expect(s.waiting).toBeGreaterThanOrEqual(0)
      expect(s.parking.four.arr).toBeLessThanOrEqual(s.parking.four.exp)
      expect(s.parking.two.arr).toBeLessThanOrEqual(s.parking.two.exp)
      for (const v of [...s.split.exp, ...s.split.arr]) expect(v).toBeGreaterThanOrEqual(0)
      // A filter must be a plain subset: the filtered totals equal the totals over just those parties.
      const f = { years: [2010, 2015], schools: [] }
      const sub = computeStats(rowsOf(parties.filter((p) => matches(p, f)), events), events)
      expect(sub.expected).toBe(sum(s.years.filter((y) => f.years.includes(y.year)).map((y) => y.exp)))
      expect(sub.arrived).toBe(sum(s.years.filter((y) => f.years.includes(y.year)).map((y) => y.arr)))
    })
  }
})

describe('filterOptions', () => {
  it('counts guests per year and per school, with a key for none', () => {
    const ps = [party({ batchYear: 2012, school: 'School of Law', children: 1 }), party({ batchYear: 2010, school: 'School of Law' }), party({ batchYear: 2010, school: null })]
    const o = filterOptions(ps, (id) => ps.find((p) => p.id === id)!.partySize)
    expect(o.years).toEqual([{ year: 2010, guests: 2 }, { year: 2012, guests: 2 }])
    expect(o.schools).toEqual([{ key: 'School of Law', guests: 3 }, { key: '', guests: 1 }])
  })
  it('is empty for an empty roster', () => {
    expect(filterOptions([], () => 0)).toEqual({ years: [], schools: [] })
  })
})

describe('arrivalSeries', () => {
  const T = T0 // on a 15 minute boundary
  const entries = (spec: [number, number][]) => {
    const ps = spec.map(() => party({ children: 5 }))
    const evs = spec.map(([min, qty], i) => ev(ps[i]!.id, 'entry', qty, T + min * MIN))
    return rowsOf(ps, evs)
  }

  it('is null before the first check-in', () => {
    expect(arrivalSeries(rowsOf([party()], []), T, 100, 0)).toBeNull()
  })
  it('buckets people (not parties) into 15 minute slots, ending with the current slot', () => {
    const rows = entries([[1, 10], [16, 20], [31, 30], [46, 40]])
    const s = arrivalSeries(rows, T + 50 * MIN, 400, 100)!
    expect(s.bars.filter((b) => b.kind !== 'proj').map((b) => [b.start - T, b.n, b.kind])).toEqual([[0, 10, 'act'], [15 * MIN, 20, 'act'], [30 * MIN, 30, 'act'], [45 * MIN, 40, 'now']])
    expect(s.current).toBe(40)
    expect(s.peak).toBe(40)
  })
  it('keeps empty slots between check-ins as zero bars', () => {
    const rows = entries([[1, 5], [61, 5]])
    const s = arrivalSeries(rows, T + 62 * MIN, 1000, 10)!
    expect(s.bars.slice(0, 5).map((b) => b.n)).toEqual([5, 0, 0, 0, 5])
  })
  it('projects to 80% of expected at the mean of the last three complete slots', () => {
    const rows = entries([[1, 10], [16, 20], [31, 30], [46, 40]])
    // target 160, arrived 100, pace (10+20+30)/3 = 20, so 3 more slots
    const s = arrivalSeries(rows, T + 50 * MIN, 200, 100)!
    const proj = s.bars.filter((b) => b.kind === 'proj')
    expect(proj).toHaveLength(3)
    expect(proj.every((b) => b.n === 20)).toBe(true)
    expect(proj[0]!.start).toBe(T + 60 * MIN)
    expect(s.eta).toBe(T + 45 * MIN + 3 * 15 * MIN)
    expect(s.done).toBe(false)
    expect(s.slow).toBe(false)
  })
  it('says done, with no projection, once 80% are in', () => {
    const rows = entries([[1, 10]])
    const s = arrivalSeries(rows, T + 2 * MIN, 100, 80)!
    expect(s.done).toBe(true)
    expect(s.eta).toBeNull()
    expect(s.bars.some((b) => b.kind === 'proj')).toBe(false)
  })
  it('rounds the 80% target up', () => {
    const rows = entries([[1, 10]])
    expect(arrivalSeries(rows, T + 2 * MIN, 7, 5)!.done).toBe(false) // 5.6 -> 6
    expect(arrivalSeries(rows, T + 2 * MIN, 7, 6)!.done).toBe(true)
  })
  it('names no time when the pace is too slow (more than 8 slots away)', () => {
    const rows = entries([[1, 1], [16, 1], [31, 1], [46, 1]])
    const s = arrivalSeries(rows, T + 50 * MIN, 1000, 4)!
    expect(s.slow).toBe(true)
    expect(s.eta).toBeNull()
    expect(s.bars.some((b) => b.kind === 'proj')).toBe(false)
  })
  it('is slow, not infinite, when the recent pace is zero', () => {
    const rows = entries([[1, 10], [120, 0]])
    const s = arrivalSeries(rows, T + 150 * MIN, 100, 10)!
    expect(s.slow).toBe(true)
  })
  it('allows exactly 8 projected slots', () => {
    const rows = entries([[1, 10], [16, 10], [31, 10], [46, 10]])
    // pace 10, target 160, arrived 80, need 80 -> 8 slots
    const s = arrivalSeries(rows, T + 50 * MIN, 200, 80)!
    expect(s.bars.filter((b) => b.kind === 'proj')).toHaveLength(8)
    expect(s.slow).toBe(false)
    // need 81 -> 9 slots -> slow
    expect(arrivalSeries(rows, T + 50 * MIN, 200, 79)!.slow).toBe(true)
  })
  it('uses the only slot when the first check-in is still in the current slot', () => {
    const rows = entries([[2, 12]])
    const s = arrivalSeries(rows, T + 5 * MIN, 100, 12)!
    expect(s.bars.find((b) => b.kind === 'proj')!.n).toBe(12)
  })
  it('shows at most the last 16 slots', () => {
    const rows = entries([[0, 1], [600, 1]])
    const s = arrivalSeries(rows, T + 601 * MIN, 1000, 2)!
    expect(s.bars.filter((b) => b.kind !== 'proj')).toHaveLength(16)
    expect(s.bars.filter((b) => b.kind !== 'proj').at(-1)!.kind).toBe('now')
  })
  it('keeps the slots in order, 15 minutes apart', () => {
    const rows = entries([[1, 4], [200, 4]])
    const s = arrivalSeries(rows, T + 201 * MIN, 100, 8)!
    for (let i = 1; i < s.bars.length; i++) expect(s.bars[i]!.start - s.bars[i - 1]!.start).toBe(15 * MIN)
  })
  it('does not lose a check-in stamped after "now" (a phone clock running fast)', () => {
    const rows = entries([[40, 7]])
    const s = arrivalSeries(rows, T + 10 * MIN, 100, 7)!
    expect(s.bars.filter((b) => b.kind !== 'proj').at(-1)!.n).toBe(7)
  })
  it('ignores a voided entry', () => {
    const p = party({ children: 2 })
    const e = ev(p.id, 'entry', 3, T + MIN)
    const rows = rowsOf([p], [e, voidOf(e, T + 2 * MIN)])
    expect(arrivalSeries(rows, T + 3 * MIN, 10, 0)).toBeNull()
  })
  it('reports the peak over real slots only, never the projection', () => {
    const rows = entries([[1, 3], [16, 3], [31, 3]])
    const s = arrivalSeries(rows, T + 35 * MIN, 100, 9)!
    expect(s.peak).toBe(3)
  })
})

describe('dinnerSeries', () => {
  const p = party({ children: 5 })
  const entry = ev(p.id, 'entry', 4, T0 + 5 * MIN)
  it('is null before the first meal', () => {
    expect(dinnerSeries(rowsOf([p], [entry]), liveEvents([entry]), T0 + 10 * MIN)).toBeNull()
  })
  it('counts meals per 30 minutes and the queue at the end of each slot', () => {
    const evs = [entry, ev(p.id, 'dinner', 1, T0 + 35 * MIN), ev(p.id, 'dinner', 2, T0 + 65 * MIN)]
    const s = dinnerSeries(rowsOf([p], evs), liveEvents(evs), T0 + 70 * MIN)!
    expect(s.bars.map((b) => [b.start - T0, b.meals, b.queue])).toEqual([[30 * MIN, 1, 3], [60 * MIN, 2, 1]])
    expect(s.max).toBe(3)
  })
  it('caps the last slot at now, so a meal later in the slot is not yet served', () => {
    const evs = [entry, ev(p.id, 'dinner', 1, T0 + 35 * MIN), ev(p.id, 'dinner', 2, T0 + 80 * MIN)]
    const s = dinnerSeries(rowsOf([p], evs), liveEvents(evs), T0 + 70 * MIN)
    // the later meal is in the future from now's view and its slot is not shown
    expect(s!.bars.at(-1)!.start).toBe(T0 + 60 * MIN)
  })
  it('ignores meals from parties outside the rows', () => {
    const other = party()
    const evs = [entry, ev(p.id, 'dinner', 1, T0 + 35 * MIN), ev(other.id, 'dinner', 1, T0 + 36 * MIN)]
    const s = dinnerSeries(rowsOf([p], evs), liveEvents(evs), T0 + 40 * MIN)!
    expect(s.bars).toHaveLength(1)
    expect(s.bars[0]!.meals).toBe(1)
  })
  it('has a queue of zero rather than negative when meals outnumber entries', () => {
    const evs = [ev(p.id, 'dinner', 3, T0 + 35 * MIN)]
    const s = dinnerSeries(rowsOf([p], evs), liveEvents(evs), T0 + 40 * MIN)!
    expect(s.bars[0]!.queue).toBe(0)
  })
  it('always has a scale of at least 1', () => {
    const evs = [ev(p.id, 'dinner', 0, T0 + 35 * MIN)]
    expect(dinnerSeries(rowsOf([p], evs), liveEvents(evs), T0 + 40 * MIN)!.max).toBeGreaterThanOrEqual(1)
  })
  it('shows at most the last 8 slots', () => {
    const evs = [entry, ev(p.id, 'dinner', 1, T0), ev(p.id, 'dinner', 1, T0 + 10 * 60 * MIN)]
    const s = dinnerSeries(rowsOf([p], evs), liveEvents(evs), T0 + 10 * 60 * MIN + MIN)!
    expect(s.bars).toHaveLength(8)
  })
  it('does not count voided meals when given live events', () => {
    const d = ev(p.id, 'dinner', 2, T0 + 35 * MIN)
    const evs = [entry, d, voidOf(d, T0 + 36 * MIN)]
    expect(dinnerSeries(rowsOf([p], evs), liveEvents(evs), T0 + 40 * MIN)).toBeNull()
  })
})

describe('counterRows', () => {
  const counters = COUNTERS.filter((c) => c.kind === 'dinner').slice(0, 3)
  const now = T0 + 60 * MIN
  const p = party({ children: 5 })
  it('lists every counter, with zeros for ones nobody used', () => {
    const rows = counterRows(counters, [], 'dinner', now)
    expect(rows.map((r) => [r.code, r.n, r.lastAt, r.rate, r.active])).toEqual(counters.map((c) => [c.code, 0, null, 0, false]))
  })
  it('sums servings, not scans', () => {
    const evs = [ev(p.id, 'dinner', 2, now - 20 * MIN), ev(p.id, 'dinner', 3, now - 5 * MIN)]
    expect(counterRows(counters, evs, 'dinner', now)[0]!.n).toBe(5)
  })
  it('reports people per minute over the last 10 minutes', () => {
    const evs = [ev(p.id, 'dinner', 2, now - 20 * MIN), ev(p.id, 'dinner', 3, now - 5 * MIN), ev(p.id, 'dinner', 2, now - 1 * MIN)]
    expect(counterRows(counters, evs, 'dinner', now)[0]!.rate).toBeCloseTo(0.5)
  })
  it('is active until 10 minutes pass since the last scan, and quiet after', () => {
    const at = (m: number) => counterRows(counters, [ev(p.id, 'dinner', 1, now - m * MIN)], 'dinner', now)[0]!.active
    expect(at(9)).toBe(true)
    expect(at(10)).toBe(false)
    expect(at(30)).toBe(false)
  })
  it('remembers who scanned last and when', () => {
    const evs = [ev(p.id, 'dinner', 1, now - 30 * MIN, { actorName: 'Asha' }), ev(p.id, 'dinner', 1, now - 3 * MIN, { actorName: 'Ravi' }), ev(p.id, 'dinner', 1, now - 15 * MIN, { actorName: 'Meena' })]
    const r = counterRows(counters, evs, 'dinner', now)[0]!
    expect(r.actor).toBe('Ravi')
    expect(r.lastAt).toBe(now - 3 * MIN)
  })
  it('keeps counters apart', () => {
    const evs = [ev(p.id, 'dinner', 1, now - MIN, { counter: counters[1]!.code })]
    const rows = counterRows(counters, evs, 'dinner', now)
    expect(rows.map((r) => r.n)).toEqual([0, 1, 0])
  })
  it('ignores the other checkpoint', () => {
    const evs = [ev(p.id, 'entry', 4, now - MIN, { counter: counters[0]!.code })]
    expect(counterRows(counters, evs, 'dinner', now)[0]!.n).toBe(0)
    expect(counterRows(counters, evs, 'entry', now)[0]!.n).toBe(4)
  })
  it('ignores events from counters that are not in the list', () => {
    const evs = [ev(p.id, 'dinner', 1, now - MIN, { counter: 'DINNER-99' })]
    expect(counterRows(counters, evs, 'dinner', now).every((r) => r.n === 0)).toBe(true)
  })
})

describe('gateRows', () => {
  const gates = COUNTERS.filter((c) => c.kind === 'gate')
  it('adds up people per gate and lists quiet gates as zero', () => {
    const a = party({ children: 2 })
    const b = party()
    const evs = [ev(a.id, 'entry', 3, T0, { counter: 'GATE-1' }), ev(b.id, 'entry', 1, T0 + MIN, { counter: 'GATE-1' })]
    expect(gateRows(gates, rowsOf([a, b], evs)).map((g) => [g.code, g.n])).toEqual([['GATE-1', 4], ['GATE-2', 0]])
  })
  it('counts a party once, at the gate that counts, when it was scanned at two gates', () => {
    const a = party({ children: 2 })
    const evs = [ev(a.id, 'entry', 3, T0, { counter: 'GATE-1' }), ev(a.id, 'entry', 3, T0 + 5 * MIN, { counter: 'GATE-2' })]
    const rows = rowsOf([a], evs)
    const g = gateRows(gates, rows)
    expect(g.map((x) => x.n)).toEqual([3, 0])
    expect(g.reduce((n, x) => n + x.n, 0)).toBe(computeStats(rows, evs).arrived)
  })
  it('drops a gate scan that was undone', () => {
    const a = party()
    const e = ev(a.id, 'entry', 1, T0, { counter: 'GATE-1' })
    expect(gateRows(gates, rowsOf([a], [e, voidOf(e, T0 + MIN)])).every((g) => g.n === 0)).toBe(true)
  })
  it('follows the rows, so a filter narrows it', () => {
    const a = party({ batchYear: 2010 })
    const b = party({ batchYear: 2011 })
    const evs = [ev(a.id, 'entry', 1, T0), ev(b.id, 'entry', 1, T0)]
    expect(gateRows(gates, rowsOf([a], evs))[0]!.n).toBe(1)
  })
})
