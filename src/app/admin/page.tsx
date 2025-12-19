'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Role = 'admin' | 'user' | 'merchant' | 'accounting';

type ProfileRow = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
  balance?: number;
  total_earnings?: number;
  created_at?: string;
};

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const lastRealtimeProfilesRefreshAtRef = useRef(0);
  const realtimeProfilesRefreshInFlightRef = useRef(false);

  const formatCurrency = (value: any) => {
    const n = Number(value);
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  };

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<ProfileRow | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const canAccess = useMemo(() => me?.role === 'admin', [me?.role]);

  useEffect(() => {
    const init = async () => {
      setError(null);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      if (!session) {
        router.push('/login');
        setLoading(false);
        return;
      }

      const { data: myProfile, error: myProfileError } = await supabase
        .from('profiles')
        .select('id, username, first_name, last_name, role, created_at')
        .eq('id', session.user.id)
        .single();

      if (myProfileError) {
        setError(myProfileError.message);
        setLoading(false);
        return;
      }

      setMe(myProfile as ProfileRow);

      if ((myProfile as ProfileRow).role !== 'admin') {
        router.push('/dashboard');
        setLoading(false);
        return;
      }

      await reloadProfiles();
      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const reloadProfiles = useCallback(async () => {
    try {
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch('/api/admin/users', {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((json as any)?.error ?? 'Failed to load users');
      }
      setProfiles(((json as any)?.profiles ?? []) as ProfileRow[]);
    } catch (e) {
      setError((e as any)?.message ?? 'Failed to load users');
    }
  }, [supabase]);

  useEffect(() => {
    if (!canAccess) return;

    const channel = supabase
      .channel('admin-users-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          const now = Date.now();
          if (now - lastRealtimeProfilesRefreshAtRef.current < 800) return;
          if (realtimeProfilesRefreshInFlightRef.current) return;
          lastRealtimeProfilesRefreshAtRef.current = now;
          realtimeProfilesRefreshInFlightRef.current = true;
          reloadProfiles().finally(() => {
            realtimeProfilesRefreshInFlightRef.current = false;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commissions' },
        () => {
          const now = Date.now();
          if (now - lastRealtimeProfilesRefreshAtRef.current < 800) return;
          if (realtimeProfilesRefreshInFlightRef.current) return;
          lastRealtimeProfilesRefreshAtRef.current = now;
          realtimeProfilesRefreshInFlightRef.current = true;
          reloadProfiles().finally(() => {
            realtimeProfilesRefreshInFlightRef.current = false;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_packages' },
        () => {
          const now = Date.now();
          if (now - lastRealtimeProfilesRefreshAtRef.current < 800) return;
          if (realtimeProfilesRefreshInFlightRef.current) return;
          lastRealtimeProfilesRefreshAtRef.current = now;
          realtimeProfilesRefreshInFlightRef.current = true;
          reloadProfiles().finally(() => {
            realtimeProfilesRefreshInFlightRef.current = false;
          });
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [canAccess, reloadProfiles, supabase]);

  const updateRole = async (userId: string, role: Role, prevRole?: Role) => {
    setSavingId(userId);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : null),
        },
        body: JSON.stringify({ userId, role }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((json as any)?.error ?? 'Failed to update role');
      }
      setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, role } : p)));
    } catch (e) {
      if (prevRole) {
        setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, role: prevRole } : p)));
      }
      setError((e as any)?.message ?? 'Failed to update role');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!canAccess || error) {
    return (
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
              <button
                onClick={() => router.push('/dashboard')}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </nav>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900">Unable to load users</h2>
            {error ? (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            ) : (
              <p className="mt-2 text-sm text-gray-600">You don’t have access to this page.</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-3 py-2 border border-indigo-600 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50"
              >
                Retry
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
            <button
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Users</h2>
              <p className="text-sm text-gray-500">Change roles for any account.</p>
            </div>
            <button
              onClick={reloadProfiles}
              className="inline-flex items-center px-3 py-2 border border-indigo-600 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50"
            >
              Refresh
            </button>
          </div>

          {error && (
            <div className="px-6 py-4 text-sm text-red-600">{error}</div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Earnings</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {profiles.map((p) => {
                  const isSelf = p.id === me?.id;
                  return (
                    <tr key={p.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {p.first_name} {p.last_name}{isSelf ? ' (you)' : ''}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.username}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency((p as any)?.balance ?? 0)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency((p as any)?.total_earnings ?? 0)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                          value={p.role}
                          onChange={(e) => {
                            const nextRole = e.target.value as Role;
                            const prevRole = p.role;
                            setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, role: nextRole } : x)));
                            updateRole(p.id, nextRole, prevRole);
                          }}
                          disabled={savingId === p.id}
                        >
                          <option value="user">User</option>
                          <option value="merchant">Merchant</option>
                          <option value="accounting">Accounting</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {profiles.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-gray-500">No users found.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
