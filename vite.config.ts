import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

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
          description: 'Gate entry and dinner check-in for GITAM Homecoming 2026.',
          theme_color: '#981F2A',
          background_color: '#F2F2F7',
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
          cleanupOutdatedCaches: true,
        },
      }),
    ].filter(Boolean),
    server: { host: true },
  }
})
