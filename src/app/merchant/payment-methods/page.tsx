'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import MerchantLayout from '@/components/merchant/MerchantLayout'
import { createClient } from '@/lib/supabase/client'

const WALLET_TYPES = ['gcash', 'maya'] as const
const BANK_TYPES = ['bank', 'gotyme'] as const
type PaymentType = typeof WALLET_TYPES[number] | typeof BANK_TYPES[number]

type PaymentMethodRow = {
  id: string
  user_id: string
  type: string
  label: string | null
  provider: string | null
  account_name: string | null
  account_number_last4: string | null
  phone: string | null
  is_public: boolean
  is_default: boolean
  qr_code_path: string | null
  created_at: string
}

const isWalletType = (value: string): value is typeof WALLET_TYPES[number] =>
  (WALLET_TYPES as readonly string[]).includes(value)

const isBankType = (value: string): value is typeof BANK_TYPES[number] =>
  (BANK_TYPES as readonly string[]).includes(value)

const getDefaultProvider = (value: PaymentType) => {
  switch (value) {
    case 'gcash':
      return 'GCash'
    case 'maya':
      return 'Maya'
    case 'gotyme':
      return 'GoTyme Bank'
    default:
      return ''
  }
}

const formatMethodTitle = (m: PaymentMethodRow) => {
  const label = m.label ? ` — ${m.label}` : ''
  if (m.type === 'gcash') return `GCash${label}`
  if (m.type === 'maya') return `Maya${label}`
  if (m.type === 'gotyme') return `GoTyme Bank${label}`
  return `${m.provider || 'Bank'}${label}`
}

