'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MerchantHome() {
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) {
        router.push('/merchant/login?next=/merchant')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', session.user.id)
        .single()

      if (profile) {
        setName(`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim())
      }
    }

    load()
  }, [router, supabase])

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900">Merchant Portal</h1>
          <p className="mt-2 text-sm text-gray-600">
            {name ? `Welcome, ${name}.` : 'Welcome.'}
          </p>
          <p className="mt-4 text-sm text-gray-600">
            This is the merchant-only area. You can build merchant tools here (orders, products, payouts, etc.).
          </p>
        </div>
      </div>
    </div>
  )
}
