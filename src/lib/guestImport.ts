import { MAX_BATCH_YEAR, MAX_CHILDREN, MIN_BATCH_YEAR, SCHOOLS, schoolShort } from './config.ts'

/** One guest, in the shape admin_import_guests takes. */
export interface GuestRow {
  name: string
  batchYear: number
  school: string | null
  department: string | null
  course: string | null
  mobile: string
  email: string | null
  spouse: 'no' | 'yes' | 'maybe'
  children: number
  parking: 'none' | 'two_wheeler' | 'four_wheeler'
  accommodation: 'no' | 'yes' | 'maybe' | null
  dinnerOverride: number | null
}

/** One column of the template. The template, the checker and the on-screen guide all read this list. */
export interface Field {
  /** Column heading in the template. */
  header: string
  required: boolean
  /** What to type, shown to the organisers. */
  allowed: string
  example: string
}

export const FIELDS: Field[] = [
  { header: 'Name', required: true, allowed: 'The alumnus’s full name, at least 2 letters.', example: 'Ravi Kumar' },
  { header: 'Batch year', required: true, allowed: 'A 4-digit year from ' + MIN_BATCH_YEAR + ' to ' + MAX_BATCH_YEAR + '.', example: '2008' },
  { header: 'Mobile', required: true, allowed: '10 digits. "+91" in front is fine. Set the column to Text first so Excel keeps every digit.', example: '9876543210' },
  { header: 'School', required: false, allowed: 'One of: ' + SCHOOLS.join('; ') + '. Leave blank if unknown.', example: 'School of Technology' },
  { header: 'Department', required: false, allowed: 'Free text. Leave blank if unknown.', example: 'Mechanical' },
  { header: 'Course', required: false, allowed: 'Free text, for example B.Tech or MBA. Leave blank if unknown.', example: 'B.Tech' },
  { header: 'Email', required: false, allowed: 'A normal email address, or blank.', example: 'ravi@example.com' },
  { header: 'Spouse', required: false, allowed: 'Yes, No or Maybe. Blank means No.', example: 'Yes' },
  { header: 'Children', required: false, allowed: 'A whole number from 0 to ' + MAX_CHILDREN + '. Blank means 0.', example: '2' },
  { header: 'Parking', required: false, allowed: 'None, 2-wheeler or 4-wheeler. Blank means None.', example: '4-wheeler' },
  { header: 'Accommodation', required: false, allowed: 'Yes, No or Maybe, or blank.', example: 'No' },
  { header: 'Dinner override', required: false, allowed: 'Leave blank unless this guest should get a different number of dinners than the party size (1 + spouse + children). A whole number from 0 to 30.', example: '' },
]

export const MAX_ROWS = 10000
export const MAX_FILE_BYTES = 5_000_000

/** Excel needs this at the start of a UTF-8 CSV to show accented names correctly. */
const BOM = String.fromCharCode(0xfeff)
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The template: headings only. */
export const templateCsv = () => BOM + FIELDS.map((f) => f.header).join(',') + '\r\n'

// ---------- CSV ----------

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, line breaks inside quotes and , ; or tab as the separator. */
export function parseCsv(text: string): string[][] {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const firstLine = t.split(/\r\n|\n|\r/, 1)[0] ?? ''
  const sep = [',', ';', '\t'].map((c) => [c, firstLine.split(c).length] as const).sort((a, b) => b[1] - a[1])[0]![0]
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!
    if (quoted) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
    } else if (ch === '"' && cur === '') quoted = true
    else if (ch === sep) {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  if (cur !== '' || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

/** Reads a chosen file as text: UTF-8, or Windows-1252 when an older Excel saved it that way. */
export async function readFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

const needsGuard = (s: string) => /^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d ]+$/.test(s))
/** One CSV cell. Text that a spreadsheet could run as a formula gets a leading apostrophe. */
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v)
  if (needsGuard(s)) s = "'" + s
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
export const toCsv = (header: string[], rows: unknown[][]) => BOM + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

