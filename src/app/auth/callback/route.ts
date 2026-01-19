import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next') || '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // exchangeCodeForSession not available in @supabase/supabase-js@1.0.0
    // const { error } = await supabase.auth.exchangeCodeForSession(code);
    // if (error) {
    //   console.error('Error exchanging code for session:', error);
    //   return NextResponse.redirect(`${requestUrl.origin}/login?error=auth-error`);
    // }

    // Session handling not available in @supabase/supabase-js@1.0.0
    // const { data: { session } } = await supabase.auth.getSession();
    // if (session) {
    //   const response = NextResponse.redirect(`${requestUrl.origin}${next}`);
    //   response.cookies.set('sb-access-token', session.access_token, {
    //     path: '/',
    //     secure: true,
    //     httpOnly: true,
    //     sameSite: 'lax',
    //     maxAge: session.expires_in,
    //   });
    //   response.cookies.set('sb-refresh-token', session.refresh_token, {
    //     path: '/',
    //     secure: true,
    //     httpOnly: true,
    //     sameSite: 'lax',
    //     maxAge: 60 * 60 * 24 * 365, // 1 year
    //   });
    //   return response;
    // }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${requestUrl.origin}${next}`);
}
