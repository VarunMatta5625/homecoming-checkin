import { SCHOOLS } from '../lib/config.ts'
import type { Parking, Party, ScanEvent, Ynm } from '../lib/types.ts'

/** Deterministic fake roster and event history for demo mode. No real attendee data. */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHA = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const tokenFrom = (r: () => number) => Array.from({ length: 22 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[Math.floor(r() * 64)]).join('')
const codeFrom = (r: () => number) => 'GH26-' + Array.from({ length: 5 }, () => ALPHA[Math.floor(r() * ALPHA.length)]).join('')

interface Named {
  id: string
  name: string
  batch: number
  school: string
  course: string
  last4: string
  spouse: Ynm
  kids: number
  parking: Parking
}
const NAMED: Named[] = [
  { id: 'g1', name: 'Priya Raghavan', batch: 2009, school: 'School of Technology', course: 'B.Tech, Computer Science', last4: '6310', spouse: 'yes', kids: 2, parking: 'four_wheeler' },
  { id: 'g2', name: 'Sameer Kolluri', batch: 1991, school: 'GITAM Dental College', course: 'BDS', last4: '2207', spouse: 'yes', kids: 1, parking: 'four_wheeler' },
  { id: 'g3', name: 'Arjun Venkatesh', batch: 1998, school: 'School of Business', course: 'MBA', last4: '4471', spouse: 'maybe', kids: 0, parking: 'four_wheeler' },
  { id: 'g4', name: 'Kavya Sreenivas', batch: 2016, school: 'School of Pharmacy', course: 'B.Pharm', last4: '5512', spouse: 'yes', kids: 1, parking: 'two_wheeler' },
  { id: 'g5', name: 'Farhan Siddiqui', batch: 2021, school: 'School of Law', course: 'LL.B', last4: '9054', spouse: 'no', kids: 0, parking: 'two_wheeler' },
  { id: 'g6', name: 'Nandini Prasad', batch: 2009, school: 'School of Science', course: 'M.Sc, Physics', last4: '1186', spouse: 'yes', kids: 1, parking: 'none' },
  { id: 'g7', name: 'Rohit Varma', batch: 1984, school: 'School of Technology', course: 'B.E., Mechanical', last4: '3021', spouse: 'yes', kids: 0, parking: 'four_wheeler' },
  { id: 'g8', name: 'Priyanka Rao', batch: 2012, school: 'School of Technology', course: 'B.Tech, ECE', last4: '8842', spouse: 'no', kids: 0, parking: 'none' },
  { id: 'g9', name: 'Ravi Shankar Kota', batch: 2022, school: 'School of Technology', course: 'MCA', last4: '6604', spouse: 'yes', kids: 1, parking: 'none' },
  { id: 'g10', name: 'Deepa Menon', batch: 2005, school: 'School of Science', course: 'M.Sc, Biotechnology', last4: '7730', spouse: 'maybe', kids: 0, parking: 'none' },
  { id: 'g11', name: 'Meera Iyengar', batch: 1987, school: 'School of Science', course: 'M.Sc, Chemistry', last4: '2954', spouse: 'yes', kids: 0, parking: 'none' },
  { id: 'g12', name: 'Harsha Vardhan', batch: 2003, school: 'School of Technology', course: 'B.Tech, Civil', last4: '5167', spouse: 'yes', kids: 2, parking: 'four_wheeler' },
  { id: 'g13', name: 'Fatima Shaik', batch: 2018, school: 'School of Business', course: 'BBA', last4: '3308', spouse: 'no', kids: 0, parking: 'none' },
  { id: 'g14', name: 'Priya Dharshini M.', batch: 2009, school: 'School of Science', course: 'M.Sc, Mathematics', last4: '0457', spouse: 'no', kids: 0, parking: 'none' },
  { id: 'g15', name: 'Sai Priya Kota', batch: 2019, school: 'School of Business', course: 'MBA', last4: '3390', spouse: 'yes', kids: 1, parking: 'two_wheeler' },
  { id: 'g16', name: 'Priyamvada Joshi', batch: 1995, school: 'School of Law', course: 'LL.M', last4: '7718', spouse: 'yes', kids: 0, parking: 'none' },
]

const FIRST = ['Aditya', 'Ananya', 'Bhavana', 'Charan', 'Divya', 'Eshwar', 'Gayatri', 'Harini', 'Imran', 'Jahnavi', 'Karthik', 'Lavanya', 'Madhav', 'Neha', 'Om', 'Pranav', 'Qasim', 'Rekha', 'Srinivas', 'Tejaswi', 'Uma', 'Vamsi', 'Yamini', 'Zoya', 'Abhinav', 'Bhargavi', 'Chaitanya', 'Dheeraj', 'Gopi', 'Hema', 'Isha', 'Jagadeesh', 'Keerthi', 'Lokesh', 'Manasa', 'Naveen', 'Padma', 'Rajesh', 'Swathi', 'Teja']
const LAST = ['Reddy', 'Naidu', 'Rao', 'Sharma', 'Varma', 'Kumar', 'Murthy', 'Prasad', 'Chowdary', 'Raju', 'Menon', 'Iyer', 'Khan', 'Patel', 'Singh', 'Das', 'Nair', 'Gupta', 'Babu', 'Sastry']
const COURSES: Record<string, string[]> = {
  'School of Technology': ['B.Tech, Computer Science', 'B.Tech, ECE', 'B.Tech, Mechanical', 'B.Tech, Civil', 'MCA', 'B.Tech, EEE'],
  'School of Science': ['M.Sc, Physics', 'M.Sc, Chemistry', 'M.Sc, Mathematics', 'M.Sc, Biotechnology'],
  'School of Business': ['MBA', 'BBA', 'BBA, Finance'],
  'School of Pharmacy': ['B.Pharm', 'M.Pharm'],
  'School of Law': ['LL.B', 'B.A. LL.B'],
  'School of Architecture': ['B.Arch'],
  'GITAM Dental College': ['BDS'],
}

const mins = (m: number) => Date.now() - m * 60000

function makeParty(id: string, name: string, batch: number, school: string, course: string, last4: string, spouse: Ynm, kids: number, parking: Parking, r: () => number): Party {
  return {
    id,
    passCode: codeFrom(r),
    qrToken: tokenFrom(r),
    source: 'booked',
    leadName: name,
    nameLc: name.toLowerCase(),
    batchYear: batch,
    school,
    department: course.includes(',') ? course.split(', ')[1]! : course,
    course,
    mobileLast4: last4,
    spouse,
    children: kids,
    partySize: 1 + (spouse === 'no' ? 0 : 1) + kids,
    parking,
    possibleDuplicateOf: null,
    deletedAt: null,
  }
}

export function demoSnapshot(): { parties: Party[]; events: ScanEvent[] } {
  const r = rng(26)
  const parties: Party[] = NAMED.map((n) => makePartyFrom(n, r))
  function makePartyFrom(n: Named, rr: () => number) {
    return makeParty(n.id, n.name, n.batch, n.school, n.course, n.last4, n.spouse, n.kids, n.parking, rr)
  }
  const used = new Set(parties.map((p) => p.nameLc))
  while (parties.length < 480) {
    const name = FIRST[Math.floor(r() * FIRST.length)] + ' ' + LAST[Math.floor(r() * LAST.length)]
    if (used.has(name.toLowerCase())) continue
    used.add(name.toLowerCase())
    const school = SCHOOLS[Math.floor(r() * 5.4)]!
    const cs = COURSES[school]!
    const sp = r()
    const spouse: Ynm = sp < 0.5 ? 'yes' : sp < 0.6 ? 'maybe' : 'no'
    const k = r()
    const kids = k < 0.45 ? 0 : k < 0.75 ? 1 : k < 0.95 ? 2 : 3
    const pk = r()
    parties.push(
      makeParty('p' + parties.length, name, 1984 + Math.floor(r() * 39), school, cs[Math.floor(r() * cs.length)]!, String(Math.floor(r() * 10000)).padStart(4, '0'), spouse, kids, pk < 0.45 ? 'four_wheeler' : pk < 0.8 ? 'two_wheeler' : 'none', r),
    )
  }

  const events: ScanEvent[] = []
  let n = 0
  const ev = (partyId: string, qty: number, ago: number, counter: string, actor: string) => {
    const at = mins(ago)
    events.push({ id: 'seed-' + ++n, seq: n, partyId, checkpoint: 'entry', action: 'pass', qty, method: 'qr', actorId: 'u-' + actor.split(' ')[0]!.toLowerCase(), actorName: actor, counter, deviceId: 'seed-device', clientAt: at, receivedAt: at })
  }
  // named guests cover every result state
  ev('g1', 4, 52, 'GATE-2', 'Sneha P.')
  ev('g3', 2, 36, 'GATE-2', 'Sneha P.')
  ev('g4', 3, 59, 'GATE-1', 'Kiran B.')
  ev('g6', 3, 44, 'GATE-1', 'Kiran B.')
  ev('g7', 2, 74, 'GATE-1', 'Kiran B.')
  ev('g9', 3, 33, 'GATE-2', 'Sneha P.')
  ev('g11', 2, 32, 'GATE-1', 'Kiran B.')
  ev('g12', 4, 46, 'GATE-2', 'Sneha P.')
  ev('g13', 1, 30, 'GATE-1', 'Kiran B.')
  ev('g14', 1, 27, 'GATE-1', 'Kiran B.')
  ev('g15', 3, 40, 'GATE-2', 'Sneha P.')

  const gates = ['GATE-1', 'GATE-2']
  for (const p of parties.slice(16)) {
    if (r() > 0.6) continue
    const entry = 25 + Math.floor(r() * 110)
    ev(p.id, p.partySize, entry, gates[Math.floor(r() * 2)]!, r() < 0.5 ? 'Sneha P.' : 'Kiran B.')
  }
  return { parties, events }
}