// ---------- Checking ----------

export interface RowReport {
  /** The row number in the spreadsheet: the heading row is 1. */
  line: number
  name: string
  errors: string[]
  warnings: string[]
  guest: GuestRow | null
}

export interface FileReport {
  rows: RowReport[]
  /** Problems with the file as a whole (missing column, nothing to import). */
  fileErrors: string[]
  /** Columns in the file that the app does not use. */
  ignored: string[]
}

const YES_NO_MAYBE: Record<string, 'no' | 'yes' | 'maybe'> = { yes: 'yes', y: 'yes', no: 'no', n: 'no', maybe: 'maybe', m: 'maybe' }
const PARKING: Record<string, GuestRow['parking']> = {
  '': 'none', none: 'none', no: 'none', nil: 'none',
  twowheeler: 'two_wheeler', '2wheeler': 'two_wheeler', twowheelers: 'two_wheeler', '2wheelers': 'two_wheeler', bike: 'two_wheeler',
  fourwheeler: 'four_wheeler', '4wheeler': 'four_wheeler', fourwheelers: 'four_wheeler', '4wheelers': 'four_wheeler', car: 'four_wheeler',
}

function mobileProblem(raw: string): { digits: string } | { error: string } {
  let s = raw.trim()
  if (/^\d(\.\d+)?e\+?\d+$/i.test(s)) return { error: 'Excel has turned the mobile into ' + s + ' and lost digits. Set the Mobile column to Text, then type the numbers again.' }
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '')
  if (!/^[+\d][\d\s()-]*$/.test(s)) return { error: 'The mobile “' + raw + '” has characters other than digits. Use 10 digits.' }
  const d = s.replace(/\D/g, '')
  const ok = d.length === 10 || (d.length === 11 && d.startsWith('0')) || (d.length === 12 && d.startsWith('91')) || (d.length === 14 && d.startsWith('0091'))
  if (!ok) return { error: 'The mobile “' + raw + '” needs 10 digits (with or without +91).' }
  return { digits: d.slice(-10) }
}

