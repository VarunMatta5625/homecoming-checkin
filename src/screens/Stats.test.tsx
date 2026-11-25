// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Roster, SyncStatus } from '../lib/hooks.ts'
import { ev, MIN, party, resetIds, rosterOf, T0 } from '../test/fixtures.ts'
import type { Party, ScanEvent } from '../lib/types.ts'

const h = vi.hoisted(() => ({
  roster: undefined as Roster | undefined,
  status: { online: true, syncing: false, pending: 0, failed: 0 } as SyncStatus,
  now: 0,
  lastSyncAt: null as number | null,
  kickSync: vi.fn(),
  retryFailed: vi.fn(),
}))

vi.mock('../lib/hooks.ts', () => ({ useRoster: () => h.roster, useSyncStatus: () => h.status, useNow: () => h.now }))
vi.mock('../lib/prefs.ts', () => ({ prefs: { use: () => ({ lastSyncAt: h.lastSyncAt }) } }))
vi.mock('../lib/sync.ts', () => ({ kickSync: h.kickSync, retryFailed: h.retryFailed }))
// The real Screen pulls in the backend, sync and session. Only its title and children matter here.
vi.mock('../components/layout.tsx', () => ({ Screen: ({ title, children }: { title?: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main> }))

import { BUILTIN_COUNTERS } from '../lib/config.ts'
import { countersStore, setCounters } from '../lib/counters.ts'
import { StatsScreen } from './Stats.tsx'

const NOW = T0 + 90 * MIN

/** Ten guests: 7 in, one party that may be listed twice (needs review), one walk-in party. */
function scenario() {
  const A = party({ batchYear: 2010, school: 'School of Technology', spouse: 'yes', children: 2, parking: 'four_wheeler' }) // 4
  const B = party({ batchYear: 2010, school: 'School of Science' }) // 1
  const C = party({ batchYear: 2005, school: 'School of Technology', spouse: 'yes' }) // 2, not here
  const D = party({ batchYear: 2015, school: null, source: 'onspot', children: 1, parking: 'two_wheeler' }) // 2
  const E = party({ batchYear: 2010, school: 'School of Technology', possibleDuplicateOf: A.id }) // 1, shares a mobile with A
  const events: ScanEvent[] = [
    ev(A.id, 'entry', 3, T0 + 10 * MIN, { counter: 'GATE-1' }),
    ev(B.id, 'entry', 1, T0 + 20 * MIN, { counter: 'GATE-2' }),
    ev(D.id, 'entry', 2, T0 + 30 * MIN, { counter: 'GATE-1' }),
    ev(E.id, 'entry', 1, T0 + 35 * MIN, { counter: 'GATE-2' }),
  ]
  return { parties: [A, B, C, D, E], events }
}

function load(parties: Party[], events: ScanEvent[]) {
  h.roster = rosterOf(parties, events)
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/stats']}>
      <Routes>
        <Route path="/stats" element={<StatsScreen />} />
        <Route path="/stats/review" element={<div>REVIEW PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const tiles = () => [...document.querySelectorAll('.st-tile')].map((t) => t.textContent)
const tab = (name: string) => within(screen.getByRole('group', { name: 'Stats view' })).getByRole('button', { name })
const click = (el: Element) => fireEvent.click(el)

beforeEach(() => {
  resetIds()
  h.roster = undefined
  h.status = { online: true, syncing: false, pending: 0, failed: 0 }
  h.now = NOW
  h.lastSyncAt = NOW - 2 * MIN
  h.kickSync.mockReset()
  h.retryFailed.mockReset()
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  window.scrollTo = vi.fn()
})

afterEach(() => {
  countersStore.set({ list: BUILTIN_COUNTERS })
  // The tab and filter live in a module-level store so they survive navigation. Put them back for the next test.
  const clear = screen.queryByRole('button', { name: 'Clear' }) as HTMLButtonElement | null
  if (clear && !clear.disabled) click(clear)
  const entry = screen.queryByRole('group', { name: 'Stats view' })
  if (entry) click(within(entry).getByRole('button', { name: 'Entry' }))
  cleanup()
  vi.useRealTimers()
})

describe('states before there are numbers', () => {
  it('renders only the title while the roster loads', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Stats' })).toBeTruthy()
    expect(tiles()).toEqual([])
  })
  it('says the first sync has not finished when no guests and never synced', () => {
    h.lastSyncAt = null
    load([], [])
    mount()
    expect(screen.getByText('Getting the numbers')).toBeTruthy()
  })
  it('offers Sync now when synced but the guest list is empty', () => {
    load([], [])
    mount()
    expect(screen.getByText('No guests loaded yet')).toBeTruthy()
    click(screen.getByRole('button', { name: /Sync now/ }))
    expect(h.kickSync).toHaveBeenCalledTimes(1)
  })
  it('shows zeros and friendly empty-chart text before anyone has arrived', () => {
    const ps = [party({ children: 1 }), party()]
    load(ps, [])
    mount()
    expect(tiles()).toEqual(['0On campus now', '0%0 of 3 arrived', '0Review'])
    expect(screen.getByText('0 of 3 guests have checked in.')).toBeTruthy()
    expect(screen.getByText(/No check-ins yet/)).toBeTruthy()
  })
})

describe('header tiles and footer', () => {
  it('shows people on campus, percent and the review count', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    expect(tiles()).toEqual(['7On campus now', '70%7 of 10 arrived', '1 Review ›'])
  })
  it('the Review tile goes to the review screen', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    click(document.querySelector('button.st-tile.warn')!)
    expect(screen.getByText('REVIEW PAGE')).toBeTruthy()
  })
  it('shows when the numbers were updated and how many changes are still syncing', () => {
    const { parties, events } = scenario()
    load(parties, events)
    h.status = { ...h.status, pending: 3 }
    mount()
    const foot = document.querySelector('.st-foot')!.textContent!
    expect(foot).toMatch(/^Updated /)
    expect(foot).toContain('3 changes on this phone still syncing.')
    expect(foot).toContain('every phone this one has heard from')
  })
  it('says "Not synced yet" before any sync', () => {
    const { parties, events } = scenario()
    load(parties, events)
    h.lastSyncAt = null
    mount()
    expect(document.querySelector('.st-foot')!.textContent).toMatch(/^Not synced yet\./)
  })
  it('warns when offline and says how stale the numbers are', () => {
    const { parties, events } = scenario()
    load(parties, events)
    h.status = { ...h.status, online: false }
    h.lastSyncAt = NOW - 12 * MIN
    mount()
    const banner = document.querySelector('.banner')!.textContent!
    expect(banner).toMatch(/^Offline/)
    expect(banner).toMatch(/Last synced .*12 min ago/)
    expect(document.querySelector('.st-foot b')!.textContent).toMatch(/Last synced .*12 min ago/)
  })
  it('has no offline banner when online', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    expect(document.querySelector('.banner')).toBeNull()
  })
})

