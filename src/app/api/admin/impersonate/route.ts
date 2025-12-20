import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // API routes don't need to set cookies
        },
      },
    }
  )

  const { data: { user: userData } } = await supabase.auth.getUser()

  if (!userData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    .eq('id', userData.id)
    .single()

  if (profileError || myProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Admin API not available in @supabase/supabase-js@1.0.0
  return NextResponse.json({ error: 'Admin impersonation not available with current Supabase version' }, { status: 501 })
}
