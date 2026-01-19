'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createMerchantClient } from '@/lib/supabase/client'
import MerchantLayout from '@/components/merchant/MerchantLayout'

type AuditLogEntry = {
  id: string
  amount: number
  status: 'approved' | 'rejected'
  user_id: string
  user_username?: string | null
  user_name?: string | null
  merchant_id?: string | null
  merchant_name?: string | null
  processed_at?: string | null
  created_at: string
  status_notes?: string | null
}

export default function MerchantAuditLogsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createMerchantClient(), [])
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'approved' | 'rejected'>('all')
  const [paymentMethodsById, setPaymentMethodsById] = useState<Record<
    string,
    {
      id: string
      type: string
      provider?: string | null
      label?: string | null
      phone?: string | null
      account_name?: string | null
      account_number_last4?: string | null
    }
  >>({})

  const maskUuids = useCallback((value?: string | null) => {
    if (!value) return value ?? '—'
    return value.replace(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
      '••••••••-••••-••••-••••-••••••••••••'
    )
  }, [])

  const extractPaymentMethodId = useCallback((notes?: string | null) => {
    if (!notes) return null
    const match = notes.match(/payment_method_id:([0-9a-fA-F-]{36})/i)
    return match?.[1] ?? null
  }, [])

  const describePaymentMethod = useCallback(
    (notes?: string | null) => {
      const id = extractPaymentMethodId(notes)
      if (!id) {
        if (!notes) return 'Not provided'
        return maskUuids(notes)
      }
      const pm = paymentMethodsById[id]
      if (!pm) {
        return 'Payment details available after refresh'
      }
      if (pm.type === 'gcash') {
        return `${pm.provider || 'GCash'}${pm.phone ? ` (${pm.phone})` : ''}`
      }
      return `${pm.provider || 'Bank'}${pm.account_number_last4 ? ` (****${pm.account_number_last4})` : ''}`
    },
    [extractPaymentMethodId, maskUuids, paymentMethodsById]
  )

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs
    return logs.filter((log) => log.status === filter)
  }, [logs, filter])

  const loadPaymentMethods = useCallback(
    async (logList: AuditLogEntry[]) => {
      const ids = Array.from(
        new Set(
          logList
            .map((log) => extractPaymentMethodId(log.status_notes))
            .filter((id): id is string => Boolean(id))
        )
      )
      if (!ids.length) {
        setPaymentMethodsById({})
        return
      }
      const { data, error: pmError } = await supabase
        .from('payment_methods')
        .select('id, type, provider, label, phone, account_name, account_number_last4')
        .in('id', ids)
      if (pmError) {
        console.error('PaymentMethodsFetchError', pmError)
        setPaymentMethodsById({})
        return
      }
      const map: typeof paymentMethodsById = {}
      for (const row of data ?? []) {
        map[row.id] = row
      }
      setPaymentMethodsById(map)
    },
    [extractPaymentMethodId, supabase]
  )

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        throw new Error('No active session')
      }

      const res = await fetch('/api/merchant/audit-logs?limit=100', {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error ?? 'Failed to load audit logs')
      }

      const payload = await res.json().catch(() => null)
      const rawLogs = ((payload?.logs ?? []) as AuditLogEntry[]) ?? []
      setLogs(rawLogs)
      await loadPaymentMethods(rawLogs)
    } catch (err) {
      setError((err as any)?.message ?? 'Failed to load audit logs')
      if ((err as any)?.message === 'No active session') {
        router.push('/merchant/login?next=/merchant/logs')
      }
    } finally {
      setLoading(false)
    }
  }, [router, supabase])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  return (
    <MerchantLayout>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-sm text-slate-300/80">Merchant Tools</p>
            <h1 className="text-3xl font-semibold text-white">Top-up Audit Logs</h1>
            <p className="mt-1 text-sm text-white/60">Full history of approved and rejected top-up requests.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/merchant/portal"
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-[#183149] bg-[#081626] text-slate-200 hover:bg-[#12314a] transition"
            >
              Back to dashboard
            </Link>
            <button
              type="button"
              onClick={loadLogs}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Reload'}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-[#183149] bg-[#0b1a2a] p-4 sm:p-6 shadow-2xl text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white/70">Filter:</span>
              {(['all', 'approved', 'rejected'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  className={`px-3 py-1 rounded-full text-sm font-semibold border transition ${
                    filter === option
                      ? 'bg-blue-500/15 text-white border-blue-500/30'
                      : 'bg-[#081626] text-slate-200 border-[#183149] hover:bg-[#12314a]'
                  }`}
                >
                  {option === 'all' ? 'All' : option === 'approved' ? 'Approved' : 'Rejected'}
                </button>
              ))}
            </div>
            <p className="text-sm text-white/50">Showing {filteredLogs.length} of {logs.length} records</p>
          </div>

          {error ? <div className="mt-4 text-sm text-red-400">{error}</div> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-[#183149]">
              <thead className="bg-[#081626]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">
                    Processed At
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">
                    Processed By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">
                    Payment Method
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#183149]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-white/50">
                      Loading logs…
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-white/50">
                      No audit entries for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 text-sm text-white">
                        <div className="font-medium">
                          {log.user_username ?? log.user_name ?? 'Unknown user'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">₱{Number(log.amount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            log.status === 'approved'
                              ? 'bg-blue-500/15 text-blue-200'
                              : 'bg-red-500/20 text-red-300'
                          }`}
                        >
                          {log.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {new Date(log.processed_at ?? log.created_at).toLocaleString(undefined, {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {log.merchant_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300/80">
                        {describePaymentMethod(log.status_notes)}
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
