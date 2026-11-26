import type { PartyState } from './state.ts'
import type { Party } from './types.ts'

/** Stats are computed on the phone from the roster, so they cover only what this phone has heard about. No backend call. */

export interface Filter {
  years: number[]
  schools: string[]
}
export const NO_FILTER: Filter = { years: [], schools: [] }
export const filterOn = (f: Filter) => f.years.length > 0 || f.schools.length > 0

/** Schools are keyed by name; a guest with no school has the empty key. */
export const schoolKey = (s: string | null) => s ?? ''

export function matches(p: Party, f: Filter) {
  return (!f.years.length || f.years.includes(p.batchYear)) && (!f.schools.length || f.schools.includes(schoolKey(p.school)))
}

export interface Tally {
  exp: number
  arr: number
}

/** Whole percent. Never shows 100 until everyone is in, and never 0 once anyone is. */
export function pct(arr: number, exp: number) {
  if (exp <= 0) return 0
  const p = Math.round((arr / exp) * 100)
  if (arr < exp) return Math.min(99, Math.max(arr > 0 ? 1 : 0, p))
  return 100
}

/** Groups of one or two people say "1 of 2" instead of a bold percentage. */
export const isSmall = (exp: number) => exp > 0 && exp <= 2

/** 1 to 5 for the shading ramp: 1-19, 20-39, 40-59, 60-79, 80-100. */
export const bucket = (p: number) => (p >= 80 ? 5 : p >= 60 ? 4 : p >= 40 ? 3 : p >= 20 ? 2 : 1)

export const decadeOf = (year: number) => Math.floor(year / 10) * 10

/** "Technology" -> "Tech". Four letters at most so grid headers stay on one line. */
const SHORT: Record<string, string> = { Technology: 'Tech', Business: 'Bus', Science: 'Sci', Pharmacy: 'Phar', Law: 'Law', Dental: 'Dent', Architecture: 'Arch', Humanities: 'Hum', 'Medical Sciences': 'Med', Nursing: 'Nurs' }
export const schoolCode = (shortName: string) => SHORT[shortName] ?? shortName.slice(0, 4)

export interface Row {
  party: Party
  st: PartyState
}

export interface SchoolTally extends Tally {
  key: string
}
export interface YearTally extends Tally {
  year: number
}

const tally = <K,>(m: Map<K, Tally>, k: K, exp: number, arr: number) => {
  const t = m.get(k)
  if (t) {
    t.exp += exp
    t.arr += arr
  } else m.set(k, { exp, arr })
}

export interface Stats {
  guests: number
  parties: number
  expected: number
  arrived: number
  notArrived: number
  review: number
  years: YearTally[]
  schools: SchoolTally[]
  cell: Map<string, Tally>
  decades: { label: string; n: number }[]
  campusSchools: { key: string; n: number }[]
  parking: { four: Tally; two: Tally }
  split: { exp: [number, number, number]; arr: [number, number, number] }
  walkIns: { parties: number; people: number }
}

export const cellKey = (year: number, school: string) => year + '|' + school

export function computeStats(rows: Row[]): Stats {
  let expected = 0, arrived = 0, review = 0
  const years = new Map<number, Tally>()
  const schools = new Map<string, Tally>()
  const cell = new Map<string, Tally>()
  const decades = new Map<number, number>()
  const campus = new Map<string, number>()
  const parking = { four: { exp: 0, arr: 0 }, two: { exp: 0, arr: 0 } }
  const split = { exp: [0, 0, 0] as [number, number, number], arr: [0, 0, 0] as [number, number, number] }
  const walkIns = { parties: 0, people: 0 }

  for (const { party: p, st } of rows) {
    const exp = st.entitled
    const here = st.entered ? (st.headcount ?? 0) : 0
    expected += exp
    arrived += here
    if (st.needsReview) review++
    const k = schoolKey(p.school)
    tally(years, p.batchYear, exp, here)
    tally(schools, k, exp, here)
    tally(cell, cellKey(p.batchYear, k), exp, here)
    if (here) {
      decades.set(decadeOf(p.batchYear), (decades.get(decadeOf(p.batchYear)) ?? 0) + here)
      campus.set(k, (campus.get(k) ?? 0) + here)
      if (p.source === 'onspot') {
        walkIns.parties++
        walkIns.people += here
      }
    }
    const bin = p.parking === 'four_wheeler' ? parking.four : p.parking === 'two_wheeler' ? parking.two : null
    if (bin) {
      bin.exp++
      if (st.entered) bin.arr++
    }
    // Alumnus first, then spouse, then children. The gate counts heads, not who, so the arrived side is an estimate.
    const spouseSlot = p.spouse !== 'no' ? 1 : 0
    const a = Math.min(1, exp), s = Math.min(spouseSlot, exp - a), c = exp - a - s
    split.exp[0] += a
    split.exp[1] += s
    split.exp[2] += c
    const ha = Math.min(1, here), hs = Math.min(spouseSlot, Math.max(0, here - ha)), hc = here - ha - hs
    split.arr[0] += ha
    split.arr[1] += hs
    split.arr[2] += hc
  }

  return {
    guests: expected,
    parties: rows.length,
    expected,
    arrived,
    notArrived: Math.max(0, expected - arrived),
    review,
    years: [...years].map(([year, t]) => ({ year, ...t })).sort((a, b) => a.year - b.year),
    schools: [...schools].map(([key, t]) => ({ key, ...t })).sort((a, b) => b.exp - a.exp),
    cell,
    decades: [...decades].sort((a, b) => a[0] - b[0]).map(([d, n]) => ({ label: d + 's', n })),
    campusSchools: [...campus].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n),
    parking,
    split,
    walkIns,
  }
}

