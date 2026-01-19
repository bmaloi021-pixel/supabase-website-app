'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createMerchantClient } from '@/lib/supabase/client'

function MerchantLoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createMerchantClient(), [])

  const normalizeUsername = (value: string) => value.trim().toLowerCase()
  const trimUsername = (value: string) => value.trim()

  const rawNextPath = searchParams.get('next') || '/merchant/portal'
  const coercedNextPath = rawNextPath === '/merchant' ? '/merchant/portal' : rawNextPath
  const nextPath = coercedNextPath.startsWith('/merchant') && !coercedNextPath.startsWith('//') ? coercedNextPath : '/merchant/portal'

  useEffect(() => {
    const forceReauth = async () => {
      try {
        sessionStorage.removeItem('merchant_auth')
      } catch {}

      await supabase.auth.signOut()
    }

    forceReauth()
  }, [supabase])

  const signInWithUsername = async (value: string) => {
    const candidates = Array.from(
      new Set([
        `${normalizeUsername(value)}@users.firststeps.app`,
        `${trimUsername(value)}@users.firststeps.app`,
      ])
    ).filter((v) => v && !v.startsWith('@'))

    let lastError: any = null
    for (const email of candidates) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (!signInError) return
      lastError = signInError
    }

    throw lastError
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await signInWithUsername(username)

      try {
        sessionStorage.setItem('merchant_auth', '1')
      } catch {}

      router.push(nextPath)
      router.refresh()
    } catch (err) {
      const e = err as any
      const message =
        e?.message ||
        e?.error_description ||
        (typeof e === 'string' ? e : null) ||
        'An error occurred'
      const code = e?.code ? ` (${e.code})` : ''
      const status = e?.status ? ` [${e.status}]` : ''
      setError(`${message}${code}${status}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <Image
              src="/xhimer-logo.png"
              alt="Xhimer logo"
              width={72}
              height={72}
              priority
              className="h-18 w-18"
            />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">Merchant sign in</h2>
          <p className="mt-2 text-sm text-gray-600">Only merchant and admin accounts can access this portal.</p>
        </div>

        {error && <div className="p-4 text-red-700 bg-red-100 rounded-md">{error}</div>}

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="w-full px-3 py-2 pr-12 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19.5c-4.523 0-8.265-2.903-9.781-7a9.956 9.956 0 011.524-3.042M9.88 9.88a3 3 0 014.242 4.243M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div>
            <Link
              href="/login"
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-800 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to main login
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function MerchantLogin() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    }>
      <MerchantLoginForm />
    </Suspense>
  )
}