/** Checks the whole file the way the server will, so every problem is shown before anything is sent. */
export function checkGuestFile(text: string): FileReport {
  const table = parseCsv(text)
  const head = table[0] ?? []
  const fileErrors: string[] = []
  const col = new Map<string, number>()
  head.forEach((h, i) => col.set(squash(h), i))
  const missing = FIELDS.filter((f) => f.required && !col.has(squash(f.header))).map((f) => f.header)
  if (missing.length) fileErrors.push('The first row must have the template headings. Missing: ' + missing.join(', ') + '.')
  const known = new Set(FIELDS.map((f) => squash(f.header)))
  const ignored = head.filter((h) => h.trim() && !known.has(squash(h))).map((h) => h.trim())
  const body = table.slice(1).map((cells, i) => ({ cells, line: i + 2 })).filter((r) => r.cells.some((c) => c.trim() !== ''))
  if (!fileErrors.length && !body.length) fileErrors.push('The file has no guests under the headings.')
  if (body.length > MAX_ROWS) fileErrors.push('The file has ' + body.length + ' guests. The limit is ' + MAX_ROWS + ' in one file: split it and import the parts one after the other with Add.')
  if (fileErrors.length) return { rows: [], fileErrors, ignored }

  const get = (cells: string[], header: string) => (cells[col.get(squash(header)) ?? -1] ?? '').replace(/\s+/g, ' ').trim()
  const firstSeen = new Map<string, number>()
  const rows = body.map(({ cells, line }): RowReport => {
    const errors: string[] = []
    const warnings: string[] = []
    const name = get(cells, 'Name')
    if (name.length < 2) errors.push('Name is missing.')
    if (/^example\b/i.test(name) || /delete this row/i.test(name)) errors.push('This looks like an example row. Delete it.')

    const yearText = get(cells, 'Batch year')
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN
    if (!(year >= MIN_BATCH_YEAR && year <= MAX_BATCH_YEAR)) errors.push('Batch year must be a 4-digit year from ' + MIN_BATCH_YEAR + ' to ' + MAX_BATCH_YEAR + (yearText ? ', not “' + yearText + '”.' : '.'))

    const mob = mobileProblem(get(cells, 'Mobile'))
    if ('error' in mob) errors.push(mob.error)

    const schoolText = get(cells, 'School')
    let school: string | null = null
    if (schoolText) {
      school = SCHOOLS.find((s) => squash(s) === squash(schoolText) || squash(schoolShort(s)) === squash(schoolText)) ?? null
      if (!school) errors.push('School “' + schoolText + '” is not one of: ' + SCHOOLS.join('; ') + '.')
    }

    const email = get(cells, 'Email')
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('The email “' + email + '” does not look right.')

    const spouseText = get(cells, 'Spouse')
    const spouse = spouseText ? YES_NO_MAYBE[squash(spouseText)] : 'no'
    if (!spouse) errors.push('Spouse must be Yes, No or Maybe, not “' + spouseText + '”.')

    const kidsText = get(cells, 'Children')
    const kids = kidsText === '' ? 0 : /^\d{1,2}$/.test(kidsText) ? Number(kidsText) : NaN
    if (!(kids >= 0 && kids <= MAX_CHILDREN)) errors.push('Children must be a whole number from 0 to ' + MAX_CHILDREN + ', not “' + kidsText + '”.')

    const parkText = get(cells, 'Parking')
    const parking = PARKING[squash(parkText)]
    if (!parking) errors.push('Parking must be None, 2-wheeler or 4-wheeler, not “' + parkText + '”.')

    const accText = get(cells, 'Accommodation')
    const acc = accText ? YES_NO_MAYBE[squash(accText)] : null
    if (accText && !acc) errors.push('Accommodation must be Yes, No or Maybe, not “' + accText + '”.')

    const ovrText = get(cells, 'Dinner override')
    const ovr = ovrText === '' ? null : /^\d{1,2}$/.test(ovrText) ? Number(ovrText) : NaN
    if (ovr !== null && !(ovr >= 0 && ovr <= 30)) errors.push('Dinner override must be blank or a whole number from 0 to 30, not “' + ovrText + '”.')

    if ('digits' in mob) {
      const before = firstSeen.get(mob.digits)
      if (before) warnings.push('Same mobile as row ' + before + '. Both are kept, and the second is flagged for review.')
      else firstSeen.set(mob.digits, line)
    }

    const guest: GuestRow | null = errors.length
      ? null
      : {
          name,
          batchYear: year,
          school,
          department: get(cells, 'Department') || null,
          course: get(cells, 'Course') || null,
          mobile: (mob as { digits: string }).digits,
          email: email || null,
          spouse: spouse!,
          children: kids,
          parking: parking!,
          accommodation: acc ?? null,
          dinnerOverride: ovr,
        }
    return { line, name, errors, warnings, guest }
  })
  return { rows, fileErrors, ignored }
}

// ---------- Pass list (export) ----------

/** One guest in the pass list. The first twelve columns are the ones scripts/test_passes.py reads. */
export interface PassRow {
  pass_code: string
  qr_token: string
  lead_name: string
  batch_year: number
  school: string | null
  department: string | null
  course: string | null
  mobile_last4: string
  spouse: string
  children: number
  party_size: number
  parking: string
  mobile: string | null
  email: string | null
}

const PASS_COLUMNS: (keyof PassRow)[] = ['pass_code', 'qr_token', 'lead_name', 'batch_year', 'school', 'department', 'course', 'mobile_last4', 'spouse', 'children', 'party_size', 'parking', 'mobile', 'email']
export const passListCsv = (rows: PassRow[]) => toCsv(PASS_COLUMNS, rows.map((r) => PASS_COLUMNS.map((c) => r[c])))

/** Saves text as a file on the user's computer. */
export function download(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
