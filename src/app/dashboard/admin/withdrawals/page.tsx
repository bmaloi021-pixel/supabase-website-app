'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type WithdrawalHistoryEntry = {
  id: string;
  amount: number;
  withdrawnAt: string;
  packageName: string | null;
};

export default function AdminWithdrawalsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawalHistoryEntries, setWithdrawalHistoryEntries] = useState<WithdrawalHistoryEntry[]>([]);

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

  useEffect(() => {
    const fetchWithdrawalHistory = async () => {
      if (!user?.id) return;

      try {
        // This would need to be implemented based on your actual data structure
        // For now, using a placeholder structure
        const { data, error } = await supabase
          .from('user_packages')
          .select(`
            id,
            withdrawn_at,
            packages!inner(name, price)
          `)
          .eq('user_id', user.id)
          .not('withdrawn_at', 'is', null)
          .order('withdrawn_at', { ascending: false });

        if (error) {
          console.error('Error fetching withdrawal history:', error);
          return;
        }

        const entries: WithdrawalHistoryEntry[] = (data || []).map((item: any) => ({
          id: item.id,
          amount: item.packages?.price || 0,
          withdrawnAt: item.withdrawn_at,
          packageName: item.packages?.name || null,
        }));

        setWithdrawalHistoryEntries(entries);
      } catch (e) {
        console.error('Error fetching withdrawal history:', e);
      }
    };

    if (!loading && user) {
      fetchWithdrawalHistory();
    }
  }, [loading, user, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#050f15] via-[#071922] to-[#041017] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

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
            <div className="mb-8">
              <h1 className="text-3xl font-semibold text-white">Package Withdrawals</h1>
              <p className="text-[#9fc3c1] mt-2">Completed package withdrawals and released balances</p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#1c3f4c] bg-[#0b1e27]">
              {withdrawalHistoryEntries.length > 0 ? (
                <div className="divide-y divide-[#1c3f4c]">
                  {withdrawalHistoryEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between hover:bg-white/5 transition"
                    >
                      <div className="space-y-2">
                        <p className="text-xl font-semibold text-white">{formatCurrency(entry.amount)}</p>
                        <p className="text-sm text-[#9fc3c1]">{new Date(entry.withdrawnAt).toLocaleString()}</p>
                        <p className="text-sm text-[#9fc3c1]">
                          Package: <span className="font-medium text-white">{entry.packageName ?? '—'}</span>
                        </p>
                      </div>
                      <span className="inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] bg-[#173d2c] text-[#8ee4b8]">
                        Released
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
                  <p className="text-lg font-semibold text-white mb-2">No package withdrawals yet</p>
                  <p className="text-sm text-[#9fc3c1]">Package withdrawals will appear here when completed</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
