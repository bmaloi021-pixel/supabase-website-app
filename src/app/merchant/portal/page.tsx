'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MerchantPortal() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [name, setName] = useState<string>('')
  const [merchantId, setMerchantId] = useState<string | null>(null)
  const [pendingRequests, setPendingRequests] = useState<
    Array<{
      id: string
      user_id: string
      amount: number
      created_at: string
      status: string
      status_notes?: string | null
    }>
  >([])
  const [paymentMethodsById, setPaymentMethodsById] = useState<Record<string, any>>({})
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const lastRealtimeRefreshAtRef = useRef(0)
  const realtimeRefreshInFlightRef = useRef(false)
  const [stats, setStats] = useState({
    pendingTopUps: 0,
    approvedTopUps: 0,
    totalAmount: 0,
    loading: true
  })

  const logSupabaseError = (label: string, err: unknown) => {
    const raw = err as any
    console.error(label, {
      message: raw?.message,
      code: raw?.code,
      details: raw?.details,
      hint: raw?.hint,
      status: raw?.status,
      statusText: raw?.statusText,
      name: raw?.name,
      stack: raw?.stack,
      ownKeys: raw ? Object.getOwnPropertyNames(raw) : [],
      stringified: (() => {
        try {
          return JSON.stringify(raw)
        } catch {
          return '[unstringifiable]'
        }
      })(),
      raw,
    })
  }

  const fetchTopUpStats = useCallback(async (userId: string) => {
    try {
      setLoadError(null)
      const { count: pendingCount, error: pendingError } = await supabase
        .from('top_up_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')

      if (pendingError) throw pendingError

      const { count: approvedCount, data: approvedData, error: approvedError } = await supabase
        .from('top_up_requests')
        .select('amount', { count: 'exact' })
        .eq('merchant_id', userId)
        .eq('status', 'approved')

      if (approvedError) throw approvedError

      const totalAmount =
        approvedData?.reduce((sum, item: any) => sum + (Number(item?.amount) || 0), 0) || 0

      setStats({
        pendingTopUps: pendingCount || 0,
        approvedTopUps: approvedCount || 0,
        totalAmount,
        loading: false
      })
    } catch (error) {
      logSupabaseError('Error fetching top-up stats:', error)
      setLoadError((error as any)?.message ?? 'Error fetching top-up stats')
      setStats(prev => ({ ...prev, loading: false }))
    }
  }, [supabase])

  const fetchPendingRequests = useCallback(async () => {
    try {
      setLoadError(null)
      const { data, error } = await supabase
        .from('top_up_requests')
        .select('id, user_id, amount, created_at, status, status_notes')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error

      const rows = ((data as any) ?? []) as any[]
      setPendingRequests(rows)

      const ids = Array.from(
        new Set(
          rows
            .map((r) => {
              const notes = (r?.status_notes as string | null) || ''
              const match = notes.match(/payment_method_id:([0-9a-fA-F-]{36})/)
              return match?.[1] ?? null
            })
            .filter(Boolean)
        )
      ) as string[]

      if (ids.length === 0) {
        setPaymentMethodsById({})
        return
      }

      const { data: pmData, error: pmError } = await supabase
        .from('payment_methods')
        .select('id, type, label, provider, phone, account_name, account_number_last4')
        .in('id', ids)

      if (pmError) throw pmError

      const map: Record<string, any> = {}
      for (const pm of (pmData ?? []) as any[]) {
        map[pm.id] = pm
      }
      setPaymentMethodsById(map)
    } catch (error) {
      logSupabaseError('Error fetching pending top-up requests:', error)
      setLoadError((error as any)?.message ?? 'Error fetching pending top-up requests')
      setPendingRequests([])
      setPaymentMethodsById({})
    }
  }, [supabase])

  const updateTopUpStatus = async (requestId: string, status: 'approved' | 'rejected') => {
    setActionError(null)
    setActionLoadingId(requestId)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData?.session?.user?.id
      if (!uid) {
        setActionError('No active session')
        return
      }

      const { error } = await supabase.rpc('process_top_up_request', {
        p_request_id: requestId,
        p_status: status,
      })

      if (error) throw error

      await fetchPendingRequests()
      await fetchTopUpStats(uid)
    } catch (error) {
      logSupabaseError('Error updating top-up status:', error)
      setActionError((error as any)?.message ?? 'Failed to update top-up request')
    } finally {
      setActionLoadingId(null)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const ok = sessionStorage.getItem('merchant_auth') === '1'
        if (!ok) {
          await supabase.auth.signOut()
          router.push('/merchant/login?next=/merchant/portal')
          return
        }
      } catch {
        await supabase.auth.signOut()
        router.push('/merchant/login?next=/merchant/portal')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/merchant/login?next=/merchant/portal')
        return
      }

      setMerchantId(session.user.id)

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, role')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        logSupabaseError('Error fetching merchant profile:', profileError)
        setLoadError(profileError.message)
        return
      }

      if (profile?.role !== 'merchant' && profile?.role !== 'admin') {
        setLoadError('This account is not a merchant.')
        return
      }

      if (profile) {
        setName(`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim())
      }

      // Fetch top-up stats
      if (session.user.id) {
        fetchTopUpStats(session.user.id)
        fetchPendingRequests()
      }
    }

    load()
  }, [fetchPendingRequests, fetchTopUpStats, router, supabase])

  useEffect(() => {
    if (!merchantId) return

    const channel = supabase
      .channel(`merchant-portal-realtime-${merchantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'top_up_requests' },
        () => {
          const now = Date.now()
          if (now - lastRealtimeRefreshAtRef.current < 700) return
          if (realtimeRefreshInFlightRef.current) return
          lastRealtimeRefreshAtRef.current = now
          realtimeRefreshInFlightRef.current = true
          Promise.all([fetchPendingRequests(), fetchTopUpStats(merchantId)]).finally(() => {
            realtimeRefreshInFlightRef.current = false
          })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_methods' },
        () => {
          const now = Date.now()
          if (now - lastRealtimeRefreshAtRef.current < 700) return
          if (realtimeRefreshInFlightRef.current) return
          lastRealtimeRefreshAtRef.current = now
          realtimeRefreshInFlightRef.current = true
          fetchPendingRequests().finally(() => {
            realtimeRefreshInFlightRef.current = false
          })
        }
      )
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {
        // ignore
      }
    }
  }, [fetchPendingRequests, fetchTopUpStats, merchantId, supabase])

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-full px-4 py-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Merchant Dashboard</h1>
            <p className="mt-2 text-sm text-gray-600">{name ? `Signed in as: ${name}` : 'Signed in'}</p>
          </div>

          {/* Stats Cards */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-indigo-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Pending Top-ups</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {stats.loading ? '...' : stats.pendingTopUps}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Approved Top-ups</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {stats.loading ? '...' : stats.approvedTopUps}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Amount</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {stats.loading ? '...' : `₱${stats.totalAmount.toLocaleString()}`}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-3 sm:p-4 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-semibold text-gray-900">Pending Top-up Requests</div>
              <button
                onClick={() => {
                  fetchPendingRequests()
                }}
                className="px-3 py-2 rounded-md text-sm font-medium text-indigo-700 bg-white border border-indigo-600 hover:bg-indigo-50"
              >
                Refresh
              </button>
            </div>

            {loadError ? <div className="mt-3 text-sm text-red-600">{loadError}</div> : null}
            {actionError ? <div className="mt-3 text-sm text-red-600">{actionError}</div> : null}

            {pendingRequests.length > 0 ? (
              <div className="mt-4 space-y-3">
                {pendingRequests.map((r) => (
                  <div key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-gray-50 rounded-md">
                    <div>
                      <div className="text-sm font-medium text-gray-900">₱{Number(r.amount).toLocaleString()}</div>
                      <div className="text-xs text-gray-600">User: {r.user_id}</div>
                      <div className="text-xs text-gray-600">
                        Payment: {(() => {
                          const notes = (r?.status_notes as string | null) || ''
                          const match = notes.match(/payment_method_id:([0-9a-fA-F-]{36})/)
                          const id = match?.[1]
                          if (!id) return 'Not specified'
                          const pm = paymentMethodsById[id]
                          if (!pm) return id
                          if (pm.type === 'gcash') {
                            return `${pm.provider || 'GCash'}${pm.phone ? ` (${pm.phone})` : ''}`
                          }
                          return `${pm.provider || 'Bank'}${pm.account_number_last4 ? ` (****${pm.account_number_last4})` : ''}`
                        })()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(r.created_at).toLocaleString(undefined, {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateTopUpStatus(r.id, 'approved')}
                        disabled={actionLoadingId === r.id}
                        className="px-3 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                      >
                        {actionLoadingId === r.id ? 'Working...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => updateTopUpStatus(r.id, 'rejected')}
                        disabled={actionLoadingId === r.id}
                        className="px-3 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                      >
                        {actionLoadingId === r.id ? 'Working...' : 'Reject'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-600">No pending requests.</div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
