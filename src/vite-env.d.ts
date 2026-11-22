/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Set by vite.config.ts: package version plus the short commit. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_DEMO?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}
