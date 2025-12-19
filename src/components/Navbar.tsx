'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Navbar() {
  const pathname = usePathname();
  const supabase = createClient();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);

      if (!session?.user?.id) {
        setRole(null);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      setRole((profile as any)?.role ?? null);
    };

    checkAuth();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    try {
      sessionStorage.removeItem('merchant_auth');
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const isActive = (path: string) => pathname === path ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white';

  const hideDashboard = role === 'merchant' || pathname.startsWith('/merchant');
  const hideHome = role === 'merchant' || pathname.startsWith('/merchant');
  const brandHref = role === 'merchant' || pathname.startsWith('/merchant') ? '/merchant/portal' : '/';

  return (
    <nav className="bg-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href={brandHref} className="text-white font-bold">
                First Steps
              </Link>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                {!isLoggedIn && !hideHome && (
                  <Link 
                    href="/" 
                    className={`${isActive('/')} px-3 py-2 rounded-md text-sm font-medium`}
                  >
                    Home
                  </Link>
                )}
                {!hideDashboard && (
                  <Link 
                    href="/dashboard" 
                    className={`${isActive('/dashboard')} px-3 py-2 rounded-md text-sm font-medium`}
                  >
                    Dashboard
                  </Link>
                )}
                {isLoggedIn && (role === 'merchant' || role === 'admin') && (
                  <Link
                    href="/payment-methods"
                    className={`${isActive('/payment-methods')} px-3 py-2 rounded-md text-sm font-medium`}
                  >
                    Payment Methods
                  </Link>
                )}
              </div>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="ml-4 flex items-center md:ml-6">
              {/* Sign out button removed */}
              {isLoggedIn && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="ml-4 px-3 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Sign out
                </button>
              )}
              {pathname === '/signup' && (
                <Link 
                  href="/login" 
                  className="ml-4 px-3 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
