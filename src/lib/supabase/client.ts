import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

declare global {
  // eslint-disable-next-line no-var
  var __supabaseBrowserClient: SupabaseClient<any> | undefined
  // eslint-disable-next-line no-var
  var __supabaseBrowserClientsByStorageKey: Record<string, SupabaseClient<any> | undefined> | undefined
  // eslint-disable-next-line no-var
  var __supabaseBrowserClientsByStorageKeyConfigVersion: Record<string, number | undefined> | undefined
}

const SCOPED_CLIENT_CONFIG_VERSION = 1
const SHARED_STORAGE_KEY = 'xhimer-auth'

const cleanupLegacySupabaseKeys = () => {
  if (typeof window === 'undefined') return
  try {
    const keys = Object.keys(window.localStorage)
    for (const k of keys) {
      if (k.startsWith('sb-')) {
        window.localStorage.removeItem(k)
      }
    }
  } catch {
    // ignore
  }
}

const getEnv = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }

  if (!supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')
  }

  return { supabaseUrl, supabaseKey }
}

const createClientWithStorageKey = (storageKey?: string): SupabaseClient<any> => {
  const { supabaseUrl, supabaseKey } = getEnv()

  if (typeof window === 'undefined') {
    return createSupabaseClient(supabaseUrl, supabaseKey)
  }

  if (!storageKey) {
    if (!globalThis.__supabaseBrowserClient) {
      globalThis.__supabaseBrowserClient = createSupabaseClient(supabaseUrl, supabaseKey)
    }

    return globalThis.__supabaseBrowserClient
  }

  cleanupLegacySupabaseKeys()

  globalThis.__supabaseBrowserClientsByStorageKey ??= {}
  globalThis.__supabaseBrowserClientsByStorageKeyConfigVersion ??= {}

  const cached = globalThis.__supabaseBrowserClientsByStorageKey[storageKey]
  const cachedVersion = globalThis.__supabaseBrowserClientsByStorageKeyConfigVersion[storageKey]

  if (!cached || cachedVersion !== SCOPED_CLIENT_CONFIG_VERSION) {
    globalThis.__supabaseBrowserClientsByStorageKey[storageKey] = createSupabaseClient(supabaseUrl, supabaseKey, {
      auth: {
        storageKey,
        storage: window.localStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    globalThis.__supabaseBrowserClientsByStorageKeyConfigVersion[storageKey] = SCOPED_CLIENT_CONFIG_VERSION
  }

  return globalThis.__supabaseBrowserClientsByStorageKey[storageKey]!
}

export const createClient = () => {
  return createClientWithStorageKey(SHARED_STORAGE_KEY)
}

export const createAdminClient = () => {
  return createClientWithStorageKey(SHARED_STORAGE_KEY)
}

export const createMerchantClient = () => {
  return createClientWithStorageKey(SHARED_STORAGE_KEY)
}

export const createAccountingClient = () => {
  return createClientWithStorageKey(SHARED_STORAGE_KEY)
}
