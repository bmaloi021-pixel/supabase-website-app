'use client';

import { useState, ReactNode, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/client';

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [profileName, setProfileName] = useState<string>('Admin');
  const [profileRole, setProfileRole] = useState<string>('Administrator');
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createAdminClient(), []);

  const menuItems = [
    { icon: '🏠', label: 'Dashboard', href: '/admin/overview' },
    { icon: '👥', label: 'User Management', href: '/admin/users' },
    { icon: '🏪', label: 'Merchants', href: '/admin/merchants' },
    { icon: '📊', label: 'Accounting', href: '/admin/accounting' },
    { icon: '💳', label: 'Payment Methods', href: '/admin/payment-methods' },
    { icon: '💰', label: 'Cashflow Center', href: '/admin/cashflow' },
    { icon: '💵', label: 'Commissions', href: '/admin/commissions' },
    { icon: '🗓️', label: 'Payout Calendar', href: '/admin/payout-calendar' },
    { icon: '📦', label: 'Investment Plans', href: '/admin/packages' },
  ];

  const handleSignOut = async () => {
    try {
      sessionStorage.removeItem('merchant_auth');
      sessionStorage.removeItem('accounting_auth');
    } catch {
      // ignore
    }

    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = '/';
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (data) {
        setProfileName(`${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || 'Admin');
        setProfileRole((data.role ?? 'Administrator').toUpperCase());
      }
    };

    fetchProfile();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050f15] via-[#071922] to-[#041017]">
      {/* Top navbar */}
      <nav className="bg-[#0f1f2e] border-b border-[#1a2f3f] sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="inline-flex items-center justify-center rounded-md p-2 text-[#9fc3c1] hover:bg-[#173042] focus:outline-none focus:ring-2 focus:ring-[#16a7a1]"
                aria-label="Open menu"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#0d1c26] flex items-center justify-center">
                  <img
                    src="https://sbhcpvqygnvnjhxacpms.supabase.co/storage/v1/object/public/Public/ChatGPT%20Image%20Dec%2025,%202025,%2006_22_34%20PM.png"
                    alt="Xhimer mark"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-white">
                  <p className="text-sm font-semibold leading-tight">Xhimer</p>
                  <p className="text-[11px] uppercase tracking-[0.25em] text-[#7eb3b0]">Admin Dashboard</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-white text-sm font-semibold">{profileName}</span>
                <span className="text-[11px] uppercase tracking-[0.3em] text-[#7eb3b0]">{profileRole}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] text-[#0a1217] hover:opacity-90 transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-[#0a1621] border-r border-[#1a2f3f] z-50 transform transition-transform duration-300 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#0d1c26] flex items-center justify-center">
                <img
                  src="https://sbhcpvqygnvnjhxacpms.supabase.co/storage/v1/object/public/Public/ChatGPT%20Image%20Dec%2025,%202025,%2006_22_34%20PM.png"
                  alt="Xhimer mark"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h2 className="text-white font-semibold text-lg">Xhimer</h2>
                <p className="text-[#7eb3b0] text-xs uppercase tracking-wider">Control Center</p>
              </div>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 rounded-md text-[#9fc3c1] hover:bg-[#173042]"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Menu Items */}
          <nav className="space-y-2 flex-1 overflow-y-auto">
            {menuItems.map((item) => {
              const current = pathname || ''
              const isExact = current === item.href
              const isNested = item.href !== '/admin/overview' && current.startsWith(`${item.href}/`)
              const isActive = isExact || isNested

              return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                  isActive
                    ? 'bg-gradient-to-r from-[#16a7a1]/20 to-[#d4b673]/20 text-white'
                    : 'text-[#9fc3c1] hover:bg-[#173042]'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isActive ? 'bg-[#173042]' : 'bg-[#0f1f2e]'
                }`}>
                  <span className="text-xl">{item.icon}</span>
                </div>
                <span className="font-medium">{item.label}</span>
              </Link>
              )
            })}
          </nav>

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] py-3 text-sm font-semibold text-[#0a1217] hover:opacity-90 transition"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative">
        {children}
      </main>
    </div>
  );
}
