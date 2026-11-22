/** Live mode talks to Supabase. Without both values (or with VITE_DEMO=true) the app runs on built-in demo data. */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
export const LIVE = !!SUPABASE_URL && !!SUPABASE_KEY && import.meta.env.VITE_DEMO !== 'true'
export const DEMO = !LIVE
export const APP_VERSION = '1.0.0 (1)'
export const EVENT_NAME = 'Homecoming 2026'
/** Volunteer undo window. The server (push_batch) allows 120 s, so 60 s here is always accepted. */
export const UNDO_WINDOW_S = 60
export const MIN_BATCH_YEAR = 1984
export const MAX_BATCH_YEAR = 2026
export const MAX_CHILDREN = 6

export interface Counter {
  code: string
  label: string
  kind: 'gate' | 'dinner'
}

export const COUNTERS: Counter[] = [
  { code: 'GATE-1', label: 'Gate desk 1', kind: 'gate' },
  { code: 'GATE-2', label: 'Gate desk 2', kind: 'gate' },
  ...Array.from({ length: 10 }, (_, i): Counter => ({ code: 'DINNER-' + (i + 1), label: 'Counter ' + (i + 1), kind: 'dinner' })),
]

export const counterLabel = (code: string) => COUNTERS.find((c) => c.code === code)?.label ?? code

export const SCHOOLS = [
  'School of Technology',
  'School of Science',
  'School of Business',
  'School of Pharmacy',
  'School of Law',
  'School of Architecture',
  'GITAM Dental College',
]

/** "School of Technology" -> "Technology", "GITAM Dental College" -> "Dental" */
export const schoolShort = (s: string | null) => (s ?? '').replace(/^School of /, '').replace(/^GITAM /, '').replace(/ College$/, '')

export const REASONS_UNDO = ['Tapped by mistake', 'Wrong guest', 'Wrong number of people', 'Something else']
export const REASONS_CORRECT = ['Duplicate while offline', 'Wrong guest', 'Scanned wrong pass', 'Guest left']
