import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'processing'

type WithdrawalRow = {
  id: string
  user_id: string
  amount: number
  status: WithdrawalStatus
  status_notes: string | null
  payment_method_info: any
  created_at: string
  processed_at: string | null
}

type EnrichedWithdrawal = WithdrawalRow & {
  username: string | null
}

async function getAdminOrAccountingClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return {
      errorResponse: NextResponse.json({ error: 'Server misconfigured: missing Supabase credentials' }, { status: 500 }),
    }
  }

  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null

  if (!bearerToken) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })
  const {
    data: { user },
    error: userError,
  } = await anonClient.auth.getUser(bearerToken)

  if (!user) {
    return { errorResponse: NextResponse.json({ error: userError?.message ?? 'Unauthorized' }, { status: 401 }) }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      ),
    }
  }

  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError) {
    return { errorResponse: NextResponse.json({ error: profileError.message }, { status: 403 }) }
  }

  const role = String((profile as any)?.role ?? '')
  if (role !== 'accounting') {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { serviceClient }
}

async function hydrateUsernames(serviceClient: SupabaseClient, rows: WithdrawalRow[]) {
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)))
  if (userIds.length === 0) return []

  const { data: profiles, error } = await serviceClient
    .from('profiles')
    .select('id, username')
    .in('id', userIds)

  if (error) throw error

  const usernameById = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.username ?? null]))

  return rows.map((r) => ({
    ...r,
    username: usernameById[r.user_id] ?? null,
  })) as EnrichedWithdrawal[]
}

export async function GET(request: NextRequest) {
  const { serviceClient, errorResponse } = await getAdminOrAccountingClient(request)
  if (errorResponse || !serviceClient) return errorResponse!

  try {
    const { data, error } = await serviceClient
      .from('withdrawal_requests')
      .select('id,user_id,amount,status,status_notes,payment_method_info,created_at,processed_at')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error

    const rows = (data ?? []) as WithdrawalRow[]
    const enriched = await hydrateUsernames(serviceClient, rows)

    return NextResponse.json({ withdrawals: enriched })
  } catch (e) {
    console.error('AccountingWithdrawalsGET', e)
    return NextResponse.json({ error: (e as any)?.message ?? 'Failed to load withdrawals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { serviceClient, errorResponse } = await getAdminOrAccountingClient(request)
  if (errorResponse || !serviceClient) return errorResponse!

  const body = await request.json().catch(() => null)
  const id = body?.id
  const action = body?.action

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const nextStatus: WithdrawalStatus = action === 'approve' ? 'approved' : 'rejected'

  try {
    if (action === 'approve') {
      const { data: row, error: fetchError } = await serviceClient
        .from('withdrawal_requests')
        .select('id,user_id,amount,status,status_notes,processed_at')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError
      if (!row) {
        return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
      }

      const status = String((row as any)?.status ?? '') as WithdrawalStatus
      const statusNotes = String((row as any)?.status_notes ?? '')
      const alreadyDeducted = statusNotes.split('|').includes('deducted:1')

      if (status !== 'pending' && status !== 'approved') {
        return NextResponse.json({ ok: true, id, status })
      }

      if (status === 'approved' && alreadyDeducted) {
        return NextResponse.json({ ok: true, id, status })
      }

      const userId = String((row as any)?.user_id ?? '')
      const amount = Number((row as any)?.amount ?? 0)
      if (!userId || !Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Invalid withdrawal request' }, { status: 400 })
      }

      const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('withdrawable_balance')
        .eq('id', userId)
        .single()

      if (profileError) throw profileError

      const current = Number((profile as any)?.withdrawable_balance ?? 0)
      const next = current - amount
      if (!Number.isFinite(current) || current < amount) {
        return NextResponse.json({ error: 'Insufficient withdrawable balance' }, { status: 400 })
      }
      if (!Number.isFinite(next)) {
        return NextResponse.json({ error: 'Invalid user balance' }, { status: 400 })
      }

      const nextNotes = (() => {
        const tokens = statusNotes
          .split('|')
          .map((t) => t.trim())
          .filter(Boolean)
        if (!tokens.includes('deducted:1')) tokens.push('deducted:1')
        return tokens.join('|')
      })()

      const updateReqPayload: Record<string, any> = {
        status: nextStatus,
        processed_at: (row as any)?.processed_at ?? new Date().toISOString(),
        status_notes: nextNotes,
      }

      const updateReqQuery = serviceClient
        .from('withdrawal_requests')
        .update(updateReqPayload)
        .eq('id', id)

      const { error: updateReqError } = status === 'pending'
        ? await updateReqQuery.eq('status', 'pending')
        : await updateReqQuery

      if (updateReqError) throw updateReqError

      const { error: updateBalanceError } = await serviceClient
        .from('profiles')
        .update({
          withdrawable_balance: next,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (updateBalanceError) throw updateBalanceError

      return NextResponse.json({ ok: true, id, status: nextStatus })
    }

    const { error } = await serviceClient
      .from('withdrawal_requests')
      .update({
        status: nextStatus,
        processed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending')

    if (error) throw error

    return NextResponse.json({ ok: true, id, status: nextStatus })
  } catch (e) {
    console.error('AccountingWithdrawalsPOST', e)
    return NextResponse.json({ error: (e as any)?.message ?? 'Failed to update withdrawal' }, { status: 500 })
  }
}
