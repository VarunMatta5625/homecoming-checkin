import { useState } from 'react'
import { REASONS_UNDO, counterLabel } from '../lib/config.ts'
import { fmtTime } from '../lib/format.ts'
import { voidEvent } from '../lib/actions.ts'
import type { ScanEvent } from '../lib/types.ts'
import { Btn, Group, Icon, Sheet } from './ui.tsx'

/** Undo always asks for a reason and writes a compensating void event. */
export function UndoSheet({ event, who, detail, onClose, onUndone }: { event: ScanEvent; who: string; detail: string; onClose: () => void; onUndone: () => void }) {
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const isServe = event.checkpoint === 'dinner'
  const title = (isServe ? 'Served ' + event.qty : 'Checked in ' + event.qty) + ' · ' + who

  const confirm = async () => {
    if (!reason || busy) return
    setBusy(true)
    await voidEvent(event, note.trim() ? reason + ': ' + note.trim() : reason)
    onUndone()
  }

  return (
    <Sheet title={isServe ? 'Undo this serve?' : 'Undo this check-in?'} onClose={onClose}>
      <div className="card" style={{ margin: '0 16px', padding: '12px 16px', background: 'var(--fill2)', display: 'flex', flexDirection: 'column' }}>
        <span className="t-head">{title}</span>
        <span className="t-sub muted">{fmtTime(event.clientAt)} · {counterLabel(event.counter)} · {detail}</span>
      </div>
      <Group header="Why are you undoing this? · required">
        <div role="radiogroup" aria-label="Reason">
          {REASONS_UNDO.map((r) => (
            <button key={r} type="button" className="cell" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}>
              <span className="grow">{r}</span>
              <span className={'radio' + (reason === r ? ' on' : '')}>{reason === r && <Icon name="check" size="s" />}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group header="Note (optional)">
        <label className="cell">
          <input style={{ textAlign: 'left' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for staff" maxLength={140} aria-label="Note" />
        </label>
      </Group>
      <div className="px">
        <Btn kind="destructive" icon="undo" disabled={!reason || busy} onClick={confirm}>
          {isServe ? 'Undo serve' : 'Undo check-in'}
        </Btn>
      </div>
      <div className="t-cap muted px5 center">Saved with your name and the time.</div>
    </Sheet>
  )
}
