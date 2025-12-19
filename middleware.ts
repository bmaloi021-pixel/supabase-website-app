import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const url = request.nextUrl

  // Only protect merchant area. This allows the main site to behave normally.
  const pathname = url.pathname
  const isMerchantArea = pathname === '/merchant' || pathname.startsWith('/merchant/')
  if (!isMerchantArea) return NextResponse.next()

  // Always route the merchant root through the merchant login page so the user sees a login screen.
  if (pathname === '/merchant') {
    const loginUrl = new URL('/merchant/login', request.url)
    loginUrl.searchParams.set('next', '/merchant/portal')
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

  let response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: userData } = await supabase.auth.getUser()

  if (!userData?.user) {
    const loginUrl = new URL('/merchant/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  const role = (profileData as any)?.role
  const allowed = role === 'admin' || role === 'merchant'

  if (!allowed) {
    const loginUrl = new URL('/merchant/login', request.url)
    loginUrl.searchParams.set('next', '/merchant/portal')
    loginUrl.searchParams.set('reason', 'merchant_only')
    return NextResponse.redirect(loginUrl)
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
  matcher: ['/merchant/:path*'],
}
