import QrScanner from 'qr-scanner'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionToast } from '../components/ActionToast.tsx'
import { Banners } from '../components/layout.tsx'
import { ResultFlow, type Flow } from '../components/ResultFlow.tsx'
import { Banner, Btn, Icon, Sheet, SyncPill } from '../components/ui.tsx'
import { DEMO } from '../lib/config.ts'
import { counterLabel } from '../lib/counters.ts'
import { db } from '../lib/db.ts'
import { useSyncStatus } from '../lib/hooks.ts'
import { plural } from '../lib/format.ts'
import { normalizeCode, parseQr, qrPayload } from '../lib/ids.ts'
import { leaveLayers } from '../lib/layers.ts'
import { prefs } from '../lib/prefs.ts'
import { ui } from '../lib/ui.ts'

type Cam = 'starting' | 'on' | 'blocked' | 'none'

export function ScanScreen() {
  const p = prefs.use()
  const status = useSyncStatus()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const [cam, setCam] = useState<Cam>('starting')
  const declined = p.cameraDeclined
  const setDeclined = (cameraDeclined: boolean) => prefs.set({ cameraDeclined })
  // What the browser itself remembers. Local storage can be cleared (private tabs, in-app browsers) while the camera stays allowed.
  const [granted, setGranted] = useState(false)
  useEffect(() => {
    let status: PermissionStatus | null = null
    navigator.permissions
      ?.query({ name: 'camera' as PermissionName })
      .then((s) => {
        status = s
        setGranted(s.state === 'granted')
        s.onchange = () => setGranted(s.state === 'granted')
      })
      .catch(() => {}) // not every browser can report camera permission
    return () => {
      if (status) status.onchange = null
    }
  }, [])
  const asked = p.cameraAsked || granted
  const [canTorch, setCanTorch] = useState(false)
  const [torch, setTorch] = useState(false)
  const [flow, setFlow] = useState<Flow | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)
  const sheetOpen = useRef(false)
  sheetOpen.current = !!flow || codeOpen
  const last = useRef<{ text: string; at: number }>({ text: '', at: 0 })

  const lookup = useCallback(async (text: string) => {
    const token = parseQr(text)
    if (!token) return setFlow({ kind: 'unrec' })
    const party = await db.parties.where('qrToken').equals(token).first()
    setFlow(party && !party.deletedAt ? { kind: 'guest', partyId: party.id, method: 'qr' } : { kind: 'notfound' })
  }, [])

  const onDecode = useCallback(
    (text: string) => {
      const t = Date.now()
      if (sheetOpen.current) return
      if (last.current.text === text && t - last.current.at < 2500) return
      last.current = { text, at: t }
      void lookup(text)
    },
    [lookup],
  )

  const wantCam = asked && !declined
  useEffect(() => {
    if (!wantCam) return
    setCam('starting')
    const video = videoRef.current
    if (!video) return
    let dead = false
    const scanner = new QrScanner(video, (r) => onDecode(r.data), { preferredCamera: 'environment', maxScansPerSecond: 12, returnDetailedScanResult: true, highlightScanRegion: false, highlightCodeOutline: false, onDecodeError: () => {} })
    scannerRef.current = scanner
    scanner
      .start()
      .then(async () => {
        if (dead) return
        setCam('on')
        setCanTorch(await scanner.hasFlash().catch(() => false))
      })
      .catch((e: unknown) => {
        if (dead) return
        setCam(/denied|notallowed|permission/i.test(String(e)) ? 'blocked' : 'none')
      })
    return () => {
      dead = true
      scannerRef.current = null
      scanner.stop()
      scanner.destroy()
    }
  }, [wantCam, onDecode])

  const toggleTorch = async () => {
    try {
      await scannerRef.current?.toggleFlash()
      setTorch(scannerRef.current?.isFlashOn() ?? false)
    } catch {
      setCanTorch(false)
    }
  }

  const camOff = !asked ? 'ask' : declined ? 'declined' : cam === 'blocked' ? 'blocked' : cam === 'none' ? 'none' : null

  return (
    <div className="scan">
      {wantCam && <video ref={videoRef} muted playsInline aria-hidden="true" />}

      <div className="scan-top">
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="pill cam" aria-label="Account and counter" onClick={() => ui.set({ account: true })}>
            <Icon name="login" size="s" />
            {counterLabel(p.counter ?? '')}
            <Icon name="chev-d" size="s" />
          </button>
          <SyncPill status={status} cam />
        </div>
        {import.meta.env.DEV && DEMO && <SimPanel onScan={(t) => void lookup(t)} />}
        <Banners className="scan-banner" />
        {!status.online && (
          <div className="scan-banner">
            <Banner kind="warn" icon="wifi-off" title="You’re offline">
              Keep scanning. {status.pending ? plural(status.pending, 'change') + (status.pending === 1 ? ' is' : ' are') : 'Changes are'} saved on this phone and will sync when signal is back.
            </Banner>
          </div>
        )}
      </div>

      {!camOff && (
        <>
          <div className="reticle" aria-hidden="true">
            <b /><b /><b /><b />
          </div>
          <div className="camhint">Scan a pass to check in</div>
        </>
      )}

      {camOff === 'ask' && (
        <div className="scan-off">
          <div className="circle"><Icon name="scan" size="xl" /></div>
          <h2>Let’s turn on the camera</h2>
          <p>You’ll use it to scan guest passes. Your browser will ask next. Nothing is recorded or saved.</p>
          <div className="stack g2" style={{ width: '100%', marginTop: 12 }}>
            <Btn onClick={() => prefs.set({ cameraAsked: true })}>Allow camera</Btn>
            <Btn kind="plain" style={{ color: '#fff' }} onClick={() => { prefs.set({ cameraAsked: true }); setDeclined(true) }}>Not now, I’ll type codes</Btn>
          </div>
        </div>
      )}
      {(camOff === 'blocked' || camOff === 'none' || camOff === 'declined') && (
        <div className="scan-off">
          <div className="circle"><Icon name="camera-off" size="xl" /></div>
          <h2>{camOff === 'none' ? (window.isSecureContext ? 'No camera found' : 'Camera needs a secure page') : 'Camera is off'}</h2>
          <p>
            {camOff === 'blocked'
              ? 'Allow camera access for this site in your browser settings to scan passes. You can still type codes or search.'
              : camOff === 'none'
                ? window.isSecureContext
                  ? 'This phone’s camera isn’t available. You can still type codes or search.'
                  : 'Browsers only allow the camera on HTTPS pages. Open the https:// address, or use the installed app. You can still type codes or search.'
                : 'You can type a pass code or search by name. Turn the camera on any time.'}
          </p>
          <div className="stack g2" style={{ width: '100%', marginTop: 12 }}>
            {camOff === 'declined' && <Btn onClick={() => setDeclined(false)}>Turn camera on</Btn>}
          </div>
        </div>
      )}

      <div className="scan-bottom">
        {canTorch ? (
          <button type="button" className={'cambtn' + (torch ? ' on' : '')} aria-label="Torch" aria-pressed={torch} onClick={toggleTorch}>
            <Icon name="torch" />
          </button>
        ) : (
          <span style={{ width: 56 }} />
        )}
        <button type="button" className="campill" onClick={() => setCodeOpen(true)}>
          <Icon name="keyboard" size="m" />
          Enter code instead
        </button>
        <span style={{ width: 56 }} />
      </div>

      <ActionToast hidden={!!flow || codeOpen} />
      {flow && <ResultFlow flow={flow} onClose={() => setFlow(null)} onEnterCode={() => { setFlow(null); setCodeOpen(true) }} />}
      {codeOpen && (
        <CodeSheet
          onClose={() => setCodeOpen(false)}
          onSearch={() => leaveLayers(() => navigate('/search'))}
          onFound={(f) => { setCodeOpen(false); setFlow(f) }}
        />
      )}
    </div>
  )
}

