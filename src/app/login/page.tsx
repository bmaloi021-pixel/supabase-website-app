'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient, createClient } from '@/lib/supabase/client';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const adminSupabase = createAdminClient();

  useEffect(() => {
    const redirectIfAuthed = async () => {
      try {
        const { data: { session: adminSession } } = await adminSupabase.auth.getSession();
        if (adminSession?.user?.id) {
          router.replace('/admin/overview');
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        const role = (profileData as any)?.role;
        if (role === 'merchant') {
          router.replace('/merchant/portal');
          return;
        }
        if (role === 'accounting') {
          router.replace('/accounting/dashboard');
          return;
        }
        if (role === 'admin') {
          router.replace('/admin/overview');
          return;
        }

        router.replace('/dashboard');
      } catch {
        // ignore; login form remains
      }
    };

    redirectIfAuthed();
  }, [router, supabase, adminSupabase]);

  const normalizeUsername = (value: string) => value.trim().toLowerCase();
  const trimUsername = (value: string) => value.trim();

  const signInWithUsername = async (value: string) => {
    const candidates = Array.from(
      new Set([
        `${normalizeUsername(value)}@users.firststeps.app`,
        `${trimUsername(value)}@users.firststeps.app`,
      ])
    ).filter((v) => v && !v.startsWith('@'));

    let lastError: any = null;
    for (const email of candidates) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!signInError) return;
      lastError = signInError;
    }

    throw lastError;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signInWithUsername(username);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        const role = (profileData as any)?.role;
        if (role === 'merchant') {
          await supabase.auth.signOut();
          router.push('/merchant/login?next=/merchant/portal');
          return;
        }
        if (role === 'accounting') {
          await supabase.auth.signOut();
          router.push('/accounting/login?next=/accounting/dashboard');
          return;
        }
        if (role === 'admin') {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token && session?.refresh_token) {
            await adminSupabase.auth.setSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            });
          }
          await supabase.auth.signOut();
          router.push('/admin/overview');
          router.refresh();
          return;
        }
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      const e = err as any;
      const message =
        e?.message ||
        e?.error_description ||
        (typeof e === 'string' ? e : null) ||
        'An error occurred';
      const code = e?.code ? ` (${e.code})` : '';
      const status = e?.status ? ` [${e.status}]` : '';
      setError(`${message}${code}${status}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <Image
              src="https://sbhcpvqygnvnjhxacpms.supabase.co/storage/v1/object/public/Public/ChatGPT%20Image%20Dec%2025,%202025,%2006_22_34%20PM.png"
              alt="Xhimer logo"
              width={72}
              height={72}
              priority
              className="h-18 w-18"
            />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">Sign in to your account</h2>
        </div>
        
        {error && (
          <div className="p-4 text-red-700 bg-red-100 rounded-md">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="w-full px-3 py-2 pr-12 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19.5c-4.523 0-8.265-2.903-9.781-7a9.956 9.956 0 011.524-3.042M9.88 9.88a3 3 0 014.242 4.243M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <a href="#" className="font-medium text-indigo-600 hover:text-indigo-500">
                Forgot your password?
              </a>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div>
            <Link
              href="/signup"
              className="w-full flex justify-center py-2 px-4 border border-indigo-600 rounded-md shadow-sm text-sm font-medium text-indigo-700 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Sign up
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
