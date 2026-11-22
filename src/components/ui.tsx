import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLayer } from '../lib/layers.ts'
import { mmss, plural } from '../lib/format.ts'
import type { SyncStatus } from '../lib/hooks.ts'
import { SPRITE, type IconName } from './sprite.ts'

/** Overlays render at the app root so a fixed-position screen (the camera) can't trap them under the tab bar. */
const Overlay = ({ children }: { children: ReactNode }) => createPortal(children, document.querySelector('.app') ?? document.body)

export function Sprite() {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: '<defs>' + SPRITE + '</defs>' }} />
}

export function Icon({ name, size, style, className }: { name: IconName; size?: 's' | 'm' | 'l' | 'xl'; style?: CSSProperties; className?: string }) {
  return (
    <svg className={'i' + (size ? ' ' + size : '') + (className ? ' ' + className : '')} style={style} aria-hidden="true">
      <use href={'#i-' + name} />
    </svg>
  )
}

export function Logo({ name, height }: { name: 'homecoming' | 'gitam'; height: number }) {
  const w = name === 'homecoming' ? 960 / 246 : 600 / 259
  const alt = name === 'homecoming' ? 'Homecoming 2026 Visakhapatnam' : 'GITAM Deemed to be University'
  return (
    <>
      <img className="logo logo-light" src={'/logos/' + name + '-teal.png'} height={height} width={Math.round(height * w)} alt={alt} />
      <img className="logo logo-dark" src={'/logos/' + name + '-cream.png'} height={height} width={Math.round(height * w)} alt={alt} />
    </>
  )
}

export function Chip({ kind = 'neutral', icon, children, className }: { kind?: 'ok' | 'warn' | 'bad' | 'neutral' | 'outline' | 'tint'; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={'chip ' + kind + (className ? ' ' + className : '')}>
      {icon && <Icon name={icon} size="s" />}
      {children}
    </span>
  )
}

export function Btn({ kind = 'primary', icon, children, onClick, disabled, sm, auto, type = 'button', style }: { kind?: 'primary' | 'secondary' | 'plain' | 'gray' | 'destructive' | 'destructive-fill'; icon?: IconName; children: ReactNode; onClick?: () => void; disabled?: boolean; sm?: boolean; auto?: boolean; type?: 'button' | 'submit'; style?: CSSProperties }) {
  return (
    <button type={type} className={'btn ' + kind + (sm ? ' sm' : '') + (auto ? ' auto' : '') + (disabled ? ' disabled' : '')} disabled={disabled} onClick={onClick} style={style}>
      {icon && <Icon name={icon} size={sm ? 's' : 'm'} />}
      {children}
    </button>
  )
}

export function Seg<T extends string>({ options, value, onChange, label, cam, style }: { options: { value: T; label: string; icon?: IconName }[]; value: T; onChange: (v: T) => void; label: string; cam?: boolean; style?: CSSProperties }) {
  return (
    <div className={'seg' + (cam ? ' cam' : '')} role="group" aria-label={label} style={style}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size="s" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={'Fewer: ' + label} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Icon name="minus" />
      </button>
      <span className="div" />
      <span className="v" aria-live="polite">
        {value}
      </span>
      <span className="div" />
      <button type="button" aria-label={'More: ' + label} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Icon name="plus" />
      </button>
    </div>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)} />
}

export function SyncPill({ status, cam }: { status: SyncStatus; cam?: boolean }) {
  const { online, syncing, pending, failed } = status
  let cls = 'online'
  let label = 'Online'
  let icon: IconName | null = null
  if (!online) {
    cls = 'offline'
    label = pending ? 'Offline · ' + pending : 'Offline'
    icon = 'wifi-off'
  } else if (failed) {
    cls = 'failed'
    label = 'Sync failed · ' + failed
    icon = 'alert'
  } else if (syncing || pending) {
    cls = 'syncing'
    label = 'Syncing ' + pending + '…'
    icon = 'refresh'
  }
  return (
    <span className={'pill ' + cls + (cam ? ' cam' : '') + (cam && !online ? ' off' : '')} role="status">
      {icon ? <Icon name={icon} size="s" className={cls === 'syncing' ? 'spin' : undefined} /> : <span className="dot" />}
      {label}
    </span>
  )
}

export function Banner({ kind = 'warn', icon = 'wifi-off', title, children, action }: { kind?: 'warn' | 'info'; icon?: IconName; title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={'banner' + (kind === 'info' ? ' info' : '')} role="status">
      <Icon name={icon} size="m" />
      <div className="grow">
        {title && <b>{title}. </b>}
        {children}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
    </div>
  )
}

export function Sheet({ title, onClose, children, action }: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode }) {
  useLayer(onClose)
  return (
    <Overlay>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="sheet-top">
          <span className="t-head">{title}</span>
          {action}
          <button type="button" className="xbtn" aria-label="Close" onClick={onClose}>
            <span>
              <Icon name="x" size="s" />
            </span>
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </Overlay>
  )
}