describe('alerts', () => {
  it('starts collapsed with a "+N more" and expands and collapses', () => {
    const { parties, events } = scenario()
    load(parties, events)
    h.status = { ...h.status, failed: 2 }
    mount()
    // failed syncs and one review: two alerts
    expect(screen.getByText('+1 more')).toBeTruthy()
    expect(screen.queryByText(/need review/)).toBeNull()
    click(screen.getByText('+1 more'))
    expect(screen.getByText('2 syncs failed on this phone. Tap to retry')).toBeTruthy()
    expect(screen.getByText('1 party need review')).toBeTruthy()
    click(screen.getByText('Show fewer'))
    expect(screen.getByText('+1 more')).toBeTruthy()
  })
  it('retries failed syncs when the alert is tapped', () => {
    const p = party()
    load([p], [])
    h.status = { ...h.status, failed: 1 }
    mount()
    click(screen.getByText('1 sync failed on this phone. Tap to retry'))
    expect(h.retryFailed).toHaveBeenCalledTimes(1)
  })
  it('opens the review screen from the alert', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    click(screen.getByText('1 party need review'))
    expect(screen.getByText('REVIEW PAGE')).toBeTruthy()
  })
  it('shows no alert strip when all is well', () => {
    const p = party()
    load([p], [])
    mount()
    expect(document.querySelector('.st-alerts')).toBeNull()
  })
})

