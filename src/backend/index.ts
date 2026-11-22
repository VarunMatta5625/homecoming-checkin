import { LIVE } from '../lib/config.ts'
import { demoBackend } from './demoBackend.ts'
import { supabaseBackend } from './supabase.ts'
import type { Backend } from './types.ts'

export const backend: Backend = LIVE ? supabaseBackend : demoBackend
