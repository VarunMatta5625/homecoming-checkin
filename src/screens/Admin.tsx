import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../backend/index.ts'
import type { AdminUser } from '../backend/types.ts'
import { Banner, Btn, Chip, Empty, Group, Icon, NavBar, Seg, Sheet, Switch } from '../components/ui.tsx'
import { counterLabel } from '../lib/config.ts'
import { fmtTime, initials, roleLabel } from '../lib/format.ts'
import { useRoster } from '../lib/hooks.ts'
import type { Role } from '../lib/types.ts'

function Page({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
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

  return (
    <Page title="Users and roles" right={<button type="button" className="navbtn" onClick={() => setEdit({ user: BLANK, isNew: true })}>Add</button>}>
      {users && (
        <Group header={users.length + ' people can sign in'} footer="People are added by email. They link up the first time they sign in with Google.">
          {users.map((u) => (
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
          ))}
        </Group>
      )}
      {edit && <EditUser init={edit} all={users ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </Page>
  )
}

function EditUser({ init, all, onClose, onSaved }: { init: { user: AdminUser; isNew: boolean }; all: AdminUser[]; onClose: () => void; onSaved: () => void }) {
  const [u, setU] = useState(init.user)
  const [error, setError] = useState<string | null>(null)
  const emailOk = /^\S+@\S+\.\S+$/.test(u.email.trim())

  const save = async () => {
    const email = u.email.trim().toLowerCase()
    if (init.isNew && all.some((x) => x.email.toLowerCase() === email)) return setError('That email is already on the list.')
    const others = all.filter((x) => x.email.toLowerCase() !== email && x.active && x.role === 'admin')
    if (!others.length && !(u.active && u.role === 'admin')) return setError('There must be at least one active admin.')
    try {
      await backend.saveUser({ ...u, email })
      onSaved()
    } catch (e) {
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
      <div className="px"><Btn disabled={!emailOk} onClick={() => void save()}>Save</Btn></div>
    </Sheet>
  )
}

/** Shows the corrections and undos this phone knows about. User and guest edits are in the server audit log. */
export function AuditScreen() {
  const roster = useRoster()
  const rows = useMemo(() => {
    if (!roster) return []
    return roster.events.filter((e) => e.action === 'void').sort((a, b) => b.clientAt - a.clientAt)
  }, [roster])
  return (
    <Page title="Audit log">
      <Banner kind="info" icon="info">Showing undos and corrections synced to this phone. User and guest edits appear here once the server audit feed is connected.</Banner>
      <div style={{ height: 16 }} />
      {rows.length === 0 ? (
        <Empty icon="history" title="Nothing logged yet" body="Undos and staff corrections will show up here with who did them and why." />
      ) : (
        <div className="group">
          {rows.map((e) => (
            <div key={e.id} className="rrow vtop">
              <div className="lead lead36" style={{ background: 'var(--warn-bg)', color: 'var(--warn-text)' }}><Icon name={e.method === 'staff' ? 'wrench' : 'undo'} size="m" /></div>
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="nm" style={{ whiteSpace: 'normal' }}>{(e.method === 'staff' ? 'Reset ' : 'Undid ') + e.checkpoint + ' · ' + (roster?.byId.get(e.partyId)?.leadName ?? 'Unknown')}</span>
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