function CodeSheet({ onClose, onFound, onSearch }: { onClose: () => void; onFound: (f: Flow) => void; onSearch: () => void }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState(false)
  const submit = async () => {
    const code = normalizeCode(text)
    if (!code) return setErr(true)
    const party = await db.parties.where('passCode').equals(code).first()
    onFound(party && !party.deletedAt ? { kind: 'guest', partyId: party.id, method: 'code' } : { kind: 'notfound', code })
  }
  return (
    <Sheet title="Enter code" onClose={onClose}>
      <form className="px5 stack g3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <p className="t-sub muted" style={{ margin: 0 }}>Type the code printed under the guest’s QR. Letters and numbers only.</p>
        <label className="stack" style={{ gap: 6 }}>
          <span className="t-cap muted">PASS CODE</span>
          <span className="codebox">
            <input autoFocus value={text} onChange={(e) => { setText(e.target.value); setErr(false) }} placeholder="GH26-" autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} inputMode="text" aria-label="Pass code" />
          </span>
          {err && <span className="err-msg" style={{ padding: 0 }}><Icon name="alert" size="s" />Codes have at least 4 letters or numbers</span>}
          <span className="t-cap muted">Codes look like GH26-7K4Q</span>
        </label>
        <Btn type="submit">Look up guest</Btn>
        <Btn kind="plain" onClick={onSearch}>Search by name instead</Btn>
      </form>
    </Sheet>
  )
}

/** Dev only: no camera on a laptop, so this reaches every result state the same way a scan would. */
function SimPanel({ onScan }: { onScan: (text: string) => void }) {
  const [list, setList] = useState<{ label: string; text: string }[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    void (async () => {
      const ids: [string, string][] = [['g2', 'Sameer · check in'], ['g10', 'Deepa · maybe'], ['g1', 'Priya · already in'], ['', 'Unknown QR']]
      const out = await Promise.all(ids.map(async ([id, label]) => ({ label, text: id ? qrPayload((await db.parties.get(id))?.qrToken ?? 'x') : label === 'Unknown QR' ? 'https://example.com/pay' : qrPayload('ZZZZZZZZZZZZZZZZZZZZZZ') })))
      setList(out)
    })()
  }, [])
  if (!list.length) return null
  return (
    <div className="sim">
      <button type="button" className="t" style={{ textAlign: 'left', height: 32 }} aria-expanded={open} onClick={() => setOpen(!open)}>
        Dev · simulate a scan {open ? '▾' : '▸'}
      </button>
      {open && <div className="b" style={{ flexWrap: 'wrap' }}>
        {list.map((s) => (
          <button key={s.label} type="button" style={{ flex: '1 1 40%' }} onClick={() => onScan(s.text)}>
            {s.label}
          </button>
        ))}
      </div>}
    </div>
  )
}
