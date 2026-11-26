import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ReviewSheet } from '../components/ReviewSheet.tsx'
import { Banner, Chip, Empty, Icon, NavBar } from '../components/ui.tsx'
import { plural } from '../lib/format.ts'
import { useRoster } from '../lib/hooks.ts'
import { leaveLayers } from '../lib/layers.ts'

export function ReviewScreen() {
  const roster = useRoster()
  const navigate = useNavigate()
  const [open, setOpen] = useState<string | null>(null)
  if (!roster) return null
  const flagged = roster.parties.filter((p) => roster.states.get(p.id)!.needsReview).sort((a, b) => a.nameLc.localeCompare(b.nameLc))

  return (
    <main className="screen notabs-top" style={{ paddingTop: 0 }}>
      <NavBar back="Stats" onBack={() => navigate('/stats', { replace: true })} title="Needs review" />
      {flagged.length === 0 ? (
        <Empty icon="check-circle" tone="ok" title="All clear" body="No parties need review. Flags show up here when two guests share a mobile number." />
      ) : (
        <>
          <Banner kind="info" icon="info">These guests share a mobile number with another guest, so they may be listed twice. Check with the guest, then mark them as different people or correct the record.</Banner>
          <div style={{ height: 18 }} />
          <div className="gh-h">{plural(flagged.length, 'party', 'parties')}</div>
          <div className="group">
            {flagged.map((p) => {
              return (
                <button key={p.id} type="button" className="rrow" onClick={() => setOpen(p.id)}>
                  <div className="lead lead36" style={{ background: 'var(--warn-bg)', color: 'var(--warn-text)' }}><Icon name="flag" size="m" /></div>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="nm">{p.leadName}</span>
                    <span className="meta" style={{ whiteSpace: 'normal' }}>{p.batchYear} · party of {p.partySize}</span>
                  </div>
                  <Chip kind="warn">Duplicate?</Chip>
                  <Icon name="chev-r" size="s" className="chev" style={{ color: 'var(--text2)', opacity: 0.7 }} />
                </button>
              )
            })}
          </div>
          <div className="gh-f">Corrections need a reason and are saved to the audit log.</div>
        </>
      )}
      {open && <ReviewSheet partyId={open} onClose={() => setOpen(null)} onOpenGuest={() => leaveLayers(() => navigate('/guest/' + open))} />}
    </main>
  )
}