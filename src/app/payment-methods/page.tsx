'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const WALLET_TYPES = ['gcash', 'maya'] as const
const BANK_TYPES = ['bank', 'gotyme'] as const
type PaymentType = typeof WALLET_TYPES[number] | typeof BANK_TYPES[number]

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

export default function PaymentMethodsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [methods, setMethods] = useState<any[]>([])
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [createQrFile, setCreateQrFile] = useState<File | null>(null)
  const createQrInputRef = useRef<HTMLInputElement | null>(null)
  const lastRealtimeRefreshAtRef = useRef(0)
  const realtimeRefreshInFlightRef = useRef(false)

  const [type, setType] = useState<PaymentType>('gcash')
  const [label, setLabel] = useState('')
  const [provider, setProvider] = useState('')
  const [accountName, setAccountName] = useState('')
  const [phone, setPhone] = useState('')
  const [accountLast4, setAccountLast4] = useState('')
  const [makeDefault, setMakeDefault] = useState(true)
  const [makePublic, setMakePublic] = useState(false)

  const loadMethods = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('user_id', uid)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error
    setMethods(data ?? [])

    const nextUrls: Record<string, string> = {}
    await Promise.all(
      (data ?? [])
        .filter((m: any) => !!m?.qr_code_path)
        .map(async (m: any) => {
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
  }, [supabase])

  const reloadRole = useCallback(async (uid: string) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .single()

    if (profileError) throw profileError

    const nextRole = (profile as any)?.role ?? null
    setRole(nextRole)

    if (nextRole !== 'merchant' && nextRole !== 'admin') {
      router.push('/dashboard')
      return null
    }

    return nextRole as string
  }, [router, supabase])

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

    if (updateError) throw updateError

    const { data: signed, error: signedError } = await supabase.storage
      .from('payment-method-qr-codes')
      .createSignedUrl(objectPath, 60 * 60)

    if (signedError) throw signedError

    setQrUrls((prev) => ({ ...prev, [methodId]: signed?.signedUrl ?? '' }))
  }

  const removeQrCode = async (uid: string, methodId: string, path?: string | null) => {
    if (!path) return
    const { error: removeError } = await supabase.storage
      .from('payment-method-qr-codes')
      .remove([path])

    if (removeError) throw removeError

    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({ qr_code_path: null })
      .eq('id', methodId)

    if (updateError) throw updateError

    setQrUrls((prev) => {
      const next = { ...prev }
      delete next[methodId]
      return next
    })
  }

  const setDefaultMethod = async (uid: string, id: string) => {
    const { error: clearError } = await supabase
      .from('payment_methods')
      .update({ is_default: false })
      .eq('user_id', uid)

    if (clearError) throw clearError

    const { error: setError } = await supabase
      .from('payment_methods')
      .update({ is_default: true })
      .eq('id', id)

    if (setError) throw setError
  }

  const handleDelete = async (id: string) => {
    if (!userId) return
    const ok = window.confirm('Delete this payment method?')
    if (!ok) return
    setError(null)
    try {
      const { error } = await supabase.from('payment_methods').delete().eq('id', id)
      if (error) throw error
      await loadMethods(userId)
    } catch (e) {
      setError((e as any)?.message ?? 'Failed to delete payment method')
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    setError(null)
    setSaving(true)
    try {
      const walletSelected = isWalletType(type)
      const bankSelected = isBankType(type)

      if (walletSelected) {
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
        account_name: bankSelected ? accountName.trim() || null : null,
        account_number_last4: bankSelected ? accountLast4.trim() || null : null,
        phone: walletSelected ? phone.trim() || null : null,
        is_default: false,
        is_public: (role === 'merchant' || role === 'admin') ? !!makePublic : false,
      }

      const { data, error } = await supabase
        .from('payment_methods')
        .insert(insertPayload)
        .select('*')
        .single()

      if (error) throw error

      if (makeDefault && data?.id) {
        await setDefaultMethod(userId, data.id)
      }

      if (createQrFile && data?.id) {
        await uploadQrCode(userId, data.id, createQrFile)
      }

      setLabel('')
      setProvider('')
      setAccountName('')
      setPhone('')
      setAccountLast4('')
      setMakeDefault(true)
      setMakePublic(false)
      setCreateQrFile(null)
      if (createQrInputRef.current) {
        createQrInputRef.current.value = ''
      }

      await loadMethods(userId)
    } catch (e) {
      setError((e as any)?.message ?? 'Failed to add payment method')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      setError(null)
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !sessionData?.session?.user?.id) {
          setError(sessionError?.message || 'No active session')
          setLoading(false)
          router.push('/login')
          return
        }

        const session = sessionData.session
        const nextRole = await reloadRole(session.user.id)
        if (!nextRole) {
          setLoading(false)
          return
        }

        setUserId(session.user.id)
        await loadMethods(session.user.id)
        setLoading(false)
      } catch (e) {
        setError((e as any)?.message ?? 'Failed to load')
        setLoading(false)
      }
    }

    load()
  }, [loadMethods, reloadRole, router, supabase])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`payment-methods-realtime-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_methods', filter: `user_id=eq.${userId}` },
        () => {
          const now = Date.now()
          if (now - lastRealtimeRefreshAtRef.current < 700) return
          if (realtimeRefreshInFlightRef.current) return
          lastRealtimeRefreshAtRef.current = now
          realtimeRefreshInFlightRef.current = true
          loadMethods(userId).finally(() => {
            realtimeRefreshInFlightRef.current = false
          })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        () => {
          const now = Date.now()
          if (now - lastRealtimeRefreshAtRef.current < 700) return
          if (realtimeRefreshInFlightRef.current) return
          lastRealtimeRefreshAtRef.current = now
          realtimeRefreshInFlightRef.current = true
          reloadRole(userId)
            .then((nextRole) => {
              if (nextRole) {
                return loadMethods(userId)
              }
            })
            .finally(() => {
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
  }, [loadMethods, reloadRole, supabase, userId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900">Payment Methods</h1>
          <p className="mt-2 text-sm text-gray-600">Manage your payment methods for top-ups and purchases.</p>

          {error ? <div className="mt-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">{error}</div> : null}

          <form onSubmit={handleCreate} className="mt-6 rounded-md border border-gray-200 p-4">
            <div className="text-sm font-semibold text-gray-900">Add payment method</div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                >
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="gotyme">GoTyme Bank</option>
                  <option value="bank">Other Bank</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Label (optional)</label>
                <input
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Personal, Business"
                />
              </div>

              {isWalletType(type) ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {type === 'gcash' ? 'GCash number' : 'Maya number'}
                    </label>
                    <input
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 09xxxxxxxxx"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      id="default"
                      type="checkbox"
                      checked={makeDefault}
                      onChange={(e) => setMakeDefault(e.target.checked)}
                    />
                    <label htmlFor="default" className="text-sm text-gray-700">
                      Set as default
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Bank name</label>
                    {type === 'gotyme' ? (
                      <input
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-gray-50"
                        value={getDefaultProvider(type)}
                        readOnly
                      />
                    ) : (
                      <input
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        placeholder="e.g. BDO, BPI"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Account name</label>
                    <input
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="e.g. Juan Dela Cruz"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Account last 4 digits</label>
                    <input
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={accountLast4}
                      onChange={(e) => setAccountLast4(e.target.value)}
                      placeholder="e.g. 1234"
                      inputMode="numeric"
                      maxLength={4}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      id="default"
                      type="checkbox"
                      checked={makeDefault}
                      onChange={(e) => setMakeDefault(e.target.checked)}
                    />
                    <label htmlFor="default" className="text-sm text-gray-700">
                      Set as default
                    </label>
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">QR code image (optional)</label>
                <input
                  ref={createQrInputRef}
                  type="file"
                  accept="image/*"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
                  onChange={(e) => {
                    setCreateQrFile(e.target.files?.[0] ?? null)
                  }}
                />
              </div>

              {(role === 'merchant' || role === 'admin') ? (
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input
                    id="makePublic"
                    type="checkbox"
                    checked={makePublic}
                    onChange={(e) => setMakePublic(e.target.checked)}
                  />
                  <label htmlFor="makePublic" className="text-sm text-gray-700">
                    Public for top-up (visible to all users)
                  </label>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving || !userId}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Your payment methods</div>
              <button
                type="button"
                onClick={async () => {
                  if (!userId) return
                  setError(null)
                  try {
                    await loadMethods(userId)
                  } catch (e) {
                    setError((e as any)?.message ?? 'Failed to refresh')
                  }
                }}
                className="px-3 py-2 rounded-md text-sm font-medium text-indigo-700 bg-white border border-indigo-600 hover:bg-indigo-50"
              >
                Refresh
              </button>
            </div>

            {methods.length > 0 ? (
              <div className="mt-4 space-y-3">
                {methods.map((m) => (
                  <div key={m.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-gray-50 rounded-md">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900">
                          {m.type === 'gcash'
                            ? 'GCash'
                            : m.type === 'maya'
                              ? 'Maya'
                              : m.type === 'gotyme'
                                ? 'GoTyme Bank'
                                : 'Bank'}
                          {m.label ? ` - ${m.label}` : ''}
                        </div>
                        {m.is_default ? (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {isWalletType(m.type) ? (
                          <span>{m.phone}</span>
                        ) : (
                          <span>
                            {m.provider || (m.type === 'gotyme' ? getDefaultProvider('gotyme') : 'Bank')} • {m.account_name} • ****{m.account_number_last4}
                          </span>
                        )}
                      </div>

                      {(role === 'merchant' || role === 'admin') ? (
                        <div className="mt-2">
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${m.is_public ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                            {m.is_public ? 'Public' : 'Private'}
                          </span>
                        </div>
                      ) : null}

                      <div className="mt-3">
                        <div className="text-xs font-medium text-gray-700">QR code</div>
                        {qrUrls[m.id] ? (
                          <div className="mt-2">
                            <img
                              src={qrUrls[m.id]}
                              alt="QR code"
                              className="h-28 w-28 rounded-md border border-gray-200 object-cover"
                            />
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-gray-600">No QR uploaded</div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {!m.is_default ? (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!userId) return
                            setError(null)
                            try {
                              await setDefaultMethod(userId, m.id)
                              await loadMethods(userId)
                            } catch (e) {
                              setError((e as any)?.message ?? 'Failed to set default')
                            }
                          }}
                          className="px-3 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                        >
                          Set default
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
                        className="px-3 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
                      >
                        Delete
                      </button>

                      {(role === 'merchant' || role === 'admin') ? (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!userId) return
                            setError(null)
                            try {
                              const { error: updateError } = await supabase
                                .from('payment_methods')
                                .update({ is_public: !m.is_public })
                                .eq('id', m.id)
                              if (updateError) throw updateError
                              await loadMethods(userId)
                            } catch (e) {
                              setError((e as any)?.message ?? 'Failed to update visibility')
                            }
                          }}
                          className="px-3 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                        >
                          {m.is_public ? 'Make private' : 'Make public'}
                        </button>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="px-3 py-2 rounded-md text-sm font-medium text-indigo-700 bg-white border border-indigo-600 hover:bg-indigo-50 cursor-pointer text-center">
                        {qrUrls[m.id] ? 'Replace QR' : 'Upload QR'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file || !userId) return
                            setError(null)
                            try {
                              await uploadQrCode(userId, m.id, file)
                              await loadMethods(userId)
                            } catch (err) {
                              setError((err as any)?.message ?? 'Failed to upload QR code')
                            } finally {
                              e.currentTarget.value = ''
                            }
                          }}
                        />
                      </label>

                      {m.qr_code_path ? (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!userId) return
                            const ok = window.confirm('Remove QR code?')
                            if (!ok) return
                            setError(null)
                            try {
                              await removeQrCode(userId, m.id, m.qr_code_path)
                              await loadMethods(userId)
                            } catch (err) {
                              setError((err as any)?.message ?? 'Failed to remove QR code')
                            }
                          }}
                          className="px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-600 hover:bg-gray-700"
                        >
                          Remove QR
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-gray-200 p-4">
                <div className="text-sm font-medium text-gray-900">No payment methods yet</div>
                <div className="mt-1 text-sm text-gray-600">Add one above to get started.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
