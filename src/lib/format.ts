const tf = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
export const fmtTime = (ms: number) => tf.format(ms).replace(/\s?(am|pm)/i, (_, p: string) => ' ' + p.toUpperCase())

export function ago(ms: number, now = Date.now()) {
  const m = Math.floor((now - ms) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return m + ' min ago'
  const h = Math.floor(m / 60)
  return h + (h === 1 ? ' hour ago' : ' hours ago')
}

export const mmss = (sec: number) => Math.floor(sec / 60) + ':' + String(Math.max(0, sec) % 60).padStart(2, '0')

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

export const roleLabel = (role: string) => role[0]!.toUpperCase() + role.slice(1)

/** The last 10 digits typed, so "+91 98765 43210" and "9876543210" are the same number. Anything shorter stays as typed. */
export function mobileDigits(s: string) {
  const d = s.replace(/\D/g, '')
  return d.length > 10 ? d.slice(-10) : d
}

export const firstName = (name: string) => name.split(/\s+/)[0] ?? name
export const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)

export const parkingLabel = (p: string) => (p === 'two_wheeler' ? '2-wheeler' : p === 'four_wheeler' ? '4-wheeler' : 'No parking')

export function partyDesc(spouse: string, children: number) {
  const bits: string[] = []
  if (spouse !== 'no') bits.push('spouse')
  if (children) bits.push(children + (children === 1 ? ' child' : ' children'))
  return bits.length ? bits.join(' + ') : 'alumnus only'
}

export function vibrate(kind: 'ok' | 'warn' | 'bad') {
  const pattern = kind === 'ok' ? [60] : kind === 'warn' ? [60, 70, 60, 70, 60] : [320, 120, 320]
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported (iPhone) */
  }
}
