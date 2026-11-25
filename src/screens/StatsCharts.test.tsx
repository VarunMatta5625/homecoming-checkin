// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { arrivalSeries, cellKey } from '../lib/stats.ts'
import { ev, MIN, party, rowsOf, T0 } from '../test/fixtures.ts'
import { Card, Donut, Grid, GridKey, Legend, Pair, ProgressRow, StackBar, Timeline } from './StatsCharts.tsx'

afterEach(cleanup)

describe('StackBar', () => {
  const segs = [{ n: 60, cls: 'a', label: 'Alumni' }, { n: 30, cls: 'b', label: 'Spouses' }, { n: 8, cls: 'c', label: 'Kids' }, { n: 2, cls: 'd', label: 'Tiny' }, { n: 0, cls: 'e', label: 'None' }]
  it('prints the full label on a wide segment, the count on a medium one, nothing on a sliver', () => {
    render(<StackBar segs={segs} aria="x" />)
    const bar = screen.getByRole('img', { name: 'x' })
    const spans = [...bar.querySelectorAll('span')]
    expect(spans.map((s) => s.textContent)).toEqual(['Alumni 60', 'Spouses 30', '8', ''])
  })
  it('omits a zero segment altogether', () => {
    render(<StackBar segs={segs} aria="x" />)
    expect(screen.getByRole('img', { name: 'x' }).querySelectorAll('span')).toHaveLength(4)
  })
  it('sizes segments by count', () => {
    render(<StackBar segs={[{ n: 3, cls: 'a', label: 'A' }, { n: 1, cls: 'b', label: 'B' }]} aria="x" />)
    const [a, b] = [...screen.getByRole('img').querySelectorAll('span')] as HTMLElement[]
    expect(a!.style.flex).toMatch(/^3 1 0%/)
    expect(b!.style.flex).toMatch(/^1 1 0%/)
  })
  it('draws an estimate with the striped class', () => {
    render(<StackBar segs={[{ n: 3, cls: 'a', label: 'A', est: true }]} aria="x" />)
    expect(screen.getByRole('img').querySelector('span')!.className).toContain('seg-est')
  })
  it('renders an empty bar when there are no segments', () => {
    render(<StackBar segs={[]} aria="nothing" />)
    expect(screen.getByRole('img', { name: 'nothing' }).children).toHaveLength(0)
  })
})

describe('Legend', () => {
  it('lists every segment with its count, even a zero', () => {
    render(<Legend segs={[{ n: 5, cls: 'a', label: 'Arrived' }, { n: 0, cls: 'b', label: 'Not arrived' }]} />)
    expect(screen.getByText('Arrived').textContent).toBe('Arrived 5')
    expect(screen.getByText('Not arrived').textContent).toBe('Not arrived 0')
  })
})

describe('ProgressRow', () => {
  it('shows counts and a percentage', () => {
    render(<ProgressRow label="2010" name="2010" t={{ exp: 40, arr: 10 }} />)
    const row = screen.getByRole('button', { name: '2010: 10 of 40 arrived' })
    expect(row.textContent).toContain('10 / 40')
    expect(row.textContent).toContain('25%')
    expect(row.className).not.toContain('small')
  })
  it('says "1 of 2", hatched, for a group of two or fewer', () => {
    render(<ProgressRow label="2011" name="2011" t={{ exp: 2, arr: 1 }} />)
    const row = screen.getByRole('button', { name: '2011: 1 of 2 arrived' })
    expect(row.textContent).toBe('20111 of 2')
    expect(row.className).toContain('small')
  })
  it('never fills past 100 percent when more arrive than expected', () => {
    render(<ProgressRow label="x" name="x" t={{ exp: 4, arr: 9 }} />)
    expect((screen.getByRole('button').querySelector('.bar i') as HTMLElement).style.width).toBe('100%')
  })
  it('does not divide by zero', () => {
    render(<ProgressRow label="x" name="x" t={{ exp: 0, arr: 0 }} />)
    expect((screen.getByRole('button').querySelector('.bar i') as HTMLElement).style.width).toBe('0%')
  })
})

describe('Donut', () => {
  it('prints the percent and describes it for screen readers', () => {
    render(<Donut arr={30} exp={120} />)
    expect(screen.getByRole('img', { name: '25 percent arrived' })).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
  })
  it('stays at 99 until all are in', () => {
    render(<Donut arr={999} exp={1000} />)
    expect(screen.getByText('99%')).toBeTruthy()
  })
  it('handles nobody expected', () => {
    render(<Donut arr={0} exp={0} />)
    expect(screen.getByText('0%')).toBeTruthy()
  })
  it('caps the ring at a full circle', () => {
    const { container } = render(<Donut arr={50} exp={10} />)
    const ring = container.querySelectorAll('circle')[1]!
    const [fill, full] = ring.getAttribute('stroke-dasharray')!.split(' ').map(Number)
    expect(fill).toBeCloseTo(full!)
  })
})

describe('Card', () => {
  it('shows a title and a sub line, or a right-hand control instead', () => {
    const { rerender } = render(<Card title="T" sub="of 5">body</Card>)
    expect(screen.getByRole('heading', { name: 'T' })).toBeTruthy()
    expect(screen.getByText('of 5')).toBeTruthy()
    rerender(<Card title="T" sub="of 5" right={<button>sort</button>}>body</Card>)
    expect(screen.queryByText('of 5')).toBeNull()
    expect(screen.getByRole('button', { name: 'sort' })).toBeTruthy()
  })
})

