'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type AccountWithdrawalEntry = {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'processing';
  status_notes: string | null;
  created_at: string;
  processed_at: string | null;
};

export default function AdminAccountWithdrawalsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accountWithdrawals, setAccountWithdrawals] = useState<AccountWithdrawalEntry[]>([]);
  const [accountWithdrawalLoading, setAccountWithdrawalLoading] = useState(false);
  const [accountWithdrawalError, setAccountWithdrawalError] = useState<string | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!profileData || profileData.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setProfile(profileData);
      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  const fetchAccountWithdrawals = async () => {
    if (!user?.id) return;
    setAccountWithdrawalLoading(true);
    setAccountWithdrawalError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/withdrawal-requests', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to fetch withdrawal requests (${response.status})`);
      }

      setAccountWithdrawals(data.withdrawal_requests || []);
    } catch (error) {
      const errorMsg = (error as any)?.message || 'Failed to load withdrawal history';
      setAccountWithdrawalError(errorMsg);
    } finally {
      setAccountWithdrawalLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && user) {
      fetchAccountWithdrawals();
    }
  }, [loading, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#050f15] via-[#071922] to-[#041017] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const statusStyle: Record<AccountWithdrawalEntry['status'], string> = {
    pending: 'bg-[#453310] text-[#f4cc7c]',
    approved: 'bg-[#173d2c] text-[#8ee4b8]',
    rejected: 'bg-[#4d1f1f] text-[#ff8a8a]',
    processing: 'bg-[#1b2e63] text-[#8ab4ff]',
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050f15] via-[#071922] to-[#041017] text-slate-100">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 text-[#8fbab9] hover:text-white transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="rounded-[32px] border border-[#1f4e5a]/60 bg-gradient-to-br from-[#0c2735] via-[#0f3445] to-[#071720] p-8 shadow-[0_25px_45px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-8">
              <div>
                <h1 className="text-3xl font-semibold text-white">Account Withdrawals</h1>
                <p className="text-[#9fc3c1] mt-2">Balance withdrawal requests and their processing status</p>
              </div>
              <button
                onClick={() => router.push('/dashboard/admin/withdraw')}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] px-6 py-3 text-sm font-semibold text-[#0a1217] shadow-[0_15px_30px_rgba(0,0,0,0.35)]"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                New Withdrawal
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#1c3f4c] bg-[#0b1e27]">
              {accountWithdrawalLoading ? (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto h-16 w-16 rounded-full bg-[#1c3f4c] flex items-center justify-center mb-4">
                    <svg className="h-8 w-8 text-[#8fbab9] animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <p className="text-[#9fc3c1]">Loading withdrawal history...</p>
                </div>
              ) : accountWithdrawalError ? (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto h-16 w-16 rounded-full bg-[#4d1f1f] flex items-center justify-center mb-4">
                    <svg className="h-8 w-8 text-[#ff8a8a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-white mb-2">Error Loading Data</p>
                  <p className="text-sm text-[#ff8a8a] mb-6">{accountWithdrawalError}</p>
                  <button
                    onClick={fetchAccountWithdrawals}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#8fbab9]/30 px-4 py-2 text-sm font-semibold text-[#8fbab9] hover:border-[#8fbab9]/50"
                  >
                    Try Again
                  </button>
                </div>
              ) : accountWithdrawals.length > 0 ? (
                <div className="divide-y divide-[#1c3f4c]">
                  {accountWithdrawals.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between hover:bg-white/5 transition"
                    >
                      <div className="space-y-2">
                        <p className="text-xl font-semibold text-white">{formatCurrency(entry.amount)}</p>
                        <p className="text-sm text-[#9fc3c1]">
                          Requested: {new Date(entry.created_at).toLocaleString()}
                        </p>
                        {entry.processed_at ? (
                          <p className="text-sm text-[#9fc3c1]">
                            Processed: {new Date(entry.processed_at).toLocaleString()}
                          </p>
                        ) : null}
                        {entry.status_notes ? (
                          <p className="text-xs text-[#9fc3c1]">
                            Note: <span className="font-mono text-white/80">{entry.status_notes}</span>
                          </p>
                        ) : null}
                      </div>
                      <span className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${statusStyle[entry.status]}`}>
                        {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto h-16 w-16 rounded-full bg-[#1c3f4c] flex items-center justify-center mb-4">
                    <svg className="h-8 w-8 text-[#8fbab9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-white mb-2">No account withdrawal requests yet</p>
                  <p className="text-sm text-[#9fc3c1] mb-6">Create your first withdrawal request to get started</p>
                  <button
                    onClick={() => router.push('/dashboard/admin/withdraw')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] px-6 py-3 text-sm font-semibold text-[#0a1217] shadow-[0_15px_30px_rgba(0,0,0,0.35)]"
                  >
                    Create Withdrawal Request
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
