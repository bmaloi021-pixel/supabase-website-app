'use client';

import { ReactNode, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  const hideNavbar = useMemo(() => {
    if (!pathname) return false;
    return (
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/signup' ||
      pathname.startsWith('/auth') ||
      pathname.startsWith('/merchant/login') ||
      pathname.startsWith('/accounting/login')
    );
  }, [pathname]);

  if (hideNavbar) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
    </>
  );
}