describe('Entry tab', () => {
  it('shows the donut and how many of the expected people arrived', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    expect(screen.getByRole('heading', { name: 'Arrived of 10 expected' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '70 percent arrived' })).toBeTruthy()
  })
  it('estimates who is here, and says so', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    expect(screen.getByRole('img', { name: 'Expected: 5 alumni, 2 spouses, 3 children' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Arrived, estimated: 4 alumni, 1 spouses, 2 children' })).toBeTruthy()
    expect(screen.getByText('7 · estimated')).toBeTruthy()
  })
  it('splits walk-ins from pre-registered by people, and says how many parties', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    const legend = [...document.querySelectorAll('.lgd span')].map((s) => s.textContent)
    expect(legend).toContain('Pre-registered 5 · 71%')
    expect(legend).toContain('Walk-ins 2 · 29% · 1 party')
  })
  it('counts each gate once per party, so the gates add up to people on campus', () => {
    const { parties, events } = scenario()
    // Party A is also scanned at Gate 2 five minutes later: must not count twice.
    events.push(ev(parties[0]!.id, 'entry', 3, T0 + 15 * MIN, { counter: 'GATE-2' }))
    load(parties, events)
    mount()
    const g1 = screen.getByText('Gate desk 1').closest('.stack')!
    const g2 = screen.getByText('Gate desk 2').closest('.stack')!
    expect(g1.querySelector('.t-sub')!.textContent).toBe('5 · 71%')
    expect(g2.querySelector('.t-sub')!.textContent).toBe('2 · 29%')
  })
  it('shows the arrival time of 80% from the recent pace', () => {
    const ps = Array.from({ length: 4 }, () => party({ children: 5 }))
    load(ps, [ev(ps[0]!.id, 'entry', 6, T0 + 40 * MIN), ev(ps[1]!.id, 'entry', 6, T0 + 55 * MIN), ev(ps[2]!.id, 'entry', 6, T0 + 70 * MIN)])
    mount()
    expect(document.body.textContent).toMatch(/At this pace, 80% are here by .*\. 20 of 24\./)
  })
  it('says the pace is too slow to name a time when nobody has come in for a while', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    expect(screen.getByText('The pace is too slow to name a time for 80%.')).toBeTruthy()
  })
  it('does not break at 100% with everybody in', () => {
    const p = party({ children: 1 })
    load([p], [ev(p.id, 'entry', 2, T0)])
    mount()
    expect(tiles()[1]).toBe('100%2 of 2 arrived')
    expect(screen.getByText('80% are already here.')).toBeTruthy()
  })
})

describe('counters from the server', () => {
  it('shows only the gates the server lists', () => {
    const { parties, events } = scenario()
    load(parties, events)
    setCounters(BUILTIN_COUNTERS.filter((c) => c.code !== 'GATE-2').map((c) => (c.code === 'GATE-1' ? { ...c, label: 'Front gate' } : c)))
    mount()
    expect(screen.getByText('Front gate')).toBeTruthy()
    expect(screen.queryByText('Gate desk 2')).toBeNull()
  })
  it('keeps a retired gate that already has check-ins, so the totals still add up, and drops one nobody used', () => {
    const { parties, events } = scenario()
    load(parties, events)
    setCounters([...BUILTIN_COUNTERS.map((c) => (c.code === 'GATE-2' ? { ...c, active: false } : c)), { code: 'GATE-3', label: 'Old gate', kind: 'gate' as const, active: false }])
    mount()
    expect(screen.getByText('Gate desk 2')).toBeTruthy()
    expect(screen.queryByText('Old gate')).toBeNull()
  })
})

