'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/client';

type TopUpHistoryEntry = {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  status_notes: string | null;
  created_at: string;
};

function AdminTopUpsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createAdminClient(), []);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [topUpRequests, setTopUpRequests] = useState<TopUpHistoryEntry[]>([]);
  const [success, setSuccess] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    }
  }, [searchParams]);

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

  useEffect(() => {
    const fetchTopUpRequests = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('top_up_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching top-up requests:', error);
          return;
        }

        setTopUpRequests(data || []);
      } catch (e) {
        console.error('Error fetching top-up requests:', e);
      }
    };

    if (!loading && user) {
      fetchTopUpRequests();
    }
  }, [loading, user, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#050f15] via-[#071922] to-[#041017] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const statusStyle: Record<TopUpHistoryEntry['status'], string> = {
    pending: 'bg-[#453310] text-[#f4cc7c]',
    approved: 'bg-[#173d2c] text-[#8ee4b8]',
    rejected: 'bg-[#4d1f1f] text-[#ff8a8a]',
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
                <h1 className="text-3xl font-semibold text-white">Top-up History</h1>
                <p className="text-[#9fc3c1] mt-2">Most recent {Math.min(topUpRequests.length, 20)} submissions • Balances update once reviewed</p>
              </div>
              <button
                onClick={() => router.push('/dashboard/admin/deposit')}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] px-6 py-3 text-sm font-semibold text-[#0a1217] shadow-[0_15px_30px_rgba(0,0,0,0.35)]"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                New Deposit
              </button>
            </div>

            {success && (
              <div className="mb-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Top-up request submitted successfully!
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-[#1c3f4c] bg-[#0b1e27]">
              {topUpRequests.length > 0 ? (
                <div className="divide-y divide-[#1c3f4c]">
                  {topUpRequests.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between hover:bg-white/5 transition"
                    >
                      <div className="space-y-2">
                        <p className="text-xl font-semibold text-white">{formatCurrency(entry.amount)}</p>
                        <p className="text-sm text-[#9fc3c1]">{new Date(entry.created_at).toLocaleString()}</p>
                        {entry.status_notes ? (
                          <p className="text-xs text-[#9fc3c1]">
                            Ref: <span className="font-mono text-white/80">{entry.status_notes}</span>
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.757l.879.508L12 15.25l2.121 1.501.879-.508M3 13.5h18" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-white mb-2">No top-up requests yet</p>
                  <p className="text-sm text-[#9fc3c1] mb-6">Submit your first top-up request to get started</p>
                  <button
                    onClick={() => router.push('/dashboard/admin/deposit')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] px-6 py-3 text-sm font-semibold text-[#0a1217] shadow-[0_15px_30px_rgba(0,0,0,0.35)]"
                  >
                    Create Deposit Request
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

export default function AdminTopUpsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-[#050f15] via-[#071922] to-[#041017] flex items-center justify-center">
          <div className="text-white">Loading...</div>
        </div>
      }
    >
      <AdminTopUpsPageInner />
    </Suspense>
  );
}
