import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/AppShell'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Xhimer',
  description: 'A modern web application with Next.js and Supabase',
  icons: {
    icon: [{ url: '/xhimer-logo.png', type: 'image/png' }],
    shortcut: [{ url: '/xhimer-logo.png', type: 'image/png' }],
    apple: [{ url: '/xhimer-logo.png', type: 'image/png' }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-gray-100`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
