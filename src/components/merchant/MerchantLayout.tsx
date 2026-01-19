'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createMerchantClient } from '@/lib/supabase/client'

type MerchantLayoutProps = {
  children: ReactNode
}

export default function MerchantLayout({ children }: MerchantLayoutProps) {
  const [profileName, setProfileName] = useState<string>('Merchant')
  const [profileRole, setProfileRole] = useState<string>('MERCHANT')
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createMerchantClient(), [])

  const tabs = [
    { label: 'Cashflow Center', href: '/merchant/portal' },
    { label: 'Payment Methods', href: '/merchant/payment-methods' },
  ]

  const handleSignOut = async () => {
    try {
      sessionStorage.removeItem('merchant_auth')
    } catch {}
    await supabase.auth.signOut()
    router.push('/merchant/login?next=/merchant/portal')
  }

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return

      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, role')
        .eq('id', session.user.id)
        .single()

      if (data) {
        setProfileName(`${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || 'Merchant')
        setProfileRole((data.role ?? 'merchant').toUpperCase())
      }
    }

    fetchProfile()
  }, [supabase])

  const isActiveTab = (href: string) => {
    if (!pathname) return false
    if (href === '/merchant/portal') return pathname === '/merchant/portal' || pathname === '/merchant/logs'
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#071725] via-[#061521] to-[#040f18]">
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
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-300/80">Merchant Portal</p>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-3 ml-6">
                {tabs.map((tab) => (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                      isActiveTab(tab.href)
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-200 hover:bg-[#12314a]'
                    }`}
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-white text-sm font-semibold">{profileName}</span>
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-300/80">{profileRole}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        <div className="md:hidden border-t border-[#183149]">
          <div className="px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2 overflow-x-auto">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  isActiveTab(tab.href)
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-200 hover:bg-[#12314a]'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <main className="relative">
        {children}
      </main>
    </div>
  )
}
