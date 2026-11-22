import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { backend } from '../backend/index.ts'
import { counterLabel } from '../lib/config.ts'
import { pendingCount, startOver } from '../lib/actions.ts'
import { useSyncStatus } from '../lib/hooks.ts'
import { prefs } from '../lib/prefs.ts'
import { ui } from '../lib/ui.ts'
import { hasRole } from '../lib/types.ts'
import { Banner, Btn, Icon, SyncPill } from './ui.tsx'
import type { SignInResult } from '../backend/types.ts'
import type { IconName } from './sprite.ts'

export function TopRow() {
  const p = prefs.use()
  const status = useSyncStatus()
  return (
    <div className="navrow">
      <button type="button" className="chip neutral counter-btn" aria-label="Account and counter" onClick={() => ui.set({ account: true })}>
        <Icon name={p.mode === 'dinner' ? 'utensils' : 'login'} size="s" />
        {(p.mode === 'dinner' ? 'Dinner' : 'Entry') + ' · ' + counterLabel(p.counter ?? '')}
        <Icon name="chev-d" size="s" />
      </button>
      <SyncPill status={status} />
    </div>
  )
}

/** Session expired and update available. Never wipes anything. */
export function Banners({ className }: { className?: string }) {
  const p = prefs.use()
  const status = useSyncStatus()
  const reauthError = useFinishReauth()
  const { needRefresh, updateSW } = ui.use()
  return (
    <div className={className}>
      {p.sessionExpired && (
        <Banner kind="warn" icon="lock" title="Please sign in again" action={<SignInAgain />}>
          Your session ended. {status.pending ? 'Your ' + status.pending + ' changes are safe on this phone and will sync after you sign in.' : 'You can keep scanning offline.'}
          {reauthError && <strong> {reauthError} To use another account, sign out from the Account menu.</strong>}
        </Banner>
      )}
      {needRefresh && updateSW && status.pending === 0 && (
        <Banner kind="info" icon="download" title="Update available" action={<Btn kind="secondary" sm onClick={() => void updateSW(true)}>Update now</Btn>}>
          A new version is ready. It only installs when you tap Update.
        </Banner>
      )}
    </div>
  )
}

/** Only the same person can resume: a different account would mix two people's unsynced changes. Returns an error text, or null. */
async function resumeSession(r: SignInResult): Promise<string | null> {
  if ('error' in r) return r.error
  if ('rejectedEmail' in r) return 'That account isn’t on the list.'
  if (r.session.actorId !== prefs.get().session?.actorId) {
    // Unsynced changes belong to the old account. With none, the new person simply takes over this phone.
    if ((await pendingCount()) === 0) {
      await startOver(r.session)
      return null
    }
    return 'Sign in with ' + (prefs.get().session?.email ?? 'the same account') + ' to keep your saved changes.'
  }
  prefs.set({ session: r.session, sessionExpired: false })
  return null
}

/** Google sign-in leaves the page, so the button's own handler is gone when it comes back: finish the sign-in here. */
function useFinishReauth() {
  const expired = prefs.use().sessionExpired
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!expired) return
    let dead = false
    backend.resume?.().then(async (r) => { if (r && !dead) setError(await resumeSession(r)) }).catch(() => {})
    return () => { dead = true }
  }, [expired])
  return expired ? error : null
}

function SignInAgain() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Btn
        sm
        onClick={async () => {
          const r = await backend.signInWithGoogle()
          await resumeSession(r)
        }}
      >
        Sign in with Google
      </Btn>
      <Btn kind="gray" sm onClick={() => prefs.set({ sessionExpired: false })}>
        Keep scanning offline
      </Btn>
    </div>
  )
}

export function Screen({ title, children, topRow = true }: { title?: string; children: ReactNode; topRow?: boolean }) {
  return (
    <main className="screen">
      {topRow && <TopRow />}
      <Banners />
      {title && <h1 className="lt">{title}</h1>}
      {children}
    </main>
  )
}

interface Tab {
  to: string
  label: string
  icon: IconName
}

export function TabBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const p = prefs.use()
  const tabs: Tab[] = [
    { to: '/scan', label: 'Scan', icon: 'scan' },
    { to: '/search', label: 'Search', icon: 'search' },
    { to: '/register', label: 'Register', icon: 'user-plus' },
    { to: '/activity', label: 'Activity', icon: 'history' },
  ]
  if (hasRole(p.session, 'staff')) tabs.push({ to: '/stats', label: 'Stats', icon: 'chart' })
  const active = pathname.startsWith('/guest') ? '/search' : '/' + pathname.split('/')[1]
  return (
    <nav className="tabbar" aria-label="Tabs">
      {tabs.map((t) => (
        <button key={t.to} type="button" className={'tab' + (t.to === active ? ' on' : '')} aria-current={t.to === active ? 'page' : undefined} onClick={() => navigate(t.to, { replace: true })}>
          <Icon name={t.icon} size="l" />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
