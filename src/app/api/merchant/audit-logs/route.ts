import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

type Role = 'admin' | 'user' | 'merchant' | 'accounting'

async function getMerchantClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Server misconfigured: missing Supabase credentials' },
        { status: 500 }
      ),
    }
  }

  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null

  if (!bearerToken) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const anonClient = createClient(url, anonKey)
  const {
    data: { user },
    error: userError,
  } = await anonClient.auth.getUser(bearerToken)

  if (!user) {
    return { errorResponse: NextResponse.json({ error: userError?.message ?? 'Unauthorized' }, { status: 401 }) }
  }

  const serviceClient = createClient(url, serviceKey)
  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('id, role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { errorResponse: NextResponse.json({ error: profileError?.message ?? 'Forbidden' }, { status: 403 }) }
  }

  if (!['merchant', 'admin'].includes(profile.role as Role)) {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { serviceClient, profile }
}

export async function GET(request: NextRequest) {
  const { serviceClient, profile, errorResponse } = await getMerchantClient(request)
  if (errorResponse || !profile) return errorResponse

  const limitParam = Number(new URL(request.url).searchParams.get('limit') ?? '25')
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 100)) : 25

  let query = serviceClient
    .from('top_up_requests')
    .select('id, user_id, amount, status, status_notes, merchant_id, processed_at, created_at')
    .neq('status', 'pending')
    .order('processed_at', { ascending: false })
    .limit(limit)

  if (profile.role !== 'admin') {
    query = query.eq('merchant_id', profile.id)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{
    id: string
    user_id: string
    amount: number
    status: 'approved' | 'rejected'
    status_notes?: string | null
    merchant_id: string | null
    processed_at: string | null
    created_at: string
  }>

  const relatedIds = Array.from(
    new Set(
      rows
        .flatMap((row) => [row.user_id, row.merchant_id])
        .filter((v): v is string => Boolean(v))
    )
  )

  const profileMap: Record<
    string,
    { username: string | null; first_name: string | null; last_name: string | null }
  > = {}

  if (relatedIds.length > 0) {
    const { data: profileRows, error: profileRowsError } = await serviceClient
      .from('profiles')
      .select('id, username, first_name, last_name')
      .in('id', relatedIds)

    if (profileRowsError) {
      return NextResponse.json({ error: profileRowsError.message }, { status: 500 })
    }

    for (const row of (profileRows ?? []) as Array<{
      id: string
      username: string | null
      first_name: string | null
      last_name: string | null
    }>) {
      profileMap[row.id] = {
        username: row.username ?? null,
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
      }
    }
  }

  const logs = rows.map((row) => {
    const userProfile = profileMap[row.user_id]
    const merchantProfile = row.merchant_id ? profileMap[row.merchant_id] : null

    const formatName = (p?: { first_name: string | null; last_name: string | null } | null) => {
      if (!p) return null
      const parts = [p.first_name, p.last_name].filter(Boolean)
      return parts.length ? parts.join(' ') : null
    }

    return {
      id: row.id,
      user_id: row.user_id,
      user_username: userProfile?.username ?? null,
      user_name: formatName(userProfile),
      amount: row.amount,
      status: row.status,
      status_notes: row.status_notes ?? null,
      merchant_id: row.merchant_id,
      merchant_name: formatName(merchantProfile),
      processed_at: row.processed_at,
      created_at: row.created_at,
    }
  })

  return NextResponse.json({ logs })
}
