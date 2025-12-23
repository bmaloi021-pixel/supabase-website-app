import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

type Role = 'admin' | 'user' | 'merchant' | 'accounting'

async function getMerchantClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Server misconfigured: missing Supabase env vars' },
        { status: 500 }
      ),
    }
  }

  if (!serviceKey) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY' },
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
    const message = userError?.message ?? 'Unauthorized'
    return { errorResponse: NextResponse.json({ error: message }, { status: 401 }) }
  }

  const serviceClient = createClient(url, serviceKey)

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return {
      errorResponse: NextResponse.json({ error: profileError?.message ?? 'Forbidden' }, { status: 403 }),
    }
  }

  if (!['merchant', 'admin'].includes(profile.role as Role)) {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { serviceClient }
}

export async function GET(request: NextRequest) {
  const { serviceClient, errorResponse } = await getMerchantClient(request)
  if (errorResponse) return errorResponse

  const { data, error } = await serviceClient
    .from('top_up_requests')
    .select('id, user_id, amount, created_at, status, status_notes')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{
    id: string
    user_id: string
    amount: number
    created_at: string
    status: string
    status_notes?: string | null
  }>

  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))) as string[]

  const usernameMap: Record<string, string | null> = {}
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await serviceClient
      .from('profiles')
      .select('id, username')
      .in('id', userIds)

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    for (const profile of (profiles ?? []) as Array<{ id: string; username: string | null }>) {
      usernameMap[profile.id] = profile.username ?? null
    }
  }

  const requests = rows.map((row) => ({
    ...row,
    username: usernameMap[row.user_id] ?? null,
  }))

  return NextResponse.json({ requests })
}
