import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Qr } from '../components/Qr.tsx'
import { Screen } from '../components/layout.tsx'
import { ActionSheet, Btn, Chip, Group, Icon, Seg, Sheet, Stepper, Banner } from '../components/ui.tsx'
import { Wheel } from '../components/Wheel.tsx'
import { MAX_BATCH_YEAR, MAX_CHILDREN, MIN_BATCH_YEAR, SCHOOLS } from '../lib/config.ts'
import { findPossibleDuplicate, registerOnSpot } from '../lib/actions.ts'
import { firstName, fmtTime, parkingLabel, partyDesc } from '../lib/format.ts'
import { useSyncStatus } from '../lib/hooks.ts'
import { qrPayload } from '../lib/ids.ts'
import { leaveLayers } from '../lib/layers.ts'
import type { Parking, Party, Ynm } from '../lib/types.ts'

interface Form {
  name: string
  mobile: string
  email: string
  batchYear: number | null
  school: string | null
  course: string
  spouse: Ynm
  children: number
  parking: Parking
}
const EMPTY: Form = { name: '', mobile: '', email: '', batchYear: null, school: null, course: '', spouse: 'no', children: 0, parking: 'none' }
const YEARS = Array.from({ length: MAX_BATCH_YEAR - MIN_BATCH_YEAR + 1 }, (_, i) => MIN_BATCH_YEAR + i)

type Errors = Partial<Record<'name' | 'mobile' | 'batchYear' | 'school' | 'course', string>>

function validate(f: Form): Errors {
  const e: Errors = {}
  if (f.name.trim().length < 2) e.name = 'Enter the alumnus’s full name'
  if (f.mobile.replace(/\D/g, '').length !== 10) e.mobile = 'Mobile needs 10 digits'
  if (f.batchYear === null) e.batchYear = 'Choose a batch year (' + MIN_BATCH_YEAR + '–' + MAX_BATCH_YEAR + ')'
  if (!f.school) e.school = 'Choose a school'
  if (!f.course.trim()) e.course = 'Enter the course'
  return e
}

