'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ImpersonateCallback() {
  const router = useRouter()
  const supabase = createClient()
  const [message, setMessage] = useState('Signing you in…')

  useEffect(() => {
    const run = async () => {
      try {
        const hash = typeof window !== 'undefined' ? window.location.hash : ''
        if (!hash || !hash.startsWith('#')) {
          setMessage('Missing session tokens')
          return
        }

        const params = new URLSearchParams(hash.slice(1))
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')

        if (!access_token || !refresh_token) {
          setMessage('Missing session tokens')
          return
        }

        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        })

        if (error) {
          setMessage(error.message)
          return
        }

        try {
          localStorage.setItem('is_impersonating', '1')
        } catch {
          // ignore
        }

        router.replace('/dashboard')
        router.refresh()
      } catch (e) {
        setMessage((e as any)?.message ?? 'Failed to complete sign in')
      }
    }

    run()
  }, [router, supabase.auth])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Switching account</h1>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
      </div>
    </div>
  )
}