describe('Breakdown tab', () => {
  const open = () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    click(tab('Breakdown'))
  }
  it('lists years with arrived over expected', () => {
    open()
    expect(screen.getByRole('button', { name: '2010: 5 of 6 arrived' }).textContent).toContain('5 / 6 · 83%')
    expect(screen.getByRole('button', { name: '2005: 0 of 2 arrived' }).textContent).toContain('0 of 2')
    expect(screen.getByRole('button', { name: '2015: 2 of 2 arrived' })).toBeTruthy()
  })
  it('sorts by percent with the lowest first', () => {
    open()
    const card = screen.getByRole('heading', { name: 'By batch year' }).closest('section')!
    click(within(card).getByRole('button', { name: '%' }))
    expect([...card.querySelectorAll('.prow .lbl')].map((l) => l.textContent)).toEqual(['2005', '2010', '2015'])
    expect(card.textContent).toContain('lowest arrival first')
  })
  it('lists schools biggest first, and a guest with no school as "No school"', () => {
    open()
    const card = screen.getByRole('heading', { name: 'By school' }).closest('section')!
    expect([...card.querySelectorAll('.prow .lbl')].map((l) => l.textContent)).toEqual(['Technology', 'No school', 'Science'])
  })
  it('breaks parking out by vehicle', () => {
    open()
    const card = screen.getByRole('heading', { name: 'Parking' }).closest('section')!
    expect([...card.querySelectorAll('.pk-n')].map((n) => n.textContent)).toEqual(['1', '1', '1', '1'])
  })
  it('puts everyone on campus in the right decade', () => {
    open()
    expect(screen.getByRole('img', { name: 'On campus by decade: 2010s 7' })).toBeTruthy()
  })
  it('limits to six years until asked', () => {
    const ps = [2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008].map((y) => party({ batchYear: y }))
    load(ps, [])
    mount()
    click(tab('Breakdown'))
    const card = screen.getByRole('heading', { name: 'By batch year' }).closest('section')!
    expect(card.querySelectorAll('.prow')).toHaveLength(6)
    click(within(card).getByRole('button', { name: 'Show 2 more years' }))
    expect(card.querySelectorAll('.prow')).toHaveLength(8)
    click(within(card).getByRole('button', { name: 'Show fewer years' }))
    expect(card.querySelectorAll('.prow')).toHaveLength(6)
  })
  it('does not break when nobody has arrived', () => {
    load([party({ children: 1 }), party({ batchYear: 2011 })], [])
    mount()
    click(tab('Breakdown'))
    expect(screen.getByRole('img', { name: /^On campus by decade:/ })).toBeTruthy()
  })
})

