import { describe, expect, it } from 'vitest'
import type { DeviceRow } from '../backend/types.ts'
import { deviceState } from './devices.ts'

const row = (over: Partial<DeviceRow> = {}): DeviceRow => ({ deviceId: 'd', name: 'Asha', email: 'a@b.co', counter: 'GATE-1', pending: 0, appVersion: '1.0.0 (abc)', lastSyncAt: 1_000_000, clockOffsetMs: 0, ...over })

describe('deviceState', () => {
  it('is online until a minute and a half of silence', () => {
    expect(deviceState(row(), 1_000_000 + 89_000, '1.0.0 (abc)').online).toBe(true)
    expect(deviceState(row(), 1_000_000 + 91_000, '1.0.0 (abc)').online).toBe(false)
  })
  it('flags another version, but not one it cannot tell', () => {
    expect(deviceState(row({ appVersion: '0.9.0' }), 0, '1.0.0 (abc)').otherVersion).toBe(true)
    expect(deviceState(row({ appVersion: null }), 0, '1.0.0 (abc)').otherVersion).toBe(false)
  })
  it('flags a clock that is more than two minutes out, either way', () => {
    expect(deviceState(row({ clockOffsetMs: 90_000 }), 0, 'v').clockOffMin).toBeNull()
    expect(deviceState(row({ clockOffsetMs: 5 * 60_000 }), 0, 'v').clockOffMin).toBe(5)
    expect(deviceState(row({ clockOffsetMs: -5 * 60_000 }), 0, 'v').clockOffMin).toBe(5)
    expect(deviceState(row({ clockOffsetMs: null }), 0, 'v').clockOffMin).toBeNull()
  })
})
