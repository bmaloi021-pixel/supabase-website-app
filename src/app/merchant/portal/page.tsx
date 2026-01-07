'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import MerchantLayout from '@/components/merchant/MerchantLayout'

export default function MerchantPortal() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [name, setName] = useState<string>('')
  const [merchantId, setMerchantId] = useState<string | null>(null)
  const [activeStatusTab, setActiveStatusTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchBy, setSearchBy] = useState<'username' | 'user_id'>('username')
  const [dateFilter, setDateFilter] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [pendingRequests, setPendingRequests] = useState<
    Array<{
      id: string
      user_id: string
      username?: string | null
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
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      if (!token) {
        throw new Error('No active session')
      }

      const res = await fetch('/api/merchant/pending-topups', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error ?? 'Failed to load pending requests')
      }

      const payload = await res.json().catch(() => null)
      const rows = (payload?.requests ?? []) as Array<{
        id: string
        user_id: string
        username?: string | null
        amount: number
        created_at: string
        status: string
        status_notes?: string | null
      }>

      const paymentMethodIds = Array.from(
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

      const paymentMethodMap: Record<string, any> = {}
      if (paymentMethodIds.length > 0) {
        const { data: pmData, error: pmError } = await supabase
          .from('payment_methods')
          .select('id, type, label, provider, phone, account_name, account_number_last4')
          .in('id', paymentMethodIds)

        if (pmError) throw pmError

        for (const pm of (pmData ?? []) as any[]) {
          paymentMethodMap[pm.id] = pm
        }
      }
      setPaymentMethodsById(paymentMethodMap)
      setPendingRequests(rows)
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
      if (!session?.user?.id) {
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

  const filteredPendingRequests = useMemo(() => {
    let rows = [...pendingRequests]

    const q = searchTerm.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) => {
        const field = searchBy === 'user_id' ? r.user_id : (r.username ?? '')
        return String(field ?? '').toLowerCase().includes(q)
      })
    }

    if (dateFilter) {
      rows = rows.filter((r) => {
        const d = new Date(r.created_at)
        if (!Number.isFinite(d.getTime())) return false
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const key = `${yyyy}-${mm}-${dd}`
        return key === dateFilter
      })
    }

    rows.sort((a, b) => {
      const at = new Date(a.created_at).getTime()
      const bt = new Date(b.created_at).getTime()
      const aKey = Number.isFinite(at) ? at : 0
      const bKey = Number.isFinite(bt) ? bt : 0
      return sortOrder === 'newest' ? bKey - aKey : aKey - bKey
    })

    return rows
  }, [dateFilter, pendingRequests, searchBy, searchTerm, sortOrder])

  return (
    <MerchantLayout>
      <div className="px-4 py-10 sm:px-8 lg:px-14 space-y-8">
        <div className="rounded-3xl border border-[#183149] bg-gradient-to-r from-[#1b2b44] to-[#1a2536] px-8 py-8 text-white shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] flex items-center justify-center">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v22M5 6h14M5 18h14" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-3xl font-semibold">Topup Requests</div>
              <div className="mt-2 text-base text-white/60">Manage and process topup requests efficiently</div>
            </div>
            <Link
              href="/merchant/logs"
              className="px-7 py-4 rounded-2xl text-base font-semibold bg-[#0a1724] border border-[#183149] text-white hover:bg-[#12314a] transition"
            >
              View logs
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-[#183149] bg-gradient-to-r from-[#5b2a1d] to-[#2a1b16] px-9 py-9 text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#f3cc84]">Pending Topups</div>
                <div className="mt-2 text-sm text-white/60">₱0.00</div>
              </div>
              <div className="text-5xl font-semibold">{stats.loading ? '…' : stats.pendingTopUps}</div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#183149] bg-gradient-to-r from-[#0b3a35] to-[#071f26] px-9 py-9 text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#8ee4b8]">My Approved Topups</div>
                <div className="mt-2 text-sm text-white/60">₱0.00</div>
              </div>
              <div className="text-5xl font-semibold">{stats.loading ? '…' : stats.approvedTopUps}</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-[#183149] bg-gradient-to-r from-[#1b2b44] to-[#1a2536] text-white shadow-2xl overflow-hidden">
          <div className="px-8 pt-7 pb-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-7">
                <div className="text-xs uppercase tracking-[0.35em] text-white/60">Search</div>
                <div className="mt-2 relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-white/40">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.3-4.3" />
                      <circle cx="11" cy="11" r="7" />
                    </svg>
                  </div>
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by username..."
                    className="w-full rounded-2xl border border-[#2a3c55] bg-[#22334a] pl-11 pr-5 py-4 text-base text-white placeholder:text-white/40 focus:outline-none"
                  />
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="text-xs uppercase tracking-[0.35em] text-white/60">Search By</div>
                <select
                  value={searchBy}
                  onChange={(e) => setSearchBy(e.target.value as any)}
                  className="mt-2 w-full rounded-2xl border border-[#2a3c55] bg-[#22334a] px-5 py-4 text-base text-white focus:outline-none"
                >
                  <option value="username">Username</option>
                  <option value="user_id">User ID</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <div className="text-xs uppercase tracking-[0.35em] text-white/60">Date Filter</div>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#2a3c55] bg-[#22334a] px-5 py-4 text-base text-white focus:outline-none"
                />
              </div>

              <div className="lg:col-span-1">
                <div className="text-xs uppercase tracking-[0.35em] text-white/60">Sort</div>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="mt-2 w-full rounded-2xl border border-[#2a3c55] bg-[#22334a] px-5 py-4 text-base text-white focus:outline-none"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveStatusTab('pending')}
                  className={`px-5 py-3 rounded-2xl text-sm font-semibold border transition ${
                    activeStatusTab === 'pending'
                      ? 'bg-[#4f46e5] text-white border-[#6d6af2]'
                      : 'bg-[#22334a] text-white/70 border-[#2a3c55] hover:bg-[#2a3c55]'
                  }`}
                >
                  Pending <span className="ml-2 inline-flex items-center justify-center rounded-full bg-white/10 px-2.5 py-1 text-xs">{pendingRequests.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStatusTab('approved')}
                  className={`px-5 py-3 rounded-2xl text-sm font-semibold border transition ${
                    activeStatusTab === 'approved'
                      ? 'bg-[#4f46e5] text-white border-[#6d6af2]'
                      : 'bg-[#22334a] text-white/70 border-[#2a3c55] hover:bg-[#2a3c55]'
                  }`}
                >
                  Approved
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStatusTab('rejected')}
                  className={`px-5 py-3 rounded-2xl text-sm font-semibold border transition ${
                    activeStatusTab === 'rejected'
                      ? 'bg-[#4f46e5] text-white border-[#6d6af2]'
                      : 'bg-[#22334a] text-white/70 border-[#2a3c55] hover:bg-[#2a3c55]'
                  }`}
                >
                  Rejected
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  fetchPendingRequests()
                }}
                className="px-7 py-4 rounded-2xl text-sm font-semibold bg-[#22334a] border border-[#2a3c55] text-white hover:bg-[#2a3c55] transition"
              >
                Refresh
              </button>
            </div>

            {loadError ? <div className="mt-3 text-sm text-red-400">{loadError}</div> : null}
            {actionError ? <div className="mt-3 text-sm text-red-400">{actionError}</div> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-[#183149] bg-gradient-to-r from-[#1b2b44] to-[#1a2536] text-white shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-[#22334a]">
                <tr>
                  <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">User</th>
                  <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Payment Method</th>
                  <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Amount</th>
                  <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Date</th>
                  <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a3c55]">
                {activeStatusTab !== 'pending' ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-14 text-center text-sm text-white/60">
                      No {activeStatusTab} topups found
                    </td>
                  </tr>
                ) : filteredPendingRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center text-base text-white/60">
                      No pending topups found
                    </td>
                  </tr>
                ) : (
                  filteredPendingRequests.map((r) => (
                    <tr key={r.id} className="bg-transparent">
                      <td className="px-8 py-7 text-lg text-white/90">{r.username ?? r.user_id}</td>
                      <td className="px-8 py-7 text-lg text-white/80">
                        {(() => {
                          const notes = (r?.status_notes as string | null) || ''
                          const match = notes.match(/payment_method_id:([0-9a-fA-F-]{36})/)
                          const id = match?.[1]
                          if (!id) return 'Not specified'
                          const pm = paymentMethodsById[id]
                          if (!pm) return id
                          if (pm.type === 'gcash' || pm.type === 'maya') {
                            const label = pm.provider || (pm.type === 'maya' ? 'Maya' : 'GCash')
                            const acct = pm.account_name ? ` - ${pm.account_name}` : ''
                            const phone = pm.phone ? ` (${pm.phone})` : ''
                            return `${label}${acct}${phone}`
                          }
                          const bank = pm.provider || 'Bank'
                          const acct = pm.account_name ? ` - ${pm.account_name}` : ''
                          const last4 = pm.account_number_last4 ? ` (****${pm.account_number_last4})` : ''
                          return `${bank}${acct}${last4}`
                        })()}
                      </td>
                      <td className="px-8 py-7 text-lg font-semibold text-white">₱{Number(r.amount).toLocaleString()}</td>
                      <td className="px-8 py-7 text-lg text-white/70">
                        {new Date(r.created_at).toLocaleString(undefined, {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </td>
                      <td className="px-8 py-7">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateTopUpStatus(r.id, 'approved')}
                            disabled={actionLoadingId === r.id}
                            className="px-6 py-3.5 rounded-2xl text-sm font-semibold bg-[#2a3c55] border border-[#314863] text-white hover:bg-[#314863] transition disabled:opacity-50"
                          >
                            {actionLoadingId === r.id ? 'Working...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateTopUpStatus(r.id, 'rejected')}
                            disabled={actionLoadingId === r.id}
                            className="px-6 py-3.5 rounded-2xl text-sm font-semibold bg-[#22334a] border border-[#314863] text-white/80 hover:bg-[#2a3c55] transition disabled:opacity-50"
                          >
                            {actionLoadingId === r.id ? 'Working...' : 'Reject'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MerchantLayout>
  )
}
