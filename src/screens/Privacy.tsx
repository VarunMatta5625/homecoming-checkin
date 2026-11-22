import { Link } from 'react-router-dom'
import { EVENT_NAME } from '../lib/config.ts'

const UPDATED = '22 November 2026'

/** Public page, reachable signed out at /privacy. Google asks for this link before it lets the sign-in screen be published. */
export function PrivacyScreen() {
  return (
    <main className="screen notabs stack" style={{ padding: '32px 20px 24px', gap: 8, maxWidth: 640, margin: '0 auto' }}>
      <Link to="/" className="t-body" style={{ color: 'var(--tint)', textDecoration: 'none' }}>
        ‹ Back to the app
      </Link>
      <h1 className="t-title" style={{ margin: '8px 0 0', fontSize: 26, lineHeight: '32px', fontWeight: 700 }}>
        Privacy policy
      </h1>
      <p className="t-cap muted" style={{ margin: 0 }}>
        {EVENT_NAME} Check-in · last updated {UPDATED}
      </p>

      <h2 className="t-head" style={{ margin: '14px 0 0' }}>What this app is</h2>
      <p className="t-body" style={{ margin: 0 }}>
        This app is used by the volunteers and staff of the GITAM {EVENT_NAME} event to check alumni guests in at the gate and to serve dinner. It is only for
        people the organisers have approved. Guests do not use it.
      </p>

      <h2 className="t-head" style={{ margin: '14px 0 0' }}>What we collect, and why</h2>
      <p className="t-body" style={{ margin: 0 }}>
        <b>Volunteers and staff.</b> When you sign in with Google we receive your email address and name. We use them to check that you are on the approved
        list, to show your name in the app, and to record who made each scan or change. We ask Google for your basic profile and email only. We cannot see your
        Gmail, Drive, contacts or anything else in your Google account.
      </p>
      <p className="t-body" style={{ margin: 0 }}>
        <b>Guests.</b> The guest list holds each guest’s name, batch year, school and course, party size, parking choice, and the last four digits of their
        mobile number. Staff and admins can also open a guest’s full mobile number and email address, and every time they do, it is recorded. A guest who
        registers at the desk gives these details to the volunteer.
      </p>
      <p className="t-body" style={{ margin: 0 }}>
        <b>Activity.</b> Each check-in, dinner serving, undo and correction is stored with the time, the counter, who did it, and a random identifier for the
        phone. Phones also report their app version, their counter and how many changes are waiting to sync.
      </p>

      <h2 className="t-head" style={{ margin: '14px 0 0' }}>Where it is stored</h2>
      <p className="t-body" style={{ margin: 0 }}>
        A copy of the guest list (without full mobile numbers or emails) is kept on the volunteer’s phone so that scanning works without signal. It is removed
        when the volunteer signs out. The main records are held in a database run by Supabase, and the app itself is served by Vercel.
      </p>

      <h2 className="t-head" style={{ margin: '14px 0 0' }}>Who can see it</h2>
      <p className="t-body" style={{ margin: 0 }}>
        Volunteers see the guest list and what they scan. Staff also see guests’ contact details and the event totals. Admins also manage who is on the approved
        list and can read the activity log. We do not sell this information, share it for advertising, or use it for anything except running the event.
      </p>

      <h2 className="t-head" style={{ margin: '14px 0 0' }}>Cookies and tracking</h2>
      <p className="t-body" style={{ margin: 0 }}>
        The app stores your sign-in and its offline copy in your browser. It does not use advertising or analytics trackers.
      </p>

      <h2 className="t-head" style={{ margin: '14px 0 0' }}>How long we keep it</h2>
      <p className="t-body" style={{ margin: 0 }}>
        The organisers keep this information for running the event and for reviewing it afterwards, and decide when it is deleted.
      </p>

      <h2 className="t-head" style={{ margin: '14px 0 0' }}>Your choices</h2>
      <p className="t-body" style={{ margin: 0 }}>
        To ask what is held about you, or to have it corrected or removed, speak to the Homecoming volunteer desk or the event organisers at GITAM.
      </p>

      <h2 className="t-head" style={{ margin: '14px 0 0' }}>Changes</h2>
      <p className="t-body" style={{ margin: 0 }}>If this policy changes, the date at the top changes with it.</p>
    </main>
  )
}
