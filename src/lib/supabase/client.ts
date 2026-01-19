import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

declare global {
  // eslint-disable-next-line no-var
  var __supabaseBrowserClient: SupabaseClient<any> | undefined
  // eslint-disable-next-line no-var
  var __supabaseBrowserClientsByStorageKey: Record<string, SupabaseClient<any> | undefined> | undefined
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

  globalThis.__supabaseBrowserClientsByStorageKey ??= {}

  if (!globalThis.__supabaseBrowserClientsByStorageKey[storageKey]) {
    globalThis.__supabaseBrowserClientsByStorageKey[storageKey] = createSupabaseClient(supabaseUrl, supabaseKey, {
      auth: {
        storageKey,
      },
    })
  }

  return globalThis.__supabaseBrowserClientsByStorageKey[storageKey]!
}

export const createClient = () => {
  return createClientWithStorageKey('xhimer-user-auth')
}

export const createAdminClient = () => {
  return createClientWithStorageKey('xhimer-admin-auth')
}

export const createMerchantClient = () => {
  return createClientWithStorageKey('xhimer-merchant-auth')
}

export const createAccountingClient = () => {
  return createClientWithStorageKey('xhimer-accounting-auth')
}
