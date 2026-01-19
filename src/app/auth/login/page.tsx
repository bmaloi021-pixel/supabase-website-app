'use client';

import { useState } from 'react';
import Image from 'next/image';
import { createAdminClient, createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const adminSupabase = createAdminClient();

  const normalizeUsername = (value: string) => value.trim().toLowerCase();
  const trimUsername = (value: string) => value.trim();
  
  // Function to get user's email from username
  const getUserEmail = async (username: string): Promise<string | null> => {
    try {
      return `${normalizeUsername(username)}@users.firststeps.app`;
    } catch (error) {
      console.error('Error fetching user email:', error);
      return null;
    }
  };

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

  const handleSignIn = async (e: React.FormEvent) => {
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

        const role = String((profileData as any)?.role ?? '').trim().toLowerCase();
        if (role === 'merchant') {
          await supabase.auth.signOut();
          router.push('/merchant/login?next=/merchant/portal');
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
      console.error('Login error:', err);
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
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
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSignIn}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 pr-12 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link href="/auth/forgot-username" className="font-medium text-indigo-600 hover:text-indigo-500">
                Forgot username?
              </Link>
            </div>
            <div className="text-sm">
              <Link href="/auth/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-500">
                Forgot password?
              </Link>
            </div>
          </div>
          <div className="text-center text-sm">
            <span className="text-gray-600">Don't have an account? </span>
            <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign up
            </Link>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
