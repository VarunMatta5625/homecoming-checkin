import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CorrectionSheet } from '../components/CorrectionSheet.tsx'
import { Banner, Chip, Empty, Icon, NavBar } from '../components/ui.tsx'
import { counterLabel } from '../lib/counters.ts'
import { plural } from '../lib/format.ts'
import { useRoster } from '../lib/hooks.ts'
import { leaveLayers } from '../lib/layers.ts'
import { liveEvents } from '../lib/state.ts'

export function ReviewScreen() {
  const roster = useRoster()
  const navigate = useNavigate()
  const [open, setOpen] = useState<string | null>(null)
  if (!roster) return null
  const flagged = roster.parties.filter((p) => roster.states.get(p.id)!.needsReview).sort((a, b) => a.nameLc.localeCompare(b.nameLc))
  const live = liveEvents(roster.events)
  const counters = (id: string) => {
    const cs = [...new Set(live.filter((e) => e.partyId === id && e.checkpoint === 'dinner').map((e) => e.counter))]
    return cs.length ? (cs.length > 1 ? 'Counters ' : '') + cs.map((c) => (cs.length > 1 ? counterLabel(c).replace('Counter ', '') : counterLabel(c))).join(' and ') : ''
  }

  return (
    <main className="screen notabs-top" style={{ paddingTop: 0 }}>
      <NavBar back="Stats" onBack={() => navigate('/stats', { replace: true })} title="Needs review" />
      {flagged.length === 0 ? (
        <Empty icon="check-circle" tone="ok" title="All clear" body="No parties need review. Flags show up here when counters sync and find a double serve." />
      ) : (
        <>
          <Banner kind="info" icon="info">Served at two counters while one was offline, served without a check-in, or a possible duplicate. Check with the guest, then correct the record.</Banner>
          <div style={{ height: 18 }} />
          <div className="gh-h">{plural(flagged.length, 'party', 'parties')}</div>
          <div className="group">
            {flagged.map((p) => {
              const s = roster.states.get(p.id)!
              const where = counters(p.id)
              const extra = s.overServed ? s.served + ' of ' + s.entitled : s.servedWithoutEntry ? 'No entry' : 'Duplicate?'
              return (
                <button key={p.id} type="button" className="rrow" onClick={() => setOpen(p.id)}>
                  <div className="lead lead36" style={{ background: 'var(--warn-bg)', color: 'var(--warn-text)' }}><Icon name="flag" size="m" /></div>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="nm">{p.leadName}</span>
                    <span className="meta" style={{ whiteSpace: 'normal' }}>{p.batchYear} · party of {p.partySize}{where ? ' · ' + where : ''}</span>
                  </div>
                  <Chip kind="warn">{extra}</Chip>
                  <Icon name="chev-r" size="s" className="chev" style={{ color: 'var(--text2)', opacity: 0.7 }} />
                </button>
              )
            })}
          </div>
          <div className="gh-f">Corrections need a reason and are saved to the audit log.</div>
        </>
      )}
      {open && <CorrectionSheet partyId={open} onClose={() => setOpen(null)} onOpenGuest={() => leaveLayers(() => navigate('/guest/' + open))} />}
    </main>
  )
}
