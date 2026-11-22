import { useEffect, useRef, useState } from 'react'
import { CounterPicker } from '../components/AccountSheet.tsx'
import { Btn, Empty, Icon, Logo } from '../components/ui.tsx'
import { counterLabel } from '../lib/config.ts'
import { downloadRoster } from '../lib/actions.ts'
import { applyCounter, savedCounter } from '../lib/counter.ts'
import { db } from '../lib/db.ts'
import { fmtTime, plural, roleLabel } from '../lib/format.ts'
import { useSyncStatus } from '../lib/hooks.ts'
import { prefs } from '../lib/prefs.ts'
import { useLiveQuery } from 'dexie-react-hooks'

interface InstallEvent extends Event {
  prompt: () => Promise<void>
}
let deferredInstall: InstallEvent | null = null
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredInstall = e as InstallEvent
})

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

type Step = 'home' | 'download' | 'paused' | 'nolist' | 'ready'

/** First run: add to Home Screen, download the guest list, pick a counter. */
export function SetupScreen() {
  const p = prefs.use()
  const [step, setStep] = useState<Step>(p.rosterAt ? 'ready' : !p.homeScreenDone && !standalone() ? 'home' : 'download')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const started = useRef(false)

  const start = () => {
    setStep('download')
    downloadRoster((done, total) => setProgress({ done, total }))
      .then(() => setStep('ready'))
      .catch(() => setStep(progress.done > 0 ? 'paused' : 'nolist'))
  }

  useEffect(() => {
    if (step === 'download' && !started.current) {
      started.current = true
      start()
    }
    // start once when the download step is first reached
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const retry = () => {
    started.current = true
    start()
  }

  if (step === 'home') return <HomeScreenStep onDone={() => { prefs.set({ homeScreenDone: true }); setStep('download') }} />

  if (step === 'nolist')
    return (
      <main className="screen notabs">
        <Empty icon="wifi-off" title="Connect once to download the guest list" body="This phone doesn’t have the list yet, so scanning and search are off. Join venue Wi-Fi or turn on mobile data.">
          <Btn icon="refresh" onClick={retry}>Retry</Btn>
        </Empty>
      </main>
    )

  if (step === 'ready') return <ReadyStep />

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const paused = step === 'paused'
  return (
    <main className="screen notabs stack" style={{ padding: '56px 24px 0', gap: 12 }}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
        <div style={{ width: 88, height: 88, borderRadius: 44, background: paused ? 'var(--warn-bg)' : 'var(--tint-bg)', color: paused ? 'var(--warn-text)' : 'var(--tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={paused ? 'wifi-off' : 'download'} size="xl" />
        </div>
        <span className="big-num num">{pct}%</span>
        <h1 className="t-title" style={{ margin: 0, fontSize: 26, lineHeight: '32px', fontWeight: 700 }}>{paused ? 'Download paused' : 'Getting this phone ready'}</h1>
        <p className="t-body muted" style={{ margin: 0 }}>{paused ? 'We’ll pick up where we left off. Keep this screen open and get back on Wi-Fi or mobile data.' : 'Downloading the guest list so you can scan without signal. Keep this screen open.'}</p>
      </div>
      <div className="bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Download progress"><div className="bar-fill" style={{ width: pct + '%', transition: 'width .2s' }} /></div>
      <div className="group" style={{ margin: '12px 0 0' }}>
        <div className="cell"><span className="grow">Signed in</span><span className="val">{p.session?.name}</span></div>
        <div className="cell"><span className="grow">Guest list</span><span className="val num">{progress.done} of {progress.total || '…'}</span></div>
        <div className="cell"><span className="grow">Counter setup</span><span className="val">Waiting</span></div>
      </div>
      {paused ? <Btn icon="refresh" onClick={retry}>Resume download</Btn> : <p className="t-cap muted center" style={{ margin: 0 }}>About a minute on venue Wi-Fi</p>}
    </main>
  )
}

function HomeScreenStep({ onDone }: { onDone: () => void }) {
  const [installed, setInstalled] = useState(false)
  const install = async () => {
    await deferredInstall?.prompt()
    deferredInstall = null
    setInstalled(true)
  }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  return (
    <main className="screen notabs stack" style={{ alignItems: 'center', textAlign: 'center', padding: '48px 24px 0', gap: 10 }}>
      <Logo name="homecoming" height={56} />
      <h1 className="t-title" style={{ margin: '20px 0 0', fontSize: 26, lineHeight: '32px', fontWeight: 700 }}>Add to your Home Screen</h1>
      <p className="t-body muted" style={{ margin: 0 }}>It works offline and opens full-screen, like a normal app.{ios ? ' On iPhone this also keeps your guest list from being cleared.' : ''}</p>
      <div className="stack g3" style={{ width: '100%', marginTop: 16, textAlign: 'left' }}>
        <div className="card" style={{ padding: 14 }}>
          <span className="t-cap muted">iPhone · Safari</span>
          <ol className="t-body" style={{ margin: '6px 0 0', paddingLeft: 22 }}><li>Tap Share in the toolbar</li><li>Choose Add to Home Screen</li><li>Tap Add</li></ol>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <span className="t-cap muted">Android · Chrome</span>
          <ol className="t-body" style={{ margin: '6px 0 0', paddingLeft: 22 }}><li>Tap Install when it pops up</li><li>Or ⋮ menu, then Install app</li></ol>
        </div>
      </div>
      <div className="stack g2" style={{ width: '100%', marginTop: 16 }}>
        {deferredInstall && !installed && <Btn icon="download" onClick={() => void install()}>Install app</Btn>}
        <Btn kind={deferredInstall && !installed ? 'secondary' : 'primary'} onClick={onDone}>I’ve added it</Btn>
        <Btn kind="plain" onClick={onDone}>Not now</Btn>
      </div>
    </main>
  )
}

function ReadyStep() {
  const p = prefs.use()
  const status = useSyncStatus()
  const [picker, setPicker] = useState(false)
  const [counter, setCounter] = useState<string | null>(null)
  const stats = useLiveQuery(async () => {
    const parties = await db.parties.toArray()
    return { parties: parties.length, guests: parties.reduce((n, x) => n + x.partySize, 0) }
  }, [])
  // Signed in before on this phone: go straight back to the counter they used last time, without asking.
  const before = savedCounter(p.session?.actorId)
  useEffect(() => {
    if (before) applyCounter(before)
  }, [before])
  if (before) return null
  return (
    <main className="screen notabs stack" style={{ padding: '48px 24px 0', gap: 12, minHeight: '100dvh' }}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
        <div style={{ width: 88, height: 88, borderRadius: 44, background: 'var(--ok-bg)', color: 'var(--ok-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="cloud-check" size="xl" />
        </div>
        <h1 className="t-title" style={{ margin: '8px 0 0', fontSize: 26, lineHeight: '32px', fontWeight: 700 }}>Ready offline</h1>
        <p className="t-body muted" style={{ margin: 0 }}>Scans work without signal. Changes sync when you’re back online.</p>
      </div>
      <div className="group" style={{ margin: '12px 0 0' }}>
        <div className="cell"><span className="grow">Guests on this phone</span><span className="val num">{stats?.guests ?? '…'}</span></div>
        <div className="cell"><span className="grow">Parties</span><span className="val num">{stats?.parties ?? '…'}</span></div>
        <div className="cell"><span className="grow">Last sync</span><span className="val">{p.lastSyncAt ? fmtTime(p.lastSyncAt) + ' · just now' : '—'}</span></div>
        <div className="cell"><span className="grow">Pending changes</span><span className="val">{status.pending ? plural(status.pending, 'change') : 'None'}</span></div>
      </div>
      <div className="gh-h" style={{ padding: '12px 8px 0' }}>Your station</div>
      <div className="group" style={{ margin: 0 }}>
        <button type="button" className="cell" onClick={() => setPicker(true)}>
          <span className="grow">Counter</span>
          <span className="val">{counter ? counterLabel(counter) : 'Choose'}</span>
          <Icon name="chev-r" size="s" className="chev" />
        </button>
        <div className="cell"><span className="grow">Start in</span><span className="val">{counter?.startsWith('GATE') ? 'Entry' : counter ? 'Dinner' : '—'}</span></div>
      </div>
      <div style={{ flex: 1 }} />
      <p className="t-cap muted center" style={{ margin: 0 }}>Signed in as {p.session?.name} · {p.session && roleLabel(p.session.role)}</p>
      <div style={{ paddingBottom: 'max(env(safe-area-inset-bottom),16px)' }}>
        <Btn icon="scan" onClick={() => (counter ? applyCounter(counter) : setPicker(true))}>{counter ? 'Start scanning' : 'Choose your counter'}</Btn>
      </div>
      {picker && <CounterPicker initial={counter} onDone={setCounter} onClose={() => setPicker(false)} />}
    </main>
  )
}