export interface AlertAction {
  label: string
  onClick: () => void
  kind?: 'bold' | 'danger'
}

export function Alert({ title, body, actions, onClose }: { title: string; body: string; actions: AlertAction[]; onClose: () => void }) {
  useLayer(onClose)
  return (
    <Overlay>
      <div className="scrim alert-scrim" onClick={onClose} />
      <div className="alert" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="ab-body">
          <span className="t-head">{title}</span>
          <span className="t-sub muted">{body}</span>
        </div>
        <div className={actions.length === 2 ? 'ab2' : undefined}>
          {actions.map((a) => (
            <button key={a.label} type="button" className={'ab' + (a.kind ? ' ' + a.kind : '')} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </Overlay>
  )
}

export function ActionSheet({ title, body, actions, onClose }: { title: string; body?: string; actions: AlertAction[]; onClose: () => void }) {
  useLayer(onClose)
  return (
    <Overlay>
      <div className="scrim alert-scrim" onClick={onClose} />
      <div className="asheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grp">
          <div className="hd">
            <span className="t-head">{title}</span>
            {body && <span className="t-sub muted">{body}</span>}
          </div>
          {actions.map((a) => (
            <button key={a.label} type="button" className={'ab' + (a.kind ? ' ' + a.kind : '')} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" className="cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Overlay>
  )
}

export function Toast({ title, sub, undo, onUndo }: { title: string; sub: string; undo?: number | null; onUndo?: () => void }) {
  return (
    <Overlay>
    <div className="toast" role="status">
      <div style={{ width: 32, height: 32, borderRadius: 16, background: '#30D158', color: '#0B3D18', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icon name="check" size="m" />
      </div>
      <div className="stack grow">
        <span className="t-head" style={{ color: '#fff' }}>
          {title}
        </span>
        <span className="t-cap" style={{ color: 'rgba(255,255,255,.78)' }}>
          {sub}
        </span>
      </div>
      {undo != null && undo > 0 && onUndo && (
        <button type="button" className="tbtn" onClick={onUndo}>
          <Icon name="undo" size="s" />
          Undo {mmss(undo)}
        </button>
      )}
    </div>
    </Overlay>
  )
}

/** Sentence uses `served`. Bar: `done` segments are grey, the next `now` segments are maroon (serving now). */
export function PartyCounter({ total, served, done = served, now = 0 }: { total: number; served: number; done?: number; now?: number }) {
  const shown = Math.min(total, done)
  return (
    <div className="stack g3">
      <div className="pc-label">
        <span>
          {served} of {total} served
        </span>
        <b>{Math.max(0, total - served)} remaining</b>
      </div>
      <div className="pc" aria-hidden="true">
        {Array.from({ length: Math.max(total, served) }, (_, k) => (
          <i key={k} className={k < shown ? 'done' : k < shown + now ? 'now' : ''} />
        ))}
      </div>
    </div>
  )
}

export function ResultHead({ kind, icon, label, sub }: { kind: 'ok' | 'warn' | 'bad' | 'neutral'; icon: IconName; label: string; sub?: string }) {
  return (
    <div className={'rhead ' + kind}>
      <div className="ricon">
        <Icon name={icon} size="l" />
      </div>
      <div className="stack">
        <span className="rlabel">{label}</span>
        {sub && <span className="rsub">{sub}</span>}
      </div>
    </div>
  )
}

export function Group({ header, footer, children, style }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={style}>
      {header && <div className="gh-h">{header}</div>}
      <div className="group">{children}</div>
      {footer && <div className="gh-f">{footer}</div>}
    </div>
  )
}

export function Kv({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <span style={{ textAlign: 'right' }}>{v}</span>
    </div>
  )
}

export function Empty({ icon, tone = 'neutral', title, body, children }: { icon: IconName; tone?: 'ok' | 'neutral' | 'warn'; title: string; body: string; children?: ReactNode }) {
  const style: CSSProperties = tone === 'ok' ? { background: 'var(--ok-bg)', color: 'var(--ok-text)' } : tone === 'warn' ? { background: 'var(--warn-bg)', color: 'var(--warn-text)' } : { color: 'var(--text2)' }
  return (
    <div className="empty">
      <div className="circle" style={style}>
        <Icon name={icon} size="xl" />
      </div>
      <h2>{title}</h2>
      <p className="t-body muted">{body}</p>
      {children && <div className="stack g2" style={{ width: '100%', marginTop: 12 }}>{children}</div>}
    </div>
  )
}

export function NavBar({ back, onBack, title, right }: { back: string; onBack: () => void; title: string; right?: ReactNode }) {
  return (
    <div className="navbar">
      <button type="button" className="navbtn" style={{ justifySelf: 'start', paddingLeft: 0 }} onClick={onBack}>
        <Icon name="chev-l" size="m" />
        {back}
      </button>
      <h2>{title}</h2>
      <span style={{ justifySelf: 'end' }}>{right}</span>
    </div>
  )
}

export const guestsLabel = (n: number) => plural(n, 'guest')