export function RegisterScreen() {
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [tried, setTried] = useState(false)
  const [picker, setPicker] = useState<'batch' | 'school' | null>(null)
  const [dup, setDup] = useState<Party | null>(null)
  const [discard, setDiscard] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pass, setPass] = useState<{ party: Party; at: number; offline: boolean } | null>(null)
  const status = useSyncStatus()
  const navigate = useNavigate()

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    const next = { ...form, [k]: v }
    setForm(next)
    if (tried) setErrors(validate(next))
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(EMPTY)
  const size = 1 + (form.spouse === 'no' ? 0 : 1) + form.children

  const create = async (duplicateOf: string | null) => {
    if (busy) return
    setBusy(true)
    const offline = !status.online
    const { party, entry } = await registerOnSpot({
      name: form.name,
      mobile: form.mobile,
      email: form.email,
      batchYear: form.batchYear!,
      school: form.school!,
      course: form.course,
      spouse: form.spouse,
      children: form.children,
      parking: form.parking,
      duplicateOf,
    })
    setDup(null)
    setBusy(false)
    setPass({ party, at: entry.clientAt, offline })
  }

  const submit = async () => {
    const e = validate(form)
    setTried(true)
    setErrors(e)
    if (Object.keys(e).length) return
    const hit = await findPossibleDuplicate(form.mobile, form.name, form.batchYear!)
    if (hit) setDup(hit)
    else await create(null)
  }

  if (pass) return <PassView party={pass.party} at={pass.at} offline={pass.offline} onAgain={() => { setPass(null); setForm(EMPTY); setErrors({}); setTried(false) }} />

  const errCount = Object.keys(errors).length
  const err = (k: keyof Errors) => errors[k] && <div className="err-msg"><Icon name="alert" size="s" />{errors[k]}</div>

  return (
    <Screen topRow={false}>
      <div className="navrow">
        <button type="button" className="navbtn" style={{ paddingLeft: 0 }} onClick={() => (dirty ? setDiscard(true) : navigate('/scan', { replace: true }))}>
          Cancel
        </button>
      </div>
      <h1 className="lt">Register</h1>
      <p className="t-sub muted px5" style={{ margin: '0 0 12px' }}>
        {tried && errCount ? 'Fix ' + errCount + (errCount === 1 ? ' thing' : ' things') + ' to create the pass.' : 'For alumni who arrive without a pass.'}
      </p>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }} noValidate>
        <Group header="Alumnus">
          <label className={'cell' + (errors.name ? ' err' : '')}>
            <span style={{ width: 96, flex: 'none' }}>Name</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" autoComplete="off" autoCapitalize="words" aria-invalid={!!errors.name} />
          </label>
          <label className={'cell' + (errors.mobile ? ' err' : '')}>
            <span style={{ width: 96, flex: 'none' }}>Mobile</span>
            <input className="num" value={form.mobile} onChange={(e) => set('mobile', e.target.value.replace(/[^\d\s+]/g, ''))} placeholder="+91" inputMode="tel" autoComplete="off" aria-invalid={!!errors.mobile} />
          </label>
          <label className="cell">
            <span style={{ width: 96, flex: 'none' }}>Email</span>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Optional" inputMode="email" autoCapitalize="none" autoComplete="off" />
          </label>
        </Group>
        {err('name')}
        {err('mobile')}

        <Group header="Studies" style={{ marginTop: 20 }}>
          <button type="button" className={'cell' + (errors.batchYear ? ' err' : '')} onClick={() => setPicker('batch')}>
            <span className="grow">Batch year</span>
            <span className="val">{form.batchYear ?? 'Choose'}</span>
            <Icon name="chev-r" size="s" className="chev" />
          </button>
          <button type="button" className={'cell' + (errors.school ? ' err' : '')} onClick={() => setPicker('school')}>
            <span className="grow">School</span>
            <span className="val">{form.school?.replace('School of ', '') ?? 'Choose'}</span>
            <Icon name="chev-r" size="s" className="chev" />
          </button>
          <label className={'cell' + (errors.course ? ' err' : '')}>
            <span style={{ width: 96, flex: 'none' }}>Course</span>
            <input value={form.course} onChange={(e) => set('course', e.target.value)} placeholder="e.g. B.Tech, Mechanical" autoComplete="off" autoCapitalize="words" />
          </label>
        </Group>
        {err('batchYear')}
        {err('school')}
        {err('course')}

        <Group header="Party" style={{ marginTop: 20 }}>
          <div className="cell" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <span>Spouse coming?</span>
            <Seg label="Spouse coming" value={form.spouse} onChange={(v) => set('spouse', v)} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }, { value: 'maybe', label: 'Maybe' }]} />
          </div>
          <div className="cell">
            <span className="grow">Children</span>
            <Stepper value={form.children} min={0} max={MAX_CHILDREN} onChange={(n) => set('children', n)} label="Children" />
          </div>
        </Group>

        <Group header="Parking" style={{ marginTop: 20 }} footer={'Party of ' + size + (form.spouse === 'maybe' ? ' (spouse: Maybe)' : '') + '. One QR for everyone.' + (form.mobile.replace(/\D/g, '').length === 10 ? ' The pass is sent to +91 ' + form.mobile.replace(/\D/g, '').slice(-10).replace(/(\d{5})(\d{5})/, '$1 $2') + ' by SMS.' : '')}>
          <div className="cell" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <Seg label="Parking" value={form.parking} onChange={(v) => set('parking', v)} options={[{ value: 'none', label: 'None' }, { value: 'two_wheeler', label: '2-wheeler' }, { value: 'four_wheeler', label: '4-wheeler' }]} />
          </div>
        </Group>
        <div className="cta-space" />
        <div className="sticky-cta">
          <Btn type="submit" icon="qr" disabled={busy}>Create pass</Btn>
        </div>
      </form>

      {picker === 'batch' && <YearSheet current={form.batchYear} onClose={() => setPicker(null)} onPick={(y) => { set('batchYear', y); setPicker(null) }} />}
      {picker === 'school' && (
        <Sheet title="School" onClose={() => setPicker(null)}>
          <div className="group" role="radiogroup" aria-label="School">
            {SCHOOLS.map((s) => (
              <button key={s} type="button" className="cell" role="radio" aria-checked={form.school === s} onClick={() => { set('school', s); setPicker(null) }}>
                <span className="grow">{s}</span>
                <span className={'radio' + (form.school === s ? ' on' : '')}>{form.school === s && <Icon name="check" size="s" />}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {dup && (
        <Sheet title="Check before you continue" onClose={() => setDup(null)}>
          <div className="rhead warn">
            <div className="ricon"><Icon name="users" size="l" /></div>
            <div className="stack"><span className="rlabel">Possible duplicate</span><span className="rsub">Same mobile ••••{dup.mobileLast4}</span></div>
          </div>
          <p className="t-body px5" style={{ margin: 0 }}>Someone with this mobile is already registered:</p>
          <div className="card" style={{ margin: '0 16px', padding: '14px 16px', background: 'var(--fill2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="t-head">{dup.leadName}</span>
            <span className="t-sub muted">Batch {dup.batchYear} · {dup.course} · party of {dup.partySize}</span>
          </div>
          <div className="btns">
            <Btn onClick={() => leaveLayers(() => navigate('/guest/' + dup.id))}>Open that guest</Btn>
            <Btn kind="secondary" disabled={busy} onClick={() => void create(dup.id)}>Register anyway</Btn>
          </div>
        </Sheet>
      )}
      {discard && (
        <ActionSheet
          title="Discard this registration?"
          body={(form.name.trim() ? firstName(form.name) + '’s' : 'These') + ' details will be lost.'}
          onClose={() => setDiscard(false)}
          actions={[{ label: 'Discard', kind: 'danger', onClick: () => { setDiscard(false); setForm(EMPTY); setErrors({}); setTried(false) } }]}
        />
      )}
    </Screen>
  )
}

function YearSheet({ current, onPick, onClose }: { current: number | null; onPick: (y: number) => void; onClose: () => void }) {
  const [i, setI] = useState(current ? YEARS.indexOf(current) : YEARS.indexOf(2014))
  return (
    <Sheet title="Batch year" onClose={onClose}>
      <Wheel items={YEARS.map(String)} index={i} onChange={setI} label="Batch year" />
      <div className="px"><Btn onClick={() => onPick(YEARS[i]!)}>Use {YEARS[i]}</Btn></div>
    </Sheet>
  )
}

function PassView({ party, at, offline, onAgain }: { party: Party; at: number; offline: boolean; onAgain: () => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  const share = async () => {
    const text = 'Homecoming 2026 pass for ' + party.leadName + '. Pass code ' + party.passCode
    try {
      if (navigator.share) await navigator.share({ title: 'Homecoming 2026 pass', text })
      else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  return (
    <Screen topRow={false}>
      <div className="navrow" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="navbtn" onClick={onAgain}>Done</button>
      </div>
      <div className="stack center" style={{ alignItems: 'center', padding: '0 24px', gap: 8 }}>
        <Chip kind="ok" icon="check-circle">Checked in · {fmtTime(at)}</Chip>
        <h1 className="t-title" style={{ margin: '6px 0 0', fontSize: 26, lineHeight: '32px', fontWeight: 700 }}>Welcome back to campus, {firstName(party.leadName)}!</h1>
        <p className="t-sub muted" style={{ margin: 0 }}>Batch of {party.batchYear} · {party.course}</p>
      </div>
      <div className="card stack" style={{ margin: '16px 40px 0', padding: 16, alignItems: 'center', gap: 12, boxShadow: 'var(--shadow)' }}>
        <Qr text={qrPayload(party.qrToken)} label={'QR pass for ' + party.leadName} />
        <div className="stack" style={{ alignItems: 'center' }}>
          <span className="t-cap muted">PASS CODE</span>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 3 }}>{party.passCode}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Chip icon="users">Party of {party.partySize}</Chip>
          {party.parking !== 'none' && <Chip icon={party.parking === 'two_wheeler' ? 'bike' : 'car'}>{parkingLabel(party.parking)} parking</Chip>}
        </div>
        <span className="t-cap muted center">{partyDesc(party.spouse, party.children)}</span>
      </div>
      {offline && (
        <div style={{ marginTop: 16 }}>
          <Banner kind="warn" icon="wifi-off">Saved on this phone. It will sync when signal is back. Other phones can’t scan this pass until then, but they can find it by name.</Banner>
        </div>
      )}
      <div className="btns" style={{ marginTop: 20 }}>
        <Btn kind="secondary" icon="share" onClick={share}>{copied ? 'Copied to clipboard' : 'Share pass'}</Btn>
        <Btn kind="plain" onClick={onAgain}>Register another</Btn>
      </div>
    </Screen>
  )
}