/** Counts per year and per school over the whole roster, for the filter sheet. */
export function filterOptions(parties: Party[], expectedOf: (id: string) => number) {
  const years = new Map<number, number>()
  const schools = new Map<string, number>()
  for (const p of parties) {
    const n = expectedOf(p.id)
    years.set(p.batchYear, (years.get(p.batchYear) ?? 0) + n)
    const k = schoolKey(p.school)
    schools.set(k, (schools.get(k) ?? 0) + n)
  }
  return {
    years: [...years].sort((a, b) => a[0] - b[0]).map(([year, guests]) => ({ year, guests })),
    schools: [...schools].sort((a, b) => b[1] - a[1]).map(([key, guests]) => ({ key, guests })),
  }
}

export const MIN15 = 15 * 60000
const floorTo = (t: number, size: number) => Math.floor(t / size) * size

export interface ArrivalBar {
  start: number
  n: number
  kind: 'act' | 'now' | 'proj'
}
export interface ArrivalSeries {
  bars: ArrivalBar[]
  peak: number
  current: number
  /** When 80% of the expected people should be in at the recent pace, or null. */
  eta: number | null
  /** Set when 80% is already in. */
  done: boolean
  /** Set when the pace is too slow to name a time. */
  slow: boolean
}

/** Arrivals per 15 minutes (people), the last 16 slots, plus a projection to 80% of expected at the recent pace. */
export function arrivalSeries(rows: Row[], now: number, expected: number, arrived: number): ArrivalSeries | null {
  const times: [number, number][] = []
  for (const { st } of rows) if (st.entered && st.enteredAt != null) times.push([st.enteredAt, st.headcount ?? 0])
  if (!times.length) return null
  const first = floorTo(Math.min(...times.map((t) => t[0])), MIN15)
  const last = floorTo(Math.max(...times.map((t) => t[0])), MIN15)
  const nowB = Math.max(floorTo(now, MIN15), last)
  const start = Math.max(first, nowB - 15 * MIN15)
  const counts = new Map<number, number>()
  for (const [t, n] of times) {
    const b = floorTo(t, MIN15)
    if (b >= start) counts.set(b, (counts.get(b) ?? 0) + n)
  }
  const bars: ArrivalBar[] = []
  for (let b = start; b <= nowB; b += MIN15) bars.push({ start: b, n: counts.get(b) ?? 0, kind: b === nowB ? 'now' : 'act' })
  const complete = bars.slice(0, -1).slice(-3)
  const sample = complete.length ? complete : bars
  const pace = sample.reduce((n, b) => n + b.n, 0) / sample.length
  const target = Math.ceil(expected * 0.8)
  const need = target - arrived
  let eta: number | null = null
  let slow = false
  const done = need <= 0
  if (!done) {
    const k = pace > 0 ? Math.ceil(need / pace) : Infinity
    if (k <= 8) {
      for (let i = 1; i <= k; i++) bars.push({ start: nowB + i * MIN15, n: Math.round(pace), kind: 'proj' })
      eta = nowB + k * MIN15
    } else slow = true
  }
  return { bars, peak: Math.max(...bars.filter((b) => b.kind !== 'proj').map((b) => b.n)), current: bars.find((b) => b.kind === 'now')?.n ?? 0, eta, done, slow }
}

/** People counted at each gate. Only the entry that counts for a party (its earliest) is used, so a second scan of the same party at another gate doesn't make the gates add up to more than "arrived". */
export function gateRows(counters: { code: string; label: string }[], rows: Row[]) {
  const per = new Map<string, number>()
  for (const { st } of rows) if (st.entered && st.enteredCounter) per.set(st.enteredCounter, (per.get(st.enteredCounter) ?? 0) + (st.headcount ?? 0))
  return counters.map((c) => ({ code: c.code, label: c.label, n: per.get(c.code) ?? 0 }))
}
