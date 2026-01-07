import AccountingLayout from '@/components/accounting/AccountingLayout'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Accounting Portal',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AccountingLayout>{children}</AccountingLayout>
}
