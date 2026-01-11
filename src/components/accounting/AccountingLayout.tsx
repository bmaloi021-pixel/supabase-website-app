'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createAccountingClient } from '@/lib/supabase/client'

type AccountingLayoutProps = {
  children: ReactNode
}

export default function AccountingLayout({ children }: AccountingLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createAccountingClient(), [])

  const isLoginRoute = pathname?.startsWith('/accounting/login')

  const [loading, setLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(true)
  const [profileName, setProfileName] = useState<string>('')
  const [profileRole, setProfileRole] = useState<string>('')
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      sessionStorage.removeItem('accounting_auth')
    } catch {
      // ignore
    }
    await supabase.auth.signOut()
    router.push('/accounting/login?next=/accounting/dashboard')
  }

  useEffect(() => {
    const load = async () => {
      try {
        setIsAuthorized(true)

        if (isLoginRoute) {
          return
        }

        try {
          const ok = sessionStorage.getItem('accounting_auth') === '1'
          if (!ok) {
            await supabase.auth.signOut()
            router.push(`/accounting/login?next=${encodeURIComponent(pathname || '/accounting/dashboard')}`)
            return
          }
        } catch {
          await supabase.auth.signOut()
          router.push(`/accounting/login?next=${encodeURIComponent(pathname || '/accounting/dashboard')}`)
          return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) {
          router.push(`/accounting/login?next=${encodeURIComponent(pathname || '/accounting/dashboard')}`)
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('first_name,last_name,role')
          .eq('id', session.user.id)
          .single()

        if (profileError) {
          router.push(`/accounting/login?next=${encodeURIComponent(pathname || '/accounting/dashboard')}`)
          return
        }

        const role = String((profile as any)?.role ?? '')
        if (role !== 'accounting') {
          setIsAuthorized(false)
          return
        }

        setProfileRole(role.toUpperCase())
        setProfileName(`${(profile as any)?.first_name ?? ''} ${(profile as any)?.last_name ?? ''}`.trim())
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router, supabase, pathname, isLoginRoute])

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#071725] via-[#061521] to-[#040f18]">
      {!isLoginRoute ? (
        <nav className="bg-[#0b1a2a] border-b border-[#183149] sticky top-0 z-40">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#0e2538] flex items-center justify-center">
                    <img
                      src="https://sbhcpvqygnvnjhxacpms.supabase.co/storage/v1/object/public/Public/ChatGPT%20Image%20Dec%2025,%202025,%2006_22_34%20PM.png"
                      alt="Xhimer mark"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-white">
                    <p className="text-sm font-semibold leading-tight">Xhimer</p>
                    <p className="text-[11px] uppercase tracking-[0.25em] text-slate-300/80">Accounting Portal</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsAccountMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white/90 hover:bg-[#12314a] transition"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>{profileName || profileRole || 'Account'}</span>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {isAccountMenuOpen ? (
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-[#183149] bg-[#0b1a2a] shadow-2xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-[#183149]">
                        <div className="text-sm font-semibold text-white">{profileName || 'Accounting User'}</div>
                        <div className="text-[11px] uppercase tracking-[0.25em] text-slate-300/80">{profileRole || 'ACCOUNTING'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsAccountMenuOpen(false)
                          await handleSignOut()
                        }}
                        className="w-full text-left px-4 py-3 text-sm font-semibold text-white/90 hover:bg-[#12314a] transition"
                      >
                        Sign out
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </nav>
      ) : null}

      <main className="relative">
        {loading ? (
          <div className="px-4 py-10 sm:px-6 lg:px-8 text-white/70">Loading…</div>
        ) : !isAuthorized ? (
          <div className="px-4 py-10 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto rounded-3xl border border-[#183149] bg-[#0b1a2a] p-8 text-white shadow-2xl">
              <div className="text-xs uppercase tracking-[0.35em] text-white/60">Access denied</div>
              <div className="mt-2 text-2xl font-semibold">You don’t have access to Accounting</div>
              <div className="mt-2 text-sm text-white/60">
                This section is restricted to accounts with the <span className="font-semibold text-white">admin</span> or{' '}
                <span className="font-semibold text-white">accounting</span> role.
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="px-5 py-3 rounded-2xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition"
                >
                  Go to dashboard
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-5 py-3 rounded-2xl text-sm font-semibold border border-[#183149] bg-[#0a1724] text-white hover:bg-[#12314a] transition"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
