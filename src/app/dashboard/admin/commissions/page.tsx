'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Commission = {
  id: string;
  amount: number;
  commission_type: string;
  level: number;
  status: 'paid' | 'pending';
  created_at: string;
  referrer_id?: string;
  referrer_username?: string;
};

export default function AdminCommissionsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [commissions, setCommissions] = useState<Commission[]>([]);

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
    const fetchCommissions = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('commissions')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching commissions:', error);
          setCommissions([]);
          return;
        }

        setCommissions(data || []);
      } catch (e) {
        console.error('Error fetching commissions:', e);
        setCommissions([]);
      }
    };

    if (!loading && user) {
      fetchCommissions();
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
          <div className="text-white/50 text-sm">
            Admin Commissions View
          </div>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="rounded-[32px] border border-[#2c2f68]/60 bg-gradient-to-br from-[#0b0f25] via-[#13183a] to-[#060714] p-8 shadow-[0_25px_45px_rgba(0,0,0,0.45)]">
            <div className="mb-8">
              <h1 className="text-3xl font-semibold text-white">Commission History</h1>
              <p className="text-white/70 mt-2">Monitor payouts from your network.</p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#2f2848]/70 bg-[#0d0e1b]/90">
              {commissions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/10">
                    <thead className="bg-[#19142f] text-left text-[11px] font-semibold uppercase tracking-[0.25em] text-[#c6b5ff]">
                      <tr>
                        <th className="px-6 py-4">Referrer</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4">Level</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm text-white/90">
                      {commissions.map((commission) => (
                        <tr key={commission.id} className="transition hover:bg-white/5">
                          <td className="px-6 py-4 text-white/70">{commission.referrer_username || commission.referrer_id?.slice(0, 8) + '…' || 'Unknown'}</td>
                          <td className="px-6 py-4 font-semibold text-white">{formatCurrency(commission.amount)}</td>
                          <td className="px-6 py-4 text-white/70">{commission.commission_type}</td>
                          <td className="px-6 py-4 text-white/70">Level {commission.level}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                                commission.status === 'paid'
                                  ? 'bg-[#1d3f2c] text-[#8fe6b6]'
                                  : 'bg-[#4b3613] text-[#f5cf87]'
                              }`}
                            >
                              {commission.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-white/70">{new Date(commission.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto h-16 w-16 rounded-full bg-[#2f2848] flex items-center justify-center mb-4">
                    <svg className="h-8 w-8 text-[#c6b5ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3 3 7-7" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-white mb-2">No commissions yet</p>
                  <p className="text-sm text-white/60">Commission earnings will appear here as your network grows</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
