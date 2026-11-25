import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../backend/index.ts'
import type { AdminUser } from '../backend/types.ts'
import { Alert, Banner, Btn, Chip, Empty, Group, Icon, NavBar, Seg, Sheet, Switch } from '../components/ui.tsx'
import { counterLabel } from '../lib/counters.ts'
import { splitFlushVoids } from '../lib/flush.ts'
import { fmtTime, initials, plural, roleLabel } from '../lib/format.ts'
import { useRoster } from '../lib/hooks.ts'
import { prefs } from '../lib/prefs.ts'
import type { Role } from '../lib/types.ts'

export function Page({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <main className="screen" style={{ paddingTop: 0 }}>
      <NavBar back="Back" onBack={() => (history.length > 1 ? navigate(-1) : navigate('/scan', { replace: true }))} title={title} right={right} />
      <div style={{ height: 16 }} />
      {children}
    </main>
  )
}

const BLANK: AdminUser = { email: '', name: '', role: 'volunteer', active: true }

/** v1: plain and functional. The last active admin can't be removed, demoted or deactivated (the server enforces it too). */
export function UsersScreen() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [edit, setEdit] = useState<{ user: AdminUser; isNew: boolean } | null>(null)
  const load = () => void backend.listUsers().then(setUsers)
  useEffect(load, [])
  const on = (users ?? []).filter((u) => u.active)
  const off = (users ?? []).filter((u) => !u.active)
  const row = (u: AdminUser) => (
    <button key={u.email} type="button" className="rrow" onClick={() => setEdit({ user: u, isNew: false })}>
      <span className="avatar" style={{ width: 40, height: 40 }}>{initials(u.name || u.email)}</span>
      <div className="grow stack" style={{ gap: 2 }}>
        <span className="nm">{u.name || u.email}</span>
        <span className="meta ellipsis">{u.email}</span>
      </div>
      {!u.active && <Chip kind="neutral" icon="lock">Off</Chip>}
      <Chip kind="tint">{roleLabel(u.role)}</Chip>
      <Icon name="chev-r" size="s" className="chev" style={{ color: 'var(--text2)', opacity: 0.7 }} />
    </button>
  )

  return (
    <Page title="Users and roles" right={<button type="button" className="navbtn" onClick={() => setEdit({ user: BLANK, isNew: true })}>Add</button>}>
      {users && (
        <>
          <Group header={on.length + ' people can sign in'} footer="People are added by email. They link up the first time they sign in with Google.">
            {on.map(row)}
          </Group>
          {off.length > 0 && (
            <Group header="Removed or switched off" style={{ marginTop: 20 }} footer="They cannot sign in. Their scans and edits stay in the records. Tap a person to switch them back on.">
              {off.map(row)}
            </Group>
          )}
        </>
      )}
      {edit && <EditUser init={edit} all={users ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </Page>
  )
}

function EditUser({ init, all, onClose, onSaved }: { init: { user: AdminUser; isNew: boolean }; all: AdminUser[]; onClose: () => void; onSaved: () => void }) {
  const [u, setU] = useState(init.user)
  const [error, setError] = useState<string | null>(null)
  const emailOk = /^\S+@\S+\.\S+$/.test(u.email.trim())

  const [confirmRemove, setConfirmRemove] = useState(false)
  const isMe = init.user.email.toLowerCase() === prefs.get().session?.email.toLowerCase()

  const save = async (next: AdminUser = u) => {
    const email = next.email.trim().toLowerCase()
    if (init.isNew && all.some((x) => x.email.toLowerCase() === email)) return setError('That email is already on the list.')
    const others = all.filter((x) => x.email.toLowerCase() !== email && x.active && x.role === 'admin')
    if (!others.length && !(next.active && next.role === 'admin')) return setError('There must be at least one active admin.')
    try {
      await backend.saveUser({ ...next, email })
      onSaved()
    } catch (e) {
      setConfirmRemove(false)
      setError(e instanceof Error ? e.message : 'Couldn’t save. Check your signal and try again.')
    }
  }

  return (
    <Sheet title={init.isNew ? 'Add person' : 'Edit person'} onClose={onClose}>
      <Group>
        <label className="cell"><span style={{ width: 80, flex: 'none' }}>Email</span><input value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} readOnly={!init.isNew} placeholder="name@gitam.in" inputMode="email" autoCapitalize="none" autoComplete="off" /></label>
        <label className="cell"><span style={{ width: 80, flex: 'none' }}>Name</span><input value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} placeholder="Optional" /></label>
        <div className="cell" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span>Role</span>
          <Seg<Role> label="Role" value={u.role} onChange={(role) => setU({ ...u, role })} options={[{ value: 'volunteer', label: 'Volunteer' }, { value: 'staff', label: 'Staff' }, { value: 'admin', label: 'Admin' }]} />
        </div>
        <div className="cell"><span className="grow">Active</span><Switch on={u.active} onChange={(active) => setU({ ...u, active })} label="Active" /></div>
      </Group>
      {error && <div className="err-msg"><Icon name="alert" size="s" />{error}</div>}
      <div className="px stack g2">
        <Btn disabled={!emailOk} onClick={() => void save()}>Save</Btn>
        {!init.isNew && u.active && !isMe && <Btn kind="destructive" onClick={() => setConfirmRemove(true)}>Remove from the list</Btn>}
      </div>
      {confirmRemove && (
        <Alert
          title={'Remove ' + (init.user.name || init.user.email) + '?'}
          body="They can no longer sign in, and any phone they are signed in on stops working. Their scans and edits stay in the records. You can switch them back on later."
          onClose={() => setConfirmRemove(false)}
          actions={[
            { label: 'Cancel', onClick: () => setConfirmRemove(false) },
            { label: 'Remove', kind: 'danger', onClick: () => void save({ ...init.user, active: false }) },
          ]}
        />
      )}
    </Sheet>
  )
}