export default function MerchantPaymentMethodsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)

  const [methods, setMethods] = useState<PaymentMethodRow[]>([])
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({})
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({})

  const [saving, setSaving] = useState(false)
  const createQrInputRef = useRef<HTMLInputElement | null>(null)
  const [createQrFile, setCreateQrFile] = useState<File | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const [qrMethodId, setQrMethodId] = useState<string | null>(null)

  const [type, setType] = useState<PaymentType>('gcash')
  const [label, setLabel] = useState('')
  const [provider, setProvider] = useState('')
  const [accountName, setAccountName] = useState('')
  const [phone, setPhone] = useState('')
  const [accountLast4, setAccountLast4] = useState('')
  const [makeActive, setMakeActive] = useState(true)

  const loadRole = useCallback(
    async (uid: string) => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', uid)
        .single()

      if (profileError) throw profileError

      const nextRole = (profile as any)?.role ?? null
      setRole(nextRole)
      return nextRole as string | null
    },
    [supabase]
  )

  const hydrateQrUrls = useCallback(
    async (rows: PaymentMethodRow[]) => {
      const nextUrls: Record<string, string> = {}
      await Promise.all(
        (rows ?? [])
          .filter((m) => !!m?.qr_code_path)
          .map(async (m) => {
            const path = m.qr_code_path as string
            const { data: signed, error: signedError } = await supabase.storage
              .from('payment-method-qr-codes')
              .createSignedUrl(path, 60 * 60)
            if (!signedError && signed?.signedUrl) {
              nextUrls[m.id] = signed.signedUrl
            }
          })
      )
      setQrUrls(nextUrls)
    },
    [supabase]
  )

  const loadMethods = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id,user_id,type,label,provider,account_name,account_number_last4,phone,is_public,is_default,qr_code_path,created_at')
        .or(`is_public.eq.true,user_id.eq.${uid}`)
        .order('is_public', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error

      const rows = (data ?? []) as PaymentMethodRow[]
      setMethods(rows)
      await hydrateQrUrls(rows)
      return rows
    },
    [hydrateQrUrls, supabase]
  )

  const loadCreatorNames = useCallback(
    async (rows: PaymentMethodRow[]) => {
      const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)))
      if (ids.length === 0) {
        setCreatorNames({})
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id,username,first_name,last_name')
        .in('id', ids)

      if (error) throw error

      const next: Record<string, string> = {}
      for (const p of (data ?? []) as any[]) {
        const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
        next[p.id] = (p.username as string) || name || '—'
      }
      setCreatorNames(next)
    },
    [supabase]
  )

  const uploadQrCode = async (uid: string, methodId: string, file: File) => {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const objectPath = `${uid}/${methodId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('payment-method-qr-codes')
      .upload(objectPath, file, { upsert: true, contentType: file.type || 'image/*' })

    if (uploadError) throw uploadError

    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({ qr_code_path: objectPath })
      .eq('id', methodId)
      .eq('user_id', uid)

    if (updateError) throw updateError

    const { data: signed, error: signedError } = await supabase.storage
      .from('payment-method-qr-codes')
      .createSignedUrl(objectPath, 60 * 60)

    if (signedError) throw signedError

    setQrUrls((prev) => ({ ...prev, [methodId]: signed?.signedUrl ?? '' }))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    setError(null)
    setSaving(true)

    try {
      const walletSelected = isWalletType(type)
      const bankSelected = isBankType(type)

      if (!createQrFile) {
        throw new Error('Please upload a QR code image')
      }

      if (walletSelected) {
        if (!accountName.trim()) {
          throw new Error('Please enter an account name')
        }
        if (!phone.trim()) {
          throw new Error(`Please enter a ${type === 'gcash' ? 'GCash' : 'Maya'} number`)
        }
      }

      if (bankSelected) {
        if (type === 'bank' && !provider.trim()) {
          throw new Error('Please enter a bank name')
        }
        if (!accountName.trim()) {
          throw new Error('Please enter an account name')
        }
        if (!/^[0-9]{4}$/.test(accountLast4.trim())) {
          throw new Error('Bank account last 4 must be exactly 4 digits')
        }
      }

      const insertPayload: any = {
        user_id: userId,
        type,
        label: label.trim() || null,
        provider:
          walletSelected
            ? getDefaultProvider(type)
            : type === 'gotyme'
              ? getDefaultProvider(type)
              : provider.trim() || null,
        account_name: (walletSelected || bankSelected) ? accountName.trim() || null : null,
        account_number_last4: bankSelected ? accountLast4.trim() || null : null,
        phone: walletSelected ? phone.trim() || null : null,
        is_default: false,
        is_public: !!makeActive,
      }

      const { data, error } = await supabase.from('payment_methods').insert(insertPayload).select('*').single()
      if (error) throw error

      if (createQrFile && data?.id) {
        await uploadQrCode(userId, data.id, createQrFile)
      }

      setType('gcash')
      setLabel('')
      setProvider('')
      setAccountName('')
      setPhone('')
      setAccountLast4('')
      setMakeActive(true)
      setCreateQrFile(null)
      if (createQrInputRef.current) {
        createQrInputRef.current.value = ''
      }

      setIsAddOpen(false)

      await loadMethods(userId)
    } catch (err) {
      setError((err as any)?.message ?? 'Failed to add payment method')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (method: PaymentMethodRow) => {
    if (!userId) return
    if (method.user_id !== userId) return

    setError(null)
    try {
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_public: !method.is_public })
        .eq('id', method.id)
        .eq('user_id', userId)

      if (error) throw error

      await loadMethods(userId)
    } catch (err) {
      setError((err as any)?.message ?? 'Failed to update payment method')
    }
  }

  const handleDelete = async (method: PaymentMethodRow) => {
    if (!userId) return
    if (method.user_id !== userId) return

    const ok = window.confirm('Delete this payment method?')
    if (!ok) return

    setError(null)
    try {
      const { error } = await supabase.from('payment_methods').delete().eq('id', method.id).eq('user_id', userId)
      if (error) throw error
      await loadMethods(userId)
    } catch (err) {
      setError((err as any)?.message ?? 'Failed to delete payment method')
    }
  }

  useEffect(() => {
    const load = async () => {
      setError(null)
      setLoading(true)
      try {
        const ok = sessionStorage.getItem('merchant_auth') === '1'
        if (!ok) {
          await supabase.auth.signOut()
          router.push('/merchant/login?next=/merchant/payment-methods')
          return
        }

        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData?.session
        if (!session?.user?.id) {
          router.push('/merchant/login?next=/merchant/payment-methods')
          return
        }

        const uid = session.user.id
        setUserId(uid)

        const nextRole = await loadRole(uid)
        if (nextRole !== 'merchant' && nextRole !== 'admin') {
          setError('This account is not a merchant.')
          return
        }

        const rows = await loadMethods(uid)
        await loadCreatorNames(rows)
      } catch (err) {
        setError((err as any)?.message ?? 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [loadCreatorNames, loadMethods, loadRole, router, supabase])

  useEffect(() => {
    if (!methods.length) {
      setCreatorNames({})
      return
    }
    loadCreatorNames(methods).catch(() => {
      // ignore
    })
  }, [loadCreatorNames, methods])

  const totalCount = methods.length
  const activeCount = methods.filter((m) => !!m.is_public).length
  const inactiveCount = totalCount - activeCount

  const qrPreviewUrl = qrMethodId ? qrUrls[qrMethodId] : undefined

  return (
    <MerchantLayout>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-3xl border border-[#f3cc84]/40 bg-gradient-to-r from-[#0c2233] via-[#0f2b3e] to-[#0c2233] p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-[#f3cc84] text-[#0a1217] flex items-center justify-center">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h10" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Payment Methods</h1>
                  <p className="text-sm text-white/60">Manage payment methods for topups</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                className="px-5 py-3 rounded-2xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition"
              >
                + Add Payment Method
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[#f3cc84]/40 bg-[#0b1a2a] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-white/60">Total</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{loading ? '—' : totalCount}</div>
                  <div className="mt-1 text-xs text-white/50">All payment methods</div>
                </div>
                <div className="h-10 w-10 rounded-xl bg-[#12314a] flex items-center justify-center text-white">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#f3cc84]/40 bg-[#0b1a2a] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-white/60">Active</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{loading ? '—' : activeCount}</div>
                  <div className="mt-1 text-xs text-white/50">Available for users</div>
                </div>
                <div className="h-10 w-10 rounded-xl bg-[#0f3d2c] flex items-center justify-center text-[#8ee4b8]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#f3cc84]/40 bg-[#0b1a2a] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-white/60">Inactive</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{loading ? '—' : inactiveCount}</div>
                  <div className="mt-1 text-xs text-white/50">Not available</div>
                </div>
                <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-white/50">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-[#f3cc84]/40 bg-[#0b1a2a] shadow-2xl overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-white">Payment Methods</div>
              <button
                type="button"
                onClick={async () => {
                  if (!userId) return
                  setError(null)
                  try {
                    await loadMethods(userId)
                  } catch (err) {
                    setError((err as any)?.message ?? 'Failed to refresh')
                  }
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#0a1724] border border-[#183149] text-white hover:bg-[#12314a] transition"
              >
                Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-[#0a1724]">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/60 uppercase tracking-[0.35em]">Name</th>
                    <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/60 uppercase tracking-[0.35em]">Account Name</th>
                    <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/60 uppercase tracking-[0.35em]">Account Number</th>
                    <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/60 uppercase tracking-[0.35em]">Created By</th>
                    <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/60 uppercase tracking-[0.35em]">Status</th>
                    <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/60 uppercase tracking-[0.35em]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#183149]">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-white/50">
                        Loading…
                      </td>
                    </tr>
                  ) : methods.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-white/50">
                        No payment methods found.
                      </td>
                    </tr>
                  ) : (
                    methods.map((m) => {
                      const isOwned = userId ? m.user_id === userId : false
                      const name = m.type?.toUpperCase?.() ? String(m.type).toUpperCase() : '—'
                      const acctName = isWalletType(m.type) ? (m.account_name ?? '—') : (m.account_name ?? '—')
                      const acctNum = isWalletType(m.type)
                        ? (m.phone ?? '—')
                        : (m.account_number_last4 ? `****${m.account_number_last4}` : '—')
                      const createdBy = creatorNames[m.user_id] ?? '—'
                      const hasQr = !!qrUrls[m.id]

                      return (
                        <tr key={m.id}>
                          <td className="px-6 py-4 text-sm font-semibold text-white">{name}</td>
                          <td className="px-6 py-4 text-sm text-white/80">{acctName}</td>
                          <td className="px-6 py-4 text-sm text-white/80">{acctNum}</td>
                          <td className="px-6 py-4 text-sm text-white/60">{createdBy}</td>
                          <td className="px-6 py-4 text-sm">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold border ${
                                m.is_public
                                  ? 'bg-[#173d2c] text-[#8ee4b8] border-[#2a7b4f]'
                                  : 'bg-white/5 text-white/60 border-white/10'
                              }`}
                            >
                              {m.is_public ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex gap-2 flex-wrap">
                              <button
                                type="button"
                                disabled={!hasQr}
                                onClick={() => {
                                  setQrMethodId(m.id)
                                  setIsQrOpen(true)
                                }}
                                className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#0a1724] border border-[#183149] text-white hover:bg-[#12314a] transition disabled:opacity-50"
                              >
                                View QR
                              </button>
                              {isOwned ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(m)}
                                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition"
                                  >
                                    {m.is_public ? 'Deactivate' : 'Activate'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(m)}
                                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition"
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <span className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 text-white/50 border border-white/10">View only</span>
                              )}
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

          {isQrOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div
                className="absolute inset-0 bg-black/60"
                onClick={() => {
                  setIsQrOpen(false)
                  setQrMethodId(null)
                }}
              />
              <div className="relative w-full max-w-md rounded-3xl border border-[#f3cc84]/40 bg-[#071725] p-6 shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">QR Code</div>
                    <div className="mt-1 text-sm text-white/60">Scan to pay</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsQrOpen(false)
                      setQrMethodId(null)
                    }}
                    className="p-2 rounded-xl text-white/70 hover:bg-white/5"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-[#183149] bg-[#0b1a2a] p-4">
                  {qrPreviewUrl ? (
                    <img src={qrPreviewUrl} alt="QR code" className="w-full h-auto rounded-xl" />
                  ) : (
                    <div className="py-10 text-center text-sm text-white/60">QR image not available.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {isAddOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => setIsAddOpen(false)} />
              <div className="relative w-full max-w-2xl rounded-3xl border border-[#f3cc84]/40 bg-[#071725] p-6 shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">Add Payment Method</div>
                    <div className="mt-1 text-sm text-white/60">Create a new payment method and set its status.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="p-2 rounded-xl text-white/70 hover:bg-white/5"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleCreate} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-300/80">Type</label>
                    <select
                      className="mt-2 w-full rounded-2xl border border-[#183149] bg-[#0b1a2a] px-4 py-3 text-sm text-white focus:outline-none"
                      value={type}
                      onChange={(e) => {
                        const next = e.target.value as PaymentType
                        setType(next)
                        if (next === 'gotyme') {
                          setProvider(getDefaultProvider('gotyme'))
                        }
                      }}
                    >
                      <option value="gcash">GCash</option>
                      <option value="maya">Maya</option>
                      <option value="gotyme">GoTyme Bank</option>
                      <option value="bank">Other Bank</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-300/80">Label (optional)</label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-[#183149] bg-[#0b1a2a] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. Main wallet"
                    />
                  </div>

                  {isWalletType(type) ? (
                    <>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-300/80">Account name</label>
                        <input
                          className="mt-2 w-full rounded-2xl border border-[#183149] bg-[#0b1a2a] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value)}
                          placeholder="Account holder name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-300/80">
                          {type === 'gcash' ? 'GCash number' : 'Maya number'}
                        </label>
                        <input
                          className="mt-2 w-full rounded-2xl border border-[#183149] bg-[#0b1a2a] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="09xxxxxxxxx"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-300/80">Bank name</label>
                        <input
                          className="mt-2 w-full rounded-2xl border border-[#183149] bg-[#0b1a2a] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none disabled:opacity-60"
                          value={type === 'gotyme' ? getDefaultProvider('gotyme') : provider}
                          onChange={(e) => setProvider(e.target.value)}
                          placeholder="e.g. BDO, BPI"
                          disabled={type === 'gotyme'}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-300/80">Account name</label>
                        <input
                          className="mt-2 w-full rounded-2xl border border-[#183149] bg-[#0b1a2a] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value)}
                          placeholder="Juan Dela Cruz"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-300/80">Account last 4 digits</label>
                        <input
                          className="mt-2 w-full rounded-2xl border border-[#183149] bg-[#0b1a2a] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
                          value={accountLast4}
                          onChange={(e) => setAccountLast4(e.target.value)}
                          placeholder="1234"
                          inputMode="numeric"
                          maxLength={4}
                        />
                      </div>
                    </>
                  )}

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-300/80">QR code image</label>
                    <input
                      ref={createQrInputRef}
                      type="file"
                      accept="image/*"
                      required
                      className="mt-2 w-full rounded-2xl border border-[#183149] bg-[#0b1a2a] px-4 py-3 text-sm text-white file:mr-4 file:rounded-full file:border-0 file:bg-[#12314a] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#183149]"
                      onChange={(e) => {
                        setCreateQrFile(e.target.files?.[0] ?? null)
                      }}
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center gap-2">
                    <input
                      id="makeActive"
                      type="checkbox"
                      checked={makeActive}
                      onChange={(e) => setMakeActive(e.target.checked)}
                      className="rounded border-[#183149] bg-[#0b1a2a]"
                    />
                    <label htmlFor="makeActive" className="text-sm text-slate-200">
                      Set as active
                    </label>
                  </div>

                  <div className="sm:col-span-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddOpen(false)}
                      className="px-5 py-3 rounded-2xl text-sm font-semibold border border-[#183149] bg-[#0b1a2a] text-slate-200 hover:bg-[#12314a] transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving || loading || !userId}
                      className="px-5 py-3 rounded-2xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Add payment method'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </MerchantLayout>
  )
}
