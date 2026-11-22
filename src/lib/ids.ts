export const QR_PREFIX = 'GH26:'
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/** RFC 4122 v4. crypto.randomUUID only exists on secure origins, so build one from random bytes when it is missing. */
export const newId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = bytes(16)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20)
}

/** 128-bit random token, base64url, no PII. */
export function newQrToken() {
  return btoa(String.fromCharCode(...bytes(16))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** GH26-XXXXX, five characters that are easy to read aloud. */
export function newPassCode() {
  return 'GH26-' + [...bytes(5)].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

export const qrPayload = (token: string) => QR_PREFIX + token

/** Pulls the token out of a scanned string, or null when it is not a Homecoming pass. */
export function parseQr(text: string): string | null {
  const t = text.trim()
  return t.startsWith(QR_PREFIX) && t.length > QR_PREFIX.length ? t.slice(QR_PREFIX.length) : null
}

/** "gh26 7k4q" -> "GH26-7K4Q". Null when too short to be a code. */
export function normalizeCode(input: string): string | null {
  let s = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.startsWith('GH26')) s = s.slice(4)
  return s.length >= 4 ? 'GH26-' + s : null
}