/** Shows the corrections and undos this phone knows about. User and guest edits are in the server audit log. */
export function AuditScreen() {
  const roster = useRoster()
  // A flush writes one void per guest. Show each flush as one line, not hundreds.
  const rows = useMemo(() => {
    if (!roster) return []
    const { flushes, rest } = splitFlushVoids(roster.events.filter((e) => e.action === 'void'))
    return [...flushes.map((f) => ({ at: f.at, flush: f, e: null })), ...rest.map((e) => ({ at: e.clientAt, flush: null, e }))].sort((a, b) => b.at - a.at)
  }, [roster])
  return (
    <Page title="Audit log">
      <Banner kind="info" icon="info">Showing undos and corrections synced to this phone. User and guest edits appear here once the server audit feed is connected.</Banner>
      <div style={{ height: 16 }} />
      {rows.length === 0 ? (
        <Empty icon="history" title="Nothing logged yet" body="Undos and staff corrections will show up here with who did them and why." />
      ) : (
        <div className="group">
          {rows.map(({ flush, e }) => flush ? (
            <div key={flush.key} className="rrow vtop">
              <div className="lead lead36" style={{ background: 'var(--bad-bg)', color: 'var(--bad-text)' }}><Icon name="alert" size="m" /></div>
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="nm" style={{ whiteSpace: 'normal' }}>{'Flushed all check-ins · ' + plural(flush.count, 'check-in') + ' undone'}</span>
                <span className="meta" style={{ whiteSpace: 'normal' }}>{fmtTime(flush.at)} · {flush.by}</span>
                <span className="meta" style={{ whiteSpace: 'normal' }}>Reason: {flush.reason}</span>
              </div>
            </div>
          ) : e && (
            <div key={e.id} className="rrow vtop">
              <div className="lead lead36" style={{ background: 'var(--warn-bg)', color: 'var(--warn-text)' }}><Icon name={e.method === 'staff' ? 'wrench' : 'undo'} size="m" /></div>
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="nm" style={{ whiteSpace: 'normal' }}>{(e.method === 'staff' ? 'Reset check-in' : 'Undid check-in') + ' · ' + (roster?.byId.get(e.partyId)?.leadName ?? 'Unknown')}</span>
                <span className="meta" style={{ whiteSpace: 'normal' }}>{fmtTime(e.clientAt)} · {e.actorName} · {counterLabel(e.counter)}</span>
                <span className="meta" style={{ whiteSpace: 'normal' }}>Reason: {e.reason}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}
