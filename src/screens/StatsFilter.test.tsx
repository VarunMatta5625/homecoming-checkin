// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Filter } from '../lib/stats.ts'
import { FilterSheet, type Options } from './StatsFilter.tsx'

afterEach(cleanup)

const options: Options = {
  years: [{ year: 1999, guests: 3 }, { year: 2009, guests: 5 }, { year: 2010, guests: 1 }, { year: 2012, guests: 7 }],
  schools: [{ key: 'School of Technology', guests: 9 }, { key: '', guests: 2 }, { key: 'GITAM Dental College', guests: 1 }],
}
// "N guests" for any filter, the way the screen counts: years then schools.
const count = (f: Filter) => (f.years.length ? f.years.reduce((n, y) => n + (options.years.find((o) => o.year === y)?.guests ?? 0), 0) : 0) + f.schools.length * 100

function open(initial: Filter = { years: [], schools: [] }, tab: 'year' | 'school' = 'year') {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(<FilterSheet options={options} initial={initial} tab={tab} count={count} onApply={onApply} onClose={onClose} />)
  return { onApply, onClose, dlg: screen.getByRole('dialog', { name: 'Filter' }) }
}
const years = () => screen.getAllByRole('checkbox').map((c) => c.textContent)
const click = (e: Element) => fireEvent.click(e)

describe('FilterSheet: years', () => {
  it('lists years under their decade, each with its guest count', () => {
    open()
    expect(years()).toEqual(['19993 guests', '20095 guests', '20101 guest', '20127 guests'])
    expect(screen.getAllByText(/^(1990|2000|2010)s$/).map((e) => e.textContent)).toEqual(expect.arrayContaining(['1990s', '2000s', '2010s']))
  })
  it('starts with nothing ticked when there is no filter, and ticked years when there is', () => {
    open({ years: [2009], schools: [] })
    expect(screen.getByRole('checkbox', { name: /2009/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: /2012/ }).getAttribute('aria-checked')).toBe('false')
  })
  it('toggles a year on and off, and updates the Show button', () => {
    open()
    click(screen.getByRole('checkbox', { name: /2012/ }))
    expect(screen.getByRole('button', { name: 'Show 7 guests' })).toBeTruthy()
    click(screen.getByRole('checkbox', { name: /2009/ }))
    expect(screen.getByRole('button', { name: 'Show 12 guests' })).toBeTruthy()
    click(screen.getByRole('checkbox', { name: /2012/ }))
    expect(screen.getByRole('button', { name: 'Show 5 guests' })).toBeTruthy()
  })
  it('says "1 guest" in the singular', () => {
    open()
    click(screen.getByRole('checkbox', { name: /2010/ }))
    expect(screen.getByRole('button', { name: 'Show 1 guest' })).toBeTruthy()
  })
  it('selects and unselects a whole decade with its chip', () => {
    open()
    const chip = screen.getByRole('button', { name: '2000s' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    click(chip)
    expect(screen.getByRole('checkbox', { name: /2009/ }).getAttribute('aria-checked')).toBe('true')
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    click(chip)
    expect(screen.getByRole('checkbox', { name: /2009/ }).getAttribute('aria-checked')).toBe('false')
  })
  it('a decade chip adds to years already picked, and removing it leaves the others', () => {
    open({ years: [1999], schools: [] })
    click(screen.getByRole('button', { name: '2010s' }))
    expect(screen.getByRole('checkbox', { name: /1999/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: /2012/ }).getAttribute('aria-checked')).toBe('true')
    click(screen.getByRole('button', { name: '2010s' }))
    expect(screen.getByRole('checkbox', { name: /1999/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: /2012/ }).getAttribute('aria-checked')).toBe('false')
  })
  it('searches by full year or by the last two digits', () => {
    open()
    const box = screen.getByRole('textbox', { name: 'Search years' })
    fireEvent.change(box, { target: { value: '09' } })
    expect(years()).toEqual(['20095 guests'])
    fireEvent.change(box, { target: { value: '1999' } })
    expect(years()).toEqual(['19993 guests'])
    fireEvent.change(box, { target: { value: '20' } })
    expect(years()).toEqual(['20095 guests', '20101 guest', '20127 guests'])
  })
  it('says so when no year matches', () => {
    open()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search years' }), { target: { value: '55' } })
    expect(screen.getByText(/No year matches/)).toBeTruthy()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
  it('keeps picks made before a search', () => {
    open()
    click(screen.getByRole('checkbox', { name: /2012/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search years' }), { target: { value: '99' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Search years' }), { target: { value: '' } })
    expect(screen.getByRole('checkbox', { name: /2012/ }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('FilterSheet: schools', () => {
  it('lists schools by short name, and "No school given" for the empty key', () => {
    open({ years: [], schools: [] }, 'school')
    expect(screen.getAllByRole('checkbox').map((c) => c.textContent)).toEqual(['Technology9 guests', 'No school given2 guests', 'Dental1 guest'])
  })
  it('switches between the tabs and keeps both selections', () => {
    open()
    click(screen.getByRole('checkbox', { name: /2012/ }))
    click(within(screen.getByRole('group', { name: 'Filter by' })).getByRole('button', { name: /^School/ }))
    click(screen.getByRole('checkbox', { name: /Technology/ }))
    const tabs = within(screen.getByRole('group', { name: 'Filter by' }))
    expect(tabs.getByRole('button', { name: 'Year · 1' })).toBeTruthy()
    expect(tabs.getByRole('button', { name: 'School · 1' })).toBeTruthy()
  })
  it('can pick the empty school key', () => {
    const { onApply } = open({ years: [], schools: [] }, 'school')
    click(screen.getByRole('checkbox', { name: /No school given/ }))
    click(screen.getByRole('button', { name: /^Show/ }))
    expect(onApply).toHaveBeenCalledWith({ years: [], schools: [''] })
  })
})

describe('FilterSheet: footer', () => {
  it('disables Clear until something is picked, then clears everything', () => {
    open({ years: [], schools: [] })
    const clear = screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement
    expect(clear.disabled).toBe(true)
    click(screen.getByRole('checkbox', { name: /2012/ }))
    expect(clear.disabled).toBe(false)
    click(clear)
    expect(clear.disabled).toBe(true)
    expect(screen.getByRole('checkbox', { name: /2012/ }).getAttribute('aria-checked')).toBe('false')
  })
  it('applies the picked years and schools only when Show is tapped', () => {
    const { onApply } = open()
    click(screen.getByRole('checkbox', { name: /2012/ }))
    expect(onApply).not.toHaveBeenCalled()
    click(screen.getByRole('button', { name: /^Show/ }))
    expect(onApply).toHaveBeenCalledWith({ years: [2012], schools: [] })
  })
  it('closing leaves the filter alone', () => {
    const { onApply, onClose } = open()
    click(screen.getByRole('checkbox', { name: /2012/ }))
    click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
  })
})
