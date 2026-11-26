import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** "1.0.0 (8c0729f)": shows in Account and in each phone's heartbeat, so staff can spot a phone on an old build. */
function appVersion() {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
  let sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  try {
    sha ??= execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    /* not a git checkout */
  }
  return version + (sha ? ' (' + sha + ')' : '')
}

// `npm run dev:phone` serves over HTTPS on your LAN so a real phone can use the camera.
export default defineConfig(({ mode }) => {
  // A production build without the Supabase keys would silently ship the fake demo roster. Fail the build instead.
  if (mode === 'production') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    if (env.VITE_DEMO !== 'true' && (!env.VITE_SUPABASE_URL?.trim() || !env.VITE_SUPABASE_ANON_KEY?.trim())) {
      throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the production build (Vercel: Project Settings, Environment Variables).')
    }
  }
  return {
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
    plugins: [
      react(),
      mode === 'phone' && basicSsl(),
      VitePWA({
        // never auto-reload: the app shows an "Update available" banner and applies it on tap
        registerType: 'prompt',
        includeAssets: ['apple-touch-icon.png', 'logos/*.png'],
        manifest: {
          name: 'Homecoming 2026 Check-in',
          short_name: 'Homecoming',
          description: 'Gate check-in for GITAM Homecoming 2026.',
          theme_color: '#00706A',
          background_color: '#FDF0DA',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,woff2,webmanifest}'],
          navigateFallback: '/index.html',
          // The PDF guide is a real file, not an app page.
          navigateFallbackDenylist: [/\.pdf$/],
          cleanupOutdatedCaches: true,
        },
      }),
    ].filter(Boolean),
    server: { host: true },
  }
})
