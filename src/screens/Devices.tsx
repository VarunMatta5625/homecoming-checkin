import { useEffect, useState } from 'react'
import { backend } from '../backend/index.ts'
import type { DeviceRow } from '../backend/types.ts'
import { Chip, Empty, Group, Icon } from '../components/ui.tsx'
import { APP_VERSION } from '../lib/config.ts'
import { counterLabel } from '../lib/counters.ts'
import { deviceState } from '../lib/devices.ts'
import { ago, initials, plural } from '../lib/format.ts'
import { useNow } from '../lib/hooks.ts'
import { Page } from './Admin.tsx'

/** Admin: the phones that have reported in. Each phone reports about every 15 seconds while it has signal. */
export function DevicesScreen() {
  const [rows, setRows] = useState<DeviceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = useNow(5000)

  useEffect(() => {
    let live = true
    const load = () =>
      backend
        .listDevices()
        .then((r) => live && (setRows(r), setError(null)))
        .catch((e) => live && setError(e instanceof Error ? e.message : 'Couldn’t load the phones. Check your signal and try again.'))
    void load()
    const t = setInterval(load, 15000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])

  const states = (rows ?? []).map((d) => ({ d, s: deviceState(d, now, APP_VERSION) }))
  const online = states.filter((x) => x.s.online)
  const earlier = states.filter((x) => !x.s.online)

  const row = ({ d, s }: (typeof states)[number]) => (
    <div key={d.deviceId + d.email} className="rrow vtop">
      <span className="avatar" style={{ width: 40, height: 40 }}>{initials(d.name)}</span>
      <div className="grow stack" style={{ gap: 2 }}>
        <span className="nm">{d.name}</span>
        <span className="meta" style={{ whiteSpace: 'normal' }}>{d.counter ? counterLabel(d.counter) : 'No counter'} · {s.online ? 'online now' : 'last seen ' + ago(d.lastSyncAt, now)}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {s.waiting > 0 && <Chip kind="warn" icon="refresh">{plural(s.waiting, 'unsent item')}</Chip>}
          {s.otherVersion && <Chip kind="neutral" icon="info">Version {d.appVersion}</Chip>}
          {s.clockOffMin != null && <Chip kind="warn" icon="clock">Clock {s.clockOffMin} min off</Chip>}
        </div>
      </div>
    </div>
  )

  return (
    <Page title="Devices">
      {error && <div className="err-msg"><Icon name="alert" size="s" />{error}</div>}
      {rows && rows.length === 0 && <Empty icon="phone" title="No phones yet" body="A phone shows up here after it signs in and syncs once." />}
      {online.length > 0 && <Group header={online.length + ' online now'}>{online.map(row)}</Group>}
      {earlier.length > 0 && <Group header={'Earlier · ' + earlier.length} style={{ marginTop: 20 }}>{earlier.map(row)}</Group>}
      {rows && rows.length > 0 && (
        <div className="gh-f">
          Unsent items are scans and registrations still on a phone. A phone with unsent items needs signal before anything is flushed. Version is compared with this phone ({APP_VERSION}). A clock that is out can upset which check-in counts as first.
        </div>
      )}
      <div style={{ height: 32 }} />
    </Page>
  )
}
