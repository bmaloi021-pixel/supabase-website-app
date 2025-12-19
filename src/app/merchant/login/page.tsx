'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function MerchantLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const normalizeUsername = (value: string) => value.trim().toLowerCase()
  const trimUsername = (value: string) => value.trim()

  const rawNextPath = searchParams.get('next') || '/merchant/portal'
  const nextPath = rawNextPath === '/merchant' ? '/merchant/portal' : rawNextPath

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
        <div className="text-center">
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
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
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
