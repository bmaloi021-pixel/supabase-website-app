import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function getClientIp(request: NextRequest) {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() ?? ''
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return ''
}

function isTruthy(value: string | undefined | null) {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

async function upstashRateLimit(params: {
  request: NextRequest
  keyPrefix: string
  limit: number
  windowSeconds: number
}) {
  const { request, keyPrefix, limit, windowSeconds } = params

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    return { allowed: true as const, remaining: limit, resetSeconds: windowSeconds }
  }

  const ip = getClientIp(request) || 'unknown'
  const nowSec = Math.floor(Date.now() / 1000)
  const windowId = Math.floor(nowSec / windowSeconds)
  const key = `rl:${keyPrefix}:${ip}:${windowId}`

  // Fixed window rate limit using INCR + EXPIRE.
  // Use a pipeline so INCR+EXPIRE are as close to atomic as possible.
  const pipelineBody = JSON.stringify([
    ['INCR', key],
    ['EXPIRE', key, windowSeconds + 5],
  ])

  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: pipelineBody,
  })

  if (!res.ok) {
    return { allowed: true as const, remaining: limit, resetSeconds: windowSeconds }
  }

  const json = (await res.json().catch(() => null)) as any
  const count = Number(json?.[0]?.result ?? 0)
  const allowed = count <= limit
  const remaining = Math.max(0, limit - count)

  const resetAt = (windowId + 1) * windowSeconds
  const resetSeconds = Math.max(0, resetAt - nowSec)

  return { allowed, remaining, resetSeconds }
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl

  const pathname = url.pathname

  const hostHeader = request.headers.get('host') ?? ''
  const host = hostHeader.split(':')[0]?.toLowerCase() ?? ''
  const isLocalhost = host === 'localhost' || host === '127.0.0.1'

  const isAdminHost = host === 'xhimer.com'
  const isMerchantHost = host === 'merchant.com'
  const isAccountingHost = host === 'accounting.com'

  const isInternalPath =
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname === '/favicon.ico'

  const isPublicPagePath =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname.startsWith('/merchant/login') ||
    pathname.startsWith('/accounting/login')

  const shouldApplyRateLimit =
    !pathname.startsWith('/_next/') &&
    pathname !== '/favicon.ico' &&
    !pathname.startsWith('/assets/')

  // Rate limiting (Upstash) - applies to BOTH pages and APIs.
  // Skip localhost by default unless explicitly enabled.
  const enableOnLocalhost = isTruthy(process.env.UPSTASH_RATE_LIMIT_ON_LOCALHOST)
  const canRateLimit = shouldApplyRateLimit && (!isLocalhost || enableOnLocalhost)

  if (canRateLimit) {
    const isApi = pathname.startsWith('/api/')

    // Defaults
    let limit = 120
    let windowSeconds = 60
    let keyPrefix = isApi ? 'api' : 'page'

    // More strict on auth-related pages
    if (!isApi && isPublicPagePath) {
      limit = 20
      windowSeconds = 60
      keyPrefix = 'page-auth'
    }

    // Strict for sensitive APIs
    if (isApi) {
      limit = 60
      windowSeconds = 60
      keyPrefix = 'api-default'

      if (request.method === 'POST' && pathname === '/api/withdrawal-requests') {
        limit = 10
        windowSeconds = 60
        keyPrefix = 'api-withdrawal-post'
      }

      if (pathname.startsWith('/api/merchant/') || pathname.startsWith('/api/accounting/') || pathname.startsWith('/api/admin/')) {
        limit = 30
        windowSeconds = 60
        keyPrefix = 'api-privileged'
      }
    }

    const rl = await upstashRateLimit({ request, keyPrefix, limit, windowSeconds })
    if (!rl.allowed) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(rl.resetSeconds),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(rl.remaining),
        },
      })
    }
  }

  // Host-based portal isolation (production domains). Do not apply this during localhost dev.
  if (!isLocalhost && (isAdminHost || isMerchantHost || isAccountingHost) && !isInternalPath) {
    if (pathname === '/') {
      const dest = isAdminHost ? '/admin' : isMerchantHost ? '/merchant' : '/accounting'
      return NextResponse.rewrite(new URL(dest, request.url))
    }

    const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/')
    const isMerchantPath = pathname === '/merchant' || pathname.startsWith('/merchant/')
    const isAccountingPath = pathname === '/accounting' || pathname.startsWith('/accounting/')

    if (isAdminHost && (isMerchantPath || isAccountingPath)) {
      return new NextResponse('Not Found', { status: 404 })
    }

    if (isMerchantHost && (isAdminPath || isAccountingPath)) {
      return new NextResponse('Not Found', { status: 404 })
    }

    if (isAccountingHost && (isAdminPath || isMerchantPath)) {
      return new NextResponse('Not Found', { status: 404 })
    }
  }

  const isMerchantArea = pathname === '/merchant' || pathname.startsWith('/merchant/')
  const isAccountingArea = pathname === '/accounting' || pathname.startsWith('/accounting/')
  if (!isMerchantArea && !isAccountingArea) return NextResponse.next()

  // Always route the portal roots through their login pages so the user sees a login screen.
  if (pathname === '/merchant') {
    const loginUrl = new URL('/merchant/login', request.url)
    loginUrl.searchParams.set('next', '/merchant/portal')
    return NextResponse.redirect(loginUrl)
  }
  if (pathname === '/accounting') {
    const loginUrl = new URL('/accounting/login', request.url)
    loginUrl.searchParams.set('next', '/accounting/dashboard')
    return NextResponse.redirect(loginUrl)
  }

  // Allow public/internal routes
  const isPublicPath =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/merchant/login' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico'

  if (isPublicPath) return NextResponse.next()

  // Create response to pass to supabase client
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: any }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginPath = isMerchantArea ? '/merchant/login' : '/accounting/login'
    const loginUrl = new URL(loginPath, request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profileData as any)?.role

  if (isMerchantArea) {
    const allowed = role === 'merchant'
    if (!allowed) {
      return NextResponse.redirect(new URL('/admin/overview', request.url))
    }
  }

  if (isAccountingArea) {
    const allowed = role === 'accounting'
    if (!allowed) {
      return NextResponse.redirect(new URL('/admin/overview', request.url))
    }
  }

  return response
}

function requestUrlOrigin(request: NextRequest) {
  try {
    return new URL(request.url).origin
  } catch {
    return '/'
  }
}

function isAbsoluteUrl(value: string) {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function toUrl(dest: string, request: NextRequest) {
  if (isAbsoluteUrl(dest)) return dest
  return new URL(dest, request.url)
}

export const config = {
  matcher: ['/:path*'],
}
