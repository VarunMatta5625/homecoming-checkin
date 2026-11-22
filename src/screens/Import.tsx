import { useRef, useState } from 'react'
import { backend } from '../backend/index.ts'
import type { ImportResult } from '../backend/types.ts'
import { Banner, Btn, Chip, Group, Icon, Seg, Sheet } from '../components/ui.tsx'
import { DEMO } from '../lib/config.ts'
import { FIELDS, MAX_FILE_BYTES, checkGuestFile, download, passListCsv, readFileText, templateCsv, type FileReport } from '../lib/guestImport.ts'
import { plural } from '../lib/format.ts'
import { checkOnline } from '../lib/sync.ts'
import { Page } from './Admin.tsx'

const SHOWN = 40

/** Admin: download the template, check a filled file, load it, and download the pass list. */
export function ImportScreen() {
  const pick = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; report: FileReport } | null>(null)
  const [replace, setReplace] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<(ImportResult & { replaced: boolean }) | null>(null)
  const [exporting, setExporting] = useState(false)

  const choose = async (f: File | undefined) => {
    setDone(null)
    setError(null)
    if (!f) return
    if (f.size > MAX_FILE_BYTES) return setError('That file is too big (over 5 MB). Is it the guest list saved as CSV?')
    setFile({ name: f.name, report: checkGuestFile(await readFileText(f)) })
  }

  const problems = file?.report.rows.filter((r) => r.errors.length) ?? []
  const warned = file?.report.rows.filter((r) => !r.errors.length && r.warnings.length) ?? []
  const ready = file ? file.report.rows.length - problems.length : 0
  const canImport = !!file && !file.report.fileErrors.length && !problems.length && ready > 0

  const run = async () => {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      const rows = file.report.rows.map((r) => r.guest!)
      const res = await backend.importGuests(rows, { filename: file.name, replace })
      setDone({ ...res, replaced: replace })
      setFile(null)
      setReplace(false)
      setConfirm(false)
      void checkOnline() // pull the new guests onto this phone now
    } catch (e) {
      setConfirm(false)
      setError(e instanceof Error ? e.message : 'Couldn’t import. Check your signal and try again.')
    } finally {
      setBusy(false)
    }
  }

  const exportPasses = async () => {
    setExporting(true)
    setError(null)
    try {
      download('pass-list.csv', passListCsv(await backend.exportPasses()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t download the pass list. Check your signal and try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page title="Import guests">
      {DEMO && <Banner kind="info" icon="info">Demo mode: the file is checked and counted, but nothing is saved.</Banner>}

      <Group header="1. Get the template" footer="Fill in one row per alumnus, save as CSV, then choose the file below. The PDF explains every column.">
        <div className="px stack g2" style={{ padding: 16 }}>
          <Btn kind="secondary" icon="download" onClick={() => download('guest-list-template.csv', templateCsv())}>Download the template (CSV)</Btn>
          <a className="btn plain" href="/guest-list-guide.pdf" target="_blank" rel="noreferrer">Instructions (PDF)</a>
        </div>
      </Group>

      <Group header="2. Choose your file" style={{ marginTop: 20 }}>
        <div className="px stack g2" style={{ padding: 16 }}>
          <input ref={pick} type="file" accept=".csv,text/csv" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = '' }} />
          <Btn kind="secondary" icon="share" onClick={() => pick.current?.click()}>{file ? 'Choose a different file' : 'Choose the filled CSV'}</Btn>
        </div>
      </Group>

      {error && <div className="err-msg" style={{ marginTop: 12 }}><Icon name="alert" size="s" />{error}</div>}

      {done && (
        <Banner kind="info" icon="check-circle" title={plural(done.imported, 'guest') + ' imported'}>
          {done.replaced ? plural(done.retired, 'earlier guest') + ' removed from the list. ' : ''}
          {done.flagged ? 'Flagged for review because the mobile matches another guest: ' + done.flagged + '. ' : ''}
          Phones pick the new guests up the next time they sync.
        </Banner>
      )}

      {file && (
        <>
          <Group header={'3. Check · ' + file.name} style={{ marginTop: 20 }}>
            {file.report.fileErrors.map((m) => (
              <div key={m} className="cell"><Icon name="alert" size="m" style={{ color: 'var(--bad-text)' }} /><span className="grow" style={{ whiteSpace: 'normal' }}>{m}</span></div>
            ))}
            {!file.report.fileErrors.length && (
              <div className="cell">
                <span className="grow">{plural(ready, 'guest')} ready</span>
                {problems.length > 0 && <Chip kind="bad" icon="alert">{plural(problems.length, 'row')} to fix</Chip>}
                {!problems.length && warned.length > 0 && <Chip kind="warn">{plural(warned.length, 'note')}</Chip>}
                {!problems.length && !warned.length && <Chip kind="ok" icon="check">All good</Chip>}
              </div>
            )}
            {file.report.ignored.length > 0 && (
              <div className="cell"><span className="grow t-cap muted" style={{ whiteSpace: 'normal' }}>Not used by the app, so skipped: {file.report.ignored.join(', ')}.</span></div>
            )}
            {problems.slice(0, SHOWN).map((r) => (
              <div key={r.line} className="cell" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span><b>Row {r.line}</b> <span className="muted">{r.name}</span></span>
                {r.errors.map((m) => <span key={m} className="t-cap" style={{ color: 'var(--bad-text)', whiteSpace: 'normal' }}>{m}</span>)}
              </div>
            ))}
            {problems.length > SHOWN && <div className="cell"><span className="muted">…and {problems.length - SHOWN} more rows with problems. Fix these and choose the file again.</span></div>}
            {!problems.length && warned.slice(0, SHOWN).map((r) => (
              <div key={r.line} className="cell" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span><b>Row {r.line}</b> <span className="muted">{r.name}</span></span>
                {r.warnings.map((m) => <span key={m} className="t-cap muted" style={{ whiteSpace: 'normal' }}>{m}</span>)}
              </div>
            ))}
          </Group>
          {problems.length > 0 && <p className="t-cap muted px5">Fix the rows above in your spreadsheet, save it again, and choose the file again. Nothing has been sent.</p>}

          {canImport && (
            <>
              <Group header="4. Add or replace" style={{ marginTop: 20 }} footer={replace ? 'Replace removes every guest now in the app, then adds this file. It is refused once any check-in has been recorded, or once the event is live.' : 'Add keeps the guests already in the app and adds these.'}>
                <div className="cell" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                  <Seg label="Add or replace" value={replace ? 'replace' : 'add'} onChange={(v) => setReplace(v === 'replace')} options={[{ value: 'add', label: 'Add to the list' }, { value: 'replace', label: 'Replace the list' }]} />
                </div>
              </Group>
              <div className="px" style={{ marginTop: 16 }}><Btn disabled={busy} onClick={() => setConfirm(true)}>{'Import ' + plural(ready, 'guest')}</Btn></div>
            </>
          )}
        </>
      )}

      <Group header="Pass list" style={{ marginTop: 28 }} footer="Every current guest with their pass code, QR token, mobile and email, for sending passes and printing QR codes. It holds personal details: keep the file safe and delete it when done. Each download is recorded in the audit log.">
        <div className="px" style={{ padding: 16 }}>
          <Btn kind="secondary" icon="download" disabled={exporting} onClick={() => void exportPasses()}>{exporting ? 'Preparing…' : 'Download the pass list (CSV)'}</Btn>
        </div>
      </Group>
      <Group header="Column guide" style={{ marginTop: 28 }}>
        {FIELDS.map((f) => (
          <div key={f.header} className="cell" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span><b>{f.header}</b> <span className="muted">· {f.required ? 'required' : 'optional'}</span></span>
            <span className="t-cap muted" style={{ whiteSpace: 'normal' }}>{f.allowed}</span>
          </div>
        ))}
      </Group>

      <div style={{ height: 32 }} />

      {confirm && file && (
        <Sheet
          title={replace ? 'Replace the guest list?' : 'Import these guests?'}
          onClose={() => setConfirm(false)}
          footer={<Btn kind={replace ? 'destructive-fill' : 'primary'} disabled={busy} onClick={() => void run()}>{busy ? 'Importing…' : replace ? 'Replace the list' : 'Import ' + plural(ready, 'guest')}</Btn>}
        >
          <p className="t-body px5" style={{ margin: 0 }}>
            {replace ? 'Every guest now in the app is removed and ' : ''}
            {plural(ready, 'guest')} from {file.name} {replace ? 'take their place.' : 'are added to the list.'} Passes are created for each new guest.
          </p>
          <p className="t-cap muted px5">This is recorded in the audit log, with your name.</p>
        </Sheet>
      )}
    </Page>
  )
}
