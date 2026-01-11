import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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
