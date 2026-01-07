'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createAccountingClient } from '@/lib/supabase/client'

type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'processing'

type WithdrawalRow = {
  id: string
  user_id: string
  username: string | null
  amount: number
  status: WithdrawalStatus
  status_notes: string | null
  payment_method_info: any
  created_at: string
  processed_at: string | null
}

const toNumber = (value: any) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value ?? 0)
}

export default function AccountingDashboardPage() {
  const supabase = useMemo(() => createAccountingClient(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [rows, setRows] = useState<WithdrawalRow[]>([])

  const [activeStatusTab, setActiveStatusTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchBy, setSearchBy] = useState<'username' | 'user_id'>('username')
  const [dateFilter, setDateFilter] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

  const fetchWithdrawals = useCallback(async () => {
    setError(null)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) {
      setError('You must be signed in to view withdrawals.')
      return
    }

    const res = await fetch('/api/accounting/withdrawals', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error ?? 'Failed to load withdrawals')
    }

    setRows((data?.withdrawals ?? []) as WithdrawalRow[])
  }, [supabase])

  const updateWithdrawalStatus = useCallback(
    async (id: string, action: 'approve' | 'reject') => {
      setActionError(null)
      setActionLoadingId(id)
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        if (!token) throw new Error('You must be signed in to perform this action.')

        const res = await fetch('/api/accounting/withdrawals', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id, action }),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error ?? 'Failed to update withdrawal')
        }

        await fetchWithdrawals()
      } catch (e) {
        setActionError((e as any)?.message ?? 'Failed to update withdrawal')
      } finally {
        setActionLoadingId(null)
      }
    },
    [fetchWithdrawals, supabase]
  )

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        await fetchWithdrawals()
      } catch (e) {
        setError((e as any)?.message ?? 'Failed to load withdrawals')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [fetchWithdrawals])

  const stats = useMemo(() => {
    const pending = rows.filter((r) => r.status === 'pending')
    const approved = rows.filter((r) => r.status === 'approved')
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, r) => sum + toNumber(r.amount), 0),
      approvedCount: approved.length,
      approvedAmount: approved.reduce((sum, r) => sum + toNumber(r.amount), 0),
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    let list = rows.filter((r) => r.status === activeStatusTab)

    const q = searchTerm.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => {
        const field = searchBy === 'user_id' ? r.user_id : (r.username ?? '')
        return String(field ?? '').toLowerCase().includes(q)
      })
    }

    if (dateFilter) {
      list = list.filter((r) => {
        const d = new Date(r.created_at)
        if (!Number.isFinite(d.getTime())) return false
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}` === dateFilter
      })
    }

    list.sort((a, b) => {
      const at = new Date(a.created_at).getTime()
      const bt = new Date(b.created_at).getTime()
      const aKey = Number.isFinite(at) ? at : 0
      const bKey = Number.isFinite(bt) ? bt : 0
      return sortOrder === 'newest' ? bKey - aKey : aKey - bKey
    })

    return list
  }, [activeStatusTab, dateFilter, rows, searchBy, searchTerm, sortOrder])

  const getPaymentInfo = (r: WithdrawalRow) => {
    const info = (r.payment_method_info as any) ?? {}
    const paymentMethod =
      info.method || info.type || info.provider || (typeof info.note === 'string' ? info.note : '') || '—'
    const accountName = info.account_name || info.accountName || '—'
    const accountNumber = info.account_number || info.accountNumber || info.phone || '—'
    return { paymentMethod, accountName, accountNumber }
  }

  const renderStatusPill = (status: WithdrawalStatus) => {
    const cls =
      status === 'pending'
        ? 'bg-[#453310] text-[#f4cc7c] border-[#6b4d18]'
        : status === 'approved'
          ? 'bg-[#173d2c] text-[#8ee4b8] border-[#2a7b4f]'
          : status === 'rejected'
            ? 'bg-[#4d1f1f] text-[#ff8a8a] border-[#7b2a2a]'
            : 'bg-[#1b2e63] text-[#8ab4ff] border-[#294a9a]'

    return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold border ${cls}`}>{status}</span>
  }

  return (
    <div className="px-4 py-10 sm:px-8 lg:px-14 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-[#183149] bg-gradient-to-r from-[#5b2a1d] to-[#2a1b16] px-9 py-9 text-white shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-[#f3cc84]">Pending Withdrawals</div>
              <div className="mt-2 text-sm text-white/60">{loading ? '…' : formatCurrency(stats.pendingAmount)}</div>
            </div>
            <div className="text-5xl font-semibold">{loading ? '…' : stats.pendingCount}</div>
          </div>
        </div>

        <div className="rounded-3xl border border-[#183149] bg-gradient-to-r from-[#0b3a35] to-[#071f26] px-9 py-9 text-white shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-[#8ee4b8]">My Approved Withdrawals</div>
              <div className="mt-2 text-sm text-white/60">{loading ? '…' : formatCurrency(stats.approvedAmount)}</div>
            </div>
            <div className="text-5xl font-semibold">{loading ? '…' : stats.approvedCount}</div>
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
                Pending{' '}
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-white/10 px-2.5 py-1 text-xs">
                  {rows.filter((r) => r.status === 'pending').length}
                </span>
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
              onClick={async () => {
                setActionError(null)
                try {
                  await fetchWithdrawals()
                } catch (e) {
                  setError((e as any)?.message ?? 'Failed to refresh withdrawals')
                }
              }}
              className="px-7 py-4 rounded-2xl text-sm font-semibold bg-[#22334a] border border-[#2a3c55] text-white hover:bg-[#2a3c55] transition"
            >
              Refresh
            </button>
          </div>

          {error ? <div className="mt-4 text-sm text-red-300">{error}</div> : null}
          {actionError ? <div className="mt-2 text-sm text-red-300">{actionError}</div> : null}
        </div>
      </div>

      <div className="rounded-3xl border border-[#183149] bg-gradient-to-r from-[#1b2b44] to-[#1a2536] text-white shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-[#22334a]">
              <tr>
                <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">User</th>
                <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Payment Method</th>
                <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Account Name</th>
                <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Account Number</th>
                <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Net</th>
                <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Date</th>
                <th className="px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.35em] text-white/70">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3c55]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center text-base text-white/60">
                    Loading…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center text-base text-white/60">
                    No {activeStatusTab} withdrawals found
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const info = getPaymentInfo(r)
                  const canAct = r.status === 'pending'

                  return (
                    <tr key={r.id} className="bg-transparent">
                      <td className="px-8 py-7 text-lg text-white/90">{r.username ?? r.user_id}</td>
                      <td className="px-8 py-7 text-lg text-white/80">{info.paymentMethod}</td>
                      <td className="px-8 py-7 text-lg text-white/80">{info.accountName}</td>
                      <td className="px-8 py-7 text-lg text-white/80">{info.accountNumber}</td>
                      <td className="px-8 py-7 text-lg font-semibold text-[#8ee4b8]">{formatCurrency(toNumber(r.amount))}</td>
                      <td className="px-8 py-7 text-lg text-white/70">
                        {new Date(r.created_at).toLocaleString(undefined, {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </td>
                      <td className="px-8 py-7">
                        <div className="flex items-center justify-end gap-3">
                          {renderStatusPill(r.status)}
                          <button
                            type="button"
                            disabled={!canAct || actionLoadingId === r.id}
                            onClick={() => updateWithdrawalStatus(r.id, 'approve')}
                            className="px-6 py-3.5 rounded-2xl text-sm font-semibold bg-[#0f3d2c] border border-[#2a7b4f] text-[#8ee4b8] hover:bg-[#173d2c] transition disabled:opacity-50"
                          >
                            {actionLoadingId === r.id ? 'Working…' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            disabled={!canAct || actionLoadingId === r.id}
                            onClick={() => updateWithdrawalStatus(r.id, 'reject')}
                            className="px-6 py-3.5 rounded-2xl text-sm font-semibold bg-[#4d1f1f] border border-[#7b2a2a] text-[#ff8a8a] hover:bg-[#5a2525] transition disabled:opacity-50"
                          >
                            {actionLoadingId === r.id ? 'Working…' : 'Reject'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
