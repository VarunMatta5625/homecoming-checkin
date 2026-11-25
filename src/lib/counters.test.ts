// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { BUILTIN_COUNTERS, type Counter } from './config.ts'
import { activeCounters, counterLabel, countersStore, getCounters, setCounters } from './counters.ts'

afterEach(() => countersStore.set({ list: BUILTIN_COUNTERS }))

const c = (code: string, label: string, kind: string, active = true) => ({ code, label, kind, active }) as Counter

describe('counters', () => {
  it('starts with the built-in gates', () => {
    expect(getCounters()).toHaveLength(2)
    expect(counterLabel('GATE-2')).toBe('Gate desk 2')
  })
  it('falls back to the code for a counter it does not know, or none', () => {
    expect(counterLabel('GATE-99')).toBe('GATE-99')
    expect(counterLabel('')).toBe('')
  })
  it('takes the server list, with new labels and counters', () => {
    setCounters([c('GATE-1', 'Main gate', 'gate'), c('GATE-3', 'Side gate', 'gate')])
    expect(counterLabel('GATE-1')).toBe('Main gate')
    expect(counterLabel('GATE-3')).toBe('Side gate')
    expect(getCounters()).toHaveLength(2)
  })
  it('sorts gates in natural order', () => {
    setCounters([c('GATE-10', 'G10', 'gate'), c('GATE-2', 'G2', 'gate'), c('GATE-1', 'G1', 'gate')])
    expect(getCounters().map((x) => x.code)).toEqual(['GATE-1', 'GATE-2', 'GATE-10'])
  })
  it('ignores dinner and desk counters the shared database may still hold, and malformed rows', () => {
    setCounters([c('DINNER-1', 'Counter 1', 'dinner'), c('DESK-1', 'Help desk', 'desk'), c('GATE-1', 'G1', 'gate'), { code: '', label: 'x', kind: 'gate', active: true }, { code: 'X', kind: 'gate' } as Counter])
    expect(getCounters().map((x) => x.code)).toEqual(['GATE-1'])
  })
  it('keeps retired counters for their old scans but does not offer them', () => {
    setCounters([c('GATE-1', 'G1', 'gate'), c('GATE-2', 'Old gate', 'gate', false)])
    expect(counterLabel('GATE-2')).toBe('Old gate')
    expect(activeCounters(getCounters()).map((x) => x.code)).toEqual(['GATE-1'])
  })
  it('treats a missing active flag as active', () => {
    setCounters([{ code: 'GATE-1', label: 'G1', kind: 'gate' } as Counter])
    expect(getCounters()[0]!.active).toBe(true)
  })
  it('keeps the current list when the server sends nothing usable', () => {
    setCounters([])
    expect(getCounters()).toHaveLength(2)
    setCounters([c('GATE-1', 'G1', 'gate', false)])
    expect(getCounters()).toHaveLength(2)
    setCounters([c('DINNER-1', 'C1', 'dinner')])
    expect(getCounters()).toHaveLength(2)
  })
})
