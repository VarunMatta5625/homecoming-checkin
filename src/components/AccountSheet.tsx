import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_VERSION, DEMO } from '../lib/config.ts'
import { activeCounters, counterLabel, useCounters } from '../lib/counters.ts'
import { resetDemoData, signOutAndWipe } from '../lib/actions.ts'
import { applyCounter } from '../lib/counter.ts'
import { ago, fmtTime, initials, roleLabel } from '../lib/format.ts'
import { useSyncStatus } from '../lib/hooks.ts'
import { leaveLayers } from '../lib/layers.ts'
import { applyAppearance, prefs } from '../lib/prefs.ts'
import { checkOnline } from '../lib/sync.ts'
import { ui } from '../lib/ui.ts'
import { hasRole } from '../lib/types.ts'
import { Alert, Btn, Chip, Group, Icon, Seg, Sheet, Switch } from './ui.tsx'

export function CounterPicker({ initial, onDone, onClose }: { initial: string | null; onDone: (code: string) => void; onClose: () => void }) {
  const [code, setCode] = useState(initial)
  const counters = useCounters()
  return (
    <Sheet
      title="Choose counter"
      onClose={onClose}
      footer={
        <Btn
          disabled={!code}
          onClick={() => {
            if (code) onDone(code)
            onClose()
          }}
        >
          Done
        </Btn>
      }
    >
      <Group header="Gate">
        <div role="radiogroup" aria-label="Gate">
          {activeCounters(counters).map((c) => (
            <button key={c.code} type="button" className="cell" role="radio" aria-checked={code === c.code} onClick={() => setCode(c.code)}>
              <span className="grow">{c.label}</span>
              <span className={'radio' + (code === c.code ? ' on' : '')}>{code === c.code && <Icon name="check" size="s" />}</span>
            </button>
          ))}
        </div>
      </Group>
      <div className="t-cap muted px5">Your counter is saved with every scan, so staff can trace it.</div>
    </Sheet>
  )
}

