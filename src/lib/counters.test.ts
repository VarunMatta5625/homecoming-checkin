// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { BUILTIN_COUNTERS, type Counter } from './config.ts'
import { activeCounters, counterLabel, countersStore, getCounters, setCounters } from './counters.ts'

afterEach(() => countersStore.set({ list: BUILTIN_COUNTERS }))

const c = (code: string, label: string, kind: string, active = true) => ({ code, label, kind, active }) as Counter

describe('counters', () => {
  it('starts with the built-in gates and dinner counters', () => {
    expect(getCounters()).toHaveLength(12)
    expect(counterLabel('GATE-2')).toBe('Gate desk 2')
    expect(counterLabel('DINNER-10')).toBe('Counter 10')
  })
  it('falls back to the code for a counter it does not know, or none', () => {
    expect(counterLabel('DINNER-99')).toBe('DINNER-99')
    expect(counterLabel('')).toBe('')
  })
  it('takes the server list, with new labels and counters', () => {
    setCounters([c('GATE-1', 'Main gate', 'gate'), c('DINNER-1', 'Hall A', 'dinner'), c('DINNER-11', 'Hall B', 'dinner')])
    expect(counterLabel('GATE-1')).toBe('Main gate')
    expect(counterLabel('DINNER-11')).toBe('Hall B')
    expect(getCounters()).toHaveLength(3)
  })
  it('puts gates first and sorts dinner counters in natural order', () => {
    setCounters([c('DINNER-10', 'C10', 'dinner'), c('DINNER-2', 'C2', 'dinner'), c('GATE-1', 'G1', 'gate'), c('DINNER-1', 'C1', 'dinner')])
    expect(getCounters().map((x) => x.code)).toEqual(['GATE-1', 'DINNER-1', 'DINNER-2', 'DINNER-10'])
  })
  it('ignores desk counters and malformed rows', () => {
    setCounters([c('DESK-1', 'Help desk', 'desk'), c('GATE-1', 'G1', 'gate'), { code: '', label: 'x', kind: 'gate', active: true }, { code: 'X', kind: 'gate' } as Counter])
    expect(getCounters().map((x) => x.code)).toEqual(['GATE-1'])
  })
  it('keeps retired counters for their old scans but does not offer them', () => {
    setCounters([c('GATE-1', 'G1', 'gate'), c('DINNER-1', 'C1', 'dinner'), c('DINNER-2', 'Old hall', 'dinner', false)])
    expect(counterLabel('DINNER-2')).toBe('Old hall')
    expect(activeCounters(getCounters(), 'dinner').map((x) => x.code)).toEqual(['DINNER-1'])
  })
  it('treats a missing active flag as active', () => {
    setCounters([{ code: 'GATE-1', label: 'G1', kind: 'gate' } as Counter])
    expect(getCounters()[0]!.active).toBe(true)
  })
  it('keeps the current list when the server sends nothing usable', () => {
    setCounters([])
    expect(getCounters()).toHaveLength(12)
    setCounters([c('GATE-1', 'G1', 'gate', false)])
    expect(getCounters()).toHaveLength(12)
  })
})
