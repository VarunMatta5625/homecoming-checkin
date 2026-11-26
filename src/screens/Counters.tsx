import { useState } from 'react'
import { backend } from '../backend/index.ts'
import { Banner, Btn, Group, Icon, Stepper } from '../components/ui.tsx'
import { activeCounters, setCounters, useCounters } from '../lib/counters.ts'
import { plural } from '../lib/format.ts'
import { Page } from './Admin.tsx'

const MAX = 20

/** Admin: how many gate desks there are. Desks above the number are switched off, never deleted, so old scans keep their names. */
export function CountersScreen() {
  const current = activeCounters(useCounters()).length
  const [n, setN] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    if (busy || n === current) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      setCounters(await backend.setGateCount(n))
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save. Check your signal and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Gate desks">
      <Group header="Number of gate desks" footer="Volunteers choose their desk from this list. Lowering the number switches the last desks off; their earlier scans keep the name.">
        <div className="cell">
          <span className="grow">Gate desks</span>
          <Stepper value={n} min={1} max={MAX} onChange={(v) => { setN(v); setSaved(false) }} label="Gate desks" />
        </div>
      </Group>
      {error && <div className="err-msg" style={{ marginTop: 12 }}><Icon name="alert" size="s" />{error}</div>}
      {saved && (
        <div style={{ marginTop: 12 }}>
          <Banner kind="info" icon="check-circle" title="Saved">
            {plural(current, 'gate desk')} now. Other phones pick up the new list within ten minutes. A volunteer already scanning at a desk that was switched off can finish; they choose a desk again the next time they sign in.
          </Banner>
        </div>
      )}
      <div className="px stack g2" style={{ marginTop: 20 }}>
        <Btn disabled={busy || n === current} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Btn>
      </div>
    </Page>
  )
}
