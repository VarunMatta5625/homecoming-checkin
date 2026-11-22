import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AccountSheet } from './components/AccountSheet.tsx'
import { TabBar } from './components/layout.tsx'
import { Sprite } from './components/ui.tsx'
import { hasRole } from './lib/types.ts'
import { prefs } from './lib/prefs.ts'
import { startSync } from './lib/sync.ts'
import { ui } from './lib/ui.ts'
import { ActivityScreen } from './screens/Activity.tsx'
import { ScanScreen } from './screens/Scan.tsx'
import { SearchScreen } from './screens/Search.tsx'
import { SetupScreen } from './screens/Setup.tsx'
import { PrivacyScreen } from './screens/Privacy.tsx'
import { SignInScreen } from './screens/SignIn.tsx'

// Screens people open less often load on demand. The service worker precaches every chunk, so they still work offline.
const AuditScreen = lazy(() => import('./screens/Admin.tsx').then((m) => ({ default: m.AuditScreen })))
const UsersScreen = lazy(() => import('./screens/Admin.tsx').then((m) => ({ default: m.UsersScreen })))
const GuestDetailScreen = lazy(() => import('./screens/GuestDetail.tsx').then((m) => ({ default: m.GuestDetailScreen })))
const RegisterScreen = lazy(() => import('./screens/Register.tsx').then((m) => ({ default: m.RegisterScreen })))
const ReviewScreen = lazy(() => import('./screens/Review.tsx').then((m) => ({ default: m.ReviewScreen })))
const StatsScreen = lazy(() => import('./screens/Stats.tsx').then((m) => ({ default: m.StatsScreen })))

export default function App() {
  const p = prefs.use()
  const { pathname } = useLocation()
  useEffect(() => startSync(), [])
  return (
    <div className="gh app">
      <Sprite />
      {/* The privacy policy is public: Google and guests open it without signing in. */}
      {pathname === '/privacy' ? <PrivacyScreen /> : !p.session ? <SignInScreen /> : !p.rosterAt || !p.counter ? <SetupScreen /> : <Shell />}
    </div>
  )
}

function Shell() {
  const role = prefs.use().session
  const { account } = ui.use()
  const staff = hasRole(role, 'staff')
  const admin = hasRole(role, 'admin')
  return (
    <>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/scan" element={<ScanScreen />} />
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/activity" element={<ActivityScreen />} />
        <Route path="/guest/:id" element={<GuestDetailScreen />} />
        {staff && <Route path="/stats" element={<StatsScreen />} />}
        {staff && <Route path="/stats/review" element={<ReviewScreen />} />}
        {admin && <Route path="/admin/users" element={<UsersScreen />} />}
        {admin && <Route path="/admin/audit" element={<AuditScreen />} />}
        <Route path="*" element={<Navigate to="/scan" replace />} />
      </Routes>
      </Suspense>
      <TabBar />
      {account && <AccountSheet />}
    </>
  )
}