describe('Grid', () => {
  const schools = ['School of Technology', 'School of Law', '']
  const cell = new Map([
    [cellKey(2010, 'School of Technology'), { exp: 10, arr: 9 }],
    [cellKey(2010, 'School of Law'), { exp: 2, arr: 1 }],
    [cellKey(2011, 'School of Technology'), { exp: 10, arr: 0 }],
    [cellKey(2011, '' ), { exp: 5, arr: 1 }],
  ])
  const data = { years: [2010, 2011], schools, cell }
  const find = (name: RegExp) => screen.getByRole('button', { name })
  it('headers use the short school code and "None" for no school', () => {
    render(<Grid data={data} selected={() => false} onPick={() => {}} />)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Year', 'Tech', 'Law', 'None'])
  })
  it('shades by bucket, shows 0% as a plain cell, small groups as "arrived/expected", and empty cells as none', () => {
    render(<Grid data={data} selected={() => false} onPick={() => {}} />)
    expect(find(/^2010 Technology: 9 of 10/).className).toContain('q5')
    expect(find(/^2010 Technology: 9 of 10/).textContent).toBe('90%')
    expect(find(/^2011 Technology: 0 of 10/).className).toContain('zero')
    expect(find(/^2011 Technology: 0 of 10/).textContent).toBe('0%')
    expect(find(/^2010 Law: 1 of 2/).className).toContain('small')
    expect(find(/^2010 Law: 1 of 2/).textContent).toBe('1/2')
    expect(find(/^2011 Law: no registrations/).className).toContain('none')
    expect(find(/^2011 no school: 1 of 5/).className).toContain('q2')
  })
  it('rings selected cells and reports the tapped one', () => {
    const picked: [number, string][] = []
    render(<Grid data={data} selected={(y, s) => y === 2010 && s === 'School of Law'} onPick={(y, s) => picked.push([y, s])} />)
    expect(find(/^2010 Law/).className).toContain('sel')
    expect(find(/^2010 Technology/).className).not.toContain('sel')
    find(/^2011 no school/).click()
    expect(picked).toEqual([[2011, '']])
  })
  it('labels every cell for screen readers, including empty ones', () => {
    render(<Grid data={data} selected={() => false} onPick={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(6)
  })
})

describe('GridKey', () => {
  it('lists the five steps, zero, empty and small', () => {
    render(<GridKey />)
    for (const t of ['1–19%', '20–39%', '40–59%', '60–79%', '80–100%', '0%', 'No registrations']) expect(screen.getByText(t)).toBeTruthy()
    expect(screen.getByText(/2 or fewer/)).toBeTruthy()
  })
})

describe('Pair', () => {
  it('scales both bars against the shared scale', () => {
    const { container } = render(<Pair icon="car" name="Four-wheelers" exp={10} arr={5} scale={20} unit="car" />)
    const bars = [...container.querySelectorAll('.pk-bar')] as HTMLElement[]
    expect(bars.map((b) => b.style.width)).toEqual(['50%', '25%'])
    expect(screen.getByText('5 cars arrived of 10', { exact: false })).toBeTruthy()
  })
  it('does not divide by zero', () => {
    const { container } = render(<Pair icon="bike" name="Two-wheelers" exp={0} arr={0} scale={0} />)
    expect([...container.querySelectorAll('.pk-bar')].map((b) => (b as HTMLElement).style.width)).toEqual(['0%', '0%'])
  })
})

describe('Timeline', () => {
  const ps = Array.from({ length: 4 }, () => party({ children: 5 }))
  const evs = [[1, 10], [16, 20], [31, 30], [46, 40]].map(([m, q], i) => ev(ps[i]!.id, 'entry', q!, T0 + m! * MIN))
  const series = arrivalSeries(rowsOf(ps, evs), T0 + 50 * MIN, 200, 100)!
  it('draws one bar per slot, marks the current one and the projected ones', () => {
    const { container } = render(<Timeline s={series} />)
    const bars = [...container.querySelectorAll('.tlc i')] as HTMLElement[]
    expect(bars).toHaveLength(series.bars.length)
    expect(bars.filter((b) => b.className.includes('now'))).toHaveLength(1)
    expect(bars.filter((b) => b.className.includes('proj'))).toHaveLength(3)
    expect(screen.getByText('Projected')).toBeTruthy()
  })
  it('tallest real bar is full height', () => {
    const { container } = render(<Timeline s={series} />)
    const heights = [...container.querySelectorAll('.tlc i')].map((b) => (b as HTMLElement).style.height)
    expect(heights).toContain('100%')
  })
  it('says the current slot and the peak', () => {
    render(<Timeline s={series} />)
    expect(screen.getByText(/Now: 40/)).toBeTruthy()
    expect(screen.getByText('40 peak')).toBeTruthy()
  })
  it('has no "Projected" key when nothing is projected', () => {
    const done = arrivalSeries(rowsOf(ps, evs), T0 + 50 * MIN, 100, 100)!
    render(<Timeline s={done} />)
    expect(screen.queryByText('Projected')).toBeNull()
  })
})

