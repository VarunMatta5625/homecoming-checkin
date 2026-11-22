import './lib/signinReturn.ts' // first: it reads the address before the Supabase client can clear it
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { sb } from './backend/supabase.ts'
import { startOver } from './lib/actions.ts'
import { LIVE } from './lib/config.ts'
import { applyAppearance, prefs } from './lib/prefs.ts'
import { ui } from './lib/ui.ts'
import './styles/tokens.css'
import './styles/gh.css'
import './styles/app.css'

applyAppearance()
prefs.subscribe(applyAppearance)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAppearance)

if (LIVE) {
  // Build the Supabase client before the router runs. Coming back from Google, it trades the ?code= in the address for a
  // session; if the router has already redirected away, that code is lost and the sign-in silently never completes.
  sb()
  // Demo mode shares this address and leaves a fake session behind (its ids are not UUIDs). It can never sync, so drop it with its fake data.
  const s = prefs.get().session
  if (s && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.actorId)) void startOver(null)
}

// Register the service worker once, at boot, so the app shell is cached before sign-in finishes.
// Updates never auto-reload: the banner shows only when nothing is waiting to sync, and applies on tap.
const updateSW = registerSW({ onNeedRefresh: () => ui.set({ needRefresh: true }) })
ui.set({ updateSW })

// No StrictMode: sheets own browser-history entries and must not mount twice.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
