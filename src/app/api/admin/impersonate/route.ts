import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

async function getAuthenticatedUser(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null

  if (!bearerToken) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const anonClient = createClient(url, anonKey)
  const { data: { user }, error } = await anonClient.auth.getUser(bearerToken)

  if (!user) {
    if (error) {
      return { errorResponse: NextResponse.json({ error: error.message }, { status: 401 }) }
    }
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { user }
}

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await getAuthenticatedUser(request)
  if (errorResponse || !user) return errorResponse!

  const body = await request.json().catch(() => null)
  const targetUserId = body?.userId
  if (!targetUserId || typeof targetUserId !== 'string') {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  const { data: myProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || myProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (user.id === targetUserId) {
    return NextResponse.json({ error: 'Already using this account' }, { status: 400 })
  }

  const { data: targetUser, error: fetchTargetError } = await adminClient.auth.admin.getUserById(targetUserId)
  if (fetchTargetError || !targetUser?.user?.email) {
    return NextResponse.json({ error: fetchTargetError?.message ?? 'Target user not found' }, { status: 404 })
  }

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const redirectTo = `${origin.replace(/\/$/, '')}/auth/impersonate-callback`

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: targetUser.user.email,
    options: {
      redirectTo,
    },
  })

  const actionLink = linkData?.properties?.action_link

  if (linkError || !actionLink) {
    return NextResponse.json({ error: linkError?.message ?? 'Failed to generate impersonation link' }, { status: 500 })
  }

  return NextResponse.json({ action_link: actionLink })
}
