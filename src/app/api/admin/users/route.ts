import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

type Role = 'admin' | 'user' | 'merchant' | 'accounting'

async function getAdminClientAndAssertAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null

  if (!bearerToken) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const anonClient = createClient(url, anonKey)

  const { data: { user: userData }, error: userError } = await anonClient.auth.getUser(bearerToken)
  if (!userData) {
    if (userError) {
      return { errorResponse: NextResponse.json({ error: userError.message }, { status: 401 }) }
    }
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
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

  const adminClient = createClient(url, serviceKey)

  const { data: myProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userData.id)
    .single()

  if (profileError || myProfile?.role !== 'admin') {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { adminClient }
}

export async function GET(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClientAndAssertAdmin(request)
  if (errorResponse) return errorResponse

  const { data, error } = await adminClient
    .from('profiles')
    .select('id, username, first_name, last_name, role, balance, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const profiles = (data ?? []) as Array<{
    id: string
    username: string
    first_name: string
    last_name: string
    role: Role
    balance?: number | null
    created_at?: string
  }>

  const userIds = profiles.map((p) => p.id).filter(Boolean)

  const [paidCommissionsRes, withdrawnPackagesRes] = await Promise.all([
    userIds.length
      ? adminClient
          .from('commissions')
          .select('user_id, amount')
          .in('user_id', userIds)
          .eq('status', 'paid')
      : Promise.resolve({ data: [], error: null } as any),
    userIds.length
      ? adminClient
          .from('user_packages')
          .select('user_id, withdrawn_at, packages ( price )')
          .in('user_id', userIds)
          .not('withdrawn_at', 'is', null)
      : Promise.resolve({ data: [], error: null } as any),
  ])

  if (paidCommissionsRes?.error) {
    return NextResponse.json({ error: paidCommissionsRes.error.message }, { status: 500 })
  }
  if (withdrawnPackagesRes?.error) {
    return NextResponse.json({ error: withdrawnPackagesRes.error.message }, { status: 500 })
  }

  const paidByUserId = new Map<string, number>()
  for (const row of (paidCommissionsRes.data ?? []) as any[]) {
    const uid = row?.user_id
    const amt = Number(row?.amount ?? 0)
    if (!uid) continue
    paidByUserId.set(uid, (paidByUserId.get(uid) ?? 0) + (Number.isFinite(amt) ? amt : 0))
  }

  const withdrawnByUserId = new Map<string, number>()
  for (const row of (withdrawnPackagesRes.data ?? []) as any[]) {
    const uid = row?.user_id
    const price = Number(row?.packages?.price ?? 0)
    if (!uid) continue
    withdrawnByUserId.set(uid, (withdrawnByUserId.get(uid) ?? 0) + (Number.isFinite(price) ? price : 0))
  }

  const enriched = profiles.map((p) => {
    const bal = Number((p as any)?.balance ?? 0)
    const balance = Number.isFinite(bal) ? bal : 0
    const total_earnings = (paidByUserId.get(p.id) ?? 0) + (withdrawnByUserId.get(p.id) ?? 0)
    return { ...p, balance, total_earnings }
  })

  return NextResponse.json({ profiles: enriched })
}

export async function POST(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClientAndAssertAdmin(request)
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null)
  const userId = body?.userId
  const role = body?.role

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  if (!role || typeof role !== 'string') {
    return NextResponse.json({ error: 'Missing role' }, { status: 400 })
  }

  const allowed: Role[] = ['admin', 'user', 'merchant', 'accounting']
  if (!allowed.includes(role as Role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
