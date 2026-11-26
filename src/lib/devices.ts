import type { DeviceRow } from '../backend/types.ts'

/** A phone reports about every 15 seconds while it has signal, so a minute and a half of silence means it is offline or closed. */
export const ONLINE_MS = 90_000
/** Clocks further apart than this make "earliest check-in wins" and the undo window unreliable. */
export const CLOCK_WARN_MS = 2 * 60_000

export interface DeviceState {
  online: boolean
  /** Unsent items waiting on the phone. */
  waiting: number
  /** Not on the version this phone runs. Only a hint: the admin's own phone may be the old one. */
  otherVersion: boolean
  /** Minutes the clock is off by, or null when it is fine. */
  clockOffMin: number | null
}

export function deviceState(d: DeviceRow, now: number, myVersion: string): DeviceState {
  const off = d.clockOffsetMs
  return {
    online: now - d.lastSyncAt < ONLINE_MS,
    waiting: d.pending,
    otherVersion: !!d.appVersion && d.appVersion !== myVersion,
    clockOffMin: off != null && Math.abs(off) > CLOCK_WARN_MS ? Math.round(Math.abs(off) / 60000) : null,
  }
}