export function AccountSheet() {
  const p = prefs.use()
  const status = useSyncStatus()
  const navigate = useNavigate()
  const [picker, setPicker] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const s = p.session
  if (!s) return null
  const close = () => ui.set({ account: false })
  const go = (to: string) => leaveLayers(() => navigate(to))
  const out = async () => {
    setBusy(true)
    await signOutAndWipe()
    ui.set({ account: false })
  }

  return (
    <>
      <Sheet title="Account" onClose={close}>
        <div className="px5" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="avatar">{initials(s.name)}</span>
          <div className="grow stack">
            <span className="t-head">{s.name}</span>
            <span className="t-sub muted ellipsis">{s.email}</span>
          </div>
          <Chip kind="tint" icon="shield">{roleLabel(s.role)}</Chip>
        </div>

        <Group>
          <button type="button" className="cell" onClick={() => setPicker(true)}>
            <span className="grow">Counter</span>
            <span className="val">{counterLabel(p.counter ?? '')}</span>
            <Icon name="chev-r" size="s" className="chev" />
          </button>
        </Group>

        <Group>
          <div className="cell"><span className="grow">Last sync</span><span className="val">{p.lastSyncAt ? fmtTime(p.lastSyncAt) + ' · ' + ago(p.lastSyncAt) : 'Never'}</span></div>
          <div className="cell"><span className="grow">Pending changes</span><span className="val">{status.pending || 'None'}</span></div>
          <div className="cell"><span className="grow">App version</span><span className="val">{APP_VERSION}</span></div>
          {status.pending > 0 && (
            <button type="button" className="cell" style={{ color: 'var(--tint)' }} onClick={() => void checkOnline()}>
              <Icon name="refresh" size="m" />
              <span className="grow">Sync now</span>
            </button>
          )}
        </Group>

        <Group header="Appearance">
          <div className="cell" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <Seg label="Theme" value={p.theme} onChange={(theme) => { prefs.set({ theme }); applyAppearance() }} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
          <div className="cell">
            <span className="grow">Larger text</span>
            <Switch on={p.bigText} onChange={(bigText) => { prefs.set({ bigText }); applyAppearance() }} label="Larger text" />
          </div>
        </Group>

        {hasRole(s, 'admin') && (
          <Group header="Admin">
            <button type="button" className="cell" onClick={() => go('/admin/users')}><Icon name="users" size="m" style={{ color: 'var(--text2)' }} /><span className="grow">Users and roles</span><Icon name="chev-r" size="s" className="chev" /></button>
            <button type="button" className="cell" onClick={() => go('/admin/import')}><Icon name="download" size="m" style={{ color: 'var(--text2)' }} /><span className="grow">Import guests</span><Icon name="chev-r" size="s" className="chev" /></button>
            <button type="button" className="cell" onClick={() => go('/admin/audit')}><Icon name="history" size="m" style={{ color: 'var(--text2)' }} /><span className="grow">Audit log</span><Icon name="chev-r" size="s" className="chev" /></button>
            <button type="button" className="cell" onClick={() => go('/admin/devices')}><Icon name="phone" size="m" style={{ color: 'var(--text2)' }} /><span className="grow">Devices</span><Icon name="chev-r" size="s" className="chev" /></button>
            <button type="button" className="cell" onClick={() => go('/admin/counters')}><Icon name="settings" size="m" style={{ color: 'var(--text2)' }} /><span className="grow">Gate desks</span><Icon name="chev-r" size="s" className="chev" /></button>
          </Group>
        )}

        {DEMO && (
          <Group header="Demo tools" footer="Only shown while the app runs on demo data.">
            <div className="cell"><span className="grow">Pretend there’s no signal</span><Switch on={p.demoOffline} onChange={(demoOffline) => { prefs.set({ demoOffline }); void checkOnline() }} label="Pretend offline" /></div>
            <button type="button" className="cell" onClick={() => { prefs.set({ sessionExpired: true }); close() }}><span className="grow">Expire my session</span></button>
            <button type="button" className="cell" onClick={() => void resetDemoData().then(close)}><span className="grow">Reset demo data</span></button>
          </Group>
        )}

        {hasRole(s, 'admin') && (
          <Group header="Danger zone" footer="Clears every check-in for a fresh start, for example after a rehearsal. Registrations stay.">
            <button type="button" className="cell" style={{ color: 'var(--bad-text)' }} onClick={() => go('/admin/flush')}>
              <Icon name="alert" size="m" />
              <span className="grow">Flush all check-ins</span>
              <Icon name="chev-r" size="s" className="chev" />
            </button>
          </Group>
        )}

        <div className="px">
          <Btn kind="destructive" icon="logout" onClick={() => setConfirm(true)}>Sign out</Btn>
        </div>
      </Sheet>

      {picker && <CounterPicker initial={p.counter} onDone={applyCounter} onClose={() => setPicker(false)} />}
      {confirm &&
        (status.pending > 0 ? (
          <Alert
            title="Sign out?"
            body={status.pending + (status.pending === 1 ? ' change hasn’t' : ' changes haven’t') + ' synced. Signing out will delete ' + (status.pending === 1 ? 'it' : 'them') + ' from this phone. Get signal and sync first.'}
            onClose={() => setConfirm(false)}
            actions={[
              { label: 'Stay signed in', kind: 'bold', onClick: () => setConfirm(false) },
              { label: 'Sync now', onClick: () => { setConfirm(false); void checkOnline() } },
              { label: busy ? 'Signing out…' : 'Sign out anyway', kind: 'danger', onClick: () => void out() },
            ]}
          />
        ) : (
          <Alert
            title="Sign out?"
            body="Everything is synced. You can sign back in with your GITAM account."
            onClose={() => setConfirm(false)}
            actions={[
              { label: 'Cancel', onClick: () => setConfirm(false) },
              { label: busy ? 'Signing out…' : 'Sign out', kind: 'danger', onClick: () => void out() },
            ]}
          />
        ))}
    </>
  )
}