describe('filtering', () => {
  const open = () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
  }
  it('starts with Clear disabled and no "Filtered" note', () => {
    open()
    expect((screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText(/Filtered:/)).toBeNull()
  })
  it('picks a year in the sheet, previews the guest count, and applies it', () => {
    open()
    click(screen.getByRole('button', { name: /^Year/ }))
    const dlg = screen.getByRole('dialog', { name: 'Filter' })
    click(within(dlg).getByRole('checkbox', { name: /2010/ }))
    click(within(dlg).getByRole('button', { name: 'Show 6 guests' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(/Filtered:/).textContent).toBe('Filtered: 2010')
    expect(screen.getByText('Partial numbers')).toBeTruthy()
    expect(tiles()).toEqual(['5On campus now', '83%5 of 6 arrived', '1 Review ›'])
    expect(screen.getByRole('button', { name: /^Year · 1/ })).toBeTruthy()
  })
  it('does not apply anything when the sheet is closed without applying', () => {
    open()
    click(screen.getByRole('button', { name: /^School/ }))
    const dlg = screen.getByRole('dialog', { name: 'Filter' })
    click(within(dlg).getByRole('checkbox', { name: /Science/ }))
    click(within(dlg).getByRole('button', { name: 'Close' }))
    expect(screen.queryByText(/Filtered:/)).toBeNull()
    expect(tiles()[0]).toBe('7On campus now')
  })
  it('keeps the filter and the tab when you leave and come back', () => {
    open()
    click(tab('Breakdown'))
    click(screen.getByRole('button', { name: '2005: 0 of 2 arrived' }))
    cleanup()
    mount()
    expect(screen.getByText(/Filtered:/).textContent).toBe('Filtered: 2005')
    expect(within(screen.getByRole('group', { name: 'Stats view' })).getByRole('button', { name: 'Breakdown' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('filters from a year row, tells you with a toast, and Undo puts it back', () => {
    open()
    click(tab('Breakdown'))
    click(screen.getByRole('button', { name: '2015: 2 of 2 arrived' }))
    const toast = screen.getByRole('status')
    expect(toast.textContent).toContain('Filtered to 2015')
    expect(toast.textContent).toContain('2 of 2 arrived')
    click(within(toast).getByRole('button', { name: /Undo/ }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText(/Filtered:/)).toBeNull()
  })
  it('filters to a school, with "No school" for a guest without one', () => {
    open()
    click(tab('Breakdown'))
    const card = screen.getByRole('heading', { name: 'By school' }).closest('section')!
    click(within(card).getByRole('button', { name: /^No school/ }))
    expect(screen.getByText(/Filtered:/).textContent).toBe('Filtered: No school')
    expect(tiles()[1]).toBe('100%2 of 2 arrived')
  })
  it('combines year and school when a grid cell is tapped', () => {
    open()
    click(tab('Breakdown'))
    click(screen.getByRole('button', { name: /^2010 Technology: 4 of 5 arrived$/ }))
    expect(screen.getByText(/Filtered:/).textContent).toBe('Filtered: 2010 · Technology')
    expect(screen.getByRole('status').textContent).toContain('4 of 5 arrived')
  })
  it('rings the matching grid cells while still showing everyone', () => {
    open()
    click(tab('Breakdown'))
    click(screen.getByRole('button', { name: '2005: 0 of 2 arrived' }))
    const rung = [...document.querySelectorAll('.gc.sel')]
    expect(rung.length).toBeGreaterThan(0)
    expect(rung.every((c) => /^2005 /.test(c.getAttribute('aria-label')!))).toBe(true)
    expect(document.querySelectorAll('.ggrid tbody tr')).toHaveLength(3)
  })
  it('says nobody matches and offers to clear when a combination is empty', () => {
    open()
    click(tab('Breakdown'))
    click(screen.getByRole('button', { name: /^2005 Science: no registrations$/ }))
    expect(screen.getByText('No guests match')).toBeTruthy()
    expect(screen.getByText(/Nobody from 2005 registered with Science/)).toBeTruthy()
    click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.queryByText('No guests match')).toBeNull()
    expect(tiles()[0]).toBe('7On campus now')
  })
  it('Clear says how many guests are showing again, and Undo restores the filter', () => {
    open()
    click(tab('Breakdown'))
    click(screen.getByRole('button', { name: '2015: 2 of 2 arrived' }))
    click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('status').textContent).toContain('Filters cleared')
    expect(screen.getByRole('status').textContent).toContain('Showing all 10 guests')
    click(within(screen.getByRole('status')).getByRole('button', { name: /Undo/ }))
    expect(screen.getByText(/Filtered:/).textContent).toBe('Filtered: 2015')
  })
  it('hides the toast after six seconds', () => {
    open()
    click(tab('Breakdown'))
    vi.useFakeTimers()
    click(screen.getByRole('button', { name: '2015: 2 of 2 arrived' }))
    expect(screen.getByRole('status')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(6001)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('narrows the Entry numbers to the filter too', () => {
    open()
    click(tab('Breakdown'))
    click(screen.getByRole('button', { name: '2015: 2 of 2 arrived' }))
    click(tab('Entry'))
    expect(screen.getByRole('heading', { name: 'Arrived of 2 expected' })).toBeTruthy()
  })
})

describe('compact header', () => {
  const scrollTo = (y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
  }
  it('shrinks to one line after scrolling and grows back near the top, not before', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    scrollTo(100)
    expect(document.querySelector('.st-tiles')).not.toBeNull() // under 150: still full
    scrollTo(200)
    const mini = screen.getByRole('button', { name: 'Show all numbers' })
    expect(mini.textContent).toContain('7 here')
    expect(mini.textContent).toContain('70% of 10')
    scrollTo(60)
    expect(screen.queryByRole('button', { name: 'Show all numbers' })).not.toBeNull() // hysteresis: still compact above 24
    scrollTo(10)
    expect(document.querySelector('.st-tiles')).not.toBeNull()
  })
  it('scrolls to the top when the one-line header is tapped', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    scrollTo(300)
    click(screen.getByRole('button', { name: 'Show all numbers' }))
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 })
  })
  it('hides the "Filtered" note while compact but keeps the filter chips', () => {
    const { parties, events } = scenario()
    load(parties, events)
    mount()
    click(tab('Breakdown'))
    click(screen.getByRole('button', { name: '2015: 2 of 2 arrived' }))
    scrollTo(300)
    expect(screen.queryByText(/Filtered:/)).toBeNull()
    expect(screen.getByRole('button', { name: /^Year · 1/ })).toBeTruthy()
  })
})
