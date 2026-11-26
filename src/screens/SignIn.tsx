import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../backend/index.ts'
import type { SignInResult } from '../backend/types.ts'
import { Btn, Chip, Icon, Logo } from '../components/ui.tsx'
import { DEMO } from '../lib/config.ts'
import { initials } from '../lib/format.ts'
import { prefs } from '../lib/prefs.ts'
import { signInReturnError } from '../lib/signinReturn.ts'

type Who = 'volunteer' | 'staff' | 'admin' | 'unlisted'

export function SignInScreen() {
  const [busy, setBusy] = useState(false)
  // Back from Google with a refusal (the account hook): "" means the email is not known here.
  const [returned] = useState(signInReturnError)
  const [rejected, setRejected] = useState<string | null>(returned === 'not-listed' ? '' : null)
  const [desk, setDesk] = useState(false)
  const [error, setError] = useState<string | null>(returned === 'other' ? 'Google sign-in didn’t finish. Try again.' : null)

  const finish = (r: SignInResult) => {
    if ('session' in r) prefs.set({ session: r.session, sessionExpired: false })
    else if ('rejectedEmail' in r) setRejected(r.rejectedEmail)
    else setError(r.error)
  }

  const run = async (who?: Who) => {
    setBusy(true)
    setError(null)
    try {
      finish(who && backend.signInDemo ? await backend.signInDemo(who) : await backend.signInWithGoogle())
    } catch {
      setError('Couldn’t reach the server. Check your signal and try again.')
    } finally {
      setBusy(false)
    }
  }

  // Back from Google's page: pick up the session it created.
  useEffect(() => {
    void backend.resume?.().then((r) => r && finish(r)).catch(() => {})
  }, [])

  if (rejected !== null)
    return (
      <main className="screen notabs stack" style={{ alignItems: 'center', textAlign: 'center', padding: '72px 24px 0', gap: 10 }}>
        <div style={{ width: 88, height: 88, borderRadius: 44, background: 'var(--warn-bg)', color: 'var(--warn-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="help" size="xl" />
        </div>
        <h1 className="t-title" style={{ margin: '12px 0 0', fontSize: 26, lineHeight: '32px', fontWeight: 700 }}>You’re not on the list yet</h1>
        <p className="t-body muted" style={{ margin: 0 }}>This app is only for Homecoming volunteers and staff. Ask the volunteer desk to approve your account, then try again.</p>
        {rejected && (
          <div className="card" style={{ marginTop: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left' }}>
            <span className="avatar">{initials(rejected.split('@')[0]!.replace('.', ' '))}</span>
            <div className="stack grow">
              <span className="t-cap muted">Signed in as</span>
              <span className="t-head ellipsis">{rejected}</span>
            </div>
          </div>
        )}
        <div className="stack g2" style={{ width: '100%', marginTop: 12 }}>
          <Btn onClick={() => setRejected(null)}>Try another account</Btn>
          <Btn kind="plain" onClick={() => setDesk(!desk)}>{desk ? 'Hide volunteer desk details' : 'Show volunteer desk details'}</Btn>
          {desk && <div className="note"><Icon name="info" size="m" style={{ color: 'var(--text2)' }} /><span>Tell the desk {rejected ? 'the email shown above' : 'the Google email you just used'}. They add it to the list, then you can sign in again here.</span></div>}
        </div>
      </main>
    )

  return (
    <main className="screen notabs stack" style={{ alignItems: 'center', textAlign: 'center', padding: '56px 24px 0', gap: 10, minHeight: '100dvh' }}>
      <Logo name="homecoming" height={132} />
      <h1 className="lt" style={{ padding: '28px 0 0', fontSize: 30, lineHeight: '36px' }}>Welcome, volunteers</h1>
      <p className="t-body muted" style={{ margin: 0, maxWidth: 320 }}>Check guests in at the gate, even when the signal drops.</p>
      <div className="stack g2" style={{ width: '100%', marginTop: 28 }}>
        <Btn kind="primary" disabled={busy} onClick={() => void run()}>
          <span style={{ fontWeight: 800, background: '#fff', color: 'var(--btn)', width: 24, height: 24, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>G</span>
          {busy ? 'Signing in…' : 'Continue with Google'}
        </Btn>
        <span className="t-cap muted">Use your GITAM college account</span>
        {error && <div className="err-msg" style={{ justifyContent: 'center' }}><Icon name="alert" size="s" />{error}</div>}
      </div>

      {DEMO && (
        <div className="stack g2" style={{ width: '100%', marginTop: 28, border: '1.5px dashed var(--sep)', borderRadius: 14, padding: 12, textAlign: 'left' }}>
          <span className="t-cap muted" style={{ fontWeight: 600 }}>DEMO · sign in as</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['volunteer', 'staff', 'admin', 'unlisted'] as Who[]).map((w) => (
              <button key={w} type="button" className="fchip" disabled={busy} onClick={() => void run(w)}>
                {w === 'unlisted' ? 'Not on the list' : w[0]!.toUpperCase() + w.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '24px 0', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text2)' }}>
        <Logo name="gitam" height={32} />
      </div>
      <Chip kind="outline" icon="wifi-off">Works offline once your phone is set up</Chip>
      <Link to="/privacy" className="t-cap muted" style={{ padding: '8px 0 4px' }}>
        Privacy policy
      </Link>
    </main>
  )
}
